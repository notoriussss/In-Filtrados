import { describe, expect, it } from 'vitest';
import {
  MATCH_MINUTES,
  MATCH_MINUTES_OPTIONS,
  impostorOptions,
  maxImpostors,
  shownImpostors,
  shownMatchMinutes,
} from './matchConfig';

describe('impostor count', () => {
  it('caps at half the players minus one, and never below 1', () => {
    const cases: [number, number][] = [
      [1, 1],
      [2, 1],
      [4, 1],
      [5, 2],
      [7, 3],
      [9, 4],
      [10, 4],
    ];
    for (const [players, want] of cases) {
      expect(maxImpostors(players)).toBe(want);
    }
  });

  it('offers 1 up to the cap', () => {
    expect(impostorOptions(3)).toEqual([1]);
    expect(impostorOptions(9)).toEqual([1, 2, 3, 4]);
  });

  it('shows the snapshot value, or 1 without one', () => {
    expect(shownImpostors(3)).toBe(3);
    expect(shownImpostors(0)).toBe(1);
    expect(shownImpostors(undefined)).toBe(1);
  });
});

describe('match minutes', () => {
  it('offers values inside the range, including the default', () => {
    for (const n of MATCH_MINUTES_OPTIONS) {
      expect(n).toBeGreaterThanOrEqual(MATCH_MINUTES.MIN);
      expect(n).toBeLessThanOrEqual(MATCH_MINUTES.MAX);
    }
    expect(MATCH_MINUTES_OPTIONS).toContain(MATCH_MINUTES.DEFAULT);
  });

  it('shows the snapshot value, or the default without one', () => {
    expect(shownMatchMinutes(12)).toBe(12);
    expect(shownMatchMinutes(0)).toBe(8);
    expect(shownMatchMinutes(undefined)).toBe(8);
  });
});
