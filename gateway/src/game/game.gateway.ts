import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { RawData, WebSocket } from 'ws';
import { status } from '@grpc/grpc-js';
import type { ServerMessage } from '@in-filtrados/messages';
import { MatchClient, type PlayStream } from '../clients/match.client';
import {
  ERROR_CODES,
  ERROR_MESSAGES,
  WS_CLOSE_CODES,
} from './game.constants';
import { parseClientMessage, toGrpcAction } from './client-messages';
import { PlayersClient } from '../clients/players.client';
import { type GrpcServerEvent, toServerMessage } from './server-events';

// WebSocket /ws?token=...; one Play stream per player
@WebSocketGateway({ path: '/ws' })
export class GameGateway implements OnGatewayConnection {
  private readonly logger = new Logger(GameGateway.name);
  private readonly activeSockets = new Map<string, WebSocket>();

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
    let stream: PlayStream | null = null;
    let playerId: string | null = null;

    socket.on('message', (raw: RawData) => {
      if (!isAuthenticated) {
        messageQueue.push(raw);
        return;
      }
      processMessage(raw);
    });

    const processMessage = (raw: RawData) => {
      const msg = parseClientMessage(raw.toString());
      if (!msg) {
        send(socket, {
          type: 'error',
          code: ERROR_CODES.BAD_MESSAGE,
          message: ERROR_MESSAGES.MALFORMED_MESSAGE,
        });
        return;
      }
      if (msg.type === 'join') {
        if (!stream && playerId) {
          stream = this.openPlay(
            socket,
            playerId,
            msg.matchId,
            msg.lastTick,
          );
        }
        return;
      }
      const action = toGrpcAction(msg);
      if (stream && action) stream.write(action);
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

  private openPlay(
    socket: WebSocket,
    playerId: string,
    matchId: string,
    lastTick: number,
  ): PlayStream {
    const stream = this.match.play();
    stream.write({ join: { matchId, playerId, lastTick } });

    stream.on('data', (ev: GrpcServerEvent) => {
      const msg = toServerMessage(ev);
      if (msg) send(socket, msg);
    });
    stream.on('error', (err) => {
      this.logger.warn(`play ${playerId}: ${err.message}`);
      send(socket, {
        type: 'error',
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: ERROR_MESSAGES.MATCH_SERVICE_UNAVAILABLE,
      });
      socket.close(WS_CLOSE_CODES.SERVICE_UNAVAILABLE);
    });
    stream.on('end', () => socket.close(WS_CLOSE_CODES.NORMAL));
    return stream;
  }
}

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}
