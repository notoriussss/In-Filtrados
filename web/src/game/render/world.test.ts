import { describe, expect, it } from 'vitest';
import { tankLevel } from './world';

describe('tankLevel', () => {
  it('maps contamination to the clean-water frame', () => {
    expect(tankLevel({ contamination: 0, dead: false })).toBe(100);
    expect(tankLevel({ contamination: 35, dead: false })).toBe(70);
    expect(tankLevel({ contamination: 96, dead: false })).toBe(0);
  });

  it('shows a dead tank empty', () => {
    expect(tankLevel({ contamination: 10, dead: true })).toBe(0);
  });

  it('clamps out-of-range values', () => {
    expect(tankLevel({ contamination: -5, dead: false })).toBe(100);
    expect(tankLevel({ contamination: 140, dead: false })).toBe(0);
  });
});
