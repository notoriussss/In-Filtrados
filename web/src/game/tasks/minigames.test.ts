import { describe, expect, it } from 'vitest';
import {
  BOARD,
  BUCKET_COUNT,
  BUCKET_SIZE,
  BucketsGame,
  JugFilterGame,
  JUG_BUCKET_HOME,
  JUG_FILTER_MS,
  JUG_ROUNDS,
  JUG_SIZE,
  JUG_TAP,
  JUG_TOP,
  FILL_COUNT,
  FILL_MARK,
  FILL_RATE,
  FLOOR_Y,
  FillGame,
  FirstRainGame,
  MIN_GAME_MS,
  PARTICLE_COUNT,
  ParticlesGame,
  PRESSURE_BUTTON,
  PRESSURE_HITS,
  PRESSURE_SWEEP_MS,
  PRESSURE_ZONE_HI,
  PRESSURE_ZONE_LO,
  PRESSURE_ZONE_SHRINK,
  PRESSURE_ZONE_START,
  PressureGame,
  RAIN_CLEAN_GOAL,
  type RainDrop,
  RAIN_FALL_MS,
  RAIN_GAP_MS,
  RAIN_LEVER,
  RAIN_MAX_DROPS,
  RAIN_DIRTY_MAX,
  REUSE_TANK,
  SEAL_CRACK_AFTER_MS,
  SEAL_GOAL,
  SealGame,
  VALVE_FILL_MS,
  ValveGame,
  PipesGame,
  StreamGame,
  STREAM_END_X,
  STREAM_GOAL,
  STREAM_SPEED,
  STREAM_START_X,
  PIPES_COLS,
  PIPES_GRID,
  PIPES_TILE,
  WateringGame,
  type WaterKind,
  WATERING_COUNT,
  WATERING_HOME,
  WATERING_PLOT,
  WATERING_SIZE,
  WATERING_TREAT,
  hash01,
  createMinigame,
} from './minigames';

describe('createMinigame', () => {
  it('maps each 3R type to its game', () => {
    expect(createMinigame('reduce')).toBeInstanceOf(ValveGame);
    expect(createMinigame('reuse')).toBeInstanceOf(BucketsGame);
    expect(createMinigame('recycle')).toBeInstanceOf(ParticlesGame);
  });

  it('gives each station its own game (docs/design/minigames-3r.md)', () => {
    expect(createMinigame('reduce', 'valve-1')).toBeInstanceOf(PressureGame);
    expect(createMinigame('reduce', 'valve-2')).toBeInstanceOf(FillGame);
    expect(createMinigame('reduce', 'leak-2')).toBeInstanceOf(SealGame);
    expect(createMinigame('reuse', 'rain-1')).toBeInstanceOf(FirstRainGame);
    expect(createMinigame('reuse', 'rain-2')).toBeInstanceOf(FirstRainGame);
    expect(createMinigame('reuse', 'greywater-2')).toBeInstanceOf(WateringGame);
    expect(createMinigame('recycle', 'compost-1')).toBeInstanceOf(JugFilterGame);
    expect(createMinigame('recycle', 'sorter-1')).toBeInstanceOf(PipesGame);
    expect(createMinigame('recycle', 'filter-2')).toBeInstanceOf(StreamGame);
  });

  it('keeps the type game as fallback for the rest of the stations', () => {
    expect(createMinigame('reduce', 'leak-1')).toBeInstanceOf(ValveGame);
    expect(createMinigame('reuse', 'greywater-1')).toBeInstanceOf(BucketsGame);
    expect(createMinigame('recycle', 'filter-1')).toBeInstanceOf(ParticlesGame);
  });
});

describe('ValveGame', () => {
  it('fills only while held and keeps progress when released', () => {
    const g = new ValveGame();
    g.step(1000);
    expect(g.progress()).toBe(0);
    g.pointerDown(g.center);
    g.step(VALVE_FILL_MS / 2);
    g.pointerUp();
    g.step(1000);
    expect(g.progress()).toBeCloseTo(0.5);
    g.pointerDown(g.center);
    g.step(VALVE_FILL_MS / 2);
    expect(g.done).toBe(true);
  });

  it('ignores presses away from the valve', () => {
    const g = new ValveGame();
    g.pointerDown({ x: 340, y: 20 });
    g.step(VALVE_FILL_MS);
    expect(g.done).toBe(false);
  });

  it('takes between 3 and 6 seconds', () => {
    expect(VALVE_FILL_MS).toBeGreaterThanOrEqual(3000);
    expect(VALVE_FILL_MS).toBeLessThanOrEqual(6000);
  });
});

