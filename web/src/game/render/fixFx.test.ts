import type { Emergency } from '@in-filtrados/messages';
import { describe, expect, it } from 'vitest';
import { FixEffects, backOut, fixOutcome } from './fixFx';

const steam = (held: string[]): Emergency => ({
  kind: 'steam',
  endsAtTick: 0,
  heldPoints: held,
});
const pipe = (held: string[], endsAtTick = 700): Emergency => ({
  kind: 'pipe',
  endsAtTick,
  heldPoints: held,
});

// run avanza el reloj cada 16 ms con la misma emergencia.
function run(
  fx: FixEffects,
  e: Emergency | null,
  tick: number,
  from: number,
  to: number,
): void {
  for (let t = from; t <= to; t += 16) fx.update(e, tick, t);
}

describe('fixOutcome', () => {
  it('closes the steam only if someone was holding the valve', () => {
    expect(fixOutcome('steam', 10, 0, true)).toBe('fixed');
    expect(fixOutcome('steam', 10, 0, false)).toBe('cancelled');
  });

  it('bursts the pipe when the clock ran out', () => {
    expect(fixOutcome('pipe', 699, 700, false)).toBe('burst');
    expect(fixOutcome('pipe', 700, 700, true)).toBe('burst');
  });

  it('fixes the pipe when it ended early with someone holding', () => {
    expect(fixOutcome('pipe', 400, 700, true)).toBe('fixed');
  });

  it('shows nothing when it ended early with nobody holding', () => {
    expect(fixOutcome('pipe', 400, 700, false)).toBe('cancelled');
    expect(fixOutcome('pipe', null, 700, true)).toBe('fixed');
  });
});

describe('FixEffects', () => {
  it('reports a fixed steam leak once the valve is closed', () => {
    const fx = new FixEffects();
    run(fx, steam([]), 100, 0, 400);
    run(fx, steam(['steam-valve']), 120, 416, 1500);
    fx.update(null, 140, 1516);
    expect(fx.outcomes).toEqual(['fixed']);
  });

  it('reports a burst pipe at the deadline', () => {
    const fx = new FixEffects();
    run(fx, pipe([]), 100, 0, 400);
    fx.update(pipe([]), 698, 416);
    fx.update(null, 699, 432);
    expect(fx.outcomes).toEqual(['burst']);
  });

  it('forgets the ending after its animation', () => {
    const fx = new FixEffects();
    run(fx, steam(['steam-valve']), 100, 0, 600);
    fx.update(null, 140, 616);
    expect(fx.outcomes).toHaveLength(1);
    fx.update(null, 200, 616 + 3000);
    expect(fx.outcomes).toEqual([]);
  });

  it('does not celebrate when the emergency was never held', () => {
    const fx = new FixEffects();
    run(fx, steam([]), 100, 0, 800);
    fx.update(null, 120, 816);
    expect(fx.outcomes).toEqual([]);
  });
});

describe('backOut', () => {
  it('starts at 0, overshoots, and settles at 1', () => {
    expect(backOut(0)).toBeCloseTo(0);
    expect(backOut(0.7)).toBeGreaterThan(1);
    expect(backOut(1)).toBeCloseTo(1);
  });
});
