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
  type WasteBin,
  type WasteGame,
  type WasteKind,
  WASTE_BINS,
  WASTE_SIZE,
} from '../minigames';
import { drawDropZone, drawMarchArrow, type ZoneTone } from './dragHelpers';
import { drawHand, drawTapRing } from './hand';
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

// Reciclar (sorter-1): la mesa clasificadora. Cuatro residuos sobre la
// mesa y cuatro cajones de colores: cada residuo cae en el cajón de su
// color. El personaje jala lo que se arrastra y celebra cada acierto.

const TABLE = { x: 12, y: 170, w: 176, h: 26 };
export const SORTER_HERO_X = 194;

const WASTE_COLORS: Record<WasteKind, { body: string; hi: string }> = {
  plastic: { body: C.water, hi: C.waterHi },
  glass: { body: C.aqua, hi: C.white },
  organic: { body: C.dirt, hi: C.dirtHi },
  other: { body: C.grey, hi: C.greyHi },
};

const BOTTLE_ROWS = [
  '...oooo...',
  '...obbo...',
  '...obbo...',
  '..obbbbo..',
  '..obbbbo..',
  '..ohbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..oooooo..',
];

const JAR_ROWS = [
  '..oooooo..',
  '..ommmmo..',
  '..oooooo..',
  '..obbbbo..',
  '..obhhbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..obbbbo..',
  '..oooooo..',
];

const PEEL_ROWS = [
  '...oooo...',
  '..obbbbo..',
  '.obbbbbbo.',
  '.obbbhbbo.',
  'obbbbbbbo.',
  '.obbbbbo..',
  '..obbbbo..',
  '...oooo...',
];

const SPONGE_ROWS = [
  '..oooooo..',
  '.obbbbbbo.',
  '.obhbhbbo.',
  '.obbbbbbo.',
  '.obhbbhbo.',
  '.obbbbbbo.',
  '..oooooo..',
];

const sprites = new Map<WasteKind, HTMLCanvasElement>();

function wasteSprite(kind: WasteKind): HTMLCanvasElement {
  let s = sprites.get(kind);
  if (!s) {
    const rows =
      kind === 'plastic'
        ? BOTTLE_ROWS
        : kind === 'glass'
          ? JAR_ROWS
          : kind === 'organic'
            ? PEEL_ROWS
            : SPONGE_ROWS;
    s = spriteFromRows(rows, {
      o: C.ink,
      b: WASTE_COLORS[kind].body,
      h: WASTE_COLORS[kind].hi,
      m: C.metalMid,
    });
    sprites.set(kind, s);
  }
  return s;
}

// El símbolo de cada cajón dice la categoría sin palabras.
const SYMBOL_ROWS: Record<WasteKind, string[]> = {
  plastic: ['.ww.', 'wwww', 'wwww', 'wwww', '.ww.'],
  glass: ['wwwwww', '.w..w.', '.w..w.', '.wwww.'],
  organic: ['..ww..', '.wwww.', '.wwww.', 'wwww..', 'ww....', '.w....'],
  other: ['w.w.w'],
};

let symbols: Map<WasteKind, HTMLCanvasElement> | null = null;

function symbolSprite(kind: WasteKind): HTMLCanvasElement {
  symbols ??= new Map();
  let s = symbols.get(kind);
  if (!s) {
    s = spriteFromRows(SYMBOL_ROWS[kind], { w: C.white });
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

function drawTray(c: CanvasRenderingContext2D, bin: WasteBin): void {
  const col = WASTE_COLORS[bin.kind];
  px(c, bin.x - 3, bin.y - 3, bin.w + 6, bin.h + 6, C.metalInk);
  px(c, bin.x - 1, bin.y - 1, bin.w + 2, bin.h + 2, C.metalDark);
  px(c, bin.x + 2, bin.y + bin.h * 0.5, bin.w - 4, bin.h * 0.5 - 4, col.body);
  px(c, bin.x + 2, bin.y + bin.h * 0.5, bin.w - 4, PX, col.hi);
  px(c, bin.x - 1, bin.y + bin.h - 1, bin.w + 2, 5, C.metalInk);
  px(c, bin.x - 1, bin.y + bin.h - 1, bin.w + 2, PX, C.metalHi);
  stamp(c, symbolSprite(bin.kind), bin.x + bin.w / 2, bin.y + bin.h - 14);
}

type Shown = { x: number; y: number; tilt: number; lift: number };

export class SorterScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawTable(c);
    for (const bin of WASTE_BINS) drawTray(c, bin);
  });
  private readonly shown: Shown[];
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: WasteGame,
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
      if (it.placed || this.game.dragging === i) continue;
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
      const left = it.x + WASTE_SIZE / 2 < SORTER_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
      const reach = clamp01(
        Math.abs(it.x + WASTE_SIZE / 2 - SORTER_HERO_X) / 110,
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

  // Mientras se arrastra: el cajón bajo el residuo se enciende; verde si
  // es el suyo, rojo si no.
  private drawZones(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging === null) return;
    const it = g.items[g.dragging];
    const cx = it.x + WASTE_SIZE / 2;
    const cy = it.y + WASTE_SIZE / 2;
    for (const bin of WASTE_BINS) {
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

  // Los ya clasificados se ven dentro de su cajón.
  private drawPlaced(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    for (const it of g.items) {
      if (!it.placed) continue;
      const bin = WASTE_BINS.find((b) => b.kind === it.kind);
      if (!bin) continue;
      stamp(
        ctx,
        wasteSprite(it.kind),
        bin.x + bin.w / 2,
        bin.y + bin.h * 0.62,
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
        wasteSprite(it.kind),
        s.x + WASTE_SIZE / 2,
        s.y + WASTE_SIZE / 2,
      );
    }
  }

  private drawDragged(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    if (g.dragging === null) return;
    const s = this.shown[g.dragging];
    const it = g.items[g.dragging];
    const cx = s.x + WASTE_SIZE / 2;
    const cy = s.y + WASTE_SIZE / 2;
    ctx.globalAlpha = 0.3;
    stamp(ctx, wasteSprite(it.kind), cx + 6, cy + 10, { angle: s.tilt });
    ctx.globalAlpha = 1;
    stamp(ctx, wasteSprite(it.kind), cx, cy - 2 * s.lift, { angle: s.tilt });
  }

  // La mano señala el residuo que toca y, hasta el primer acierto, la
  // flecha de su color muestra a qué cajón va.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done) return;
    const i = g.items.findIndex((it) => !it.placed);
    if (i < 0) return;
    const it = g.items[i];
    const s = this.shown[i];
    const sx = s.x + WASTE_SIZE / 2;
    const sy = s.y + WASTE_SIZE / 2;
    const bin = WASTE_BINS.find((b) => b.kind === it.kind);
    if (bin && !this.touched) {
      drawMarchArrow(
        ctx,
        { x: sx + 18, y: sy },
        { x: bin.x + bin.w / 2, y: bin.y + bin.h / 2 },
        now,
        this.env.calm,
        WASTE_COLORS[it.kind].body,
      );
    }
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, sx - 4, sy - 10, press);
    if (!this.touched) {
      drawTapRing(ctx, sx, sy, this.env.calm ? 0.3 : (now % 900) / 900);
    }
  }
}
