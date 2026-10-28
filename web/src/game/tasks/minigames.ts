import type { StationType } from '../../map';

// Lógica de los minijuegos de las 3R (S2-11), sin canvas para poder
// probarla. Todo está en coordenadas del tablero (BOARD); la vista
// escala el tablero a la pantalla. Cada uno dura de 3 a 6 segundos.
//
// Cada minijuego avisa de lo que pasa con eventos (events) para que la
// vista pueda reaccionar: el personaje se mueve, las piezas salpican, las
// luces se encienden. La lógica no sabe nada de eso; solo los deja en la
// cola y la vista los recoge con drainEvents().
//
// Los juegos nuevos (docs/design/minigames-3r.md) se eligen por
// estación, no por tipo: cada estación puede tener el suyo y el juego
// de su tipo queda de respaldo.

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
  | { type: 'miss'; x: number; y: number }
  | { type: 'spill'; x: number; y: number; index: number }
  | { type: 'switch'; x: number; y: number; side: 'left' | 'right' };

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

export function createMinigame(type: StationType, stationId = ''): Minigame {
  const byStation = STATION_GAMES[stationId];
  if (byStation) return byStation();
  if (type === 'reduce') return new ValveGame();
  if (type === 'reuse') return new BucketsGame();
  return new ParticlesGame();
}

// Juego propio de cada estación; las demás caen al juego de su tipo.
const STATION_GAMES: Record<string, () => Minigame> = {
  'valve-1': () => new PressureGame(),
  'valve-2': () => new FillGame(),
  'leak-2': () => new SealGame(),
  'rain-1': () => new FirstRainGame(),
  'rain-2': () => new FirstRainGame(),
  'greywater-2': () => new WateringGame(),
  'filter-2': () => new StreamGame(),
  'compost-1': () => new JugFilterGame(),
  'sorter-1': () => new PipesGame(),
};

// Dos números a partir de uno, para repartir al azar sin guardar nada:
// el mismo i da siempre el mismo valor (lo usa también el dibujo).
export function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// shuffle baraja una lista con el generador que le pasen, sin tocar la
// original. Así cada partida sale distinta y las pruebas fijan la secuencia.
function shuffle<T>(list: readonly T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// match rechaza las tareas de menos de 3 s (taskMinTicks): ningún juego
// nuevo se gana antes de eso, ni siquiera a puro reflejo.
export const MIN_GAME_MS = 3000;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);

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

// ─── Minijuegos por estación (docs/design/minigames-3r.md) ──────────────
// Cada estación tiene el suyo; comparten la interfaz Minigame y los
// eventos con los tres juegos de arriba. Los que se agarran y se
// arrastran siguen el mismo esqueleto de BucketsGame.

// Reciclar (sorter-1, Tuberías del ecopunto): conectar las tuberías. El
// agua ya limpia sale de la fuente de la izquierda y hay que llevarla al
// tanque de la derecha: cada clic gira un tramo un cuarto de vuelta y el
// agua corre cuando todos quedan en su sitio. El recorrido cambia en cada
// partida.
export const PIPES_COLS = 4;
export const PIPES_ROWS = 3;
export const PIPES_TILE = 56;
export const PIPES_GRID = { x: 68, y: 36 }; // esquina de la cuadrícula

// Lados de un tramo, en el sentido de las agujas del reloj.
export type PipeSide = 0 | 1 | 2 | 3; // arriba, derecha, abajo, izquierda
const opposite = (s: number): PipeSide => ((s + 2) % 4) as PipeSide;

export type PipeKind = 'straight' | 'elbow';

type PathCell = { col: number; row: number; exit: PipeSide };

export type PipeTile = {
  col: number;
  row: number;
  kind: PipeKind;
  rot: number; // 0 a 3, cuartos de vuelta
  solution: number;
};

// pipeSides: los dos lados que une un tramo con esa vuelta. Recto de
// izquierda a derecha y codo de arriba a la derecha, girados rot veces.
export function pipeSides(kind: PipeKind, rot: number): [PipeSide, PipeSide] {
  const base: [number, number] = kind === 'straight' ? [3, 1] : [0, 1];
  return [
    ((base[0] + rot) % 4) as PipeSide,
    ((base[1] + rot) % 4) as PipeSide,
  ];
}

// sameSides: dos vueltas del mismo tramo que unen los mismos lados.
function sameSides(kind: PipeKind, r1: number, r2: number): boolean {
  const [a, b] = pipeSides(kind, r1);
  const [x, y] = pipeSides(kind, r2);
  return (a === x && b === y) || (a === y && b === x);
}

