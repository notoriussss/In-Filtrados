import { IDLE_POSE, flourishPose } from '../../render/workPose';
import {
  type FirstRainGame,
  type RainDrop,
  BOARD,
  RAIN_BARREL,
  RAIN_CLEAN_GOAL,
  RAIN_DRAIN,
  RAIN_FALL_MS,
  RAIN_JUNCTION,
  RAIN_SPOUT,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
import { swingPose } from './particlesScene';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  clamp01,
  hash01,
  px,
  pxDisc,
  pxLine,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reutilizar (rain-1 y rain-2): primera lluvia. Las gotas caen de la
// canaleta hasta la compuerta; la compuerta se cambia con un clic. Las
// marrones (las primeras, que lavan el techo) van al desvío y las
// azules al barril.

const ROOF = { y: 10, h: 12 };
const GUTTER = { x: 24, y: 26, w: 152, h: 14 };
export const RAIN_HERO_X = 178;
const FLIGHT_MS = 320;
const BROWN = '#8a6a3c';
const BROWN_HI = '#b08c58';

const DROP_ROWS = [
  '..oo..',
  '.obbo.',
  'obhbbo',
  'obbbbo',
  'obbbbo',
  '.obbo.',
  '..oo..',
];

const dropSprites = new Map<boolean, HTMLCanvasElement>();

function dropSprite(clean: boolean): HTMLCanvasElement {
  let sprite = dropSprites.get(clean);
  if (!sprite) {
    sprite = spriteFromRows(DROP_ROWS, {
      o: C.ink,
      b: clean ? C.water : BROWN,
      h: clean ? C.waterHi : BROWN_HI,
    });
    dropSprites.set(clean, sprite);
  }
  return sprite;
}

// El cartel sobre la caja: a la izquierda la gota sucia (va al desvío) y
// a la derecha la limpia (va al barril). La mitad abierta se ilumina.
const SIGN = {
  x: RAIN_JUNCTION.x - 26,
  y: RAIN_JUNCTION.y - 42,
  w: 52,
  h: 22,
};

type Pt = [number, number];

// Los tubos de la compuerta, de la caja al desvío y al barril.
const ARM_DEFLECT: Pt[] = [
  [RAIN_JUNCTION.x, RAIN_JUNCTION.y + 10],
  [RAIN_JUNCTION.x - 30, RAIN_JUNCTION.y + 40],
  [RAIN_DRAIN.x + 24, RAIN_DRAIN.y - 8],
];
const ARM_BARREL: Pt[] = [
  [RAIN_JUNCTION.x, RAIN_JUNCTION.y + 10],
  [RAIN_JUNCTION.x + 60, RAIN_JUNCTION.y + 26],
  [RAIN_BARREL.x + 30, RAIN_BARREL.y - 10],
];

// El punto a lo largo del tubo; t va de 0 a 1.
function along(pts: Pt[], t: number): Pt {
  const lens = pts
    .slice(1)
    .map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let left = t * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const k = Math.min(1, left / lens[i]);
      return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k,
      ];
    }
    left -= lens[i];
  }
  return pts[pts.length - 1];
}

// Piezas fijas: canaleta, caja de la compuerta, los dos tubos, el barril
// y la rejilla del desvío.
function drawFixtures(c: CanvasRenderingContext2D): void {
  // Techo y canaleta.
  px(c, 8, ROOF.y, 188, ROOF.h, C.metalInk);
  px(c, 10, ROOF.y, 184, ROOF.h - 4, C.metalDark);
  px(c, 10, ROOF.y, 184, PX, C.metalMid);
  px(c, GUTTER.x - 4, GUTTER.y, GUTTER.w + 8, GUTTER.h, C.metalInk);
  px(c, GUTTER.x - 2, GUTTER.y + 2, GUTTER.w + 4, GUTTER.h - 6, C.metalDeep);
  px(c, GUTTER.x - 2, GUTTER.y + 2, GUTTER.w + 4, PX, C.metalMid);
  px(c, RAIN_SPOUT.x - 8, GUTTER.y + GUTTER.h - 4, 16, 8, C.metalInk);
  px(c, RAIN_SPOUT.x - 6, GUTTER.y + GUTTER.h - 2, 12, 4, C.ink);
  // Soportes de la canaleta.
  for (const x of [40, 100, 160]) {
    px(c, x, ROOF.y + ROOF.h, 8, GUTTER.y - ROOF.y - ROOF.h, C.metalDeep);
  }
  drawJunction(c);
  drawArms(c);
  drawBarrel(c);
  drawGrate(c);
}

