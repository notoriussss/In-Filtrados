import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@in-filtrados/messages';
import {
  clockLevel,
  formatClock,
  matchSecondsLeft,
} from './matchClock';

const snap = (tick: number, matchEndsAtTick: number) =>
  ({ tick, matchEndsAtTick }) as Snapshot;

describe('matchSecondsLeft', () => {
  it('turns the ticks left into seconds at 20 ticks per second', () => {
    expect(matchSecondsLeft(snap(100, 100 + 20 * 90))).toBe(90);
  });

  it('rounds up so 00:00 only shows when the time is over', () => {
    expect(matchSecondsLeft(snap(0, 1))).toBe(1);
    expect(matchSecondsLeft(snap(100, 100))).toBe(0);
    expect(matchSecondsLeft(snap(120, 100))).toBe(0);
  });

  it('is null when match sent no end (lobby, ended) or no snapshot', () => {
    expect(matchSecondsLeft(snap(10, 0))).toBeNull();
    expect(matchSecondsLeft(null)).toBeNull();
  });

  it('stands still while the server tick does (pause)', () => {
    const a = matchSecondsLeft(snap(500, 9600));
    expect(matchSecondsLeft(snap(500, 9600))).toBe(a);
  });
});

describe('formatClock', () => {
  it('formats mm:ss', () => {
    expect(formatClock(480)).toBe('08:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(9)).toBe('00:09');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-3)).toBe('00:00');
  });
});

describe('clockLevel', () => {
  it('warns in the last minute and the last 10 seconds', () => {
    expect(clockLevel(61)).toBe('normal');
    expect(clockLevel(60)).toBe('low');
    expect(clockLevel(11)).toBe('low');
    expect(clockLevel(10)).toBe('critical');
    expect(clockLevel(0)).toBe('critical');
  });
});