// La vuelta con la que un tramo une los lados a y b.
function rotFor(kind: PipeKind, a: number, b: number): number {
  for (let rot = 0; rot < 4; rot++) {
    const [x, y] = pipeSides(kind, rot);
    if ((x === a && y === b) || (x === b && y === a)) return rot;
  }
  return 0;
}

export class PipesGame extends BaseGame implements Minigame {
  readonly tiles: PipeTile[] = []; // en el orden del recorrido
  readonly startRow: number;
  readonly endRow: number;
  elapsed = 0;

  constructor(rnd: () => number = Math.random) {
    super();
    const path = this.walk(rnd);
    this.startRow = path[0].row;
    this.endRow = path[path.length - 1].row;
    path.forEach((cell, i) => {
      const from: number = i === 0 ? 3 : opposite(path[i - 1].exit);
      const straight = opposite(cell.exit) === from;
      const kind: PipeKind = straight ? 'straight' : 'elbow';
      const solution = rotFor(kind, from, cell.exit);
      // Nunca empieza en su sitio: elige entre las vueltas que unen otros
      // lados (un recto girado media vuelta queda igual, no cuenta).
      const wrong = [1, 2, 3]
        .map((d) => (solution + d) % 4)
        .filter((r) => !sameSides(kind, r, solution));
      const rot = wrong[Math.floor(rnd() * wrong.length)];
      this.tiles.push({ col: cell.col, row: cell.row, kind, rot, solution });
    });
  }

  // El recorrido: de la columna 0 a la última. Dos o tres columnas, al
  // azar, suben o bajan una fila antes de salir hacia la derecha: nunca
  // es una línea recta, y no se alarga (6 o 7 tramos).
  private walk(rnd: () => number): PathCell[] {
    const columns = Array.from({ length: PIPES_COLS }, (_, i) => i);
    const bends = shuffle(columns, rnd).slice(0, 2 + Math.floor(rnd() * 2));
    const cells: PathCell[] = [];
    let row = Math.floor(rnd() * PIPES_ROWS);
    for (let col = 0; col < PIPES_COLS; col++) {
      if (bends.includes(col)) {
        const canUp = row > 0;
        const canDown = row < PIPES_ROWS - 1;
        const down = canUp && canDown ? rnd() < 0.5 : canDown;
        cells.push({ col, row, exit: down ? 2 : 0 });
        row += down ? 1 : -1;
      }
      cells.push({ col, row, exit: 1 });
    }
    return cells;
  }

  // Hacia dónde tiene que salir el agua del tramo i: hacia el siguiente
  // del recorrido o, en el último, hacia el tanque (a la derecha).
  private exitOf(i: number): PipeSide {
    const t = this.tiles[i];
    const next = this.tiles[i + 1];
    if (!next || next.col > t.col) return 1;
    return next.row > t.row ? 2 : 0;
  }

  // El agua entra por la izquierda del primer tramo y sigue mientras cada
  // tramo una el lado por el que entra con el que lleva al siguiente:
  // cuántos tramos recorre.
  get flow(): number {
    let n = 0;
    let from: PipeSide = 3;
    for (const [i, t] of this.tiles.entries()) {
      const [a, b] = pipeSides(t.kind, t.rot);
      if (a !== from && b !== from) break;
      const out = a === from ? b : a;
      if (out !== this.exitOf(i)) break;
      from = opposite(out);
      n += 1;
    }
    return n;
  }

  get connected(): boolean {
    return this.flow === this.tiles.length;
  }

  get done(): boolean {
    return this.connected && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return this.flow / this.tiles.length;
  }

  // Un clic en un tramo del recorrido lo gira; en otro lado, no pasa nada.
  pointerDown(p: Point): void {
    if (this.connected) return;
    const col = Math.floor((p.x - PIPES_GRID.x) / PIPES_TILE);
    const row = Math.floor((p.y - PIPES_GRID.y) / PIPES_TILE);
    const t = this.tiles.find((x) => x.col === col && x.row === row);
    if (!t) {
      this.events.push({ type: 'miss', x: p.x, y: p.y });
      return;
    }
    t.rot = (t.rot + 1) % 4;
    this.events.push({
      type: 'pop',
      x: PIPES_GRID.x + (col + 0.5) * PIPES_TILE,
      y: PIPES_GRID.y + (row + 0.5) * PIPES_TILE,
      index: this.tiles.indexOf(t),
    });
  }

  pointerMove(): void {}

  pointerUp(): void {}

