import {
  FLOURISH_MS,
  IDLE_POSE,
  REACH,
  TUCK,
  flourishPose,
} from '../../render/workPose';
import {
  BOARD,
  BUCKET_COUNT,
  BUCKET_SIZE,
  type BucketsGame,
  FLOOR_Y,
  REUSE_TANK,
} from '../minigames';
import { drawHand } from './hand';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bake,
  bakeBoard,
  clamp01,
  hash01,
  px,
  pxLine,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reutilizar: tres cubetas de agua gris en los estantes y un tanque de
// vidrio a la derecha. El personaje tira de la cubeta que se arrastra y
// celebra cuando una entra; al soltarla sobre el tanque se inclina y vierte.

const T = REUSE_TANK;
const INNER = { x: T.x + 6, w: T.w - 12, top: T.y + 10, bottom: FLOOR_Y - 10 };
export const BUCKETS_HERO_X = 164;
const RIM = { x: T.x + T.w / 2 - 14, y: T.y - 24 }; // donde se vierte
const POUR_FLY_MS = 260;
const POUR_HOLD_MS = 520;
const POUR_FADE_MS = 200;
const POUR_MS = POUR_FLY_MS + POUR_HOLD_MS + POUR_FADE_MS;
const POUR_TILT = 1.15;
const WATER = '#7b97ab';
const WATER_HI = '#a9c3d4';
const WATER_LO = '#5f7a8d';
const SHRUG_MS = 420;

let bucket: HTMLCanvasElement | null = null;
let bucketShadow: HTMLCanvasElement | null = null;

// Cubeta de metal de 24 × 24 píxeles de arte: asa, boca con agua gris,
// cuerpo con costillas y luz a la izquierda.
function bucketSprite(): HTMLCanvasElement {
  bucket ??= bake(24, 24, (c) => {
    const dot = (x: number, y: number, color: string) => {
      c.fillStyle = color;
      c.fillRect(x, y, 1, 1);
    };
    // Asa.
    for (let a = Math.PI; a <= Math.PI * 2; a += 0.08) {
      dot(
        Math.round(11.5 + Math.cos(a) * 9.5),
        Math.round(7 + Math.sin(a) * 6.5),
        C.metalInk,
      );
    }
    // Cuerpo: más angosto abajo.
    for (let y = 8; y <= 22; y++) {
      const t = (y - 8) / 14;
      const left = Math.round(2 + 3 * t);
      const right = Math.round(21 - 3 * t);
      for (let x = left; x <= right; x++) {
        let color: string = C.metal;
        if (x <= left + 2) color = C.metalHi;
        else if (x >= right - 4) color = C.metalMid;
        if (x >= right - 1) color = C.metalDark;
        if (y === 13 || y === 18) color = x <= left + 2 ? C.metal : C.metalMid;
        if (x === left || x === right || y === 22) color = C.metalInk;
        dot(x, y, color);
      }
    }
    // Boca: borde y agua gris.
    for (let x = 1; x <= 22; x++) {
      dot(x, 6, C.metalInk);
      dot(x, 7, x < 9 ? C.metalHi : C.metal);
    }
    for (let x = 3; x <= 20; x++) {
      dot(x, 5, C.metalInk);
      dot(x, 6, x < 8 ? C.greyHi : C.grey);
    }
    for (let x = 4; x <= 19; x++) dot(x, 5, x < 9 ? C.greyHi : C.greyLo);
  });
  return bucket;
}

