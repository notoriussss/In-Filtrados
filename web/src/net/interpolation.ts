import type { PlayerView } from '@in-filtrados/messages';

// S1-19: the server sends 20 snapshots per second; the screen draws 60
// frames per second. Players are drawn 100 ms in the past, between the
// two snapshots around that moment, so the movement looks smooth.
export const TICK_MS = 50; // 20 Hz (docs/tasks.md 0.4)
export const INTERPOLATION_DELAY_MS = 100;

// 4 snapshots = 200 ms, enough to always have the two around the
// moment drawn (100 ms ago) even if one arrives late.
const BUFFER_SIZE = 4;
// A late snapshot beyond this resyncs the clock instead of waiting.
const RESYNC_MS = 500;
// A jump longer than this (a teleport to the meeting) is not smoothed.
const TELEPORT_DISTANCE = 100;

type Stored = { tick: number; players: PlayerView[] };

export class Interpolator {
  private buffer: Stored[] = [];
  // offset turns a server tick into local time: tick * TICK_MS + offset.
  private offset: number | null = null;

  push(tick: number, players: PlayerView[], now: number): void {
    const sample = now - tick * TICK_MS;
    const latest = this.buffer.at(-1);
    const restarted = latest !== undefined && tick <= latest.tick;
    if (this.offset === null || restarted || sample - this.offset > RESYNC_MS) {
      this.offset = sample;
      this.buffer = [];
    }
    // The fastest snapshot is the best guess of the server clock.
    this.offset = Math.min(this.offset, sample);
    this.buffer.push({ tick, players });
    if (this.buffer.length > BUFFER_SIZE) this.buffer.shift();
  }

  // tickAt is the server tick drawn at local time now, with the same
  // delay as the players; null before the first snapshot (S2-12).
  tickAt(now: number): number | null {
    if (this.offset === null) return null;
    return (now - INTERPOLATION_DELAY_MS - this.offset) / TICK_MS;
  }

  playersAt(now: number): PlayerView[] {
    const first = this.buffer[0];
    const last = this.buffer.at(-1);
    if (!first || !last || this.offset === null) return [];

    const tick = (now - INTERPOLATION_DELAY_MS - this.offset) / TICK_MS;
    if (tick >= last.tick) return last.players;
    if (tick <= first.tick) return first.players;

    let i = 1;
    while (this.buffer[i].tick < tick) i++;
    const a = this.buffer[i - 1];
    const b = this.buffer[i];
    const t = (tick - a.tick) / (b.tick - a.tick);
    return blend(a.players, b.players, t);
  }
}

// blend takes everything from b and moves each player between its
// positions in a and b; t is 0 at a and 1 at b.
function blend(a: PlayerView[], b: PlayerView[], t: number): PlayerView[] {
  const before = new Map(a.map((p) => [p.id, p]));
  return b.map((p) => {
    const from = before.get(p.id);
    const jump = from ? Math.hypot(p.x - from.x, p.y - from.y) : Infinity;
    if (!from || jump > TELEPORT_DISTANCE) return p;
    return {
      ...p,
      x: from.x + (p.x - from.x) * t,
      y: from.y + (p.y - from.y) * t,
    };
  });
}
