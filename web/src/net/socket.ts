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

// Heartbeat (deployment-lab.md, 9.1): quitar el cable no cierra el
// WebSocket, así que el navegador manda ping cada 2 s y da la conexión
// por caída si pasan 5 s sin recibir nada. Un socket que no abre en 5 s
// también se da por caído (un host apagado deja el SYN colgado).
export const HEARTBEAT_INTERVAL_MS = 2000;
export const HEARTBEAT_TIMEOUT_MS = 5000;
export const CONNECT_TIMEOUT_MS = 5000;
const WATCHDOG_MS = 1000;

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
  // Reloj e intervalo del heartbeat; las pruebas pasan unos falsos.
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (timer: unknown) => void;
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
  private watchdog: unknown = null;
  private openedAt = 0; // cuándo se creó el socket actual
  private lastSeen = 0; // último mensaje recibido
  private lastPing = 0;
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
    this.stopWatchdog();
    const ws = this.ws;
    this.ws = null;
    ws?.close(CLOSE_NORMAL);
  }

  private open(): void {
    const ws = this.createSocket(this.opts.url ?? socketUrl(this.opts.token));
    this.ws = ws;
    this.openedAt = this.now();
    this.startWatchdog();

    ws.addEventListener('open', () => {
      if (ws !== this.ws) return;
      this.lastSeen = this.now();
      this.lastPing = this.lastSeen;
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
      this.lastSeen = this.now();
      if (msg.type === 'pong') return; // solo sirve de heartbeat
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
      this.stopWatchdog();
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

  // drop da por caído al socket actual sin esperar su 'close', que con
  // la red cortada puede tardar minutos, y reintenta como siempre. Los
  // eventos que lleguen después del socket viejo se ignoran.
  private drop(): void {
    const ws = this.ws;
    this.ws = null;
    this.stopWatchdog();
    ws?.close();
    this.scheduleRetry();
  }

  // startWatchdog revisa cada segundo el socket actual: si no abre a
  // tiempo o deja de recibir, lo da por caído; si no, manda el ping.
  private startWatchdog(): void {
    this.stopWatchdog();
    const setInterval =
      this.opts.setInterval ??
      ((fn, ms) => globalThis.setInterval(fn, ms));
    this.watchdog = setInterval(() => this.checkAlive(), WATCHDOG_MS);
  }

  private stopWatchdog(): void {
    if (this.watchdog === null) return;
    const clearInterval =
      this.opts.clearInterval ??
      ((timer) => globalThis.clearInterval(timer as number));
    clearInterval(this.watchdog);
    this.watchdog = null;
  }

  private checkAlive(): void {
    const ws = this.ws;
    if (!ws || this.closed) return;
    const now = this.now();
    if (ws.readyState !== OPEN) {
      if (now - this.openedAt >= CONNECT_TIMEOUT_MS) this.drop();
      return;
    }
    if (now - this.lastSeen >= HEARTBEAT_TIMEOUT_MS) {
      this.drop();
      return;
    }
    if (now - this.lastPing >= HEARTBEAT_INTERVAL_MS) {
      this.lastPing = now;
      this.send({ type: 'ping' });
    }
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
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