  step(dtMs: number): void {
    this.elapsed += dtMs;
  }
}

// Reciclar (filter-2, Arroyo del ecopunto): limpiar el arroyo. La basura
// baja flotando por el arroyo hacia la toma de agua del tanque: hay que
// sacarla con un clic antes de que llegue. La que se cuela no resta, pero
// el agua sigue sucia hasta juntar la cantidad pedida.
export const STREAM_GOAL = 6;
export const STREAM_GAP_MS = 650; // entre una basura y la siguiente
export const STREAM_SPEED = 70; // unidades por segundo
export const STREAM_START_X = -14; // por donde entra al arroyo
export const STREAM_END_X = 300; // la toma de agua: de aquí no se saca
export const STREAM_HIT = 20; // qué tan cerca hay que hacer clic
export const STREAM_LANES: readonly number[] = [112, 140, 168];
export type StreamKind = 'bottle' | 'bag' | 'can' | 'boot';
export const STREAM_KINDS: readonly StreamKind[] = [
  'bottle',
  'bag',
  'can',
  'boot',
];

export type StreamItem = {
  index: number;
  kind: StreamKind;
  x: number; // centro
  y: number;
  gone: boolean; // ya se sacó o ya se coló
};

export class StreamGame extends BaseGame implements Minigame {
  readonly items: StreamItem[] = [];
  caught = 0;
  escaped = 0;
  elapsed = 0;
  private spawned = 0;

  constructor(private readonly rnd: () => number = Math.random) {
    super();
  }

  get done(): boolean {
    return this.caught >= STREAM_GOAL && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return clamp01(this.caught / STREAM_GOAL);
  }

  // Un clic sobre una basura la saca; la más cercana si hay varias; en
  // otro lado no pasa nada.
  pointerDown(p: Point): void {
    let best: StreamItem | null = null;
    let bestD = STREAM_HIT;
    for (const it of this.items) {
      if (it.gone) continue;
      const d = Math.hypot(p.x - it.x, p.y - it.y);
      if (d <= bestD) {
        best = it;
        bestD = d;
      }
    }
    if (!best) {
      this.events.push({ type: 'miss', x: p.x, y: p.y });
      return;
    }
    this.items.splice(this.items.indexOf(best), 1);
    this.caught += 1;
    this.events.push({
      type: 'pop',
      x: best.x,
      y: best.y,
      index: best.index,
    });
  }

  pointerMove(): void {}

  pointerUp(): void {}

  step(dtMs: number): void {
    this.elapsed += dtMs;
    while (
      this.spawned * STREAM_GAP_MS <= this.elapsed &&
      this.caught < STREAM_GOAL
    ) {
      this.spawn();
    }
    for (const it of this.items) {
      if (it.gone) continue;
      it.x += (STREAM_SPEED * dtMs) / 1000;
      if (it.x < STREAM_END_X) continue;
      it.gone = true;
      this.escaped += 1;
      this.events.push({
        type: 'spill',
        x: it.x,
        y: it.y,
        index: it.index,
      });
    }
    // La basura ya sacada o colada deja la lista.
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].gone) this.items.splice(i, 1);
    }
  }

  private spawn(): void {
    const kind = STREAM_KINDS[Math.floor(this.rnd() * STREAM_KINDS.length)];
    const y = STREAM_LANES[Math.floor(this.rnd() * STREAM_LANES.length)];
    this.items.push({
      index: this.spawned,
      kind,
      x: STREAM_START_X,
      y,
      gone: false,
    });
    this.spawned += 1;
  }
}

// Reducir (valve-1, Válvula de riego): regular la presión. La aguja
// barre el medidor; hay que presionar el botón cuando pasa por la
// franja verde, que se encoge un poco con cada acierto. La franja
// inicial y el arranque de la aguja salen de una semilla: cada partida
// es distinta.
export const PRESSURE_HITS = 3;
export const PRESSURE_SWEEP_MS = 2800; // de abajo a arriba de la aguja
export const PRESSURE_ZONE_START = 0.18; // alto de la franja, en nivel
export const PRESSURE_ZONE_SHRINK = 0.04;
export const PRESSURE_ZONE_MIN = 0.09;
// Entre qué alturas puede caer la franja (siempre alcanzable).
export const PRESSURE_ZONE_LO = 0.3;
export const PRESSURE_ZONE_HI = 0.7;
export const PRESSURE_TUBE = { x: 156, y: 44, w: 52, h: 162 };
export const PRESSURE_BUTTON = { x: 246, y: 152, w: 84, h: 58 };

