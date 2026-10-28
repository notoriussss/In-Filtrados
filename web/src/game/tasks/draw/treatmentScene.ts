import {
  FLOURISH_MS,
  IDLE_POSE,
  REACH,
  TUCK,
  flourishPose,
} from '../../render/workPose';
import {
  BOARD,
  FLOOR_Y,
  type TreatmentBin,
  type TreatmentGame,
  type TreatmentKind,
  TREATMENT_BINS,
  TREATMENT_SIZE,
} from '../minigames';
import { drawDropZone, drawMarchArrow, type ZoneTone } from './dragHelpers';
import { drawHand } from './hand';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  clamp01,
  px,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reciclar (sorter-1): la mesa de tratamiento. Cuatro frascos de agua
// sucia sobre la mesa y cuatro etapas del tratamiento: cada frasco va a
// la etapa que lleva el dibujo de lo que trae (sólidos, lodo, aceite o
// espuma de detergente). El personaje jala lo que se arrastra y celebra
// cada acierto.

const TABLE = { x: 12, y: 170, w: 176, h: 26 };
export const TREATMENT_HERO_X = 194;

// El color de cada etapa del tratamiento.
const TREATMENT_COLORS: Record<TreatmentKind, { body: string; hi: string }> = {
  solids: { body: C.metalMid, hi: C.metalHi },
  mud: { body: C.dirt, hi: C.dirtHi },
  oil: { body: C.amberLo, hi: C.amber },
  soap: { body: C.leafLo, hi: C.leaf },
};

// El frasco mide 12 px de arte: a escala 1,5 llena su zona de agarre.
const SAMPLE_SCALE = 1.5;

// Lo de adentro del frasco (8 de ancho): lo que trae esa agua sucia.
const SAMPLE_INSIDE: Record<TreatmentKind, string[]> = {
  solids: [
    'bbbbbbbb',
    'bgggbbCb',
    'bbggbppb',
    'bbbbbppb',
    'bbbbbppb',
    'bbbbbbbb',
    'bbbbbbbb',
    'bbbbbbbb',
    'bbbbbbbb',
  ],
  mud: [
    'dddddddd',
    'dhddddkd',
    'dddkdddd',
    'ddddhddd',
    'dkdddddd',
    'dddddkdd',
    'ddhddddd',
    'dddkdddd',
    'dkdddddk',
  ],
  oil: [
    'yyyyyyyy',
    'yhyyyyhy',
    'bbbbbbbb',
    'bbybbbbb',
    'bbbbbbyb',
    'bbbbbbbb',
    'bbbybbbb',
    'bbbbbbbb',
    'bbbbbbbb',
  ],
  soap: [
    'wwhwwwhw',
    'hwwwhwww',
    'bbwbbbbb',
    'bbbbbwbb',
    'bwbbbbbb',
    'bbbbbbwb',
    'bbbwbbbb',
    'bbbbbbbb',
    'bwbbbbbb',
  ],
};

const SAMPLE_PALETTE: Record<TreatmentKind, Record<string, string>> = {
  solids: { b: C.water, g: C.leaf, C: C.coral, p: C.white },
  mud: { d: C.dirt, h: C.dirtHi, k: C.dirtLo },
  oil: { b: C.water, y: C.amber, h: C.amberHi },
  soap: { b: '#b4c4d4', w: C.white, h: C.waterHi },
};

// Frasco de vidrio con tapa de metal alrededor de lo que trae.
function jarRows(kind: TreatmentKind): string[] {
  return [
    '...oooooo...',
    '...ommmmo...',
    '..oooooooo..',
    ...SAMPLE_INSIDE[kind].map((r) => `.o${r}o.`),
    '.oooooooooo.',
  ];
}

const sprites = new Map<TreatmentKind, HTMLCanvasElement>();

function sampleSprite(kind: TreatmentKind): HTMLCanvasElement {
  let s = sprites.get(kind);
  if (!s) {
    s = spriteFromRows(jarRows(kind), {
      o: C.ink,
      m: C.metalMid,
      ...SAMPLE_PALETTE[kind],
    });
    sprites.set(kind, s);
  }
  return s;
}

// El símbolo de cada etapa es el dibujo de lo que trata: el mismo que
// trae el frasco que le toca, así se emparejan sin palabras.
const DROP_ROWS = [
  '...k...',
  '..kdk..',
  '.kdddk.',
  'kdhdddk',
  'kdddddk',
  '.kdddk.',
];

const SYMBOLS: Record<
  TreatmentKind,
  { rows: string[]; palette: Record<string, string> }
