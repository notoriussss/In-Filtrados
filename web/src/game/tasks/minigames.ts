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
  'compost-1': () => new CompostGame(),
  'sorter-1': () => new WasteGame(),
};

// Dos números a partir de uno, para repartir al azar sin guardar nada:
// el mismo i da siempre el mismo valor (lo usa también el dibujo).
export function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
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

// Reciclar (sorter-1, Mesa clasificadora): clasificar 4 residuos en los
// cajones de la mesa. Cada residuo va con su color; errar de cajón
// devuelve el residuo a su lugar.
export const WASTE_COUNT = 4;
export const WASTE_SIZE = 34;
export type WasteKind = 'plastic' | 'glass' | 'organic' | 'other';
export const WASTE_KINDS: readonly WasteKind[] = [
  'plastic',
  'glass',
  'organic',
  'other',
];
export type WasteBin = {
  kind: WasteKind;
  x: number;
  y: number;
  w: number;
  h: number;
};
export const WASTE_BINS: readonly WasteBin[] = [
  { kind: 'plastic', x: 196, y: 56, w: 72, h: 50 },
  { kind: 'glass', x: 278, y: 56, w: 72, h: 50 },
  { kind: 'organic', x: 196, y: 122, w: 72, h: 50 },
  { kind: 'other', x: 278, y: 122, w: 72, h: 50 },
];
const WASTE_HOME_Y = 136; // sobre la mesa

export type WasteItem = {
  kind: WasteKind;
  x: number; // esquina superior izquierda
  y: number;
  homeX: number;
  homeY: number;
  placed: boolean;
};

// Baraja los cuatro residuos con el generador que le pasen. Así cada
// partida empieza con otro orden, pero las pruebas pueden fijar la
// secuencia.
function shuffleKinds(rnd: () => number): WasteKind[] {
  const kinds = [...WASTE_KINDS];
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds;
}

export class WasteGame extends BaseGame implements Minigame {
  readonly items: WasteItem[] = [];
  dragging: number | null = null;
  elapsed = 0;
  private grabDx = 0;
  private grabDy = 0;

  constructor(rnd: () => number = Math.random) {
    super();
    shuffleKinds(rnd).forEach((kind, i) => {
      const x = 24 + i * 42;
      this.items.push({
        kind,
        x,
        y: WASTE_HOME_Y,
        homeX: x,
        homeY: WASTE_HOME_Y,
        placed: false,
      });
    });
  }

  get placed(): number {
    return this.items.filter((i) => i.placed).length;
  }

  get done(): boolean {
    return this.placed === WASTE_COUNT && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return this.placed / WASTE_COUNT;
  }

  pointerDown(p: Point): void {
    const i = this.items.findIndex(
      (it) =>
        !it.placed &&
        p.x >= it.x &&
        p.x <= it.x + WASTE_SIZE &&
        p.y >= it.y &&
        p.y <= it.y + WASTE_SIZE,
    );
    if (i < 0) return;
    this.dragging = i;
    this.grabDx = p.x - this.items[i].x;
    this.grabDy = p.y - this.items[i].y;
    this.events.push({ type: 'grab', x: p.x, y: p.y, index: i });
  }

  pointerMove(p: Point): void {
    if (this.dragging === null) return;
    const it = this.items[this.dragging];
    it.x = p.x - this.grabDx;
    it.y = p.y - this.grabDy;
  }

