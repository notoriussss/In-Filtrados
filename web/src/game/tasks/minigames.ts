import type { StationType } from '../../map';

// Lógica de los minijuegos de las 3R (S2-11), sin canvas para poder
// probarla. Todo está en coordenadas del tablero (BOARD); la vista
// escala el tablero a la pantalla. Cada uno dura de 3 a 6 segundos.
//
// Cada minijuego avisa de lo que pasa con eventos (events) para que la
// vista pueda reaccionar: el personaje se mueve, las piezas salpican, las
// luces se encienden. La lógica no sabe nada de eso; solo los deja en la
// cola y la vista los recoge con drainEvents().

export const BOARD = { w: 360, h: 260 };
// Línea del piso: todo lo que se apoya (tanque, cubetas, personaje) está
// sobre ella.
export const FLOOR_Y = 228;

type Point = { x: number; y: number };

export type MinigameEvent =
  | { type: 'grab'; x: number; y: number; index?: number }
  | { type: 'release' }
  | { type: 'drop-in'; x: number; y: number; index: number }
  | { type: 'drop-out'; x: number; y: number; index: number }
  | { type: 'pop'; x: number; y: number; index: number }
  | { type: 'miss'; x: number; y: number };

export interface Minigame {
  readonly done: boolean;
  readonly events: MinigameEvent[];
  progress(): number; // 0 a 1
  pointerDown(p: Point): void;
  pointerMove(p: Point): void;
  pointerUp(): void;
  step(dtMs: number): void;
  drainEvents(): MinigameEvent[];
}

export function createMinigame(type: StationType): Minigame {
  if (type === 'reduce') return new ValveGame();
  if (type === 'reuse') return new BucketsGame();
  return new ParticlesGame();
}

abstract class BaseGame {
  readonly events: MinigameEvent[] = [];

  drainEvents(): MinigameEvent[] {
    return this.events.splice(0, this.events.length);
  }
}

// Reducir: mantener presionada la válvula la gira y llena la barra.
// Soltar pausa, no reinicia.
export const VALVE_FILL_MS = 3500;
export const VALVE_RADIUS = 40;
const VALVE_GRAB_MARGIN = 16;
const VALVE_TURN_PER_MS = 0.006; // radianes

export class ValveGame extends BaseGame implements Minigame {
  readonly center: Point = { x: 178, y: 184 };
  fill = 0;
  angle = 0;
  holding = false;

  get done(): boolean {
    return this.fill >= 1;
  }

  progress(): number {
    return this.fill;
  }

  pointerDown(p: Point): void {
    const d = Math.hypot(p.x - this.center.x, p.y - this.center.y);
    if (d > VALVE_RADIUS + VALVE_GRAB_MARGIN || this.holding) return;
    this.holding = true;
    this.events.push({ type: 'grab', x: p.x, y: p.y });
  }

  pointerMove(): void {}

  pointerUp(): void {
    if (!this.holding) return;
    this.holding = false;
    this.events.push({ type: 'release' });
  }

  step(dtMs: number): void {
    if (!this.holding || this.done) return;
    this.fill = Math.min(1, this.fill + dtMs / VALVE_FILL_MS);
    this.angle += dtMs * VALVE_TURN_PER_MS;
  }
}

// Reutilizar: arrastrar 3 cubetas de agua gris al tanque.
export const BUCKET_COUNT = 3;
export const BUCKET_SIZE = 48;
export const REUSE_TANK = { x: 236, y: 68, w: 100, h: FLOOR_Y - 68 };
const BUCKET_X = 22;
const BUCKET_FIRST_Y = FLOOR_Y - BUCKET_SIZE - 2 * 74;
const BUCKET_GAP_Y = 74;

export type Bucket = {
  x: number; // esquina superior izquierda
  y: number;
  homeX: number;
  homeY: number;
  inTank: boolean;
};

export class BucketsGame extends BaseGame implements Minigame {
  readonly buckets: Bucket[] = [];
  dragging: number | null = null;
  private grabDx = 0;
  private grabDy = 0;

  constructor() {
    super();
    for (let i = 0; i < BUCKET_COUNT; i++) {
      const y = BUCKET_FIRST_Y + i * BUCKET_GAP_Y;
      this.buckets.push({
        x: BUCKET_X,
        y,
        homeX: BUCKET_X,
        homeY: y,
        inTank: false,
      });
    }
  }