// La caja con la palanca; el lado que queda abierto lo dibuja el cuadro.
function drawJunction(c: CanvasRenderingContext2D): void {
  const j = RAIN_JUNCTION;
  px(c, j.x - 17, j.y - 17, 34, 34, C.metalInk);
  px(c, j.x - 15, j.y - 15, 30, 30, C.metalDark);
  px(c, j.x - 15, j.y - 15, 30, PX, C.metalMid);
  for (const [rx, ry] of [
    [-10, -10],
    [6, -10],
    [-10, 6],
    [6, 6],
  ]) {
    px(c, j.x + rx, j.y + ry, PX, PX, C.metalHi);
  }
  // Cartel arriba de la caja; las gotas se dibujan encima de cada cuadro.
  px(c, SIGN.x - 2, SIGN.y - 2, SIGN.w + 4, SIGN.h + 4, C.metalInk);
  px(c, SIGN.x, SIGN.y, SIGN.w, SIGN.h, C.wallHi);
  px(c, SIGN.x, SIGN.y, SIGN.w, PX, C.lineHi);
  px(c, SIGN.x + SIGN.w / 2 - 1, SIGN.y + 2, PX, SIGN.h - 4, C.line);
}

// Tubos hacia el desvío (izquierda) y hacia el barril (derecha).
function drawArms(c: CanvasRenderingContext2D): void {
  const drawArm = (pts: Pt[]): void => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      pxLine(c, x0, y0, x1, y1, C.metalInk, 7);
      pxLine(c, x0, y0, x1, y1, C.metalMid, 5);
      pxLine(c, x0, y0 - 1, x1, y1 - 1, C.metalHi, 1);
    }
  };
  drawArm(ARM_DEFLECT);
  drawArm(ARM_BARREL);
}

function drawBarrel(c: CanvasRenderingContext2D): void {
  const b = RAIN_BARREL;
  px(c, b.x - 3, b.y - 3, b.w + 6, b.h + 3, C.metalInk);
  px(c, b.x, b.y, b.w, b.h, C.metalDark);
  px(c, b.x + 4, b.y + 2, 8, b.h - 6, C.metalMid);
  px(c, b.x, b.y, b.w, 8, C.metalInk);
  px(c, b.x + 2, b.y + 2, b.w - 4, 4, C.metal);
  for (const y of [b.y + 22, b.y + 46]) {
    px(c, b.x - 3, y, b.w + 6, 5, C.metalInk);
    px(c, b.x - 3, y, b.w + 6, PX, C.metalHi);
  }
}

// La rejilla del desvío, con su charquito.
function drawGrate(c: CanvasRenderingContext2D): void {
  const d = RAIN_DRAIN;
  px(c, d.x - 4, d.y - 4, d.w + 8, d.h + 4, C.metalInk);
  px(c, d.x, d.y, d.w, d.h, C.ink);
  for (let x = d.x + 2; x < d.x + d.w - 2; x += 6) {
    px(c, x, d.y + 2, PX, d.h - 4, C.metalDark);
  }
}

type Ghost = { at: number; left: boolean; clean: boolean };
type Bit = { x: number; y: number; vx: number; vy: number; life: number };