function shadowSprite(): HTMLCanvasElement {
  bucketShadow ??= bake(24, 24, (c) => {
    c.drawImage(bucketSprite(), 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = C.ink;
    c.fillRect(0, 0, 24, 24);
  });
  return bucketShadow;
}

const DROP_ROWS = [
  '...w...',
  '...w...',
  '..www..',
  '.wwwww.',
  'wwwwwww',
  'wwwwwww',
  '.wwwww.',
];

function drawShelves(c: CanvasRenderingContext2D): void {
  for (const y of [80, 154]) {
    px(c, 8, y, 88, 6, C.metalInk);
    px(c, 10, y, 84, 4, C.metalMid);
    px(c, 10, y, 84, PX, C.metalHi);
    for (const x of [16, 82]) {
      px(c, x, y + 6, 4, 10, C.metalDeep);
      px(c, x + 4, y + 6, 4, 6, C.metalDeep);
    }
  }
  // Rejilla de desagüe bajo la tercera cubeta.
  px(c, 8, FLOOR_Y, 88, 4, C.metalInk);
  px(c, 10, FLOOR_Y, 84, PX, C.metalMid);
}

// Cuerpo del tanque que va detrás del agua: fondo de vidrio, cartel y
// marcas de nivel.
function drawTankBack(c: CanvasRenderingContext2D): void {
  px(c, INNER.x, INNER.top, INNER.w, INNER.bottom - INNER.top, '#07203a');
  for (let y = INNER.top; y < INNER.bottom; y += 16) {
    px(c, INNER.x, y, INNER.w, PX, '#0a2a4a');
  }
  // Cartel con una gota sobre el tanque.
  px(c, T.x + 20, T.y - 52, 60, 22, C.metalInk);
  px(c, T.x + 22, T.y - 50, 56, 18, C.wallHi);
  px(c, T.x + 22, T.y - 50, 56, PX, C.lineHi);
}

// Marco y brillo del vidrio, por delante del agua.
function drawTankFront(c: CanvasRenderingContext2D): void {
  // Patas, base y borde superior.
  px(c, T.x - 4, FLOOR_Y - 10, T.w + 8, 10, C.metalInk);
  px(c, T.x - 2, FLOOR_Y - 8, T.w + 4, 6, C.metalMid);
  px(c, T.x - 2, FLOOR_Y - 8, T.w + 4, PX, C.metalHi);
  px(c, T.x - 6, T.y - 4, T.w + 12, 8, C.metalInk);
  px(c, T.x - 4, T.y - 2, T.w + 8, 4, C.metalMid);
  px(c, T.x - 4, T.y - 2, T.w + 8, PX, C.metalHi);
  // Columnas laterales.
  for (const x of [T.x, T.x + T.w - 6]) {
    px(c, x - 2, T.y, 10, T.h - 10, C.metalInk);
    px(c, x, T.y, 6, T.h - 10, C.metalDark);
    px(c, x, T.y, 2, T.h - 10, C.metalMid);
  }
  // Reflejo en el vidrio.
  c.globalAlpha = 0.18;
  px(c, INNER.x + 8, INNER.top + 6, 4, 60, C.white);
  px(c, INNER.x + 16, INNER.top + 6, 2, 30, C.white);
  c.globalAlpha = 1;
}

function drawGauges(c: CanvasRenderingContext2D, filled: number): void {
  const x = T.x + T.w + 6;
  const innerH = INNER.bottom - INNER.top;
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const y = INNER.bottom - ((i + 1) / BUCKET_COUNT) * innerH;
    px(c, x, y - 2, 12, 8, C.ink);
    px(c, x + 2, y, 8, 4, i < filled ? C.leaf : C.line);
    if (i < filled) px(c, x + 2, y, 8, 2, C.leafHi);
    px(c, x - 6, y + 1, 6, PX, C.metalMid);
  }
}

type Pour = { index: number; at: number; x: number; y: number };
type Splash = { x: number; y: number; vx: number; vy: number; life: number };

