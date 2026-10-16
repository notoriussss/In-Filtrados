import { describe, expect, it } from 'vitest';
import { stageScale } from './stage';

describe('stageScale', () => {
  it('fits 1920 × 1080 inside the window', () => {
    expect(stageScale(1920, 1080)).toBe(1);
    expect(stageScale(1280, 720)).toBeCloseTo(2 / 3);
    // Ventana alta: manda el ancho.
    expect(stageScale(960, 1080)).toBe(0.5);
  });
});
