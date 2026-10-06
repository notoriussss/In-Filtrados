import { describe, expect, it } from 'vitest';
import { gameMap, type Rect } from './map';

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

describe('shared/map.json', () => {
  it('is a 1600 x 1200 world', () => {
    expect(gameMap.width).toBe(1600);
    expect(gameMap.height).toBe(1200);
  });

  it('has the acequia ring plus the 7 zones of the game plan', () => {
    expect(gameMap.zones.map((z) => z.id)).toEqual([
      'acequia',
      'reservoir',
      'rooftops',
      'plaza',
      'treatment',
      'pumps',
      'garden',
      'laundry',
    ]);
  });

  it('keeps every wall, zone, station and tank inside the world', () => {
    for (const r of [...gameMap.walls, ...gameMap.zones]) {
      expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= gameMap.width && r.y + r.h <= gameMap.height).toBe(true);
    }
    for (const p of [...gameMap.stations, ...gameMap.tanks, gameMap.spawn]) {
      expect(inside({ x: 0, y: 0, w: gameMap.width, h: gameMap.height }, p.x, p.y)).toBe(true);
    }
  });

  it('spawns players in the plaza', () => {
    const plaza = gameMap.zones.find((z) => z.id === 'plaza')!;
    expect(inside(plaza, gameMap.spawn.x, gameMap.spawn.y)).toBe(true);
  });

  it('has 5 tank slots, all in the garden', () => {
    const garden = gameMap.zones.find((z) => z.id === 'garden')!;
    expect(gameMap.tanks.map((t) => t.slot)).toEqual([0, 1, 2, 3, 4]);
    for (const tank of gameMap.tanks) expect(inside(garden, tank.x, tank.y)).toBe(true);
  });

  it('crosses the canal only through 3 bridges', () => {
    // Walk a horizontal line through the middle of the canal and count the open stretches.
    const canalY = 660;
    const blocked = (x: number) => gameMap.walls.some((w) => inside(w, x, canalY));
    let gaps = 0;
    for (let x = 0; x < gameMap.width; x++) {
      if (!blocked(x) && blocked(x - 1)) gaps++;
    }
    expect(gaps).toBe(3);
  });
});
