import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { RawData, WebSocket } from 'ws';
import { status } from '@grpc/grpc-js';
import type { ServerMessage } from '@in-filtrados/messages';
import { MatchClient } from '../clients/match.client';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  RATE_LIMIT_CAPACITY,
  RATE_LIMIT_PER_SECOND,
  RATE_LIMIT_WARNING_RESET_MS,
  RATE_LIMIT_WARNINGS,
  WS_CLOSE_CODES,
} from './game.constants';
import { parseClientMessage, toGrpcAction } from './client-messages';
import { FloodLimiter, TokenBucket } from './rate-limit';
import { PlayersClient } from '../clients/players.client';
import { PlayRelay } from './play-relay';
import { ChatDeduper } from './chat-dedupe';
import { Heartbeat } from './heartbeat';

// WebSocket /ws?token=...; one Play stream per player
@WebSocketGateway({ path: '/ws' })
export class GameGateway implements OnGatewayConnection {
  private readonly logger = new Logger(GameGateway.name);
  private readonly activeSockets = new Map<string, WebSocket>();
  private readonly chatIds = new ChatDeduper();

  constructor(
    private readonly match: MatchClient,
    private readonly players: PlayersClient,
  ) {}

  async handleConnection(
    socket: WebSocket,
    req: IncomingMessage,
  ): Promise<void> {
    const token = new URL(
      req.url ?? '',
      'http://localhost',
    ).searchParams.get('token');

    if (!token) {
      send(socket, {
        type: 'error',
        code: ERROR_CODES.UNAUTHORIZED,
        message: ERROR_MESSAGES.MISSING_TOKEN,
      });
      socket.close(WS_CLOSE_CODES.UNAUTHORIZED);
      return;
    }

    let isAuthenticated = false;
    const messageQueue: RawData[] = [];
    let relay: PlayRelay | null = null;
    let joining = false;
    let matchId: string | null = null;
    let playerId: string | null = null;

    // S2-08: un token bucket por conexión (un jugador = un socket
    // activo), así un flood no toca a nadie más de la sala.
    const limiter = new FloodLimiter(
      new TokenBucket(RATE_LIMIT_CAPACITY, RATE_LIMIT_PER_SECOND),
      RATE_LIMIT_WARNINGS,
      RATE_LIMIT_WARNING_RESET_MS,
    );

    // Heartbeat (deployment-lab.md, 9.1): un navegador que lleva 5 s
    // callado se corta con terminate, sin esperar el cierre ordenado que
    // nunca va a contestar; el 'close' cierra el relay y match pausa.
    const heartbeat = new Heartbeat({
      onDead: () => {
        this.logger.warn(`ws sin heartbeat ${playerId ?? ''}`);
        socket.terminate();
      },
    });
    heartbeat.start();

    socket.on('message', (raw: RawData) => {
      heartbeat.seen();
      if (!isAuthenticated) {
        messageQueue.push(raw);
        return;
      }
      processMessage(raw);
    });

    const processMessage = (raw: RawData) => {
      const outcome = limiter.check();
      if (outcome !== 'allow') {
        // S2-08: se descarta, se avisa y a la tercera se corta.
        send(socket, {
          type: 'error',
          code: ERROR_CODES.BAD_MESSAGE,
          message: ERROR_MESSAGES.RATE_LIMITED,
        });
        if (outcome === 'close') {
          socket.close(WS_CLOSE_CODES.RATE_LIMITED);
        }
        return;
      }
      const msg = parseClientMessage(raw.toString());
      if (!msg) {
        send(socket, {
          type: 'error',
          code: ERROR_CODES.BAD_MESSAGE,
          message: ERROR_MESSAGES.MALFORMED_MESSAGE,
        });
        return;
      }
      if (msg.type === 'ping') {
        send(socket, { type: 'pong' });
        return;
      }
      if (msg.type === 'join') {
        if (!relay && playerId && !joining) {
          matchId = msg.matchId;
          joining = true;
          const id = playerId;
          // Lo comprado se pregunta a players antes de abrir Play: match
          // no puede fiarse de lo que diga el navegador.
          void this.ownedItems(id).then((owned) => {
            if (socket.readyState !== socket.OPEN) return;
            relay = this.openPlay(
              socket,
              id,
              msg.matchId,
              msg.lastTick,
              owned,
            );
          });
        }
        return;
      }
      if (msg.type === 'refreshShop') {
        // Tras una compra: se vuelve a leer lo comprado y se le pasa a
        // match, que decide si el personaje y el accesorio valen.
        const current = relay;
        if (current && playerId) {
          void this.ownedItems(playerId).then((owned) =>
            current.setOwned(owned),
          );
        }
        return;
      }
      const action = toGrpcAction(msg);
      if (!relay || !action) return;
      if (msg.type === 'chat') {
        // S3-04: solo se anota si de verdad sale hacia match; mientras
        // Play se reabre, el navegador lo reintentará.
        if (!relay.connected) return;
        if (!this.chatIds.firstTime(matchId!, msg.clientMsgId)) return;
      }
      relay.write(action);
    };

    socket.on('close', () => {
      heartbeat.stop();
      if (playerId) {
        this.logger.log(`ws close ${playerId}`);
        const current = this.activeSockets.get(playerId);
        if (current === socket) {
          this.activeSockets.delete(playerId);
        }
      }
      relay?.close();
    });

    try {
      const res = await this.players.validateToken(token);
      playerId = res.playerId;
    } catch (err) {
      if ((err as { code?: number }).code === status.UNAUTHENTICATED) {
        send(socket, {
          type: 'error',
          code: ERROR_CODES.UNAUTHORIZED,
          message: ERROR_MESSAGES.INVALID_TOKEN,
        });
        socket.close(WS_CLOSE_CODES.UNAUTHORIZED);
      } else {
        send(socket, {
          type: 'error',
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: ERROR_MESSAGES.PLAYERS_SERVICE_UNAVAILABLE,
        });
        socket.close(WS_CLOSE_CODES.SERVICE_UNAVAILABLE);
      }
      return;
    }

    isAuthenticated = true;
    this.logger.log(`ws open ${playerId}`);

    const existing = this.activeSockets.get(playerId);
    if (existing) {
      existing.close(WS_CLOSE_CODES.REPLACED);
    }
    this.activeSockets.set(playerId, socket);

    messageQueue.forEach(processMessage);
  }

