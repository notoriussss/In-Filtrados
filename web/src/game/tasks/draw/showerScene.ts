import {
  FLOURISH_MS,
  IDLE_POSE,
  flourishPose,
  workPose,
} from '../../render/workPose';
import {
  BOARD,
  FLOOR_Y,
  SHOWER_BUCKET,
  SHOWER_BUCKET_HOME,
  SHOWER_PLANT,
  SHOWER_ROUNDS,
  SHOWER_X,
  SHOWER_ZONE,
  type ShowerBucketGame,
} from '../minigames';
import { drawMarchArrow } from './dragHelpers';
import { drawHand } from './hand';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import { C, PX, bakeBoard, clamp01, px, pxLine } from './pixel';
import { roomLayer } from './room';

// Reutilizar (greywater-2, Ducha del laboratorio): agua de la ducha. La
// ducha sale mientras se calienta y esa agua se iría por el desagüe: se
// pone el balde debajo, se llena y se lleva a regar la planta marchita,
// que revive con cada balde.

export const SHOWER_HERO_X = 210;
const HEAD_Y = 52; // de dónde sale el agua
const POUR_MS = 800; // lo que tarda el balde en vaciarse sobre la planta
const POT = { x: 286, y: 194, w: 48, h: 34 };
const GLASS = '#1d5578';
const WILT = '#8a6a3c';
const WILT_HI = '#b08c58';

// La pared con la tubería, la ducha, el desagüe y la maceta.
function drawFixtures(c: CanvasRenderingContext2D): void {
  // Tubería de la pared y llave roja.
  px(c, SHOWER_X - 5, 0, 10, HEAD_Y - 6, C.metalInk);
  px(c, SHOWER_X - 3, 0, 6, HEAD_Y - 6, C.metalMid);
  px(c, SHOWER_X - 3, 0, PX, HEAD_Y - 6, C.metalHi);
  px(c, SHOWER_X + 5, 22, 14, 8, C.metalInk);
  px(c, SHOWER_X + 7, 24, 10, 4, C.coral);
  // Cabezal de la ducha.
  px(c, SHOWER_X - 17, HEAD_Y - 8, 34, 12, C.metalInk);
  px(c, SHOWER_X - 15, HEAD_Y - 6, 30, 8, C.metalMid);
  px(c, SHOWER_X - 15, HEAD_Y - 6, 30, PX, C.metalHi);
  for (let x = -12; x <= 12; x += 6) {
    px(c, SHOWER_X + x, HEAD_Y + 2, PX, PX, C.ink);
  }
  // Desagüe en el piso, donde cae el agua que se pierde.
  px(c, SHOWER_X - 16, FLOOR_Y + 40, 32, 6, C.metalInk);
  for (let x = -12; x <= 12; x += 6) {
    px(c, SHOWER_X + x, FLOOR_Y + 41, PX, 4, C.metalMid);
  }
  // Maceta.
  px(c, POT.x - 2, POT.y - 2, POT.w + 4, POT.h + 2, C.metalInk);
  px(c, POT.x, POT.y, POT.w, POT.h, C.coralLo);
  px(c, POT.x, POT.y, POT.w, 5, C.dirt);
  px(c, POT.x, POT.y + 5, POT.w, PX, C.coral);
}

type Pour = { at: number };

