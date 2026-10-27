import { HEARTBEAT_CHECK_MS, HEARTBEAT_TIMEOUT_MS } from './game.constants';

export type HeartbeatOptions = {
  // Se llama una sola vez cuando pasan timeoutMs sin seen().
  onDead: () => void;
  timeoutMs?: number;
  checkMs?: number;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (timer: unknown) => void;
};

// Heartbeat da por muerto a un WebSocket que deja de mandar mensajes
// (deployment-lab.md, 9.1). Quitar el cable no cierra la conexión TCP:
// sin esto, match nunca se entera de que el jugador se fue.
export class Heartbeat {
  private lastSeen: number;
  private timer: unknown = null;
  private readonly now: () => number;

  constructor(private readonly opts: HeartbeatOptions) {
    this.now = opts.now ?? Date.now;
    this.lastSeen = this.now();
  }

  start(): void {
    this.lastSeen = this.now();
    const setTimer =
      this.opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.timer = setTimer(
      () => this.check(),
      this.opts.checkMs ?? HEARTBEAT_CHECK_MS,
    );
  }

  // seen se llama con cada mensaje que llega del navegador.
  seen(): void {
    this.lastSeen = this.now();
  }

  stop(): void {
    if (this.timer === null) return;
    const clearTimer =
      this.opts.clearInterval ??
      ((timer) => clearInterval(timer as NodeJS.Timeout));
    clearTimer(this.timer);
    this.timer = null;
  }

  private check(): void {
    const timeout = this.opts.timeoutMs ?? HEARTBEAT_TIMEOUT_MS;
    if (this.now() - this.lastSeen < timeout) return;
    this.stop();
    this.opts.onDead();
  }
}
