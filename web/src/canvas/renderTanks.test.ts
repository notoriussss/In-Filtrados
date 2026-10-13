import { describe, expect, it } from 'vitest';
import { tankColor } from './renderTanks';

describe('tankColor', () => {
  it('is green for a clean tank', () => {
    expect(tankColor(0)).toBe('rgb(106, 168, 79)');
  });

  it('is brown for a full tank', () => {
    expect(tankColor(100)).toBe('rgb(122, 74, 30)');
  });

  it('clamps values out of range', () => {
    expect(tankColor(-5)).toBe(tankColor(0));
    expect(tankColor(150)).toBe(tankColor(100));
  });
});