> = {
  solids: {
    rows: ['.gg..CC.', 'gggg.pp.', '.gg..pp.', '.....pp.', '.....pp.'],
    palette: { g: C.leaf, C: C.coral, p: C.white },
  },
  mud: {
    rows: DROP_ROWS,
    palette: { k: C.dirtLo, d: C.dirt, h: C.dirtHi },
  },
  oil: {
    rows: DROP_ROWS,
    palette: { k: C.amberLo, d: C.amber, h: C.amberHi },
  },
  soap: {
    rows: ['.ww...ww.', 'w..w.w..w', 'w..w.w..w', '.ww...ww.'],
    palette: { w: C.white },
  },
};

const symbols = new Map<TreatmentKind, HTMLCanvasElement>();

function symbolSprite(kind: TreatmentKind): HTMLCanvasElement {
  let s = symbols.get(kind);
  if (!s) {
    s = spriteFromRows(SYMBOLS[kind].rows, SYMBOLS[kind].palette);
    symbols.set(kind, s);
  }
  return s;
}

function drawTable(c: CanvasRenderingContext2D): void {
  px(c, TABLE.x, TABLE.y, TABLE.w, TABLE.h, C.metalInk);
  px(c, TABLE.x, TABLE.y, TABLE.w, 6, C.metal);
  px(c, TABLE.x, TABLE.y + 6, TABLE.w, 4, C.metalDark);
  px(c, TABLE.x, TABLE.y, TABLE.w, PX, C.metalHi);
  for (const x of [TABLE.x + 10, TABLE.x + TABLE.w - 22]) {
    px(
      c,
      x,
      TABLE.y + TABLE.h,
      12,
      FLOOR_Y - TABLE.y - TABLE.h,
      C.metalInk,
    );
    px(c, x, TABLE.y + TABLE.h, 12, 4, C.metalDark);
  }
}

function drawTray(c: CanvasRenderingContext2D, bin: TreatmentBin): void {
  const col = TREATMENT_COLORS[bin.kind];
  px(c, bin.x - 3, bin.y - 3, bin.w + 6, bin.h + 6, C.metalInk);
  px(c, bin.x - 1, bin.y - 1, bin.w + 2, bin.h + 2, C.metalDark);
  px(c, bin.x + 2, bin.y + bin.h * 0.5, bin.w - 4, bin.h * 0.5 - 4, col.body);
  px(c, bin.x + 2, bin.y + bin.h * 0.5, bin.w - 4, PX, col.hi);
  px(c, bin.x - 1, bin.y + bin.h - 1, bin.w + 2, 5, C.metalInk);
  px(c, bin.x - 1, bin.y + bin.h - 1, bin.w + 2, PX, C.metalHi);
  // La rejilla de sólidos lleva sus barrotes.
  if (bin.kind === 'solids') {
    for (let x = bin.x + 6; x < bin.x + bin.w - 4; x += 8) {
      px(c, x, bin.y + bin.h * 0.5, PX, bin.h * 0.5 - 4, C.metalInk);
    }
  }
  stamp(c, symbolSprite(bin.kind), bin.x + bin.w / 2, bin.y + 18, {
    scale: 2,
  });
}

type Shown = { x: number; y: number; tilt: number; lift: number };

