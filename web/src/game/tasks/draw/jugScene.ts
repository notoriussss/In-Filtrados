import {
  FLOURISH_MS,
  IDLE_POSE,
  flourishPose,
  workPose,
} from '../../render/workPose';
import {
  BOARD,
  FLOOR_Y,
  JUG_BODY,
  JUG_BUCKET_HOME,
  JUG_FILTER_MS,
  JUG_GLASS,
  JUG_ROUNDS,
  JUG_SIZE,
  JUG_TAP,
  JUG_TOP,
  type JugFilterGame,
} from '../minigames';
import { drawMarchArrow } from './dragHelpers';
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

// Reciclar (compost-1, Purificador): jarra filtrante. Un balde de agua
// turbia, una jarra con filtro y un vaso. Se vierte el balde en la jarra,
// el agua baja por el filtro y abajo queda clara, y se abre la llave para
// llenar el vaso. Dos vasos.

export const JUG_HERO_X = 112;
const COUNTER_Y = 200;
const POUR_MS = 650; // lo que tarda el balde en vaciarse en la jarra
const MUD = '#8a6a3c';
const MUD_DEEP = '#5e4526';
const GLASS = '#17415f';
const FILTER_Y = JUG_TOP.y + JUG_TOP.h; // el filtro divide la jarra
const WATER_X = JUG_BODY.x + 6;
const WATER_W = JUG_BODY.w - 12;
const LOWER_BOTTOM = COUNTER_Y - 4;

// Balde de agua turbia: 0 borde, b balde, h luz, w agua.
const BUCKET_ROWS = [
  'oooooooooo',
  'owwwwwwwwo',
  'obbbbbbbbo',
  'ohbbbbbbbo',
  '.obbbbbbo.',
  '.obbbbbbo.',
  '.obbbbbbo.',
  '..obbbbo..',
  '..oooooo..',
];

let bucket: HTMLCanvasElement | null = null;

function bucketSprite(): HTMLCanvasElement {
  bucket ??= spriteFromRows(BUCKET_ROWS, {
    o: C.ink,
    b: C.metalMid,
    h: C.metalHi,
    w: MUD,
  });
  return bucket;
}

// La mesa donde está todo.
function drawCounter(c: CanvasRenderingContext2D): void {
  px(c, 8, COUNTER_Y, 344, 8, C.metalInk);
  px(c, 8, COUNTER_Y, 344, 5, C.metal);
  px(c, 8, COUNTER_Y, 344, PX, C.metalHi);
  px(c, 8, COUNTER_Y + 8, 344, FLOOR_Y - COUNTER_Y - 8, C.metalDeep);
  px(c, 8, COUNTER_Y + 8, 344, PX, C.metalDark);
}

// La jarra: cuerpo de vidrio, asa, tapa, depósito de arriba y la llave.
function drawJug(c: CanvasRenderingContext2D): void {
  const b = JUG_BODY;
  // Asa a la izquierda.
  px(c, b.x - 16, b.y + 24, 18, 6, C.metalInk);
  px(c, b.x - 16, b.y + 24, 6, 50, C.metalInk);
  px(c, b.x - 16, b.y + 68, 18, 6, C.metalInk);
  px(c, b.x - 14, b.y + 26, 4, 46, C.metalMid);
  // Cuerpo de vidrio: borde claro y fondo apenas más claro que la pared.
  px(c, b.x - 3, b.y - 3, b.w + 6, b.h + 6, C.metalInk);
  px(c, b.x - 1, b.y - 1, b.w + 2, b.h + 2, C.lineHi);
  px(c, b.x, b.y, b.w, b.h, GLASS);
  px(c, b.x + 4, b.y + 4, 4, b.h - 12, C.waterHi);
  px(c, b.x + b.w - 6, b.y + 4, 2, b.h - 12, C.line);
  // Tapa del depósito.
  px(c, b.x - 5, b.y - 7, b.w + 10, 6, C.metalInk);
  px(c, b.x - 3, b.y - 5, b.w + 6, 3, C.metalMid);
  // La llave, a la derecha.
  const t = JUG_TAP;
  px(c, b.x + b.w - 2, t.y + 4, t.w - 6, 14, C.metalInk);
  px(c, b.x + b.w, t.y + 6, t.w - 10, 10, C.metalMid);
  px(c, b.x + b.w + t.w - 12, t.y + 14, 8, 14, C.metalInk);
  px(c, b.x + b.w + t.w - 10, t.y + 16, 4, 12, C.metalDark);
  px(c, b.x + b.w + 6, t.y - 6, 6, 12, C.coral);
  px(c, b.x + b.w + 3, t.y - 8, 12, 4, C.coralHi);
}