describe('minigame events', () => {
  it('reports a grab and a release on the valve', () => {
    const g = new ValveGame();
    g.pointerDown(g.center);
    g.pointerUp();
    expect(g.drainEvents().map((e) => e.type)).toEqual(['grab', 'release']);
    expect(g.drainEvents()).toEqual([]);
  });

  it('does not repeat the grab while the valve is already held', () => {
    const g = new ValveGame();
    g.pointerDown(g.center);
    g.pointerDown(g.center);
    expect(g.drainEvents()).toHaveLength(1);
  });

  it('reports where a bucket was dropped and whether it went in', () => {
    const g = new BucketsGame();
    const mid = (i: number) => ({
      x: g.buckets[i].x + BUCKET_SIZE / 2,
      y: g.buckets[i].y + BUCKET_SIZE / 2,
    });
    g.pointerDown(mid(0));
    g.pointerMove({ x: 150, y: 20 });
    g.pointerUp();
    g.pointerDown(mid(1));
    g.pointerMove({ x: REUSE_TANK.x + 50, y: REUSE_TANK.y + 80 });
    g.pointerUp();
    const types = g.drainEvents().map((e) => e.type);
    expect(types).toEqual(['grab', 'drop-out', 'grab', 'drop-in']);
  });

  it('reports a popped particle and a missed click', () => {
    const g = new ParticlesGame();
    g.pointerDown({ x: 10, y: 250 });
    g.pointerDown(g.positionOf(g.particles[1]));
    const [miss, pop] = g.drainEvents();
    expect(miss.type).toBe('miss');
    expect(pop).toMatchObject({ type: 'pop', index: 1 });
  });
});

describe('minigame board', () => {
  it('keeps every bucket and the tank on the floor line', () => {
    const g = new BucketsGame();
    const last = g.buckets[BUCKET_COUNT - 1];
    expect(last.y + BUCKET_SIZE).toBe(FLOOR_Y);
    expect(REUSE_TANK.y + REUSE_TANK.h).toBe(FLOOR_Y);
  });

  it('floats every particle inside the aquarium', () => {
    const g = new ParticlesGame();
    for (let t = 0; t < 6000; t += 250) {
      g.step(250);
      for (const p of g.particles) {
        const pos = g.positionOf(p);
        expect(pos.x).toBeGreaterThan(110);
        expect(pos.x).toBeLessThan(BOARD.w - 8);
        expect(pos.y).toBeGreaterThan(60);
        expect(pos.y).toBeLessThan(FLOOR_Y - 14);
      }
    }
  });
});

describe('BucketsGame', () => {
  const center = (g: BucketsGame, i: number) => ({
    x: g.buckets[i].x + BUCKET_SIZE / 2,
    y: g.buckets[i].y + BUCKET_SIZE / 2,
  });
  const tankCenter = {
    x: REUSE_TANK.x + REUSE_TANK.w / 2,
    y: REUSE_TANK.y + REUSE_TANK.h / 2,
  };

  it('counts a bucket dropped in the tank', () => {
    const g = new BucketsGame();
    g.pointerDown(center(g, 0));
    g.pointerMove(tankCenter);
    g.pointerUp();
    expect(g.filled).toBe(1);
    expect(g.done).toBe(false);
  });

  it('sends a bucket dropped outside back home', () => {
    const g = new BucketsGame();
    const home = { x: g.buckets[1].x, y: g.buckets[1].y };
    g.pointerDown(center(g, 1));
    g.pointerMove({ x: 150, y: 20 });
    g.pointerUp();
    expect(g.filled).toBe(0);
    expect({ x: g.buckets[1].x, y: g.buckets[1].y }).toEqual(home);
  });

  it('is done after all buckets are in', () => {
    const g = new BucketsGame();
    for (let i = 0; i < BUCKET_COUNT; i++) {
      g.pointerDown(center(g, i));
      g.pointerMove(tankCenter);
      g.pointerUp();
    }
    expect(g.done).toBe(true);
    expect(g.progress()).toBe(1);
  });
});