export class TreatmentScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawTable(c);
    for (const bin of TREATMENT_BINS) drawTray(c, bin);
  });
  private readonly shown: Shown[];
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: TreatmentGame,
    private readonly env: SceneEnv,
  ) {
    this.shown = game.items.map((it) => ({
      x: it.x,
      y: it.y,
      tilt: 0,
      lift: 0,
    }));
    env.hero.lookAt('left');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(dt);
    if (this.game.done && this.doneAt === null) this.doneAt = now;
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawZones(ctx, now);
    this.drawPlaced(ctx);
    this.drawResting(ctx);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawDragged(ctx);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'drop-in') {
        this.cheerAt = now;
        this.touched = true;
      } else if (e.type === 'drop-out') {
        this.shrugAt = now;
        this.touched = true;
      } else if (e.type === 'grab' && e.index !== undefined) {
        this.shown[e.index].lift = 1;
      }
    }
  }

  private update(dt: number): void {
    for (const [i, it] of this.game.items.entries()) {
      const s = this.shown[i];
      if (it.placed) continue;
      if (this.game.dragging === i) {
        // El frasco sigue al puntero: la lógica actualiza it.x/it.y y
        // el dibujo tiene que usar esa misma posición.
        s.x = it.x;
        s.y = it.y;
        continue;
      }
      const k = 1 - Math.exp((-dt / 1000) * 14);
      s.x += (it.x - s.x) * k;
      s.y += (it.y - s.y) * k;
      s.tilt += (0 - s.tilt) * (1 - Math.exp((-dt / 1000) * 12));
      s.lift += (0 - s.lift) * (1 - Math.exp((-dt / 1000) * 10));
    }
  }

  private driveHero(now: number, dt: number): void {
    const g = this.game;
    const hero = this.env.hero;
    if (g.done) {
      hero.lookAt('right');
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    if (g.dragging !== null) {
      const it = g.items[g.dragging];
      const left = it.x + TREATMENT_SIZE / 2 < TREATMENT_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
      const reach = clamp01(
        Math.abs(it.x + TREATMENT_SIZE / 2 - TREATMENT_HERO_X) / 110,
      );
      const s = Math.sin(now / 130);
      hero.drive(
        {
          ...IDLE_POSE,
          frame: s > 0 ? REACH : TUCK,
          lean: 1.5 + 3 * reach,
          dy: -0.9 * Math.abs(s),
          strain: 0.7,
        },
        dt,
      );
      return;
    }
    const since = now - this.cheerAt;
    if (since < FLOURISH_MS) {
      hero.lookAt('right');
      hero.drive(flourishPose(since / FLOURISH_MS), dt);
      return;
    }
    const sinceShrug = now - this.shrugAt;
    if (sinceShrug < 420 && !this.env.calm) {
      const wobble = Math.sin(sinceShrug / 38) * (1 - sinceShrug / 420);
      hero.drive({ ...IDLE_POSE, dx: 2.2 * wobble, sy: 0.97 }, dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.lookAt('left');
    hero.drive(
      { ...IDLE_POSE, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // Mientras se arrastra: la etapa bajo el frasco se enciende; verde si
  // es la suya, roja si no.
  private drawZones(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging === null) return;
    const it = g.items[g.dragging];
    const cx = it.x + TREATMENT_SIZE / 2;
    const cy = it.y + TREATMENT_SIZE / 2;
    for (const bin of TREATMENT_BINS) {
      const over =
        cx >= bin.x - 6 &&
        cx <= bin.x + bin.w + 6 &&
        cy >= bin.y - 6 &&
        cy <= bin.y + bin.h + 6;
      if (!over) continue;
      const tone: ZoneTone = bin.kind === it.kind ? 'good' : 'bad';
      drawDropZone(ctx, bin, now, this.env.calm, tone);
      return;
    }
  }

  // Los ya tratados se ven dentro de su etapa.
  private drawPlaced(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    for (const it of g.items) {
      if (!it.placed) continue;
      const bin = TREATMENT_BINS.find((b) => b.kind === it.kind);
      if (!bin) continue;
      stamp(
        ctx,
        sampleSprite(it.kind),
        bin.x + bin.w / 2,
        bin.y + bin.h * 0.66,
      );
    }
  }

  private drawResting(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    for (const [i, it] of g.items.entries()) {
      if (it.placed || g.dragging === i) continue;
      const s = this.shown[i];
      stamp(
        ctx,
        sampleSprite(it.kind),
        s.x + TREATMENT_SIZE / 2,
        s.y + TREATMENT_SIZE / 2,
        { scale: SAMPLE_SCALE },
      );
    }
  }

  private drawDragged(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    if (g.dragging === null) return;
    const s = this.shown[g.dragging];
    const it = g.items[g.dragging];
    const cx = s.x + TREATMENT_SIZE / 2;
    const cy = s.y + TREATMENT_SIZE / 2;
    ctx.globalAlpha = 0.3;
    stamp(ctx, sampleSprite(it.kind), cx + 6, cy + 10, {
      angle: s.tilt,
      scale: SAMPLE_SCALE,
    });
    ctx.globalAlpha = 1;
    stamp(ctx, sampleSprite(it.kind), cx, cy - 2 * s.lift, {
      angle: s.tilt,
      scale: SAMPLE_SCALE,
    });
  }

  // La mano señala el frasco que toca y, hasta el primer acierto, la
  // flecha de su color muestra a qué etapa va.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done) return;
    const i = g.items.findIndex((it) => !it.placed);
    if (i < 0) return;
    const it = g.items[i];
    const s = this.shown[i];
    const sx = s.x + TREATMENT_SIZE / 2;
    const sy = s.y + TREATMENT_SIZE / 2;
    const bin = TREATMENT_BINS.find((b) => b.kind === it.kind);
    if (bin && !this.touched) {
      drawMarchArrow(
        ctx,
        { x: sx + 18, y: sy },
        { x: bin.x + bin.w / 2, y: bin.y + bin.h / 2 },
        now,
        this.env.calm,
        TREATMENT_COLORS[it.kind].body,
      );
    }
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    // La mano queda debajo del frasco y solo lo señala: nunca lo tapa.
    drawHand(ctx, sx + 14, sy + 24, press);
  }
}