  // Al soltar: si el centro cae en su cajón, cuenta; en otro cajón o en
  // la mesa, vuelve a su lugar.
  pointerUp(): void {
    if (this.dragging === null) return;
    const i = this.dragging;
    const it = this.items[i];
    this.dragging = null;
    const cx = it.x + WASTE_SIZE / 2;
    const cy = it.y + WASTE_SIZE / 2;
    const bin = WASTE_BINS.find(
      (b) =>
        cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h,
    );
    it.x = it.homeX;
    it.y = it.homeY;
    if (bin && bin.kind === it.kind) {
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
// regar? Aparece un recipiente con el dibujo de su origen y se arrastra
// a Regar o a Tratar. Errar lo devuelve a la mesa. Cuatro aciertos.
export const WATERING_COUNT = 4;
export const WATERING_SIZE = 36;
export type WaterKind = 'water' | 'treat';
// Origen de cada recipiente: el agua de lavar verduras y de enjuagar
// ropa sirve para regar; con aceite o cloro, hay que tratarla.
export const WATERING_KINDS: readonly WaterKind[] = [
  'water',
  'water',
  'treat',
  'treat',
];
export const WATERING_HOME = { x: 162, y: 130 }; // sobre la mesa del centro
export const WATERING_PLOT = { x: 20, y: 140, w: 92, h: 88 }; // regar
export const WATERING_TREAT = { x: 248, y: 140, w: 92, h: 88 }; // tratar

export type WaterItem = {
  index: number;
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

  constructor() {
    super();
    for (let i = 0; i < WATERING_COUNT; i++) {
      this.items.push({
        index: i,
        x: WATERING_HOME.x,
        y: WATERING_HOME.y,
        homeX: WATERING_HOME.x,
        homeY: WATERING_HOME.y,
        placed: false,
      });
    }
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
    const kind: WaterKind = inPlot ? 'water' : inTreat ? 'treat' : 'water';
    if ((inPlot || inTreat) && WATERING_KINDS[i] === kind) {
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

// Reciclar (compost-1, Compostera): capas del compost. Arrastrar los
// sacos a la compostera en el orden que señala la mano: seco, húmedo,
// tierra. Equivocarse de saco lo devuelve sacudiéndose. Dos rondas.
export const COMPOST_ROUNDS = 2;
// El orden de cada ronda: seco, húmedo y tierra.
export const COMPOST_ORDER: readonly number[] = [0, 1, 2];
export const COMPOST_STEPS = COMPOST_ROUNDS * COMPOST_ORDER.length;
export const COMPOST_BIN = { x: 238, y: 128, w: 106, h: 100 };
export const COMPOST_SIZE = 40;
export const COMPOST_HOME_X: readonly number[] = [22, 90, 158];

export type CompostSack = {
  index: number;
  x: number; // esquina superior izquierda
  y: number;
  homeX: number;
  homeY: number;
  inBin: number; // veces que entró
};

export class CompostGame extends BaseGame implements Minigame {
  readonly sacks: CompostSack[] = [];
  dragging: number | null = null;
  elapsed = 0;
  private grabDx = 0;
  private grabDy = 0;

  constructor() {
    super();
    const y = FLOOR_Y - COMPOST_SIZE;
    COMPOST_HOME_X.forEach((x, i) => {
      this.sacks.push({
        index: i,
        x,
        y,
        homeX: x,
        homeY: y,
        inBin: 0,
      });
    });
  }

  get steps(): number {
    return this.sacks.reduce((n, s) => n + s.inBin, 0);
  }

  // El saco que toca ahora: la mano lo señala.
  get required(): number {
    return COMPOST_ORDER[this.steps % COMPOST_ORDER.length];
  }

  get done(): boolean {
    return this.steps === COMPOST_STEPS && this.elapsed >= MIN_GAME_MS;
  }

  progress(): number {
    return this.steps / COMPOST_STEPS;
  }

  pointerDown(p: Point): void {
    const i = this.sacks.findIndex(
      (s) =>
        p.x >= s.x &&
        p.x <= s.x + COMPOST_SIZE &&
        p.y >= s.y &&
        p.y <= s.y + COMPOST_SIZE,
    );
    if (i < 0) return;
    this.dragging = i;
    this.grabDx = p.x - this.sacks[i].x;
    this.grabDy = p.y - this.sacks[i].y;
    this.events.push({ type: 'grab', x: p.x, y: p.y, index: i });
  }

  pointerMove(p: Point): void {
    if (this.dragging === null) return;
    const s = this.sacks[this.dragging];
    s.x = p.x - this.grabDx;
    s.y = p.y - this.grabDy;
  }

  // Al soltar: el saco correcto dentro de la compostera cuenta y vuelve
  // a su lugar (se reusa en la siguiente ronda); cualquier otra cosa,
  // el saco se sacude y vuelve.
  pointerUp(): void {
    if (this.dragging === null) return;
    const i = this.dragging;
    const s = this.sacks[i];
    this.dragging = null;
    const cx = s.x + COMPOST_SIZE / 2;
    const cy = s.y + COMPOST_SIZE / 2;
    const inBin = inRect(cx, cy, COMPOST_BIN) && i === this.required;
    s.x = s.homeX;
    s.y = s.homeY;
    if (inBin) {
      s.inBin += 1;
      this.events.push({ type: 'drop-in', x: cx, y: cy, index: i });
      return;
    }
    this.events.push({ type: 'drop-out', x: s.x, y: s.y, index: i });
  }

  step(dtMs: number): void {
    this.elapsed += dtMs;
  }
}

function inRect(
  x: number,
  y: number,
  r: { x: number; y: number; w: number; h: number },
): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
