import { Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'http';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@in-filtrados/messages';
import { MatchClient, type PlayStream } from '../clients/match.client';
import { ERROR_CODES, ERROR_MESSAGES } from './game.constants';

// S1-07: WebSocket /ws?playerId=<id> without a token, one Play stream per socket.
// S1-16 replaces playerId with the token and adds the error handling of the final version.
@WebSocketGateway({ path: '/ws' })
export class GameGateway implements OnGatewayConnection {
  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly match: MatchClient) {}

  handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const playerId = new URL(
      req.url ?? '',
      'http://localhost',
    ).searchParams.get('playerId');
    if (!playerId) {
      send(socket, {
        type: 'error',
        code: ERROR_CODES.BAD_MESSAGE,
        message: ERROR_MESSAGES.MISSING_PLAYER_ID,
      });
      socket.close(4000);
      return;
    }
    this.logger.log(`ws open ${playerId}`);
    let stream: PlayStream | null = null;

    socket.on('message', (raw) => {
      const msg = parse(raw.toString());
      if (!msg) return;
      if (msg.type === 'join' && !stream) {
        stream = this.openPlay(
          socket,
          playerId,
          msg.matchId,
          msg.lastTick,
        );
      } else if (msg.type === 'move' && stream) {
        stream.write({ move: { dx: msg.dx, dy: msg.dy } });
      }
    });

    socket.on('close', () => {
      this.logger.log(`ws close ${playerId}`);
      stream?.end();
    });
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
      const dx = Math.sign(Number(msg.dx) || 0) as -1 | 0 | 1;
      const dy = Math.sign(Number(msg.dy) || 0) as -1 | 0 | 1;
      return { type: 'move', dx, dy };
    }
  } catch {
    // not JSON
  }
  return null;
}