describe('ParticlesGame', () => {
  it('removes a particle clicked where it floats now', () => {
    const g = new ParticlesGame();
    g.step(1234);
    g.pointerDown(g.positionOf(g.particles[2]));
    expect(g.particles[2].removed).toBe(true);
    expect(g.removed).toBe(1);
  });

  it('misses clicks on clean water', () => {
    const g = new ParticlesGame();
    g.pointerDown({ x: 10, y: 250 });
    expect(g.removed).toBe(0);
  });

  it('is done after every particle is clicked', () => {
    const g = new ParticlesGame();
    for (const p of g.particles) {
      g.step(300);
      g.pointerDown(g.positionOf(p));
    }
    expect(g.removed).toBe(PARTICLE_COUNT);
    expect(g.done).toBe(true);
  });
});

// ─── Minijuegos por estación ────────────────────────────────────────────

describe('StreamGame', () => {
  // Corre el arroyo sin tocar nada: n pasos de 50 ms.
  const run = (g: StreamGame, ms: number) => {
    for (let t = 0; t < ms; t += 50) g.step(50);
  };

  it('sends the first piece of trash right away, drifting to the right', () => {
    const g = new StreamGame(() => 0);
    g.step(50);
    expect(g.items.length).toBe(1);
    const x0 = g.items[0].x;
    expect(x0).toBeGreaterThanOrEqual(STREAM_START_X);
    g.step(1000);
    expect(g.items[0].x).toBeCloseTo(x0 + STREAM_SPEED, 0);
  });

  it('takes a piece out with a click on it, the nearest one', () => {
    const g = new StreamGame(() => 0);
    run(g, 1000);
    const it = g.items[0];
    g.pointerDown({ x: it.x + 3, y: it.y - 3 });
    expect(g.caught).toBe(1);
    expect(g.items.includes(it)).toBe(false);
    expect(g.drainEvents().some((e) => e.type === 'pop')).toBe(true);
  });

  it('ignores clicks away from the trash', () => {
    const g = new StreamGame(() => 0);
    run(g, 500);
    g.pointerDown({ x: 330, y: 20 });
    expect(g.caught).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true);
  });

  it('lets a piece through at the intake without counting it', () => {
    const g = new StreamGame(() => 0);
    run(g, ((STREAM_END_X - STREAM_START_X) / STREAM_SPEED) * 1000 + 100);
    expect(g.escaped).toBeGreaterThanOrEqual(1);
    expect(g.caught).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'spill')).toBe(true);
  });

  it('keeps sending trash even if nothing is caught', () => {
    const g = new StreamGame(() => 0);
    run(g, 30000);
    expect(g.escaped).toBeGreaterThan(STREAM_GOAL * 2);
    expect(g.items.length).toBeGreaterThan(0);
  });

  it('is done after STREAM_GOAL pieces, but not before 3 s', () => {
    const g = new StreamGame(() => 0);
    while (g.caught < STREAM_GOAL) {
      g.step(50);
      for (const it of [...g.items]) g.pointerDown({ x: it.x, y: it.y });
    }
    expect(g.progress()).toBe(1);
    expect(g.done).toBe(g.elapsed >= MIN_GAME_MS);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });
});