export class PressureGame extends BaseGame implements Minigame {
  elapsed = 0;
  hits = 0;
  zoneCenter: number;
  zoneHalf = PRESSURE_ZONE_START;

  // Semilla de la ronda: la franja inicial y el desface de la aguja
  // salen de ella, así que cada partida es distinta. Los tests pasan
  // una semilla fija para repetir el mismo escenario.
  readonly phaseMs: number;
  private readonly seed: number;

  constructor(seed: number = Math.random() * 9973) {
    super();
    this.seed = seed;
    this.phaseMs = hash01(seed + 1) * PRESSURE_SWEEP_MS * 2;
    this.zoneCenter = this.nextZone();
  }

  // La aguja va y vuelve: 0 abajo, 1 arriba, tarda PRESSURE_SWEEP_MS.
  // phaseMs corre el ciclo para que no empiece siempre desde abajo.
  get level(): number {
    const t = this.elapsed + this.phaseMs;
    return (1 - Math.cos((t / PRESSURE_SWEEP_MS) * Math.PI)) / 2;
  }

  get done(): boolean {
    return this.hits === PRESSURE_HITS && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return this.hits / PRESSURE_HITS;
  }

  pointerDown(p: Point): void {
    const b = PRESSURE_BUTTON;
    const inButton =
      p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    if (!inButton) {
      this.events.push({ type: 'miss', x: p.x, y: p.y });
      return;
    }
    if (Math.abs(this.level - this.zoneCenter) <= this.zoneHalf) {
      this.hits += 1;
      this.zoneHalf = Math.max(
        PRESSURE_ZONE_MIN,
        this.zoneHalf - PRESSURE_ZONE_SHRINK,
      );
      // Siguiente franja en otra altura, siempre igual de alcanzable.
      this.zoneCenter = this.nextZone();
      this.events.push({ type: 'pop', x: p.x, y: p.y, index: this.hits - 1 });
      return;
    }
    this.events.push({ type: 'miss', x: p.x, y: p.y });
  }

  pointerMove(): void {}

  pointerUp(): void {}

  step(dtMs: number): void {
    this.elapsed += dtMs;
    if (this.done) return; // ganado: la aguja se queda donde está
  }

  // Altura de la siguiente franja: pseudo-azar anclado a la semilla.
  private nextZone(): number {
    const h = hash01(this.seed + this.hits * 13 + 5);
    return PRESSURE_ZONE_LO + (PRESSURE_ZONE_HI - PRESSURE_ZONE_LO) * h;
  }
}

// Reducir (valve-2, Válvula de la estación solar): llenar sin derramar.
// Sostener el grifo y soltar cuando el agua pase la marca del vaso;
// cruzar el borde derrama el agua y el vaso vuelve a empezar. 3 vasos.
export const FILL_COUNT = 3;
export const FILL_RATE = 1 / 1600; // nivel que sube por ms sosteniendo
export const FILL_MARK = 0.78; // marca: hay que soltar por encima de aquí
export const FILL_RIM = 0.93; // borde: cruzarlo derrama
export const FILL_GLASS = { w: 44, h: 60 };
export const FILL_SPOTS: readonly number[] = [84, 180, 276];
export const FILL_BASE_Y = 206; // donde se apoyan los vasos

export type Glass = { index: number; fill: number; filled: boolean };

export class FillGame extends BaseGame implements Minigame {
  readonly glasses: Glass[] = [];
  holding = false;
  elapsed = 0;
  active = 0;

  constructor() {
    super();
    for (let i = 0; i < FILL_COUNT; i++) {
      this.glasses.push({ index: i, fill: 0, filled: false });
    }
  }

  get filled(): number {
    return this.glasses.filter((g) => g.filled).length;
  }

  get done(): boolean {
    return this.filled === FILL_COUNT && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return this.filled / FILL_COUNT;
  }

  // Sostener es presionar en cualquier lado: el grifo se abre igual.
  pointerDown(p: Point): void {
    if (this.holding || this.done) return;
    this.holding = true;
    this.events.push({ type: 'grab', x: p.x, y: p.y });
  }

  pointerMove(): void {}

  // Al soltar: si el agua ya pasó la marca, el vaso queda lleno; si no,
  // se queda a medias y se puede seguir sosteniendo después.
  pointerUp(): void {
    if (!this.holding) return;
    this.holding = false;
    this.events.push({ type: 'release' });
    const g = this.glasses[this.active];
    if (g.fill < FILL_MARK) return;
    g.filled = true;
    this.events.push({
      type: 'drop-in',
      x: FILL_SPOTS[this.active],
      y: FILL_BASE_Y - FILL_GLASS.h / 2,
      index: this.active,
    });
    this.nextActive();
  }

