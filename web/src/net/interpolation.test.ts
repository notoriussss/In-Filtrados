import { describe, expect, it } from 'vitest';
import type { PlayerView } from '@in-filtrados/messages';
import {
  INTERPOLATION_DELAY_MS,
  Interpolator,
  TICK_MS,
} from './interpolation';

const at = (x: number, y = 0, id = 'a'): PlayerView => ({
  id,
  name: id,
  color: '#fff',
  x,
  y,
  connected: true,
  alive: true,
});

// feed pushes ticks 0..n-1 arriving exactly every 50 ms from t=1000,
// with player a moving 10 units per tick.
function feed(n: number): Interpolator {
  const it = new Interpolator();
  for (let tick = 0; tick < n; tick++) {
    it.push(tick, [at(tick * 10)], 1000 + tick * TICK_MS);
  }
  return it;
}

describe('Interpolator', () => {
  it('draws 100 ms in the past, between two snapshots', () => {
    const it = feed(4); // last tick 3 arrived at 1150
    const xAt = (now: number) => it.playersAt(now)[0].x;

    expect(xAt(1150)).toBe(10); // tick 1 = 100 ms before tick 3
    expect(xAt(1175)).toBe(15); // halfway between ticks 1 and 2
    expect(xAt(1150 + INTERPOLATION_DELAY_MS)).toBe(30);
  });

  it('moves a little every frame at 60 fps (no jumps)', () => {
    const it = feed(4);
    const xs = [0, 1, 2, 3, 4, 5].map(
      (f) => it.playersAt(1150 + (f * 1000) / 60)[0].x,
    );
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      expect(xs[i] - xs[i - 1]).toBeLessThan(5);
    }
  });

  it('never extrapolates past the last snapshot', () => {
    const it = feed(4);
    expect(it.playersAt(5000)[0].x).toBe(30);
  });

  it('uses the fastest arrival as the clock, so jitter is ignored', () => {
    const it = new Interpolator();
    it.push(0, [at(0)], 1000);
    it.push(1, [at(10)], 1080); // 30 ms late
    it.push(2, [at(20)], 1100); // on time
    expect(it.playersAt(1150)[0].x).toBe(10);
  });

  it('does not smooth a teleport', () => {
    const it = new Interpolator();
    it.push(0, [at(0)], 1000);
    it.push(1, [at(500)], 1050);
    it.push(2, [at(500)], 1100);
    expect(it.playersAt(1125)[0].x).toBe(500);
  });

  it('shows players that just joined at their position', () => {
    const it = new Interpolator();
    it.push(0, [at(0)], 1000);
    it.push(1, [at(10), at(300, 40, 'b')], 1050);
    it.push(2, [at(20), at(300, 40, 'b')], 1100);
    const b = it.playersAt(1125).find((p) => p.id === 'b');
    expect(b).toMatchObject({ x: 300, y: 40 });
  });

  it('starts over when the ticks go back (another match)', () => {
    const it = feed(4);
    it.push(0, [at(999)], 9000);
    expect(it.playersAt(9000)[0].x).toBe(999);
  });

  it('draws nothing before the first snapshot', () => {
    expect(new Interpolator().playersAt(1000)).toEqual([]);
  });
});

describe('Interpolator.tickAt', () => {
  it('is null before the first snapshot', () => {
    expect(new Interpolator().tickAt(1000)).toBeNull();
  });

  it('uses the same delay as the players', () => {
    const it = feed(4);
    const now = 1000 + 3 * TICK_MS + INTERPOLATION_DELAY_MS;
    expect(it.tickAt(now)).toBe(3);
  });
});