describe('PipesGame', () => {
  const seeded = (seed: number) => {
    let n = seed * 17;
    return () => hash01(n++);
  };
  const center = (t: { col: number; row: number }) => ({
    x: PIPES_GRID.x + (t.col + 0.5) * PIPES_TILE,
    y: PIPES_GRID.y + (t.row + 0.5) * PIPES_TILE,
  });
  const solve = (g: PipesGame) => {
    for (const t of g.tiles) t.rot = t.solution;
  };

  it('is built as a path from the first column to the last', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = new PipesGame(seeded(seed));
      const t = g.tiles;
      expect(t[0].col).toBe(0);
      expect(t[0].row).toBe(g.startRow);
      expect(t[t.length - 1].col).toBe(PIPES_COLS - 1);
      expect(t[t.length - 1].row).toBe(g.endRow);
      for (let i = 1; i < t.length; i++) {
        const step =
          Math.abs(t[i].col - t[i - 1].col) + Math.abs(t[i].row - t[i - 1].row);
        expect(step).toBe(1);
        expect(t[i].col).toBeGreaterThanOrEqual(t[i - 1].col);
      }
      expect(t.length).toBeGreaterThanOrEqual(PIPES_COLS);
    }
  });

  it('never starts already connected', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = new PipesGame(seeded(seed));
      expect(g.connected).toBe(false);
      // Ningún tramo empieza bien puesto: el agua no sale de la fuente.
      expect(g.flow).toBe(0);
    }
  });

  it('turns a path tile a quarter on click and ignores the rest', () => {
    const g = new PipesGame(seeded(3));
    const t = g.tiles[0];
    const before = t.rot;
    g.pointerDown(center(t));
    expect(t.rot).toBe((before + 1) % 4);
    expect(g.drainEvents().some((e) => e.type === 'pop')).toBe(true);
    // Fuera de la cuadrícula no pasa nada.
    g.pointerDown({ x: 2, y: 2 });
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true);
    expect(t.rot).toBe((before + 1) % 4);
  });

  it('lets the water through the tiles that are already in place', () => {
    const g = new PipesGame(seeded(5));
    expect(g.flow).toBeLessThan(g.tiles.length);
    g.tiles[0].rot = g.tiles[0].solution;
    expect(g.flow).toBeGreaterThanOrEqual(1);
    solve(g);
    expect(g.flow).toBe(g.tiles.length);
    expect(g.connected).toBe(true);
    expect(g.progress()).toBe(1);
  });

  it('is done once connected, but not before 3 s', () => {
    const g = new PipesGame(seeded(7));
    solve(g);
    expect(g.connected).toBe(true);
    expect(g.done).toBe(false);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });

  it('deals a different route each game', () => {
    const routes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const g = new PipesGame(seeded(seed));
      routes.add(g.tiles.map((t) => `${t.col}${t.row}`).join());
    }
    expect(routes.size).toBeGreaterThan(3);
  });
});

// Nivel de la aguja del juego g al tiempo t (ms), con el desface de
// su semilla.
const levelOf = (g: PressureGame, t: number): number =>
  (1 - Math.cos(((t + g.phaseMs) / PRESSURE_SWEEP_MS) * Math.PI)) / 2;

// timeAtLevel busca el primer instante desde `from` en que la aguja
// pasa por `target`; siempre lo encuentra (barre todo el rango).
function timeAtLevel(
  g: PressureGame,
  target: number,
  from: number,
): number {
  for (let t = from; t <= from + PRESSURE_SWEEP_MS * 2; t += 2) {
    if (Math.abs(levelOf(g, t) - target) <= 0.004) return t;
  }
  throw new Error(`la aguja nunca pasa por ${target}`);
}

function timeOffBand(g: PressureGame, from: number): number {
  for (let t = from; t <= from + PRESSURE_SWEEP_MS * 2; t += 2) {
    if (Math.abs(levelOf(g, t) - g.zoneCenter) > g.zoneHalf) return t;
  }
  throw new Error('la aguja nunca sale de la franja');
}

