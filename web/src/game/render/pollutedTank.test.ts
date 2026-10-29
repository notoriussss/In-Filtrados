import { describe, expect, it } from 'vitest';
import { pollutedPixels } from './pollutedTank';

// Tanque de 1 × 3: arriba y abajo cuerpo claro y en medio el medidor,
// azul con agua y gris sin ella.
const BODY = [203, 225, 232, 255];
const WATER = [79, 163, 216, 255];
const DRY = [31, 52, 66, 255];
const px = (...cells: number[][]) => new Uint8ClampedArray(cells.flat());

describe('pollutedPixels', () => {
  const full = px(BODY, WATER, BODY);
  const empty = px(BODY, DRY, BODY);
  const out = pollutedPixels(full, empty, 1, 3);

  it('turns the gauge water murky instead of blue', () => {
    const [r, g, b] = [out[4], out[5], out[6]];
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeLessThan(79);
  });

  it('settles sediment on the body, more at the base', () => {
    const top = 203 - out[0];
    const bottom = 203 - out[8];
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeGreaterThan(top);
    expect(out[10]).toBeLessThan(out[2]); // el azul cae más en la base
  });

  it('keeps transparency and does not touch the input', () => {
    const clear = px([0, 0, 0, 0], BODY, [0, 0, 0, 0]);
    const res = pollutedPixels(clear, clear, 1, 3);
    expect([res[3], res[11]]).toEqual([0, 0]);
    expect(Array.from(full)).toEqual([...BODY, ...WATER, ...BODY]);
  });
});