export class BucketsScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawShelves(c);
    drawTankBack(c);
  });
  private readonly front = bakeBoard(drawTankFront);
  private readonly drop = spriteFromRows(DROP_ROWS, { w: C.waterHi });
  private readonly shown: {
    x: number;
    y: number;
    tilt: number;
    lift: number;
  }[];
  private readonly pours: Pour[] = [];
  private readonly splashes: Splash[] = [];
  private level = 0;
  private filledSeen = 0; // vertidos que ya terminaron
  private visibleFilled = 0; // los que ya llenan el tanque
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private doneAt: number | null = null;
  readonly settleMs = POUR_MS + FLOURISH_MS;

  constructor(
    private readonly game: BucketsGame,
    private readonly env: SceneEnv,
  ) {
    this.shown = game.buckets.map((b) => ({
      x: b.x,
      y: b.y,
      tilt: 0,
      lift: 0,
    }));
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(now, dt);
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawWater(ctx, now);
    ctx.drawImage(this.front, 0, 0, BOARD.w, BOARD.h);
    this.drawDropZone(ctx, now);
    this.drawPlate(ctx);
    this.drawGaugeLamps(ctx);
    this.drawRestingBuckets(ctx);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawPours(ctx, now);
    this.drawDragged(ctx);
    this.drawSplashes(ctx);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'drop-in') {
        this.pours.push({ index: e.index, at: now, x: e.x, y: e.y });
        this.cheerAt = now;
      } else if (e.type === 'drop-out') {
        this.shrugAt = now;
      } else if (e.type === 'grab' && e.index !== undefined) {
        this.shown[e.index].lift = 1;
      }
    }
  }

  private update(now: number, dt: number): void {
    const k = 1 - Math.exp((-dt / 1000) * 22);
    for (const [i, b] of this.game.buckets.entries()) {
      const s = this.shown[i];
      const dragging = this.game.dragging === i;
      const rate = dragging ? k : 1 - Math.exp((-dt / 1000) * 14);
      const vx = (b.x - s.x) / Math.max(dt, 1);
      s.x += (b.x - s.x) * rate;
      s.y += (b.y - s.y) * rate;
      const tilt =
        dragging && !this.env.calm
          ? Math.max(-0.45, Math.min(0.45, vx * 1.4))
          : 0;
      s.tilt += (tilt - s.tilt) * (1 - Math.exp((-dt / 1000) * 12));
      if (!dragging) s.lift += (0 - s.lift) * (1 - Math.exp((-dt / 1000) * 10));
    }
    // El nivel sube cuando el chorro empieza a caer, no al soltar.
    const pouring = this.pours.filter((p) => now - p.at >= POUR_FLY_MS).length;
    this.visibleFilled = this.filledSeen + pouring;
    const target = clamp01(this.visibleFilled / BUCKET_COUNT);
    this.level += (target - this.level) * (1 - Math.exp((-dt / 1000) * 2.4));
    this.emitSplashes(now, dt);
    for (const s of this.splashes) {
      s.life -= dt;
      s.x += (s.vx * dt) / 1000;
      s.y += (s.vy * dt) / 1000;
      s.vy += (380 * dt) / 1000;
    }
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      if (this.splashes[i].life <= 0) this.splashes.splice(i, 1);
    }
    for (let i = this.pours.length - 1; i >= 0; i--) {
      if (now - this.pours[i].at >= POUR_MS) {
        this.pours.splice(i, 1);
        this.filledSeen += 1;
      }
    }
    if (this.game.done && this.pours.length === 0 && this.doneAt === null) {
      this.doneAt = now;
    }
  }

  private emitSplashes(now: number, dt: number): void {
    if (this.env.calm) return;
    for (const p of this.pours) {
      const t = now - p.at;
      if (t < POUR_FLY_MS || t > POUR_FLY_MS + POUR_HOLD_MS) continue;
      if (hash01(Math.floor(now / 16) + p.index) > dt / 22) continue;
      const surface = this.surfaceY();
      this.splashes.push({
        x: RIM.x + 16 + (hash01(now) - 0.5) * 8,
        y: surface,
        vx: (hash01(now + 3) - 0.5) * 70,
        vy: -60 - hash01(now + 7) * 60,
        life: 420,
      });
    }
  }

  private surfaceY(): number {
    return INNER.bottom - (INNER.bottom - INNER.top) * this.level;
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
      const b = g.buckets[g.dragging];
      const left = b.x + BUCKET_SIZE / 2 < BUCKETS_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
      const reach = clamp01(
        Math.abs(b.x + BUCKET_SIZE / 2 - BUCKETS_HERO_X) / 110,
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
    const shrug = now - this.shrugAt;
    if (shrug < SHRUG_MS && !this.env.calm) {
      const wobble = Math.sin(shrug / 38) * (1 - shrug / SHRUG_MS);
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

  private drawWater(ctx: CanvasRenderingContext2D, now: number): void {
    const surface = this.surfaceY();
    if (this.level < 0.005) return;
    px(ctx, INNER.x, surface, INNER.w, INNER.bottom - surface, WATER);
    px(
      ctx,
      INNER.x,
      surface + 10,
      INNER.w,
      INNER.bottom - surface - 10,
      WATER_LO,
    );
    px(ctx, INNER.x + 8, surface + 4, 4, INNER.bottom - surface - 6, WATER_HI);
    // Ola en la superficie.
    const calm = this.env.calm;
    for (let x = INNER.x; x < INNER.x + INNER.w; x += 6) {
      const wave = calm
        ? 0
        : Math.round(Math.sin(x / 9 + now / 260) * 1.4) * PX;
      px(ctx, x, surface - 2 + wave, 6, 4, WATER_HI);
    }
  }

  private drawDropZone(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging === null) return;
    const b = g.buckets[g.dragging];
    const cx = b.x + BUCKET_SIZE / 2;
    const cy = b.y + BUCKET_SIZE / 2;
    const over = cx >= T.x && cx <= T.x + T.w && cy >= T.y && cy <= T.y + T.h;
    const color = over ? C.leaf : C.aqua;
    ctx.globalAlpha = over
      ? 0.9
      : 0.55 + (this.env.calm ? 0 : 0.25 * Math.sin(now / 160));
    const dash = 8;
    for (let x = T.x - 6; x < T.x + T.w + 6; x += dash * 2) {
      px(ctx, x, T.y - 10, dash, PX, color);
    }
    for (let y = T.y - 10; y < FLOOR_Y - 4; y += dash * 2) {
      px(ctx, T.x - 10, y, PX, dash, color);
      px(ctx, T.x + T.w + 8, y, PX, dash, color);
    }
    ctx.globalAlpha = 1;
  }

  private drawPlate(ctx: CanvasRenderingContext2D): void {
    // La gota sobre el cartel del tanque.
    ctx.imageSmoothingEnabled = false;
    stamp(ctx, this.drop, T.x + 50, T.y - 41, { scale: 1.3 });
  }

  private drawGaugeLamps(ctx: CanvasRenderingContext2D): void {
    drawGauges(ctx, this.visibleFilled);
  }

  private drawRestingBuckets(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    for (const [i, b] of g.buckets.entries()) {
      if (b.inTank || g.dragging === i) continue;
      const s = this.shown[i];
      stamp(ctx, bucketSprite(), s.x + BUCKET_SIZE / 2, s.y + BUCKET_SIZE / 2);
    }
  }

  private drawDragged(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    if (g.dragging === null) return;
    const s = this.shown[g.dragging];
    const cx = s.x + BUCKET_SIZE / 2;
    const cy = s.y + BUCKET_SIZE / 2;
    ctx.globalAlpha = 0.3;
    stamp(ctx, shadowSprite(), cx + 6, cy + 10, { angle: s.tilt });
    ctx.globalAlpha = 1;
    stamp(ctx, bucketSprite(), cx, cy - 2 * s.lift, {
      angle: s.tilt,
      scale: 1,
    });
  }

  // La cubeta vuela al borde del tanque, se inclina y vierte el agua.
  private drawPours(ctx: CanvasRenderingContext2D, now: number): void {
    for (const p of this.pours) {
      const t = now - p.at;
      const fromX = p.x + BUCKET_SIZE / 2;
      const fromY = p.y + BUCKET_SIZE / 2;
      const fly = clamp01(t / POUR_FLY_MS);
      const e = 1 - (1 - fly) ** 3;
      const x = fromX + (RIM.x - fromX) * e;
      const y = fromY + (RIM.y - fromY) * e - Math.sin(Math.PI * fly) * 18;
      const hold = clamp01((t - POUR_FLY_MS) / POUR_HOLD_MS);
      const tilt = POUR_TILT * Math.min(1, e + hold * 0.1);
      const fade = clamp01((t - POUR_FLY_MS - POUR_HOLD_MS) / POUR_FADE_MS);
      ctx.globalAlpha = 1 - fade;
      stamp(ctx, bucketSprite(), x, y - fade * 10, { angle: tilt });
      ctx.globalAlpha = 1;
      if (t >= POUR_FLY_MS && fade < 1)
        this.drawStream(ctx, now, x + 18, y + 14);
    }
  }

  private drawStream(
    ctx: CanvasRenderingContext2D,
    now: number,
    x: number,
    y: number,
  ): void {
    const end = this.surfaceY();
    px(ctx, x, y, 6, Math.max(PX, end - y), WATER_LO);
    px(ctx, x + 2, y, 2, Math.max(PX, end - y), WATER_HI);
    if (this.env.calm) return;
    for (let yy = y; yy < end; yy += 12) {
      px(ctx, x + 1, yy + ((now / 16) % 12), 4, 2, C.white);
    }
  }

  private drawSplashes(ctx: CanvasRenderingContext2D): void {
    for (const s of this.splashes) {
      ctx.globalAlpha = clamp01(s.life / 300);
      px(ctx, s.x, s.y, PX, PX, WATER_HI);
    }
    ctx.globalAlpha = 1;
  }

  // Flecha punteada de la siguiente cubeta al tanque y una mano que la
  // recorre: así se entiende sin leer nada.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done) return;
    const next = g.buckets.findIndex((b) => !b.inTank);
    if (next < 0 || this.pours.length > 0) return;
    const s = this.shown[next];
    const sx = s.x + BUCKET_SIZE + 6;
    const sy = s.y + BUCKET_SIZE / 2;
    const ex = T.x + T.w / 2;
    const ey = T.y + T.h / 2;
    const march = this.env.calm ? 0 : (now / 50) % 12;
    const len = Math.hypot(ex - sx, ey - sy);
    for (let d = march; d < len - 6; d += 12) {
      const k = d / len;
      px(ctx, sx + (ex - sx) * k, sy + (ey - sy) * k, PX * 2, PX * 2, C.amber);
    }
    pxLine(ctx, ex, ey, ex - 8, ey - 6, C.amber, 2);
    pxLine(ctx, ex, ey, ex - 8, ey + 6, C.amber, 2);
    const k = this.env.calm ? 0.5 : (now % 1500) / 1500;
    const e = k * k * (3 - 2 * k);
    drawHand(
      ctx,
      sx - 14 + (ex - sx + 14) * e,
      sy + (ey - sy) * e,
      1 - Math.abs(0.5 - e) * 2,
    );
  }
}
