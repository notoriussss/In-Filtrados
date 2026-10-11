import type { EventEmitter } from 'events';
import type { ServerMessage } from '@in-filtrados/messages';
import { status as grpcStatus } from '@grpc/grpc-js';
import { type GrpcServerEvent, toServerMessage } from './server-events';
import { PLAY_RETRY_DELAYS_MS, PLAY_RETRY_MAX_MS } from './game.constants';

// La parte del stream Play de @grpc/grpc-js que usa el relay; las
// pruebas pasan uno falso.
export type PlayStreamLike = EventEmitter & {
  write(action: object): unknown;
  end(): void;
  cancel?(): void;
};

export type JoinInfo = {
  matchId: string;
  playerId: string; // siempre el del token, nunca uno del navegador
  lastTick: number;
};

export type PlayRelayOptions = {
  open: () => PlayStreamLike;
  join: JoinInfo;
  onMessage: (msg: ServerMessage) => void;
  // El stream se cayó: el navegador muestra que se espera a match.
  onUnavailable: (attempt: number, err?: Error) => void;
  // match terminó el stream a propósito (p. ej. la partida no existe).
  onEnd: () => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

// playRetryDelay: 0,5 s, 1 s, 2 s, 4 s, 8 s y luego cada 10 s.
export function playRetryDelay(attempt: number): number {
  return PLAY_RETRY_DELAYS_MS[attempt - 1] ?? PLAY_RETRY_MAX_MS;
}

// PlayRelay mantiene el stream Play de un jugador (S3-02). Si se cae
// porque match se reinicia o no responde, el WebSocket con el navegador
// sigue abierto y el relay reabre Play con espera creciente, mandando
// otra vez Join con el último tick que vio. match responde con la foto
// completa (S3-01) y el jugador sigue donde estaba.
export class PlayRelay {
  private stream: PlayStreamLike | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private closed = false;

  constructor(private readonly opts: PlayRelayOptions) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  // write manda una acción; mientras Play se reabre, se descarta (el
  // navegador reenvía lo que importa al volver, como el chat).
  write(action: object): void {
    this.stream?.write(action);
  }

  get connected(): boolean {
    return this.stream !== null;
  }

  // close termina a propósito: el WebSocket se cerró.
  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      (this.opts.clearTimer ?? clearTimeout)(this.timer as never);
      this.timer = null;
    }
    const stream = this.stream;
    this.stream = null;
    stream?.end();
  }

  private connect(): void {
    const stream = this.opts.open();
    this.stream = stream;
    stream.write({ join: { ...this.opts.join } });

    stream.on('data', (ev: GrpcServerEvent) => {
      if (stream !== this.stream) return;
      const msg = toServerMessage(ev);
      if (!msg) return;
      if (msg.type === 'snapshot') {
        this.attempt = 0;
        this.opts.join.lastTick = msg.tick;
      }
      this.opts.onMessage(msg);
    });
    // grpc-js emite 'error' y luego 'status'; la decisión se toma con
    // 'status', que llega siempre. Este listener evita que un 'error'
    // sin escuchar tumbe al gateway.
    stream.on('error', () => undefined);
    stream.on('status', (st: { code: number; details?: string }) => {
      if (stream !== this.stream || this.closed) return;
      this.stream = null;
      if (st.code === grpcStatus.OK) {
        this.opts.onEnd();
        return;
      }
      this.retry(new Error(st.details ?? String(st.code)));
    });
  }

  private retry(err?: Error): void {
    this.attempt++;
    this.opts.onUnavailable(this.attempt, err);
    const setTimer = this.opts.setTimer ?? setTimeout;
    this.timer = setTimer(() => {
      this.timer = null;
      if (!this.closed) this.connect();
    }, playRetryDelay(this.attempt));
  }
}
