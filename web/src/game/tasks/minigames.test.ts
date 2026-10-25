import { describe, expect, it } from 'vitest';
import {
  BOARD,
  BUCKET_COUNT,
  BUCKET_SIZE,
  BucketsGame,
  FLOOR_Y,
  PARTICLE_COUNT,
  ParticlesGame,
  REUSE_TANK,
  VALVE_FILL_MS,
  ValveGame,
  createMinigame,
} from './minigames';

describe('createMinigame', () => {
  it('maps each 3R type to its game', () => {
    expect(createMinigame('reduce')).toBeInstanceOf(ValveGame);
    expect(createMinigame('reuse')).toBeInstanceOf(BucketsGame);
    expect(createMinigame('recycle')).toBeInstanceOf(ParticlesGame);
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
