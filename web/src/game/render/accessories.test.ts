import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACCESSORY_CELL_H,
  ACCESSORY_CELL_W,
  GOTA_ACCESSORIES,
  SPRITE_COLORS,
  SPRITE_FRAMES,
  accessoryCell,
  jimenaBakedImage,
  jimenaBakedUrl,
} from './sprites';
import { ACCESSORIES } from '../../ui/Gota';

const DIR = 'public/assets/characters/jimena/baked';

// Ancho y alto de un PNG: están en su cabecera (IHDR).
function pngSize(file: string) {
  const bytes = readFileSync(`${DIR}/${file}`);
  return { w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) };
}

describe('Jimena baked sheets', () => {
  it('has the same accessories as the shop and the gota sheets', () => {
    const ids = ACCESSORIES.map((a) => a.id).sort();
    expect([...GOTA_ACCESSORIES].sort()).toEqual(ids);
  });

  it('has a sheet of 14 frames for every color and accessory', () => {
    const ids = ['none', ...ACCESSORIES.map((a) => a.id)];
    for (const name of Object.values(SPRITE_COLORS)) {
      for (const id of ids) {
        expect(pngSize(`${name}-${id}.png`)).toEqual({
          w: ACCESSORY_CELL_W * SPRITE_FRAMES.length,
          h: ACCESSORY_CELL_H,
        });
      }
    }
  });

  it('names the sheet by color and accessory', () => {
    expect(jimenaBakedUrl('#F032E6', 'straw-hat')).toBe(
      '/assets/characters/jimena/baked/Magenta-straw-hat.png',
    );
    expect(jimenaBakedUrl('#e6194b')).toBe(
      '/assets/characters/jimena/baked/Red-none.png',
    );
    expect(jimenaBakedUrl('#e6194b', 'none')).toBe(
      '/assets/characters/jimena/baked/Red-none.png',
    );
    expect(jimenaBakedUrl('#123456', 'cap')).toBeNull();
  });

  it('picks the cell of each frame in the order of the sheets', () => {
    expect(SPRITE_FRAMES).toHaveLength(14);
    expect(accessoryCell('front').sx).toBe(0);
    expect(accessoryCell('back').sx).toBe(3 * ACCESSORY_CELL_W);
    expect(accessoryCell('right-passing2').sx).toBe(13 * ACCESSORY_CELL_W);
  });

  it('draws nothing while the sheet has not loaded', () => {
    expect(jimenaBakedImage('#123456')).toBeNull();
  });
});