  step(dtMs: number): void {
    this.elapsed += dtMs;
    if (!this.holding || this.done) return;
    const g = this.glasses[this.active];
    g.fill = Math.min(1, g.fill + dtMs * FILL_RATE);
    if (g.fill < FILL_RIM) return;
    // Se pasó del borde: derrama y el vaso vuelve a empezar.
    g.fill = 0;
    this.holding = false;
    this.events.push({ type: 'release' });
    this.events.push({
      type: 'spill',
      x: FILL_SPOTS[this.active],
      y: FILL_BASE_Y - FILL_GLASS.h,
      index: this.active,
    });
  }

  private nextActive(): void {
    const i = this.glasses.findIndex((g) => !g.filled);
    this.active = i < 0 ? FILL_COUNT - 1 : i;
  }
}

// Reutilizar (rain-1 y rain-2, cosecha de lluvia): primera lluvia. Las
// gotas caen de la canaleta y algunas salen marrones porque lavan el
// polvo del techo: van al desvío. Las limpias van al barril; una sucia
// que entre lo vacía un poco. Cuántas sucias trae la lluvia sale de
// una semilla: cada partida es distinta.
export const RAIN_CLEAN_GOAL = 6;
// A lo sumo cuántas gotas sucias trae una primera lluvia.
export const RAIN_DIRTY_MAX = 3;
export const RAIN_FALL_MS = 900; // de la canaleta a la compuerta
export const RAIN_GAP_MS = 520; // entre gota y gota
export const RAIN_MAX_DROPS = RAIN_DIRTY_MAX + RAIN_CLEAN_GOAL + 5;
export const RAIN_SPOUT = { x: 100, y: 46 }; // de donde caen
export const RAIN_JUNCTION = { x: 100, y: 132 }; // la compuerta
export const RAIN_LEVER = { x: 66, y: 96, w: 68, h: 64 }; // clic aquí
export const RAIN_BARREL = { x: 240, y: 158, w: 60, h: 68 };
export const RAIN_DRAIN = { x: 30, y: 198, w: 48, h: 26 };

export type RainSide = 'deflect' | 'barrel';

export type RainDrop = {
  index: number;
  clean: boolean;
  fall: number; // ms que lleva cayendo
  resolved: boolean;
};

// La primera lluvia lava el techo: al principio casi todas las gotas
// salen sucias y a medida que pasa, casi ninguna.
const dirtyChance = (i: number): number =>
  Math.max(0.15, 0.8 - i * 0.15);

export class FirstRainGame extends BaseGame implements Minigame {
  readonly drops: RainDrop[] = [];
  gate: RainSide = 'deflect'; // al abrir la lluvia, el desvío
  barrel = 0; // gotas limpias que juntó el barril
  elapsed = 0;
  private spawned = 0;
  private dirtyLeft: number;
  private readonly seed: number;

  constructor(seed: number = Math.random() * 9973) {
    super();
    this.seed = seed;
    // Cuántas gotas sucias trae esta lluvia: de 1 a 3.
    this.dirtyLeft = 1 + Math.floor(hash01(seed + 3) * RAIN_DIRTY_MAX);
  }

  get done(): boolean {
    return this.barrel >= RAIN_CLEAN_GOAL && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return clamp01(this.barrel / RAIN_CLEAN_GOAL);
  }

  // Un clic en la compuerta la cambia de lado; en cualquier otro lado,
  // no pasa nada.
  pointerDown(p: Point): void {
    const L = RAIN_LEVER;
    const inLever =
      p.x >= L.x && p.x <= L.x + L.w && p.y >= L.y && p.y <= L.y + L.h;
    if (!inLever) {
      this.events.push({ type: 'miss', x: p.x, y: p.y });
      return;
    }
    this.gate = this.gate === 'deflect' ? 'barrel' : 'deflect';
    this.events.push({
      type: 'switch',
      x: RAIN_JUNCTION.x,
      y: RAIN_JUNCTION.y,
      side: this.gate === 'barrel' ? 'right' : 'left',
    });
  }

  pointerMove(): void {}

  pointerUp(): void {}