describe('PressureGame', () => {
  const press = (g: PressureGame, at: number): void => {
    g.step(at - g.elapsed);
    const b = PRESSURE_BUTTON;
    g.pointerDown({ x: b.x + 10, y: b.y + 10 });
    g.pointerUp();
  };

  it('misses a press outside the button', () => {
    const g = new PressureGame(42);
    g.pointerDown({ x: 10, y: 10 });
    expect(g.drainEvents().map((e) => e.type)).toEqual(['miss']);
    expect(g.hits).toBe(0);
  });

  it('misses a press in the button but outside the band', () => {
    const g = new PressureGame(42);
    press(g, timeOffBand(g, 0));
    expect(g.hits).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true);
  });

  it('hits when pressed while the needle is in the band, and tightens', () => {
    const g = new PressureGame(42);
    press(g, timeAtLevel(g, g.zoneCenter, 0));
    expect(g.hits).toBe(1);
    expect(g.zoneHalf).toBeCloseTo(
      PRESSURE_ZONE_START - PRESSURE_ZONE_SHRINK,
    );
    expect(g.zoneCenter).toBeCloseTo(
      PRESSURE_ZONE_LO +
        (PRESSURE_ZONE_HI - PRESSURE_ZONE_LO) * hash01(42 + 13 + 5),
    );
    press(g, timeAtLevel(g, g.zoneCenter, g.elapsed));
    press(g, timeAtLevel(g, g.zoneCenter, g.elapsed));
    expect(g.hits).toBe(PRESSURE_HITS);
    // Estos tres toques ya tomaron más de 3 s de reloj: está listo.
    expect(g.done).toBe(true);
  });

  it('deals a different round with a different seed', () => {
    const a = new PressureGame(1);
    const b = new PressureGame(2);
    // La franja arranca en otra altura y la aguja en otro punto.
    expect(a.zoneCenter).not.toBe(b.zoneCenter);
    expect(a.phaseMs).not.toBe(b.phaseMs);
    expect(a.level).not.toBe(b.level);
    // La franja nunca sale de su rango alcanzable.
    for (const g of [a, b]) {
      expect(g.zoneCenter).toBeGreaterThanOrEqual(PRESSURE_ZONE_LO);
      expect(g.zoneCenter).toBeLessThanOrEqual(PRESSURE_ZONE_HI);
    }
  });
});

describe('FillGame', () => {
  const HOLD = { x: 20, y: 20 }; // sostener: cualquier lado sirve
  const msToFill = Math.ceil(FILL_MARK / FILL_RATE) + 10;

  it('rises while held and waits when released below the mark', () => {
    const g = new FillGame();
    g.pointerDown(HOLD);
    g.step(800);
    expect(g.glasses[0].fill).toBeCloseTo(800 * FILL_RATE);
    g.pointerUp();
    expect(g.filled).toBe(0);
    expect(g.glasses[0].fill).toBeCloseTo(800 * FILL_RATE);
  });

  it('counts a glass released above the mark', () => {
    const g = new FillGame();
    g.pointerDown(HOLD);
    g.step(msToFill);
    g.pointerUp();
    expect(g.filled).toBe(1);
    expect(g.active).toBe(1);
  });

  it('spills and restarts a glass that crosses the rim', () => {
    const g = new FillGame();
    g.pointerDown(HOLD);
    g.step(2000); // pasa del borde: 2000/1600 > FILL_RIM
    expect(g.holding).toBe(false);
    expect(g.glasses[0].fill).toBe(0);
    expect(g.filled).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'spill')).toBe(true);
  });

  it('is done after the three glasses (already over 3 s)', () => {
    const g = new FillGame();
    for (let i = 0; i < FILL_COUNT; i++) {
      g.pointerDown(HOLD);
      g.step(msToFill);
      g.pointerUp();
    }
    expect(g.filled).toBe(FILL_COUNT);
    expect(g.done).toBe(true);
  });
});

