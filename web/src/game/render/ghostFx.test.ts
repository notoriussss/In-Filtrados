import { describe, expect, it } from 'vitest';
import { ghostAlpha, tailEdge } from './ghostFx';

describe('ghostAlpha', () => {
  it('shimmers softly and stays see-through', () => {
    for (let t = 0; t < 6000; t += 250) {
      const a = ghostAlpha(t, false);
      expect(a).toBeGreaterThan(0.5);
      expect(a).toBeLessThan(0.8);
    }
  });

  it('holds still with reduced motion', () => {
    expect(ghostAlpha(0, true)).toBe(ghostAlpha(1234, true));
  });
});

describe('tailEdge', () => {
  it('waves around a fixed height and moves with time', () => {
    const heights = [0, 0.25, 0.5, 0.75, 1].map((u) => tailEdge(u, 0));
    expect(Math.max(...heights)).toBeGreaterThan(Math.min(...heights));
    for (const h of heights) expect(Math.abs(h - 14)).toBeLessThanOrEqual(3);
    expect(tailEdge(0.2, 0)).not.toBe(tailEdge(0.2, 400));
  });
});