  step(dtMs: number): void {
    this.elapsed += dtMs;
    while (
      this.spawned * RAIN_GAP_MS <= this.elapsed &&
      this.spawned < RAIN_MAX_DROPS
    ) {
      this.spawn();
    }
    for (const d of this.drops) {
      if (d.resolved) continue;
      d.fall += dtMs;
      if (d.fall < RAIN_FALL_MS) continue;
      this.resolve(d);
    }
  }

  private spawn(): void {
    if (this.spawned >= RAIN_MAX_DROPS) return;
    // La primera siempre sale sucia (es el primer lavado del techo);
    // las demás, con chance que baja gota a gota y solo mientras
    // quede presupuesto de suciedad en esta lluvia.
    const dirty =
      this.spawned === 0 ||
      (this.dirtyLeft > 0 &&
        hash01(this.seed + this.spawned * 7.31) < dirtyChance(this.spawned));
    if (dirty) this.dirtyLeft -= 1;
    this.drops.push({
      index: this.spawned,
      clean: !dirty,
      fall: 0,
      resolved: false,
    });
    this.spawned += 1;
  }

  private resolve(d: RainDrop): void {
    d.resolved = true;
    const toBarrel = this.gate === 'barrel';
    if (d.clean && toBarrel) {
      this.barrel += 1;
      this.events.push({
        type: 'drop-in',
        x: RAIN_JUNCTION.x,
        y: RAIN_JUNCTION.y,
        index: d.index,
      });
      return;
    }
    if (!d.clean && toBarrel) {
      // Gota sucia en el barril: lo vacía un poco.
      this.barrel = Math.max(0, this.barrel - 1);
      this.events.push({
        type: 'spill',
        x: RAIN_BARREL.x + RAIN_BARREL.w / 2,
        y: RAIN_BARREL.y,
        index: d.index,
      });
      return;
    }
    // Al desvío: una sucia está bien; una limpia se pierde.
    this.events.push({
      type: 'drop-out',
      x: RAIN_JUNCTION.x,
      y: RAIN_JUNCTION.y,
      index: d.index,
    });
  }
}

// Reutilizar (greywater-2, Agua gris del laboratorio): ¿sirve para
// regar? Aparece un objeto de donde viene el agua y se arrastra a Regar o
// a Tratar. Errar lo devuelve a la mesa. Cada partida saca al azar dos
// orígenes de cada tipo, así que casi nunca se repiten.
export const WATERING_COUNT = 4;
export const WATERING_SIZE = 48;
export type WaterKind = 'water' | 'treat';
export type WaterOrigin =
  | 'tomato'
  | 'carrot'
  | 'shirt'
  | 'rice'
  | 'oil'
  | 'bleach'
  | 'fuel'
  | 'pasta';
// El agua de lavar verduras, enjuagar ropa o lavar arroz sirve para
// regar; con aceite, cloro, combustible o sal (agua de cocer pasta), hay
// que tratarla.
export const WATERING_ORIGINS: readonly {
  id: WaterOrigin;
  kind: WaterKind;
}[] = [
  { id: 'tomato', kind: 'water' },
  { id: 'carrot', kind: 'water' },
  { id: 'shirt', kind: 'water' },
  { id: 'rice', kind: 'water' },
  { id: 'oil', kind: 'treat' },
  { id: 'bleach', kind: 'treat' },
  { id: 'fuel', kind: 'treat' },
  { id: 'pasta', kind: 'treat' },
];
export const WATERING_HOME = { x: 156, y: 116 }; // sobre la mesa del centro
export const WATERING_PLOT = { x: 20, y: 140, w: 92, h: 88 }; // regar
export const WATERING_TREAT = { x: 248, y: 140, w: 92, h: 88 }; // tratar

export type WaterItem = {
  index: number;
  origin: WaterOrigin;
  kind: WaterKind;
  x: number; // esquina superior izquierda
  y: number;
  homeX: number;
  homeY: number;
  placed: boolean;
};

export class WateringGame extends BaseGame implements Minigame {
  readonly items: WaterItem[] = [];
  dragging: number | null = null;
  elapsed = 0;
  private grabDx = 0;
  private grabDy = 0;

  constructor(rnd: () => number = Math.random) {
    super();
    const pick = (kind: WaterKind) =>
      shuffle(
        WATERING_ORIGINS.filter((o) => o.kind === kind),
        rnd,
      ).slice(0, WATERING_COUNT / 2);
    shuffle([...pick('water'), ...pick('treat')], rnd).forEach((o, i) => {
      this.items.push({
        index: i,
        origin: o.id,
        kind: o.kind,
        x: WATERING_HOME.x,
        y: WATERING_HOME.y,
        homeX: WATERING_HOME.x,
        homeY: WATERING_HOME.y,
        placed: false,
      });
    });
  }