describe('FirstRainGame', () => {
  const lever = {
    x: RAIN_LEVER.x + RAIN_LEVER.w / 2,
    y: RAIN_LEVER.y + RAIN_LEVER.h / 2,
  };
  const wholeRain = (seed: number): RainDrop[] => {
    const g = new FirstRainGame(seed);
    g.step(RAIN_GAP_MS * RAIN_MAX_DROPS + RAIN_FALL_MS);
    return g.drops;
  };

  it('starts raining on its own; the first drop is always dirty', () => {
    const g = new FirstRainGame(42);
    g.step(RAIN_GAP_MS * 2 + 10);
    expect(g.drops.length).toBe(3);
    expect(g.drops[0].clean).toBe(false);
    // El desvío arranca abierto: la primera pasa y no toca el barril.
    g.step(RAIN_FALL_MS);
    expect(g.drops[0].resolved).toBe(true);
    expect(g.barrel).toBe(0);
  });

  it('moves the gate with a click on it and nothing elsewhere', () => {
    const g = new FirstRainGame(42);
    g.pointerDown({ x: 10, y: 250 });
    expect(g.gate).toBe('deflect');
    g.pointerDown(lever);
    expect(g.gate).toBe('barrel');
    g.pointerDown(lever);
    expect(g.gate).toBe('deflect');
  });

  it('fills the barrel with clean drops; a dirty one empties it', () => {
    const g = new FirstRainGame(42);
    g.pointerDown(lever); // barril abierto desde el inicio
    // La primera (siempre sucia) entra al barril: lo vacía y avisa.
    g.step(RAIN_FALL_MS + 10);
    expect(g.barrel).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'spill')).toBe(true);
    for (let t = 0; t < 20000 && !g.done; t += 40) g.step(40);
    expect(g.barrel).toBe(RAIN_CLEAN_GOAL);
    expect(g.done).toBe(true);
  });

  it('loses clean drops sent to the deflector', () => {
    const g = new FirstRainGame(42);
    for (let t = 0; t < 20000; t += 40) {
      g.step(40);
      if (g.drops.some((d) => d.clean && d.resolved)) break;
    }
    expect(g.barrel).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'drop-out')).toBe(true);
  });

  it('brings 1 to 3 dirty drops in any seed', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const dirty = wholeRain(seed).filter((d) => !d.clean).length;
      expect(dirty).toBeGreaterThanOrEqual(1);
      expect(dirty).toBeLessThanOrEqual(RAIN_DIRTY_MAX);
    }
  });

  it('deals a different rain with a different seed', () => {
    const seeds = [1, 2, 3, 4, 5, 6].map((s) =>
      wholeRain(s).map((d) => (d.clean ? 'L' : 'S')).join(''),
    );
    expect(new Set(seeds).size).toBeGreaterThanOrEqual(3);
  });
});

describe('WateringGame', () => {
  const home = {
    x: WATERING_HOME.x + WATERING_SIZE / 2,
    y: WATERING_HOME.y + WATERING_SIZE / 2,
  };

  it('releases a container dropped outside the boxes back home', () => {
    const g = new WateringGame();
    expect(g.current).toBe(0);
    g.pointerDown(home);
    g.pointerUp();
    expect(g.items[0].placed).toBe(false);
    expect({ x: g.items[0].x, y: g.items[0].y }).toEqual(WATERING_HOME);
  });

  it('counts the right box and sends the wrong one back', () => {
    const g = new WateringGame();
    const box = (kind: WaterKind) =>
      kind === 'water' ? WATERING_PLOT : WATERING_TREAT;
    const drop = (kind: WaterKind) => {
      g.pointerDown(home);
      g.pointerMove({ x: box(kind).x + 40, y: box(kind).y + 40 });
      g.pointerUp();
    };
    for (let i = 0; i < WATERING_COUNT; i++) {
      const kind = g.items[i].kind;
      // La caja contraria está mal: vuelve a la mesa.
      drop(kind === 'water' ? 'treat' : 'water');
      expect(g.items[i].placed).toBe(false);
      // Su caja está bien.
      drop(kind);
      expect(g.items[i].placed).toBe(true);
    }
    expect(g.placed).toBe(WATERING_COUNT);
    expect(g.done).toBe(false);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });

  it('deals two of each kind, never the same origin twice', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let n = seed * 13;
      const g = new WateringGame(() => hash01(n++));
      const kinds = g.items.map((i) => i.kind);
      expect(kinds.filter((k) => k === 'water').length).toBe(2);
      expect(kinds.filter((k) => k === 'treat').length).toBe(2);
      expect(new Set(g.items.map((i) => i.origin)).size).toBe(
        WATERING_COUNT,
      );
    }
  });

  it('deals different objects from game to game', () => {
    const deals = new Set<string>();
    for (let i = 0; i < 30; i++) {
      deals.add(
        new WateringGame().items.map((it) => it.origin).join(),
      );
    }
    expect(deals.size).toBeGreaterThan(5);
  });
});