export class ShowerScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawFixtures(c);
  });
  private readonly shown = {
    x: SHOWER_BUCKET_HOME.x,
    y: SHOWER_BUCKET_HOME.y,
    fill: 0,
    tilt: 0,
  };
  private plant = 0; // qué tan viva está la planta, 0 a 1
  private holdUntil = 0; // mientras vierte, el balde se queda sobre la planta
  private pours: Pour[] = [];
  private cheerAt = -1e9;
  private doneAt: number | null = null;
  readonly settleMs = 1200;

  constructor(
    private readonly game: ShowerBucketGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('left');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(now, dt);
    if (this.game.done && this.doneAt === null) this.doneAt = now;
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawPlant(ctx, now);
    this.drawShower(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawBucket(ctx);
    this.drawPourStream(ctx, now);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type !== 'drop-in') continue;
      // El balde se queda sobre la planta mientras se vacía.
      this.pours.push({ at: now });
      this.holdUntil = now + POUR_MS;
      this.cheerAt = now + POUR_MS;
      this.shown.x = SHOWER_PLANT.x + 10;
      this.shown.y = SHOWER_PLANT.y + 14;
      this.shown.fill = 1;
    }
  }

  private update(now: number, dt: number): void {
    const g = this.game;
    const s = this.shown;
    const pouring = now < this.holdUntil;
    if (!pouring) {
      const k = 1 - Math.exp((-dt / 1000) * (g.dragging ? 22 : 12));
      s.x += (g.bucket.x - s.x) * k;
      s.y += (g.bucket.y - s.y) * k;
    }
    // Vertiendo, el agua baja despacio; si no, sigue lo que dice el juego.
    const rate = pouring ? 1.6 : 8;
    const target = pouring ? 0 : g.fill;
    s.fill += (target - s.fill) * (1 - Math.exp((-dt / 1000) * rate));
    const tilt = pouring ? -1 : g.dragging && !this.env.calm ? -0.08 : 0;
    s.tilt += (tilt - s.tilt) * (1 - Math.exp((-dt / 1000) * 10));
    const alive = g.poured / SHOWER_ROUNDS;
    this.plant += (alive - this.plant) * (1 - Math.exp((-dt / 1000) * 2.5));
  }

  private driveHero(now: number, dt: number): void {
    const g = this.game;
    const hero = this.env.hero;
    hero.lookAt('left');
    if (g.done) {
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    if (g.dragging) {
      hero.drive(workPose('tank', now, 1), dt);
      return;
    }
    const since = now - this.cheerAt;
    if (since >= 0 && since < FLOURISH_MS) {
      hero.drive(flourishPose(since / FLOURISH_MS), dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.drive(
      { ...IDLE_POSE, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // El chorro de la ducha: cae al balde si está debajo y, si no, al
  // desagüe, y se pierde. Al terminar se cierra la llave.
  private drawShower(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done) return;
    const under = g.underShower;
    const impact = under ? this.shown.y + 6 : FLOOR_Y + 40;
    const off = this.env.calm ? 0 : (now / 25) % 10;
    for (const dx of [-9, 0, 9]) {
      for (let y = HEAD_Y + 4 + off; y < impact - 4; y += 10) {
        px(ctx, SHOWER_X + dx, y, PX, 6, C.waterHi);
        px(ctx, SHOWER_X + dx + PX, y + 2, PX, 4, C.water);
      }
    }
    if (!this.env.calm) {
      // Gotas que rebotan donde cae el agua.
      for (let i = 0; i < 5; i++) {
        const a = (now / 110 + i * 1.3) % 3;
        const dx = (i % 2 ? 1 : -1) * (4 + a * 6);
        const dy = impact - 2 - Math.sin(a * 1.05) * 7;
        px(ctx, SHOWER_X + dx, dy, PX, PX, C.waterHi);
      }
      // Vapor: el agua todavía se está calentando.
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 3; i++) {
        const t = (now / 1400 + i / 3) % 1;
        const x = SHOWER_X - 16 + i * 14 + Math.sin(t * 6) * 3;
        px(ctx, x, HEAD_Y - 14 - t * 22, 6, 4, C.white);
      }
      ctx.globalAlpha = 1;
    }
  }

  // Balde de plástico transparente: se ve el agua subir adentro.
  private drawBucket(ctx: CanvasRenderingContext2D): void {
    const s = this.shown;
    const { w, h } = SHOWER_BUCKET;
    const lift = this.game.dragging ? 3 : 0;
    ctx.save();
    ctx.translate(s.x + w / 2, s.y + h - lift);
    ctx.rotate(s.tilt);
    ctx.translate(-w / 2, -h);
    // Asa.
    pxLine(ctx, 4, 4, w / 2, -8, C.metalInk, 2);
    pxLine(ctx, w - 4, 4, w / 2, -8, C.metalInk, 2);
    // Cuerpo.
    px(ctx, -2, 0, w + 4, h + 2, C.metalInk);
    px(ctx, 0, 2, w, h - 2, GLASS);
    px(ctx, 4, 6, 3, h - 12, C.waterHi);
    const level = clamp01(s.fill) * (h - 10);
    if (level > 1) {
      px(ctx, 2, h - 4 - level, w - 4, level, C.water);
      px(ctx, 2, h - 4 - level, w - 4, PX, C.waterHi);
    }
    // Borde de arriba.
    px(ctx, -4, -2, w + 8, 5, C.metalMid);
    px(ctx, -4, -2, w + 8, PX, C.metalHi);
    ctx.restore();
  }

  // El agua que cae del balde inclinado a la planta.
  private drawPourStream(ctx: CanvasRenderingContext2D, now: number): void {
    if (now >= this.holdUntil) return;
    const k = 1 - (this.holdUntil - now) / POUR_MS;
    if (k < 0.1 || k > 0.9) return;
    const x = this.shown.x - 4;
    const top = this.shown.y + 14;
    const bottom = POT.y + 2;
    px(ctx, x, top, 4, bottom - top, C.water);
    px(ctx, x, top, PX, bottom - top, C.waterHi);
  }

  // La planta: marchita (hojas caídas y marrones) y, con cada balde, más
  // viva, hasta florecer.
  private drawPlant(ctx: CanvasRenderingContext2D, now: number): void {
    const t = clamp01(this.plant);
    const x = POT.x + POT.w / 2;
    const y = POT.y;
    const sway = this.env.calm ? 0 : Math.round(Math.sin(now / 600)) * PX;
    // Marchita: se desvanece al revivir.
    if (t < 1) {
      ctx.globalAlpha = 1 - t;
      px(ctx, x - 2, y - 28, 4, 28, WILT);
      px(ctx, x - 20, y - 22, 18, 6, WILT);
      px(ctx, x - 24, y - 16, 6, 12, WILT);
      px(ctx, x + 2, y - 24, 18, 6, WILT_HI);
      px(ctx, x + 18, y - 18, 6, 12, WILT_HI);
      ctx.globalAlpha = 1;
    }
    // Viva: crece y se endereza.
    if (t > 0) {
      const stem = 28 + 34 * t;
      ctx.globalAlpha = t;
      px(ctx, x - 2, y - stem, 4, stem, C.leafLo);
      px(ctx, x - 20 + sway, y - stem * 0.5, 18, 8, C.leaf);
      px(ctx, x + 2 + sway, y - stem * 0.75, 18, 8, C.leaf);
      px(ctx, x - 16 + sway, y - stem * 0.88, 12, 6, C.leafHi);
      if (t > 0.9) {
        px(ctx, x - 8 + sway, y - stem - 12, 16, 12, C.amber);
        px(ctx, x - 3 + sway, y - stem - 8, 6, 6, C.amberHi);
      }
      ctx.globalAlpha = 1;
    }
  }

  // La flecha lleva el balde a la ducha y, ya lleno, a la planta; la mano
  // queda debajo del balde para no taparlo.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done || g.dragging || now < this.holdUntil) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    const from = { x: g.bucket.x + SHOWER_BUCKET.w / 2, y: g.bucket.y + 8 };
    if (g.full) {
      drawMarchArrow(
        ctx,
        { x: from.x + 24, y: from.y },
        { x: SHOWER_PLANT.x + SHOWER_PLANT.w / 2, y: SHOWER_PLANT.y + 30 },
        now,
        this.env.calm,
      );
    } else if (!g.underShower) {
      drawMarchArrow(
        ctx,
        { x: from.x - 24, y: from.y },
        { x: SHOWER_ZONE.x + SHOWER_ZONE.w / 2, y: SHOWER_ZONE.y + 20 },
        now,
        this.env.calm,
      );
    } else {
      return;
    }
    const tip = {
      x: g.bucket.x + SHOWER_BUCKET.w + 10,
      y: g.bucket.y + SHOWER_BUCKET.h - 8,
    };
    drawHand(ctx, tip.x, tip.y, press);
  }
}