  // ownedItems: los artículos comprados del jugador. Si players no
  // responde se juega con lo de inicio (Jimena, sin accesorios).
  private async ownedItems(playerId: string): Promise<string[]> {
    try {
      const shop = await this.players.getShop(playerId);
      return shop.items.filter((i) => i.owned).map((i) => i.id);
    } catch (err) {
      this.logger.warn(`shop ${playerId}: ${(err as Error).message}`);
      return [];
    }
  }

  // openPlay abre el stream Play del jugador. Si match se cae, el
  // WebSocket sigue abierto: el navegador ve SERVICE_UNAVAILABLE y el
  // relay reabre Play con espera creciente (S3-02).
  private openPlay(
    socket: WebSocket,
    playerId: string,
    matchId: string,
    lastTick: number,
    owned: string[],
  ): PlayRelay {
    const relay = new PlayRelay({
      open: () => this.match.play(),
      join: { matchId, playerId, lastTick, owned },
      onMessage: (msg) => send(socket, msg),
      onUnavailable: (attempt, err) => {
        this.logger.warn(
          `play ${playerId}: ${err?.message ?? ''}; reintento ${attempt}`,
        );
        send(socket, {
          type: 'error',
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: ERROR_MESSAGES.MATCH_SERVICE_UNAVAILABLE,
        });
      },
      onEnd: () => socket.close(WS_CLOSE_CODES.NORMAL),
    });
    relay.start();
    return relay;
  }
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}
