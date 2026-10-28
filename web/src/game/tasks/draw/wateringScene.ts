import {
  FLOURISH_MS,
  IDLE_POSE,
  REACH,
  TUCK,
  flourishPose,
} from '../../render/workPose';
import {
  BOARD,
  type WaterKind,
  WATERING_HOME,
  WATERING_KINDS,
  WATERING_PLOT,
  WATERING_SIZE,
  WATERING_TREAT,
  type WateringGame,
} from '../minigames';
import { drawDropZone, type ZoneTone } from './dragHelpers';
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

// Reutilizar (greywater-2): ¿sirve para regar? Aparece un recipiente
// con el dibujo de su origen y se arrastra a Regar (la planta) o a
// Tratar (la caja de tratamiento). Errar lo devuelve a la mesa.

const TABLE = { x: 140, y: 170, w: 80, h: 26 };
export const WATERING_HERO_X = 126;
const GREY = '#8a9aa6';

// Recipiente con agua gris, igual para los cuatro.
const CUP_ROWS = [
  '.oooooooo.',
  '.o......o.',
  '.oLLLLLLo.',
  '.oLLLLLLo.',
  '.oLLLLLLo.',
  '.oLLLLLLo.',
  '.oLLLLLLo.',
  '.oooooooo.',
];

// El dibujo del origen, sobre el recipiente: el jugador decide.
const ORIGIN_ROWS: string[][] = [
  // Agua de lavar verduras: una hoja.
  [
    '....ww....',
    '...wwww...',
    '..wwwwww..',
    '..wwwwww..',
    '...wwww...',
    '....ww....',
  ],
  // Agua de enjuagar ropa: una camiseta.
  [
    '.ww....ww.',
    'wwww..wwww',
    'wwwwwwwwww',
    '.wwwwwwww.',
    '..wwwwww..',
    '..wwwwww..',
  ],
  // Con aceite de cocina: una gota.
  [
    '....ww....',
    '....ww....',
    '...wwww...',
    '..wwwwww..',
    '..wwwwww..',
    '..wwwwww..',
    '...wwww...',
  ],
  // Con cloro: una botella.
  [
    '....ww....',
    '...wwww...',
    '...wwww...',
    '..wwwwww..',
    '..whhhww..',
    '..wwwwww..',
    '..wwwwww..',
  ],
];
const ORIGIN_COLORS = [C.leaf, C.coral, C.amber, C.white];

const originSprites = ORIGIN_ROWS.map((rows, i) =>
  spriteFromRows(rows, { w: ORIGIN_COLORS[i], h: C.ink }),
);

function drawPot(c: CanvasRenderingContext2D): void {
  const p = WATERING_PLOT;
  // Maceta con una planta: regar.
  px(c, p.x + 12, p.y + 12, p.w - 24, p.h - 12, C.metalInk);
  px(c, p.x + 14, p.y + 14, p.w - 28, p.h - 16, C.coralLo);
  px(c, p.x + 14, p.y + 14, p.w - 28, 4, C.coral);
  px(c, p.x + 10, p.y + 8, p.w - 20, 8, C.metalInk);
  px(c, p.x + 12, p.y + 10, p.w - 24, 4, C.coralHi);
  // Hojas de la planta.
  px(c, p.x + p.w / 2 - 2, p.y - 4, PX, 16, C.leafLo);
  px(c, p.x + p.w / 2 - 12, p.y - 8, 10, 6, C.leaf);
  px(c, p.x + p.w / 2 + 3, p.y - 12, 10, 6, C.leaf);
  px(c, p.x + p.w / 2 - 10, p.y - 6, 6, PX, C.leafHi);
  px(c, p.x + p.w / 2 + 5, p.y - 10, 6, PX, C.leafHi);
}

// Caja de tratamiento: embudo, rejilla y luz.
function drawTreat(c: CanvasRenderingContext2D): void {
  const t = WATERING_TREAT;
  px(c, t.x + 6, t.y + 12, t.w - 12, t.h - 12, C.metalInk);
  px(c, t.x + 8, t.y + 14, t.w - 16, t.h - 16, C.metalDark);
  px(c, t.x + 8, t.y + 14, t.w - 16, PX, C.metalMid);
  // Embudo arriba.
  px(c, t.x + 18, t.y + 2, t.w - 36, 12, C.metalInk);
  px(c, t.x + 20, t.y + 4, t.w - 40, 8, C.metalDeep);
  px(c, t.x + 20, t.y + 4, t.w - 40, PX, C.metalHi);
  // Rejilla de filtros al frente.
  for (let y = t.y + 26; y < t.y + t.h - 10; y += 8) {
    px(c, t.x + 12, y, t.w - 24, PX, C.metalInk);
  }
  px(c, t.x + t.w - 18, t.y + 18, 8, 6, C.amber);
}