// El filtro: un cono de carbón y tela al medio de la jarra.
function drawFilter(c: CanvasRenderingContext2D): void {
  const b = JUG_BODY;
  px(c, b.x + 4, FILTER_Y - 4, b.w - 8, 8, C.metalInk);
  px(c, b.x + 6, FILTER_Y - 2, b.w - 12, 4, C.metalMid);
  const cx = b.x + b.w / 2;
  for (let i = 0; i < 6; i++) {
    const w = b.w - 16 - i * 10;
    const shade = i % 2 ? '#2b3444' : '#1b2330';
    px(c, cx - w / 2, FILTER_Y + 4 + i * 3, w, 3, shade);
  }
}

export class JugScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawCounter(c);
    drawJug(c);
  });
  private pourAt = -1e9;
  private cheerAt = -1e9;
  private tapAt = -1e9;
  private upper = 0; // agua turbia de arriba, 0 a 1
  private lower = 0; // agua clara de abajo, 0 a 1
  private glass = 0; // lo que lleva el vaso, 0 a 1
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: JugFilterGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('right');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(now, dt);
    if (this.game.done && this.doneAt === null) this.doneAt = now;
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawWater(ctx, now);
    drawFilter(ctx);
    this.drawDrips(ctx, now);
    this.drawGlass(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawBucket(ctx, now);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'drop-in') {
        this.pourAt = now;
        this.cheerAt = now;
      } else if (e.type === 'pop') {
        this.tapAt = now;
        this.cheerAt = now;
      }
    }
  }

  // El agua se mueve hacia lo que dice el juego: arriba baja mientras
  // filtra, abajo sube; al abrir la llave, abajo se vacía y el vaso sube.
  private update(now: number, dt: number): void {
    const g = this.game;
    const k = 1 - Math.exp((-dt / 1000) * 8);
    const pouring = clamp01((now - this.pourAt) / POUR_MS);
    const f = clamp01(g.filterMs / JUG_FILTER_MS);
    let upper = 0;
    let lower = 0;
    if (g.phase === 'filter') {
      upper = Math.min(pouring, 1 - f * 0.9);
      lower = f;
    } else if (g.phase === 'tap') {
      lower = 1;
    }
    this.upper += (upper - this.upper) * k;
    this.lower += (lower - this.lower) * k;
    this.glass += (g.glasses / JUG_ROUNDS - this.glass) * k;
  }

  private driveHero(now: number, dt: number): void {
    const g = this.game;
    const hero = this.env.hero;
    if (g.done) {
      hero.lookAt('right');
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    if (g.dragging) {
      hero.lookAt('right');
      hero.drive(workPose('tank', now, 1), dt);
      return;
    }
    const since = now - this.cheerAt;
    if (since < FLOURISH_MS) {
      hero.lookAt('right');
      hero.drive(flourishPose(since / FLOURISH_MS), dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.lookAt('right');
    hero.drive(
      { ...IDLE_POSE, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // El agua turbia de arriba y el agua clara de abajo.
  private drawWater(ctx: CanvasRenderingContext2D, now: number): void {
    const upTop = FILTER_Y - this.upper * (JUG_TOP.h - 8);
    if (this.upper > 0.02) {
      px(ctx, WATER_X, upTop, WATER_W, FILTER_Y - upTop, MUD);
      px(ctx, WATER_X, upTop + 6, WATER_W, FILTER_Y - upTop - 6, MUD_DEEP);
      const wave = this.env.calm ? 0 : Math.round(Math.sin(now / 200)) * PX;
      px(ctx, WATER_X, upTop + wave, WATER_W, PX, C.dirtHi);
    }
    const lowH = this.lower * (LOWER_BOTTOM - FILTER_Y - 22);
    if (lowH > 1) {
      const lowTop = LOWER_BOTTOM - lowH;
      px(ctx, WATER_X, lowTop, WATER_W, lowH, C.water);
      px(ctx, WATER_X, lowTop + 6, WATER_W, lowH - 6, C.waterDeep);
      px(ctx, WATER_X, lowTop, WATER_W, PX, C.waterHi);
      px(ctx, WATER_X + 4, lowTop + 2, 3, Math.max(0, lowH - 6), C.waterHi);
    }
  }

  // Gotas que bajan del filtro mientras filtra: marrones arriba y claras
  // después de pasar el filtro.
  private drawDrips(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.phase !== 'filter' || this.env.calm) return;
    const cx = JUG_BODY.x + JUG_BODY.w / 2;
    for (let i = 0; i < 4; i++) {
      const t = (now / 520 + i / 4) % 1;
      const y = FILTER_Y + 22 + t * (LOWER_BOTTOM - FILTER_Y - 30);
      px(ctx, cx - 14 + i * 9, y, PX, PX * 2, C.waterHi);
    }
  }

  // El vaso bajo la llave se va llenando; la llave suelta un hilo.
  private drawGlass(ctx: CanvasRenderingContext2D, now: number): void {
    const gl = JUG_GLASS;
    px(ctx, gl.x - 2, gl.y - 2, gl.w + 4, gl.h + 2, C.metalInk);
    px(ctx, gl.x - 1, gl.y - 1, gl.w + 2, gl.h, C.lineHi);
    px(ctx, gl.x, gl.y, gl.w, gl.h - 2, GLASS);
    const h = this.glass * (gl.h - 6);
    if (h > 1) {
      px(ctx, gl.x + 2, gl.y + gl.h - 4 - h, gl.w - 4, h, C.water);
      px(ctx, gl.x + 2, gl.y + gl.h - 4 - h, gl.w - 4, PX, C.waterHi);
    }
    const pouring = now - this.tapAt < 450 && !this.env.calm;
    if (pouring) {
      const x = JUG_BODY.x + JUG_BODY.w + JUG_TAP.w - 8;
      px(ctx, x, JUG_TAP.y + 30, PX * 2, gl.y - JUG_TAP.y - 28, C.water);
      px(ctx, x, JUG_TAP.y + 30, PX, gl.y - JUG_TAP.y - 28, C.waterHi);
    }
  }

  // El balde, quieto en su sitio, arrastrado o vertiendo sobre la jarra.
  private drawBucket(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    const pour = clamp01((now - this.pourAt) / POUR_MS);
    if (g.phase !== 'pour' && pour >= 1) {
      this.drawBucketAt(
        ctx,
        JUG_BUCKET_HOME.x + JUG_SIZE / 2,
        JUG_BUCKET_HOME.y + JUG_SIZE / 2,
        0,
        0.4,
      );
      return;
    }
    if (g.phase !== 'pour' || pour < 1) {
      // Vertiendo: el balde se inclina sobre el borde de la jarra.
      const e = Math.sin(Math.PI * clamp01(pour));
      const tx = JUG_TOP.x + 14;
      const ty = JUG_TOP.y - 14;
      const sx = JUG_BUCKET_HOME.x + JUG_SIZE / 2;
      const sy = JUG_BUCKET_HOME.y + JUG_SIZE / 2;
      this.drawBucketAt(
        ctx,
        sx + (tx - sx) * e,
        sy + (ty - sy) * e,
        -1.1 * e,
        1,
      );
      if (pour > 0.15 && pour < 0.9) {
        px(ctx, JUG_TOP.x + 30, JUG_TOP.y - 2, 6, JUG_TOP.h * 0.6, MUD);
      }
      return;
    }
    const cx = g.bucket.x + JUG_SIZE / 2;
    const cy = g.bucket.y + JUG_SIZE / 2 - (g.dragging ? 2 : 0);
    this.drawBucketAt(ctx, cx, cy, g.dragging ? -0.1 : 0, 1);
  }

  private drawBucketAt(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    alpha: number,
  ): void {
    ctx.globalAlpha = alpha;
    stamp(ctx, bucketSprite(), x, y, { angle, scale: 2.4 });
    ctx.globalAlpha = 1;
  }

  // La flecha lleva el balde a la jarra; cuando el agua ya está clara, la
  // mano señala la llave desde abajo para no taparla.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    if (g.phase === 'pour' && !g.dragging) {
      drawMarchArrow(
        ctx,
        { x: g.bucket.x + JUG_SIZE + 4, y: g.bucket.y + 8 },
        { x: JUG_TOP.x + JUG_TOP.w / 2, y: JUG_TOP.y + 14 },
        now,
        this.env.calm,
      );
      drawHand(ctx, g.bucket.x + 36, g.bucket.y + JUG_SIZE + 14, press);
    } else if (g.phase === 'tap') {
      const tx = JUG_TAP.x + JUG_TAP.w / 2;
      const k = this.env.calm ? 0.3 : (now % 900) / 900;
      drawTapRing(ctx, tx, JUG_TAP.y + 14, k);
      drawHand(ctx, tx + 10, JUG_TAP.y + 44, press);
    }
  }
}
