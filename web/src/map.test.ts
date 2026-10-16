import { describe, expect, it } from 'vitest';
import { gameMap, type Rect, zoneRoom } from './map';

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// shared/map.json es «Estación Manglar Verde» del paquete de diseño v3
// (docs/design/in-filtrados-ui-v3/mapas/ecologico-manglar-verde).
describe('shared/map.json', () => {
  it('is the 2752 x 1824 Manglar Verde map', () => {
    expect(gameMap.id).toBe('manglar-verde');
    expect(gameMap.width).toBe(2752);
    expect(gameMap.height).toBe(1824);
  });

  it('keeps every wall, zone, station and tank inside the world', () => {
    const world = { x: 0, y: 0, w: gameMap.width, h: gameMap.height };
    for (const r of [...gameMap.walls, ...gameMap.zones]) {
      expect(
        r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.w <= gameMap.width &&
          r.y + r.h <= gameMap.height,
      ).toBe(true);
    }
    const points = [
      ...gameMap.stations,
      ...gameMap.tanks,
      ...gameMap.fixPoints,
      gameMap.spawn,
    ];
    for (const p of points) expect(inside(world, p.x, p.y)).toBe(true);
  });

  it('spawns players on the mirador', () => {
    const mirador = gameMap.zones.filter((z) => zoneRoom(z) === 'mirador');
    expect(
      mirador.some((z) => inside(z, gameMap.spawn.x, gameMap.spawn.y)),
    ).toBe(true);
  });

  it('has 4 stations of each R, each one in a room of the map', () => {
    const count = (type: string) =>
      gameMap.stations.filter((s) => s.type === type).length;
    expect([count('reduce'), count('reuse'), count('recycle')]).toEqual([
      4, 4, 4,
    ]);
    const rooms = new Set(gameMap.zones.map(zoneRoom));
    for (const s of gameMap.stations) expect(rooms.has(s.room!)).toBe(true);
  });

  it('has 10 tank slots and the 3 sabotage fix points', () => {
    expect(gameMap.tanks.map((t) => t.slot)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(gameMap.fixPoints.map((f) => f.kind).sort()).toEqual([
      'pipe',
      'pipe',
      'steam',
    ]);
  });
});
