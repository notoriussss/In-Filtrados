import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_CELL_W,
  GHOST_FRAMES,
  GOTA_CELL_W,
  ghostCell,
  ghostCellIndex,
} from './sprites';

describe('ghostCellIndex', () => {
  it('steps through the four frames of the tail', () => {
    const seen = new Set<number>();
    for (let t = 0; t < 1000; t += 20) seen.add(ghostCellIndex(t, false, false));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('uses the mirrored cells when the ghost looks right', () => {
    for (let t = 0; t < 1000; t += 50) {
      const left = ghostCellIndex(t, false, false);
      expect(ghostCellIndex(t, true, false)).toBe(left + GHOST_FRAMES);
    }
  });

  it('keeps the tail still with reduced motion', () => {
    expect(ghostCellIndex(900, false, true)).toBe(0);
    expect(ghostCellIndex(900, true, true)).toBe(GHOST_FRAMES);
  });
});

describe('ghostCell', () => {
  it('points at the cell of the sheet', () => {
    expect(ghostCell(3, ACCESSORY_CELL_W, 165)).toEqual({
      sx: 3 * ACCESSORY_CELL_W,
      sy: 0,
      sw: ACCESSORY_CELL_W,
      sh: 165,
    });
    expect(ghostCell(0, GOTA_CELL_W, 56).sx).toBe(0);
  });
});
