import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@in-filtrados/messages';
import { MatchClient, type PlayStream } from '../clients/match.client';
import { ERROR_CODES, ERROR_MESSAGES } from './game.constants';
import { PlayersClient } from '../clients/players.client';

// S1-07: WebSocket /ws?playerId=<id> without a token, one Play stream per socket.
// S1-16 replaces playerId with the token and adds the error handling of the final version.
@WebSocketGateway({ path: '/ws' })
export class GameGateway implements OnGatewayConnection {
  private readonly logger = new Logger(GameGateway.name);
  private readonly activeSockets = new Map<string, WebSocket>();

  constructor(
    private readonly match: MatchClient,
    private readonly players: PlayersClient,
  ) {}

  async handleConnection(socket: WebSocket, req: IncomingMessage): Promise<void> {
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
      socket.close(4001);
      return;
    }

    let isAuthenticated = false;
    const messageQueue: any[] = [];
    let stream: PlayStream | null = null;
    let playerId: string | null = null;

    socket.on('message', (raw) => {
      if (!isAuthenticated) {
        messageQueue.push(raw);
        return;
      }
      processMessage(raw);
    });

    const processMessage = (raw: any) => {
      const msg = parse(raw.toString());
      if (!msg) {
        send(socket, {
          type: 'error',
          code: ERROR_CODES.BAD_MESSAGE,
          message: ERROR_MESSAGES.MALFORMED_MESSAGE,
        });
        return;
      }
      if (msg.type === 'join' && !stream && playerId) {
        stream = this.openPlay(
          socket,
          playerId,
          msg.matchId,
          msg.lastTick,
        );
      } else if (msg.type === 'move' && stream) {
        stream.write({ move: { dx: msg.dx, dy: msg.dy } });
      }
    };

    socket.on('close', () => {
      if (playerId) {
        this.logger.log(`ws close ${playerId}`);
        const current = this.activeSockets.get(playerId);
        if (current === socket) {
          this.activeSockets.delete(playerId);
        }
      }
      stream?.end();
    });

    try {
      const res = await this.players.validateToken(token);
      playerId = res.playerId;
    } catch (err) {
      send(socket, {
        type: 'error',
        code: ERROR_CODES.UNAUTHORIZED,
        message: ERROR_MESSAGES.INVALID_TOKEN,
      });
      socket.close(4001);
      return;
    }

    isAuthenticated = true;
    this.logger.log(`ws open ${playerId}`);

    const existing = this.activeSockets.get(playerId);
    if (existing) {
      existing.close(4001);
    }
    this.activeSockets.set(playerId, socket);

    messageQueue.forEach(processMessage);
  }

  private openPlay(
    socket: WebSocket,
    playerId: string,
    matchId: string,
    lastTick: number,
  ): PlayStream {
    const stream = this.match.play();
    stream.write({ join: { matchId, playerId, lastTick } });

    stream.on('data', (ev: any) => {
      if (ev.event === 'snapshot') {
        const s = ev.snapshot;
        send(socket, {
          type: 'snapshot',
          tick: s.tick,
          phase: s.phase,
          players: s.players,
        });
      } else if (ev.event === 'error') {
        send(socket, {
          type: 'error',
          code: ev.error.code,
          message: ev.error.message,
        });
      }
    });
    stream.on('error', (err) => {
      this.logger.warn(`play ${playerId}: ${err.message}`);
      send(socket, {
        type: 'error',
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: ERROR_MESSAGES.MATCH_SERVICE_UNAVAILABLE,
      });
      socket.close(1011);
    });
    stream.on('end', () => socket.close());
    return stream;
  }
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

// Only the two messages of messages/src/index.ts get through; anything else is ignored.
function parse(raw: string): ClientMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg?.type === 'join' && typeof msg.matchId === 'string') {
      return {
        type: 'join',
        matchId: msg.matchId,
        lastTick: Number(msg.lastTick) || 0,
      };
    }
    if (msg?.type === 'move') {
      const dx = msg.dx;
      const dy = msg.dy;
      if (
        (dx === -1 || dx === 0 || dx === 1) &&
        (dy === -1 || dy === 0 || dy === 1)
      ) {
        return { type: 'move', dx, dy };
      }
      return null;
    }
  } catch {
    // not JSON
  }
  return null;
}