export class WateringScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawPot(c);
    drawTreat(c);
    // Mesa del centro, encima de las patas.
    px(c, TABLE.x - 4, TABLE.y - 4, TABLE.w + 8, TABLE.h + 8, C.metalInk);
    px(c, TABLE.x, TABLE.y, TABLE.w, 6, C.metal);
    px(c, TABLE.x, TABLE.y, TABLE.w, PX, C.metalHi);
    px(c, TABLE.x, TABLE.y + 6, TABLE.w, TABLE.h - 6, C.metalInk);
    for (const x of [TABLE.x + 8, TABLE.x + TABLE.w - 18]) {
      px(c, x, TABLE.y + TABLE.h, 10, 228 - TABLE.y - TABLE.h, C.metalInk);
    }
  });
  private readonly ghosts: {
    at: number;
    left: boolean;
    x: number;
    y: number;
  }[] = [];
  private readonly shown = {
    x: WATERING_HOME.x,
    y: WATERING_HOME.y,
    tilt: 0,
    lift: 0,
  };
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: WateringGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('right');
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
    this.drawCurrent(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawGhosts(ctx, now);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'drop-in') {
        this.ghosts.push({
          at: now,
          left: e.x < BOARD.w / 2,
          x: e.x,
          y: e.y,
        });
        this.cheerAt = now;
        this.touched = true;
      } else if (e.type === 'drop-out') {
        this.shrugAt = now;
        this.touched = true;
      } else if (e.type === 'grab') {
        this.shown.lift = 1;
      }
    }
  }

  private update(dt: number): void {
    const i = this.game.current;
    if (i < 0) return;
    const it = this.game.items[i];
    const dragging = this.game.dragging === i;
    const k = dragging
      ? 1 - Math.exp((-dt / 1000) * 22)
      : 1 - Math.exp((-dt / 1000) * 14);
    this.shown.x += (it.x - this.shown.x) * k;
    this.shown.y += (it.y - this.shown.y) * k;
    const vx = (it.x - this.shown.x) / Math.max(dt, 1);
    const tilt =
      dragging && !this.env.calm
        ? Math.max(-0.4, Math.min(0.4, vx * 1.3))
        : 0;
    this.shown.tilt +=
      (tilt - this.shown.tilt) * (1 - Math.exp((-dt / 1000) * 12));
    if (!dragging) {
      this.shown.lift +=
        (0 - this.shown.lift) * (1 - Math.exp((-dt / 1000) * 10));
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
      const left = it.x + WATERING_SIZE / 2 < WATERING_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
      const reach = clamp01(
        Math.abs(it.x + WATERING_SIZE / 2 - WATERING_HERO_X) / 100,
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
    hero.lookAt('right');
    hero.drive(
      { ...IDLE_POSE, lean: 1.2, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // La caja bajo el recipiente: verde si caería bien, rojo si no.
  private drawZones(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging === null) return;
    const it = g.items[g.dragging];
    const cx = it.x + WATERING_SIZE / 2;
    const cy = it.y + WATERING_SIZE / 2;
    const overPlot =
      cx >= WATERING_PLOT.x - 6 &&
      cx <= WATERING_PLOT.x + WATERING_PLOT.w + 6 &&
      cy >= WATERING_PLOT.y - 6 &&
      cy <= WATERING_PLOT.y + WATERING_PLOT.h + 6;
    const overTreat =
      cx >= WATERING_TREAT.x - 6 &&
      cx <= WATERING_TREAT.x + WATERING_TREAT.w + 6 &&
      cy >= WATERING_TREAT.y - 6 &&
      cy <= WATERING_TREAT.y + WATERING_TREAT.h + 6;
    if (!overPlot && !overTreat) return;
    const kind: WaterKind = overPlot ? 'water' : 'treat';
    const tone: ZoneTone =
      WATERING_KINDS[it.index] === kind ? 'good' : 'bad';
    drawDropZone(
      ctx,
      overPlot ? WATERING_PLOT : WATERING_TREAT,
      now,
      this.env.calm,
      tone,
    );
  }

  // El recipiente que toca, con el cartel de su origen.
  private drawCurrent(ctx: CanvasRenderingContext2D, now: number): void {
    const i = this.game.current;
    if (i < 0) return;
    const it = this.game.items[i];
    if (it.placed) return;
    const cx = this.shown.x + WATERING_SIZE / 2;
    const cy = this.shown.y + WATERING_SIZE / 2;
    stamp(ctx, cupSprite(), cx, cy - 2 * this.shown.lift, {
      angle: this.shown.tilt,
    });
    // Cartel del origen sobre el recipiente, con una leve ola.
    const bob = this.env.calm ? 0 : Math.sin(now / 320) * 1.5;
    px(ctx, cx - 14, cy - 44 + bob, 28, 24, C.metalInk);
    px(ctx, cx - 12, cy - 42 + bob, 24, 20, C.wallHi);
    px(ctx, cx - 12, cy - 42 + bob, 24, PX, C.lineHi);
    stamp(ctx, originSprites[i], cx, cy - 32 + bob);
  }

  // El acertado vuela hasta su caja y se vacía ahí.
  private drawGhosts(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      const t = (now - gh.at) / 320;
      if (t >= 1) {
        this.ghosts.splice(i, 1);
        continue;
      }
      const target = gh.left ? WATERING_PLOT : WATERING_TREAT;
      const k = t * t * (3 - 2 * t);
      const x = gh.x + (target.x + target.w / 2 - gh.x) * k;
      const y =
        gh.y +
        (target.y + target.h * 0.6 - gh.y) * k -
        Math.sin(Math.PI * k) * 22;
      ctx.globalAlpha = 1 - t * 0.4;
      stamp(ctx, cupSprite(), x, y, { angle: k * 3 });
      ctx.globalAlpha = 1;
    }
  }

  // La mano agarra el recipiente que toca.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done || this.game.current < 0) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, this.shown.x - 6, this.shown.y + 6, press);
    if (!this.touched) {
      drawTapRing(
        ctx,
        this.shown.x + WATERING_SIZE / 2,
        this.shown.y + WATERING_SIZE / 2,
        this.env.calm ? 0.3 : (now % 900) / 900,
      );
    }
  }
}

let cup: HTMLCanvasElement | null = null;

function cupSprite(): HTMLCanvasElement {
  cup ??= spriteFromRows(CUP_ROWS, {
    o: C.ink,
    L: GREY,
  });
  return cup;
}
