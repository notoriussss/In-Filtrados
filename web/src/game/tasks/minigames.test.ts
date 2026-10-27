import { describe, expect, it } from 'vitest';
import {
  BOARD,
  BUCKET_COUNT,
  BUCKET_SIZE,
  BucketsGame,
  CompostGame,
  COMPOST_BIN,
  COMPOST_SIZE,
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
  PRESSURE_ZONE_SHRINK,
  PRESSURE_ZONE_START,
  PressureGame,
  RAIN_CLEAN_GOAL,
  RAIN_FALL_MS,
  RAIN_GAP_MS,
  RAIN_LEVER,
  REUSE_TANK,
  SEAL_CRACK_AFTER_MS,
  SEAL_GOAL,
  SealGame,
  VALVE_FILL_MS,
  ValveGame,
  WasteGame,
  WASTE_BINS,
  WASTE_COUNT,
  WASTE_SIZE,
  WateringGame,
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
    expect(createMinigame('recycle', 'compost-1')).toBeInstanceOf(CompostGame);
    expect(createMinigame('recycle', 'sorter-1')).toBeInstanceOf(WasteGame);
  });

  it('keeps the type game as fallback for the rest of the stations', () => {
    expect(createMinigame('reduce', 'leak-1')).toBeInstanceOf(ValveGame);
    expect(createMinigame('reuse', 'greywater-1')).toBeInstanceOf(BucketsGame);
    expect(createMinigame('recycle', 'filter-1')).toBeInstanceOf(ParticlesGame);
    expect(createMinigame('recycle', 'filter-2')).toBeInstanceOf(ParticlesGame);
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

describe('WasteGame', () => {
  const center = (g: WasteGame, i: number) => ({
    x: g.items[i].x + WASTE_SIZE / 2,
    y: g.items[i].y + WASTE_SIZE / 2,
  });

  it('sorts a residue into its matching bin', () => {
    const g = new WasteGame();
    const bin = WASTE_BINS[0]; // plástico
    g.pointerDown(center(g, 0));
    g.pointerMove({ x: bin.x + bin.w / 2, y: bin.y + bin.h / 2 });
    g.pointerUp();
    expect(g.items[0].placed).toBe(true);
    expect(g.placed).toBe(1);
    expect(g.progress()).toBe(0.25);
  });

  it('sends a residue in the wrong bin back to the table', () => {
    const g = new WasteGame();
    const home = { x: g.items[1].x, y: g.items[1].y };
    const bin = WASTE_BINS[2]; // orgánico, no el suyo (vidrio)
    g.pointerDown(center(g, 1));
    g.pointerMove({ x: bin.x + bin.w / 2, y: bin.y + bin.h / 2 });
    g.pointerUp();
    expect(g.items[1].placed).toBe(false);
    expect({ x: g.items[1].x, y: g.items[1].y }).toEqual(home);
  });

  it('is done after every residue, but not before 3 s', () => {
    const g = new WasteGame();
    WASTE_BINS.forEach((bin, i) => {
      g.pointerDown(center(g, i));
      g.pointerMove({ x: bin.x + bin.w / 2, y: bin.y + bin.h / 2 });
      g.pointerUp();
    });
    expect(g.placed).toBe(WASTE_COUNT);
    expect(g.done).toBe(false);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });
});

// Nivel: dónde está la aguja del medidor al tiempo t (ms).
const levelAt = (t: number): number =>
  (1 - Math.cos((t / PRESSURE_SWEEP_MS) * Math.PI)) / 2;

// timeAtLevel busca el primer instante desde `from` en que la aguja
// pasa por `target`; siempre lo encuentra (barre todo el rango).
function timeAtLevel(target: number, from: number): number {
  for (let t = from; t <= from + PRESSURE_SWEEP_MS * 2; t += 2) {
    if (Math.abs(levelAt(t) - target) <= 0.004) return t;
  }
  throw new Error(`la aguja nunca pasa por ${target}`);
}

function timeOffBand(g: PressureGame, from: number): number {
  for (let t = from; t <= from + PRESSURE_SWEEP_MS * 2; t += 2) {
    if (Math.abs(levelAt(t) - g.zoneCenter) > g.zoneHalf) return t;
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
    const g = new PressureGame();
    g.pointerDown({ x: 10, y: 10 });
    expect(g.drainEvents().map((e) => e.type)).toEqual(['miss']);
    expect(g.hits).toBe(0);
  });

  it('misses a press in the button but outside the band', () => {
    const g = new PressureGame();
    press(g, timeOffBand(g, 0));
    expect(g.hits).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'miss')).toBe(true);
  });

  it('hits when pressed while the needle is in the band, and tightens', () => {
    const g = new PressureGame();
    press(g, timeAtLevel(g.zoneCenter, 0));
    expect(g.hits).toBe(1);
    expect(g.zoneHalf).toBeCloseTo(
      PRESSURE_ZONE_START - PRESSURE_ZONE_SHRINK,
    );
    expect(g.zoneCenter).toBeCloseTo(0.3 + 0.4 * hash01(1 * 13 + 5));
    press(g, timeAtLevel(g.zoneCenter, g.elapsed));
    press(g, timeAtLevel(g.zoneCenter, g.elapsed));
    expect(g.hits).toBe(PRESSURE_HITS);
    // Estos tres toques ya tomaron más de 3 s de reloj: está listo.
    expect(g.done).toBe(true);
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

  it('starts raining on its own: the first drops are dirty', () => {
    const g = new FirstRainGame();
    g.step(RAIN_GAP_MS * 2 + 10);
    expect(g.drops.length).toBe(3);
    expect(g.drops[0].clean).toBe(false);
    expect(g.drops[1].clean).toBe(false);
    expect(g.drops[2].clean).toBe(true);
    // El desvío arranca abierto: la sucia pasa y no toca el barril.
    g.step(RAIN_FALL_MS);
    expect(g.drops[0].resolved).toBe(true);
    expect(g.barrel).toBe(0);
  });

  it('moves the gate with a click on it and nothing elsewhere', () => {
    const g = new FirstRainGame();
    g.pointerDown({ x: 10, y: 250 });
    expect(g.gate).toBe('deflect');
    g.pointerDown(lever);
    expect(g.gate).toBe('barrel');
    g.pointerDown(lever);
    expect(g.gate).toBe('deflect');
  });

  it('fills the barrel with clean drops; a dirty one empties it', () => {
    const g = new FirstRainGame();
    g.pointerDown(lever); // barril abierto desde el inicio
    // La primera (sucia) entra al barril: lo vacía y avisa.
    g.step(RAIN_FALL_MS + 10);
    expect(g.barrel).toBe(0);
    expect(g.drainEvents().some((e) => e.type === 'spill')).toBe(true);
    for (let t = 0; t < 20000 && !g.done; t += 40) g.step(40);
    expect(g.barrel).toBe(RAIN_CLEAN_GOAL);
    expect(g.done).toBe(true);
  });

  it('loses clean drops that go to the deflector', () => {
    const g = new FirstRainGame();
    for (let t = 0; t < 20000 && g.barrel < 3; t += 40) g.step(40);
    expect(g.drainEvents().some((e) => e.type === 'drop-out')).toBe(true);
    expect(g.barrel).toBe(0);
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
    // El 0 (agua de verduras) va a Regar.
    g.pointerDown(home);
    g.pointerMove({ x: WATERING_PLOT.x + 40, y: WATERING_PLOT.y + 40 });
    g.pointerUp();
    expect(g.items[0].placed).toBe(true);
    expect(g.current).toBe(1);
    // El 1 (agua de ropa) también sirve: a Tratar está mal.
    g.pointerDown(home);
    g.pointerMove({ x: WATERING_TREAT.x + 40, y: WATERING_TREAT.y + 40 });
    g.pointerUp();
    expect(g.items[1].placed).toBe(false);
    // ... y a Regar está bien.
    g.pointerDown(home);
    g.pointerMove({ x: WATERING_PLOT.x + 40, y: WATERING_PLOT.y + 40 });
    g.pointerUp();
    expect(g.items[1].placed).toBe(true);
    // El 2 y el 3 (aceite y cloro) van a Tratar.
    for (const _ of [2, 3]) {
      g.pointerDown(home);
      g.pointerMove({ x: WATERING_TREAT.x + 40, y: WATERING_TREAT.y + 40 });
      g.pointerUp();
    }
    expect(g.placed).toBe(WATERING_COUNT);
    expect(g.done).toBe(false);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
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

describe('CompostGame', () => {
  const center = (g: CompostGame, i: number) => ({
    x: g.sacks[i].x + COMPOST_SIZE / 2,
    y: g.sacks[i].y + COMPOST_SIZE / 2,
  });
  const bin = {
    x: COMPOST_BIN.x + COMPOST_BIN.w / 2,
    y: COMPOST_BIN.y + COMPOST_BIN.h / 2,
  };

  it('takes the sacks in order (seco, húmedo, tierra), two rounds', () => {
    const g = new CompostGame();
    for (const round of [0, 1]) {
      for (const i of [0, 1, 2]) {
        expect(g.required).toBe(i);
        g.pointerDown(center(g, i));
        g.pointerMove(bin);
        g.pointerUp();
        expect(g.sacks[i].inBin).toBe(round + 1);
        expect({ x: g.sacks[i].x, y: g.sacks[i].y }).toEqual({
          x: g.sacks[i].homeX,
          y: g.sacks[i].homeY,
        });
      }
    }
    expect(g.steps).toBe(6);
    expect(g.done).toBe(false);
    g.step(MIN_GAME_MS);
    expect(g.done).toBe(true);
  });

  it('shakes the wrong sack back without counting it', () => {
    const g = new CompostGame();
    expect(g.required).toBe(0);
    g.pointerDown(center(g, 1)); // húmedo primero: mal
    g.pointerMove(bin);
    g.pointerUp();
    expect(g.steps).toBe(0);
    expect({ x: g.sacks[1].x, y: g.sacks[1].y }).toEqual({
      x: g.sacks[1].homeX,
      y: g.sacks[1].homeY,
    });
    // Soltar fuera de la compostera tampoco cuenta.
    g.pointerDown(center(g, 0));
    g.pointerMove({ x: 20, y: 20 });
    g.pointerUp();
    expect(g.steps).toBe(0);
  });
});
