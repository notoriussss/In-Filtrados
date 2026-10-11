import { describe, expect, it } from 'vitest';
import { OIL_DROP_LIFE_TICKS, oilDropAlpha } from './renderOilDrops';

describe('oilDropAlpha', () => {
  const expires = 1000;

  it('is 1 for a drop that just fell', () => {
    expect(oilDropAlpha(expires, expires - OIL_DROP_LIFE_TICKS)).toBe(1);
  });

  it('is 0.5 halfway to expiring', () => {
    const half = expires - OIL_DROP_LIFE_TICKS / 2;
    expect(oilDropAlpha(expires, half)).toBe(0.5);
  });

  it('is 0 once expired', () => {
    expect(oilDropAlpha(expires, expires)).toBe(0);
    expect(oilDropAlpha(expires, expires + 20)).toBe(0);
  });

  it('never goes above 1', () => {
    expect(oilDropAlpha(expires, 0)).toBe(1);
  });
});