  get placed(): number {
    return this.items.filter((i) => i.placed).length;
  }

  get done(): boolean {
    return this.placed === WATERING_COUNT && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return this.placed / WATERING_COUNT;
  }

  // Solo se puede agarrar el recipiente que toca: aparecen de a uno.
  get current(): number {
    return this.items.findIndex((i) => !i.placed);
  }

  pointerDown(p: Point): void {
    const i = this.current;
    if (i < 0) return;
    const it = this.items[i];
    const inside =
      p.x >= it.x &&
      p.x <= it.x + WATERING_SIZE &&
      p.y >= it.y &&
      p.y <= it.y + WATERING_SIZE;
    if (!inside) return;
    this.dragging = i;
    this.grabDx = p.x - it.x;
    this.grabDy = p.y - it.y;
    this.events.push({ type: 'grab', x: p.x, y: p.y, index: i });
  }

  pointerMove(p: Point): void {
    if (this.dragging === null) return;
    const it = this.items[this.dragging];
    it.x = p.x - this.grabDx;
    it.y = p.y - this.grabDy;
  }

  // Al soltar: en el recipiente correcto cuenta; en el otro, o fuera,
  // vuelve a la mesa.
  pointerUp(): void {
    if (this.dragging === null) return;
    const i = this.dragging;
    const it = this.items[i];
    this.dragging = null;
    const cx = it.x + WATERING_SIZE / 2;
    const cy = it.y + WATERING_SIZE / 2;
    const inPlot = inRect(cx, cy, WATERING_PLOT);
    const inTreat = inRect(cx, cy, WATERING_TREAT);
    it.x = it.homeX;
    it.y = it.homeY;
    const kind: WaterKind = inPlot ? 'water' : 'treat';
    if ((inPlot || inTreat) && it.kind === kind) {
      it.placed = true;
      this.events.push({ type: 'drop-in', x: cx, y: cy, index: i });
      return;
    }
    this.events.push({ type: 'drop-out', x: it.x, y: it.y, index: i });
  }

  step(dtMs: number): void {
    this.elapsed += dtMs;
  }
}

// Reducir (leak-2, Fuga del ecotaller): sellar la fuga. Grietas que se
// abren solas en la tubería; hacer clic en cada una para ponerle cinta.
// Una grieta abierta mucho tiempo abre otra. Se sellan 5.
export const SEAL_GOAL = 5;
export const SEAL_MAX_OPEN = 3;
export const SEAL_CRACK_AFTER_MS = 2400;
export const SEAL_HIT_RADIUS = 26;
export const SEAL_PIPE = { x: 16, y: 118, w: 328, h: 28 };

export type Crack = {
  index: number;
  x: number; // centro
  y: number;
  openedAt: number; // ms del inicio cuando se abrió
  sealed: boolean;
};

export class SealGame extends BaseGame implements Minigame {
  readonly cracks: Crack[] = [];
  elapsed = 0;
  sealedCount = 0;
  private lastSpawnAt = -1e9;
  private next = 0;

  get openCracks(): Crack[] {
    return this.cracks.filter((c) => !c.sealed);
  }

  get done(): boolean {
    return this.sealedCount >= SEAL_GOAL && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return clamp01(this.sealedCount / SEAL_GOAL);
  }