  get filled(): number {
    return this.buckets.filter((b) => b.inTank).length;
  }

  get done(): boolean {
    return this.filled === BUCKET_COUNT;
  }

  progress(): number {
    return this.filled / BUCKET_COUNT;
  }

  pointerDown(p: Point): void {
    const i = this.buckets.findIndex(
      (b) =>
        !b.inTank &&
        p.x >= b.x &&
        p.x <= b.x + BUCKET_SIZE &&
        p.y >= b.y &&
        p.y <= b.y + BUCKET_SIZE,
    );
    if (i < 0) return;
    this.dragging = i;
    this.grabDx = p.x - this.buckets[i].x;
    this.grabDy = p.y - this.buckets[i].y;
    this.events.push({ type: 'grab', x: p.x, y: p.y, index: i });
  }

  pointerMove(p: Point): void {
    if (this.dragging === null) return;
    const b = this.buckets[this.dragging];
    b.x = p.x - this.grabDx;
    b.y = p.y - this.grabDy;
  }

  // Al soltar: si el centro de la cubeta cae en el tanque, cuenta; si
  // no, vuelve a su lugar.
  pointerUp(): void {
    if (this.dragging === null) return;
    const index = this.dragging;
    const b = this.buckets[index];
    this.dragging = null;
    const cx = b.x + BUCKET_SIZE / 2;
    const cy = b.y + BUCKET_SIZE / 2;
    const t = REUSE_TANK;
    if (cx >= t.x && cx <= t.x + t.w && cy >= t.y && cy <= t.y + t.h) {
      b.inTank = true;
      this.events.push({ type: 'drop-in', x: b.x, y: b.y, index });
      return;
    }
    this.events.push({ type: 'drop-out', x: b.x, y: b.y, index });
    b.x = b.homeX;
    b.y = b.homeY;
  }

  step(): void {}
}

// Reciclar: hacer clic en 4 partículas de suciedad que flotan.
export const PARTICLE_COUNT = 4;
export const PARTICLE_RADIUS = 11;
const PARTICLE_HIT_RADIUS = 24; // más grande que el dibujo: más fácil
const FLOAT_AMPLITUDE = 18;
const FLOAT_SPEED = 0.0016; // radianes por ms

// Puntos de partida repartidos por el agua del acuario para que no se
// encimen.
const PARTICLE_BASES: Point[] = [
  { x: 156, y: 116 },
  { x: 214, y: 176 },
  { x: 268, y: 104 },
  { x: 312, y: 166 },
];

export type Particle = {
  baseX: number;
  baseY: number;
  phase: number;
  removed: boolean;
};

export class ParticlesGame extends BaseGame implements Minigame {
  readonly particles: Particle[];
  elapsed = 0;

  constructor() {
    super();
    this.particles = PARTICLE_BASES.slice(0, PARTICLE_COUNT).map((b, i) => ({
      baseX: b.x,
      baseY: b.y,
      phase: i * 1.7,
      removed: false,
    }));
  }

  get removed(): number {
    return this.particles.filter((p) => p.removed).length;
  }

  get done(): boolean {
    return this.removed === PARTICLE_COUNT;
  }

  progress(): number {
    return this.removed / PARTICLE_COUNT;
  }

  positionOf(p: Particle): Point {
    const a = this.elapsed * FLOAT_SPEED + p.phase;
    return {
      x: p.baseX + Math.sin(a) * FLOAT_AMPLITUDE,
      y: p.baseY + Math.cos(a * 0.8) * FLOAT_AMPLITUDE * 0.6,
    };
  }

  pointerDown(click: Point): void {
    for (const [index, p] of this.particles.entries()) {
      if (p.removed) continue;
      const pos = this.positionOf(p);
      const d = Math.hypot(click.x - pos.x, click.y - pos.y);
      if (d <= PARTICLE_HIT_RADIUS) {
        p.removed = true;
        this.events.push({ type: 'pop', x: pos.x, y: pos.y, index });
        return;
      }
    }
    this.events.push({ type: 'miss', x: click.x, y: click.y });
  }

  pointerMove(): void {}

  pointerUp(): void {}

  step(dtMs: number): void {
    this.elapsed += dtMs;
  }
}
