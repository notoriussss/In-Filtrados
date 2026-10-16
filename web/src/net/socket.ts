import type { ClientMessage, ServerMessage } from '@in-filtrados/messages';
import { session } from '../session';

// Close codes (S1-20): a normal close, invalid token or
// replaced session never retries.
export const CLOSE_NORMAL = 1000;
export const CLOSE_UNAUTHORIZED = 4001;
export const CLOSE_REPLACED = 4002;

// Waits between reconnection attempts: 0.5 s, 1 s, 2 s, 4 s, 8 s and
// then every 10 s, with no limit.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 8000];
const RETRY_DELAY_MAX_MS = 10000;

// attempt starts at 1.
export function reconnectDelay(attempt: number): number {
  return RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAY_MAX_MS;
}

export type SocketStatus =
  | { state: 'connected' }
  | { state: 'reconnecting'; attempt: number }
  | { state: 'replaced' };

// The parts of WebSocket that GameSocket uses; tests pass a fake.
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  addEventListener(type: 'open', fn: () => void): void;
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
  addEventListener(type: 'close', fn: (e: { code: number }) => void): void;
}

export type GameSocketOptions = {
  token: string;
  matchId: string;
  url?: string; // default: /ws on this host; tests set it
  // Called once with a 4001 close, after the session was cleared.
  onUnauthorized?: () => void;
  createSocket?: (url: string) => SocketLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

const OPEN = 1;

// GameSocket keeps the WebSocket to the gateway alive: it reconnects with
// a growing wait and, every time it opens, sends join with the matchId of
// the session and the last tick it received.
export class GameSocket {
  private ws: SocketLike | null = null;
  private attempt = 0;
  private timer: unknown = null;
  private closed = false;
  private lastTick = 0;
  private readonly messageHandlers: ((msg: ServerMessage) => void)[] = [];
  private readonly statusHandlers: ((status: SocketStatus) => void)[] = [];

  constructor(private readonly opts: GameSocketOptions) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  onStatus(handler: (status: SocketStatus) => void): void {
    this.statusHandlers.push(handler);
  }

  // close ends the connection on purpose: no more retries.
  close(): void {
    this.closed = true;
    this.cancelRetry();
    const ws = this.ws;
    this.ws = null;
    ws?.close(CLOSE_NORMAL);
  }

  private open(): void {
    const ws = this.createSocket(this.opts.url ?? socketUrl(this.opts.token));
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (ws !== this.ws) return;
      this.send({
        type: 'join',
        matchId: session.loadSession()?.matchId || this.opts.matchId,
        lastTick: this.lastTick,
      });
      this.emitStatus({ state: 'connected' });
    });

    ws.addEventListener('message', (e) => {
      if (ws !== this.ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(e.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'snapshot') {
        this.attempt = 0;
        this.lastTick = msg.tick;
      }
      this.messageHandlers.forEach((handler) => handler(msg));
    });

    ws.addEventListener('close', (e) => {
      // A socket we already replaced or closed on purpose says nothing.
      if (ws !== this.ws || this.closed) return;
      this.ws = null;
      if (e.code === CLOSE_UNAUTHORIZED) {
        this.closed = true;
        session.clearSession();
        this.opts.onUnauthorized?.();
        return;
      }
      if (e.code === CLOSE_REPLACED) {
        this.closed = true;
        this.emitStatus({ state: 'replaced' });
        return;
      }
      if (e.code === CLOSE_NORMAL) {
        this.closed = true;
        return;
      }
      this.scheduleRetry();
    });
  }

  private scheduleRetry(): void {
    this.attempt++;
    this.emitStatus({ state: 'reconnecting', attempt: this.attempt });
    const setTimer =
      this.opts.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
    this.timer = setTimer(() => {
      this.timer = null;
      if (!this.closed) this.open();
    }, reconnectDelay(this.attempt));
  }

  private cancelRetry(): void {
    if (this.timer === null) return;
    const clearTimer =
      this.opts.clearTimer ?? ((timer) => window.clearTimeout(timer as number));
    clearTimer(this.timer);
    this.timer = null;
  }

  private emitStatus(status: SocketStatus): void {
    this.statusHandlers.forEach((handler) => handler(status));
  }

  private createSocket(url: string): SocketLike {
    if (this.opts.createSocket) return this.opts.createSocket(url);
    return new WebSocket(url) as unknown as SocketLike;
  }
}

function socketUrl(token: string): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const query = encodeURIComponent(token);
  return `${protocol}://${location.host}/ws?token=${query}`;
}

// Only one game socket is open at a time: the lobby's one is closed when
// the game screen opens its own.
let current: GameSocket | null = null;

export function openGameSocket(opts: GameSocketOptions): GameSocket {
  current?.close();
  current = new GameSocket(opts);
  return current;
}

export function closeGameSocket(): void {
  current?.close();
  current = null;
}