  pointerDown(p: Point): void {
    let best: Crack | null = null;
    let bestD = Infinity;
    for (const c of this.cracks) {
      if (c.sealed) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= SEAL_HIT_RADIUS && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (!best) {
      this.events.push({ type: 'miss', x: p.x, y: p.y });
      return;
    }
    best.sealed = true;
    this.sealedCount += 1;
    this.events.push({ type: 'pop', x: best.x, y: best.y, index: best.index });
  }

  pointerMove(): void {}

  pointerUp(): void {}

  step(dtMs: number): void {
    this.elapsed += dtMs;
    if (this.done) return; // ganado: no se abren más grietas
    const open = this.openCracks.length;
    if (open >= SEAL_MAX_OPEN) return;
    if (
      open === 0 ||
      this.elapsed - this.lastSpawnAt >= SEAL_CRACK_AFTER_MS
    ) {
      this.spawn();
    }
  }

  // Reparte las grietas por la tubería: la ranura gira por toda la
  // pared (sin encimarse) y el lado sale al azar.
  private spawn(): void {
    const i = this.next;
    this.next += 1;
    const slot = (i * 2) % 7;
    const below = hash01(i * 11.7 + 4.1) > 0.5;
    const x = 44 + slot * 46;
    const y = below ? SEAL_PIPE.y + SEAL_PIPE.h - 2 : SEAL_PIPE.y + 2;
    this.cracks.push({
      index: i,
      x,
      y,
      openedAt: this.elapsed,
      sealed: false,
    });
    this.lastSpawnAt = this.elapsed;
  }
}

// Reciclar (compost-1, Purificador): jarra filtrante. Se arrastra el balde
// de agua turbia a la jarra; el agua baja por el filtro y abajo queda
// clara; entonces se hace clic en la llave para llenar el vaso. Dos
// vasos. Soltar el balde fuera de la jarra lo devuelve a su lugar.
export const JUG_ROUNDS = 2;
export const JUG_FILTER_MS = 1500; // lo que tarda el agua en pasar
export const JUG_SIZE = 48; // zona de agarre del balde
export const JUG_BUCKET_HOME = { x: 28, y: 152 };
export const JUG_BODY = { x: 146, y: 92, w: 88, h: 108 };
export const JUG_TOP = { x: 146, y: 92, w: 88, h: 46 }; // donde se vierte
export const JUG_TAP = { x: 236, y: 150, w: 36, h: 34 }; // clic: la llave
export const JUG_GLASS = { x: 246, y: 168, w: 30, h: 32 };

// pour: falta verter el balde; filter: el agua baja por el filtro;
// tap: el agua ya está clara y falta abrir la llave.
export type JugPhase = 'pour' | 'filter' | 'tap';

export class JugFilterGame extends BaseGame implements Minigame {
  phase: JugPhase = 'pour';
  glasses = 0; // vasos ya llenos
  filterMs = 0; // lo que lleva bajando el agua por el filtro
  dragging = false;
  elapsed = 0;
  bucket = { x: JUG_BUCKET_HOME.x, y: JUG_BUCKET_HOME.y };
  private grabDx = 0;
  private grabDy = 0;

  get done(): boolean {
    return this.glasses === JUG_ROUNDS && this.elapsed >= MIN_GAME_MS;
  }

  // Cada vaso tiene tres pasos: verter, esperar el filtro y abrir la llave.
  progress(): number {
    const step = this.phase === 'pour' ? 0 : this.phase === 'filter' ? 1 : 2;
    return Math.min(1, (this.glasses * 3 + step) / (JUG_ROUNDS * 3));
  }

  pointerDown(p: Point): void {
    if (this.phase === 'tap') {
      if (inRect(p.x, p.y, JUG_TAP)) {
        this.glasses += 1;
        this.phase = 'pour';
        this.events.push({
          type: 'pop',
          x: p.x,
          y: p.y,
          index: this.glasses - 1,
        });
        return;
      }
      this.events.push({ type: 'miss', x: p.x, y: p.y });
      return;
    }
    const B = this.bucket;
    const inside =
      this.phase === 'pour' &&
      p.x >= B.x &&
      p.x <= B.x + JUG_SIZE &&
      p.y >= B.y &&
      p.y <= B.y + JUG_SIZE;
    if (!inside) return;
    this.dragging = true;
    this.grabDx = p.x - B.x;
    this.grabDy = p.y - B.y;
    this.events.push({ type: 'grab', x: p.x, y: p.y });
  }

  pointerMove(p: Point): void {
    if (!this.dragging) return;
    this.bucket.x = p.x - this.grabDx;
    this.bucket.y = p.y - this.grabDy;
  }

  // Al soltar: sobre la jarra se vierte y empieza el filtro; en
  // cualquier otro lado el balde vuelve a su lugar.
  pointerUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const cx = this.bucket.x + JUG_SIZE / 2;
    const cy = this.bucket.y + JUG_SIZE / 2;
    this.bucket.x = JUG_BUCKET_HOME.x;
    this.bucket.y = JUG_BUCKET_HOME.y;
    if (inRect(cx, cy, JUG_TOP)) {
      this.phase = 'filter';
      this.filterMs = 0;
      this.events.push({
        type: 'drop-in',
        x: cx,
        y: cy,
        index: this.glasses,
      });
      return;
    }
    this.events.push({
      type: 'drop-out',
      x: cx,
      y: cy,
      index: this.glasses,
    });
  }

  step(dtMs: number): void {
    this.elapsed += dtMs;
    if (this.phase !== 'filter') return;
    this.filterMs += dtMs;
    if (this.filterMs >= JUG_FILTER_MS) this.phase = 'tap';
  }
}

function inRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