describe('SealGame', () => {
  it('opens the first crack right away and seals it with a click', () => {
    const g = new SealGame();
    g.step(10);
    expect(g.cracks.length).toBe(1);
    const c = g.cracks[0];
    g.pointerDown({ x: c.x + 2, y: c.y });
    expect(c.sealed).toBe(true);
    expect(g.sealedCount).toBe(1);
  });

  it('misses clicks away from any crack', () => {
    const g = new SealGame();
    g.step(10);
    g.pointerDown({ x: 355, y: 255 });
    expect(g.sealedCount).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true);
  });

  it('opens another crack when one stays open too long, up to three', () => {
    const g = new SealGame();
    g.step(10);
    expect(g.cracks.length).toBe(1);
    g.step(SEAL_CRACK_AFTER_MS + 5);
    expect(g.cracks.length).toBe(2);
    g.step(SEAL_CRACK_AFTER_MS + 5);
    expect(g.cracks.length).toBe(3);
    g.step(SEAL_CRACK_AFTER_MS + 5);
    expect(g.openCracks.length).toBe(3); // no pasa del tope
  });

  it('is done after five sealed cracks, but not before 3 s', () => {
    const g = new SealGame();
    g.step(10);
    while (g.sealedCount < SEAL_GOAL) {
      const c = g.openCracks[0];
      if (c) g.pointerDown({ x: c.x, y: c.y });
      g.step(50);
    }
    expect(g.sealedCount).toBe(SEAL_GOAL);
    expect(g.done).toBe(false);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });
});

describe('JugFilterGame', () => {
  const bucket = (g: JugFilterGame) => ({
    x: g.bucket.x + JUG_SIZE / 2,
    y: g.bucket.y + JUG_SIZE / 2,
  });
  const top = { x: JUG_TOP.x + JUG_TOP.w / 2, y: JUG_TOP.y + JUG_TOP.h / 2 };
  const tap = { x: JUG_TAP.x + JUG_TAP.w / 2, y: JUG_TAP.y + JUG_TAP.h / 2 };
  const pour = (g: JugFilterGame) => {
    g.pointerDown(bucket(g));
    g.pointerMove(top);
    g.pointerUp();
  };

  it('starts waiting for the bucket and ignores the tap', () => {
    const g = new JugFilterGame();
    expect(g.phase).toBe('pour');
    g.pointerDown(tap);
    expect(g.glasses).toBe(0);
    expect(g.phase).toBe('pour');
  });

  it('returns the bucket when dropped away from the jug', () => {
    const g = new JugFilterGame();
    g.pointerDown(bucket(g));
    g.pointerMove({ x: 20, y: 20 });
    g.pointerUp();
    expect(g.phase).toBe('pour');
    expect(g.bucket).toEqual(JUG_BUCKET_HOME);
  });

  it('filters the poured water for JUG_FILTER_MS before the tap works', () => {
    const g = new JugFilterGame();
    pour(g);
    expect(g.phase).toBe('filter');
    // Con el agua todavía bajando, el clic en la llave no cuenta.
    g.pointerDown(tap);
    expect(g.glasses).toBe(0);
    g.step(JUG_FILTER_MS - 1);
    expect(g.phase).toBe('filter');
    g.step(1);
    expect(g.phase).toBe('tap');
  });

  it('fills a glass on the tap and misses clicks elsewhere', () => {
    const g = new JugFilterGame();
    pour(g);
    g.step(JUG_FILTER_MS);
    g.drainEvents();
    g.pointerDown({ x: 10, y: 10 });
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true);
    expect(g.glasses).toBe(0);
    g.pointerDown(tap);
    expect(g.glasses).toBe(1);
    expect(g.phase).toBe('pour');
  });

  it('is done after every glass, but not before 3 s', () => {
    const g = new JugFilterGame();
    for (let i = 0; i < JUG_ROUNDS; i++) {
      pour(g);
      g.step(JUG_FILTER_MS);
      g.pointerDown(tap);
    }
    expect(g.glasses).toBe(JUG_ROUNDS);
    expect(g.progress()).toBe(1);
    expect(g.done).toBe(g.elapsed >= MIN_GAME_MS);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });
});