export class RainScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawFixtures(c);
  });
  private readonly ghosts: Ghost[] = [];
  private readonly bits: Bit[] = [];
  private shownBarrel = 0;
  private vane = -0.85; // ángulo de la palanca (izquierda)
  private spillAt = -1e9;
  private switchAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: FirstRainGame,
    private readonly env: SceneEnv,
  ) {
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
    this.drawBarrelWater(ctx, now);
    this.drawFlow(ctx, now);
    this.drawLabels(ctx);
    this.drawVane(ctx, now);
    this.drawFalling(ctx, now);
    this.drawGhosts(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawBits(ctx);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    const g = this.game;
    for (const e of g.drainEvents()) {
      if (e.type === 'switch') {
        this.switchAt = now;
        this.touched = true;
      } else if (e.type === 'drop-in') {
        this.ghosts.push({ at: now, left: false, clean: true });
      } else if (e.type === 'spill') {
        this.ghosts.push({ at: now, left: false, clean: false });
        this.spillAt = now;
      } else if (e.type === 'drop-out') {
        const d = g.drops[e.index];
        this.ghosts.push({ at: now, left: true, clean: d?.clean ?? true });
        this.touched = true;
      }
    }
  }

  private update(dt: number): void {
    this.shownBarrel +=
      (this.game.barrel - this.shownBarrel) *
      (1 - Math.exp((-dt / 1000) * 10));
    const target = this.game.gate === 'barrel' ? 0.85 : -0.85;
    this.vane += (target - this.vane) * (1 - Math.exp((-dt / 1000) * 16));
    for (const bit of this.bits) {
      bit.life -= dt;
      bit.x += (bit.vx * dt) / 1000;
      bit.y += (bit.vy * dt) / 1000;
      bit.vy += (420 * dt) / 1000;
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      if (this.bits[i].life <= 0) this.bits.splice(i, 1);
    }
  }

  private driveHero(now: number, dt: number): void {
    const hero = this.env.hero;
    if (this.game.done) {
      hero.lookAt('left');
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    const since = now - this.switchAt;
    if (since < 420) {
      hero.lookAt('left');
      hero.drive(swingPose(since), dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.lookAt('left');
    hero.drive(
      { ...IDLE_POSE, lean: 1.2, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // El agua del barril sube con cada gota limpia; si entró una sucia,
  // baja y se ve marrón un momento.
  private drawBarrelWater(ctx: CanvasRenderingContext2D, now: number): void {
    const b = RAIN_BARREL;
    const level = clamp01(this.shownBarrel / RAIN_CLEAN_GOAL);
    const top = b.y + b.h - 8 - level * (b.h - 18);
    if (level > 0.01) {
      px(ctx, b.x + 2, top, b.w - 4, b.y + b.h - 8 - top, C.water);
      px(ctx, b.x + 2, top + 6, b.w - 4, b.y + b.h - 14 - top, C.waterDeep);
      px(ctx, b.x + 6, top + 2, 3, b.y + b.h - 12 - top, C.waterHi);
    }
    if (now - this.spillAt < 420 && !this.env.calm) {
      ctx.globalAlpha = 1 - (now - this.spillAt) / 420;
      px(ctx, b.x + 2, top, b.w - 4, b.y + b.h - 8 - top, BROWN);
      ctx.globalAlpha = 1;
    }
  }

  // El tubo abierto se ilumina con puntos que corren hacia su destino y
  // el cerrado se oscurece: se ve a dónde va a parar la próxima gota.
  private drawFlow(ctx: CanvasRenderingContext2D, now: number): void {
    const toBarrel = this.game.gate === 'barrel';
    const open = toBarrel ? ARM_BARREL : ARM_DEFLECT;
    const shut = toBarrel ? ARM_DEFLECT : ARM_BARREL;
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < shut.length - 1; i++) {
      const [x0, y0] = shut[i];
      const [x1, y1] = shut[i + 1];
      pxLine(ctx, x0, y0, x1, y1, C.ink, 7);
    }
    ctx.globalAlpha = 1;
    const color = toBarrel ? C.waterHi : BROWN_HI;
    for (let k = 0; k < 3; k++) {
      const t = this.env.calm
        ? (k + 0.5) / 3
        : (now / 1100 + k / 3) % 1;
      const [x, y] = along(open, t);
      px(ctx, x - 2, y - 2, 4, 4, C.ink);
      px(ctx, x - 1, y - 1, 2, 2, color);
    }
  }

  // Cada destino lleva la gota que recibe y el cartel de la compuerta
  // muestra cuál de las dos deja pasar ahora.
  private drawLabels(ctx: CanvasRenderingContext2D): void {
    const d = RAIN_DRAIN;
    const b = RAIN_BARREL;
    const plaque = (cx: number, cy: number, clean: boolean): void => {
      px(ctx, cx - 11, cy - 11, 22, 22, C.metalInk);
      px(ctx, cx - 9, cy - 9, 18, 18, C.wallHi);
      stamp(ctx, dropSprite(clean), cx, cy);
    };
    plaque(d.x + d.w / 2, d.y + d.h / 2, false);
    plaque(b.x + b.w / 2, b.y + 34, true);
    const toBarrel = this.game.gate === 'barrel';
    const cy = SIGN.y + SIGN.h / 2;
    stamp(ctx, dropSprite(false), SIGN.x + SIGN.w / 4, cy);
    stamp(ctx, dropSprite(true), SIGN.x + (SIGN.w * 3) / 4, cy);
    // Lo que no pasa se apaga; lo que pasa lleva marco.
    const half = SIGN.w / 2;
    const shutX = toBarrel ? SIGN.x : SIGN.x + half;
    const openX = toBarrel ? SIGN.x + half : SIGN.x;
    ctx.globalAlpha = 0.6;
    px(ctx, shutX + 2, SIGN.y + 2, half - 3, SIGN.h - 4, C.ink);
    ctx.globalAlpha = 1;
    const frame = toBarrel ? C.waterHi : BROWN_HI;
    px(ctx, openX + 1, SIGN.y + 1, half - 1, PX, frame);
    px(ctx, openX + 1, SIGN.y + SIGN.h - 3, half - 1, PX, frame);
  }

  // La palanca de la compuerta: apunta al lado que queda abierto.
  private drawVane(ctx: CanvasRenderingContext2D, now: number): void {
    const j = RAIN_JUNCTION;
    const press = now - this.switchAt < 180 ? 3 : 0;
    const len = 14;
    pxLine(
      ctx,
      j.x,
      j.y - press,
      j.x + Math.sin(this.vane) * len,
      j.y - press + Math.cos(this.vane) * len,
      C.ink,
      3,
    );
    pxLine(
      ctx,
      j.x,
      j.y - press,
      j.x + Math.sin(this.vane) * len,
      j.y - press + Math.cos(this.vane) * len,
      C.amber,
      2,
    );
    pxDisc(ctx, j.x, j.y, 4, C.ink);
    pxDisc(ctx, j.x, j.y, 2, C.amberHi);
  }

  // Las gotas que caen, marrones primero y azules después.
  private drawFalling(ctx: CanvasRenderingContext2D, now: number): void {
    for (const d of this.game.drops) {
      if (d.resolved) continue;
      const t = clamp01(d.fall / RAIN_FALL_MS);
      const y =
        RAIN_SPOUT.y + t * (RAIN_JUNCTION.y - 14 - RAIN_SPOUT.y);
      const wob = this.env.calm
        ? 0
        : Math.sin(now / 90 + d.index * 2.1) * 1.6;
      stamp(ctx, dropSprite(d.clean), RAIN_SPOUT.x + wob, y);
    }
  }

  // Las ya resueltas vuelan por su tubo hasta el barril o la rejilla.
  private drawGhosts(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      const t = (now - gh.at) / FLIGHT_MS;
      if (t >= 1) {
        this.ghosts.splice(i, 1);
        this.landSplash(gh);
        continue;
      }
      const target = gh.left
        ? { x: RAIN_DRAIN.x + 24, y: RAIN_DRAIN.y - 6 }
        : { x: RAIN_BARREL.x + 30, y: RAIN_BARREL.y - 8 };
      const k = t * t * (3 - 2 * t);
      const x = RAIN_JUNCTION.x + (target.x - RAIN_JUNCTION.x) * k;
      const y =
        RAIN_JUNCTION.y +
        (target.y - RAIN_JUNCTION.y) * k -
        Math.sin(Math.PI * k) * 10;
      stamp(ctx, dropSprite(gh.clean), x, y);
    }
  }

  private landSplash(gh: Ghost): void {
    if (this.env.calm) return;
    const base = gh.left
      ? { x: RAIN_DRAIN.x + 24, y: RAIN_DRAIN.y }
      : { x: RAIN_BARREL.x + 30, y: RAIN_BARREL.y - 4 };
    for (let i = 0; i < 5; i++) {
      this.bits.push({
        x: base.x + (hash01(i + gh.at) - 0.5) * 10,
        y: base.y,
        vx: (hash01(i * 3.7 + gh.at) - 0.5) * 70,
        vy: -40 - hash01(i * 2.9) * 40,
        life: 320,
      });
    }
  }

  private drawBits(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bits) {
      ctx.globalAlpha = clamp01(b.life / 240);
      px(ctx, b.x, b.y, PX, PX, b.vy > 0 ? C.waterHi : C.water);
    }
    ctx.globalAlpha = 1;
  }

  // La mano señala la compuerta desde abajo, sin tapar la palanca, y solo
  // hasta que se prueba; si una gota que cae va a terminar en el lado
  // equivocado, vuelve y el aviso se pone rojo.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done) return;
    const wrong = g.drops.some(
      (d: RainDrop) =>
        !d.resolved && d.clean === (g.gate === 'deflect'),
    );
    const j = RAIN_JUNCTION;
    if (wrong) {
      const k = this.env.calm ? 0.4 : (now % 600) / 600;
      drawTapRing(ctx, j.x, j.y, k, C.coral);
    } else if (!this.touched) {
      drawTapRing(ctx, j.x, j.y, this.env.calm ? 0.3 : (now % 900) / 900);
    }
    if (!wrong && this.touched) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, j.x + 12, j.y + 19, press);
  }
}
