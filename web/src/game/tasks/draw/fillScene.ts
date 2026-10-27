import {
  FLOURISH_MS,
  IDLE_POSE,
  workPose,
  flourishPose,
} from '../../render/workPose';
import {
  BOARD,
  type FillGame,
  type Glass,
  FILL_BASE_Y,
  FILL_GLASS,
  FILL_MARK,
  FILL_RIM,
  FILL_SPOTS,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
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
} from './pixel';
import { roomLayer } from './room';

// Reducir (valve-2): llenar sin derramar. Tres vasos bajo una canilla
// que se desliza sobre el vaso que toca: sostener abre el agua y soltar
// la cierra. Pasarse del borde derrama y vacía el vaso.

const IN_TOP = FILL_BASE_Y - FILL_GLASS.h + 6; // interior, arriba
const IN_BOTTOM = FILL_BASE_Y - 4; // interior, abajo
export const FILL_HERO_X = 36;
const CEIL_PIPE = { y: 18, h: 10, from: 60, to: 300 };
const STREAM_W = 6;

function drawCounter(c: CanvasRenderingContext2D): void {
  // Mesa de trabajo: cubierta y faldón.
  px(c, 8, FILL_BASE_Y, BOARD.w - 16, 228 - FILL_BASE_Y, C.metalInk);
  px(c, 10, FILL_BASE_Y, BOARD.w - 20, 8, C.metal);
  px(c, 10, FILL_BASE_Y, BOARD.w - 20, PX, C.metalHi);
  px(c, 10, FILL_BASE_Y + 8, BOARD.w - 20, 6, C.metalDark);
  for (let x = 16; x < BOARD.w - 24; x += 34) {
    px(c, x, FILL_BASE_Y + 16, PX, 228 - FILL_BASE_Y - 18, C.metalDeep);
  }
  // Tubería del techo, por donde viaja la canilla.
  const pipeW = CEIL_PIPE.to - CEIL_PIPE.from;
  px(
    c,
    CEIL_PIPE.from - 6,
    CEIL_PIPE.y - 4,
    pipeW + 12,
    CEIL_PIPE.h + 8,
    C.metalInk,
  );
  px(
    c,
    CEIL_PIPE.from - 4,
    CEIL_PIPE.y - 2,
    pipeW + 8,
    CEIL_PIPE.h + 4,
    C.metalDark,
  );
  px(c, CEIL_PIPE.from - 4, CEIL_PIPE.y - 2, pipeW + 8, PX, C.metalMid);
}

function surfaceY(g: Glass): number {
  return IN_BOTTOM - clamp01(g.fill) * (IN_BOTTOM - IN_TOP);
}

type Bit = { x: number; y: number; vx: number; vy: number; life: number };

export class FillScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawCounter(c);
  });
  private readonly bits: Bit[] = [];
  private pipeX: number = FILL_SPOTS[0];
  private cheerAt = -1e9;
  private spillAt = -1e9;
  private spillGlass = -1;
  private spillX = 0;
  private spillY = 0;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: FillGame,
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
    this.drawPipe(ctx);
    for (const g of this.game.glasses) this.drawGlass(ctx, g, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawStream(ctx, now);
    this.drawBits(ctx);
    this.drawSpillRing(ctx, now);
    this.drawHint(ctx, now);
  }

  // Anillo rojo que se abre en el borde del vaso que se derramó.
  private drawSpillRing(
    ctx: CanvasRenderingContext2D,
    now: number,
  ): void {
    if (this.env.calm) return;
    const k = (now - this.spillAt) / 450;
    if (k < 0 || k >= 1) return;
    drawTapRing(ctx, this.spillX, this.spillY, k, C.coral);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'spill') {
        this.spillAt = now;
        this.spillGlass = e.index;
        this.spillX = e.x;
        this.spillY = e.y;
        if (!this.env.calm) this.burst(e.x, e.y);
      }
      if (e.type === 'drop-in') this.cheerAt = now;
    }
  }

  // Gotas que salen volando por encima del borde al derramar.
  private burst(x: number, y: number): void {
    for (let i = 0; i < 12; i++) {
      this.bits.push({
        x: x + (hash01(i * 3.1) - 0.5) * 20,
        y: y - 2,
        vx: (hash01(i * 7.7) - 0.5) * 160,
        vy: -90 - hash01(i * 5.3) * 90,
        life: 520,
      });
    }
  }

  private update(dt: number): void {
    const spot = FILL_SPOTS[this.game.active];
    const k = 1 - Math.exp((-dt / 1000) * 14);
    this.pipeX += (spot - this.pipeX) * k;
    for (const b of this.bits) {
      b.life -= dt;
      b.x += (b.vx * dt) / 1000;
      b.y += (b.vy * dt) / 1000;
      b.vy += (420 * dt) / 1000;
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      if (this.bits[i].life <= 0) this.bits.splice(i, 1);
    }
  }

  private driveHero(now: number, dt: number): void {
    const g = this.game;
    const hero = this.env.hero;
    if (g.done) {
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    if (g.holding) {
      hero.drive(workPose('reduce', now, 1), dt);
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
      { ...IDLE_POSE, lean: 1.2, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // La canilla viaja por la tubería hasta el vaso que toca.
  private drawPipe(ctx: CanvasRenderingContext2D): void {
    const x = Math.round(this.pipeX);
    px(ctx, x - 6, CEIL_PIPE.y + CEIL_PIPE.h, 12, 18, C.metalInk);
    px(ctx, x - 4, CEIL_PIPE.y + CEIL_PIPE.h, 8, 16, C.metalDark);
    px(ctx, x - 4, CEIL_PIPE.y + CEIL_PIPE.h, 8, PX, C.metalMid);
    // Pico y palanca de la canilla.
    px(ctx, x - 10, CEIL_PIPE.y + CEIL_PIPE.h + 14, 20, 6, C.metalInk);
    px(ctx, x - 8, CEIL_PIPE.y + CEIL_PIPE.h + 14, 16, 4, C.metalMid);
    px(ctx, x - 2, CEIL_PIPE.y + CEIL_PIPE.h + 18, 4, 4, C.ink);
    const tilt = this.game.holding ? 0.5 : 0.22;
    pxLine(
      ctx,
      x,
      CEIL_PIPE.y + CEIL_PIPE.h - 2,
      x + Math.cos(-tilt) * 14,
      CEIL_PIPE.y + CEIL_PIPE.h - 2 + Math.sin(-tilt) * 14,
      C.amberLo,
      2,
    );
    pxLine(
      ctx,
      x,
      CEIL_PIPE.y + CEIL_PIPE.h - 2,
      x + Math.cos(-tilt) * 14,
      CEIL_PIPE.y + CEIL_PIPE.h - 2 + Math.sin(-tilt) * 14,
      C.amber,
      1,
    );
  }

  // Un vaso: marco, agua hasta su nivel, la marca y el borde que no se
  // debe cruzar.
  private drawGlass(
    ctx: CanvasRenderingContext2D,
    g: Glass,
    now: number,
  ): void {
    const spot = FILL_SPOTS[g.index];
    const x = spot - FILL_GLASS.w / 2;
    const y = FILL_BASE_Y - FILL_GLASS.h;
    ctx.globalAlpha = 0.25;
    pxDisc(ctx, spot + 3, FILL_BASE_Y + 1, FILL_GLASS.w * 0.42, C.ink);
    ctx.globalAlpha = 1;
    // Vidrio vacío: el fondo del interior, del labio a la base.
    px(
      ctx,
      x + PX,
      y + PX,
      FILL_GLASS.w - PX * 2,
      FILL_GLASS.h - PX * 2,
      '#0a2136',
    );
    // Agua hasta su nivel.
    if (g.fill > 0.01 || g.filled) {
      const s = surfaceY(g);
      px(ctx, x + PX, s, FILL_GLASS.w - PX * 2, IN_BOTTOM - s, C.water);
      px(
        ctx,
        x + PX,
        s + 10,
        FILL_GLASS.w - PX * 2,
        IN_BOTTOM - s - 10,
        C.waterDeep,
      );
      px(ctx, x + 6, s + 3, 3, IN_BOTTOM - s - 6, C.waterHi);
      const wave = this.env.calm
        ? 0
        : Math.round(Math.sin(now / 240 + g.index) * 1.3) * PX;
      px(ctx, x + PX, s + wave, FILL_GLASS.w - PX * 2, PX, C.waterHi);
    }
    // Borde (derramar) y marca (mínimo), por encima del agua. La marca
    // se pone verde cuando el nivel ya está en la zona de soltar, y el
    // vaso parpadea en coral un instante tras derramar.
    const flashK = (now - this.spillAt) / 300;
    const flash =
      !this.env.calm &&
      this.spillGlass === g.index &&
      flashK >= 0 &&
      flashK < 1;
    const rimY = IN_BOTTOM - FILL_RIM * (IN_BOTTOM - IN_TOP);
    pxLine(
      ctx,
      x + 1,
      rimY,
      x + FILL_GLASS.w - 1,
      rimY,
      flash ? C.coralHi : C.coral,
      flash ? 2 : 1,
    );
    const inBand = g.fill >= FILL_MARK && g.fill < FILL_RIM;
    const markY = IN_BOTTOM - FILL_MARK * (IN_BOTTOM - IN_TOP);
    for (let mx = x + 3; mx < x + FILL_GLASS.w - 3; mx += 8) {
      px(ctx, mx, markY, 5, PX, inBand ? C.leaf : C.amber);
    }
    if (flash) {
      ctx.globalAlpha = (1 - flashK) * 0.35;
      px(
        ctx,
        x + PX,
        y + PX,
        FILL_GLASS.w - PX * 2,
        FILL_GLASS.h - PX * 2,
        C.coral,
      );
      ctx.globalAlpha = 1;
    }
    // Marco del vidrio: contorno hueco, para que el nivel se vea.
    px(ctx, x, y, FILL_GLASS.w, PX * 2, C.metalInk); // labio
    px(ctx, x, y, PX, FILL_GLASS.h, C.metalInk); // pared izquierda
    px(ctx, x + FILL_GLASS.w - PX, y, PX, FILL_GLASS.h, C.metalInk); // derecha
    px(ctx, x, FILL_BASE_Y - PX, FILL_GLASS.w, PX, C.metalInk); // base
    ctx.globalAlpha = 0.2;
    px(ctx, x + 6, y + 8, 4, FILL_GLASS.h - 24, C.white);
    ctx.globalAlpha = 1;
    if (g.filled) this.drawCheck(ctx, spot, y - 12);
  }

  // Palomita sobre los vasos ya llenos.
  private drawCheck(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    px(ctx, x - 9, y - 2, 18, 14, C.metalInk);
    px(ctx, x - 7, y, 14, 10, C.leafLo);
    pxLine(ctx, x - 4, y + 5, x - 1, y + 8, C.leafHi, 2);
    pxLine(ctx, x - 1, y + 8, x + 4, y + 2, C.leafHi, 2);
  }

  // Chorro del grifo al agua del vaso activo mientras se sostiene.
  private drawStream(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (!g.holding || g.done) return;
    const glass = g.glasses[g.active];
    const x = Math.round(this.pipeX);
    const top = CEIL_PIPE.y + CEIL_PIPE.h + 20;
    const end = surfaceY(glass);
    px(ctx, x - STREAM_W / 2, top, STREAM_W, Math.max(PX, end - top), C.water);
    px(
      ctx,
      x - STREAM_W / 2 + 1,
      top,
      2,
      Math.max(PX, end - top),
      C.waterHi,
    );
    if (!this.env.calm) {
      for (let yy = top; yy < end; yy += 12) {
        px(ctx, x - 1, yy + ((now / 16) % 12), 3, 2, C.white);
      }
      this.drawSplash(ctx, now, x, end);
    }
  }

  private drawSplash(
    ctx: CanvasRenderingContext2D,
    now: number,
    x: number,
    y: number,
  ): void {
    const k = (now / 220) % 1;
    ctx.globalAlpha = 1 - k;
    px(ctx, x - 8 - k * 5, y - k * 5, PX, PX, C.waterHi);
    px(ctx, x + 6 + k * 5, y - k * 6, PX, PX, C.waterHi);
    ctx.globalAlpha = 1;
  }

  private drawBits(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bits) {
      ctx.globalAlpha = clamp01(b.life / 300);
      px(ctx, b.x, b.y, PX, PX * 2, C.waterHi);
    }
    ctx.globalAlpha = 1;
  }

  // La mano sostiene apretado sobre el vaso que toca, a la altura de la
  // marca.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.holding || g.done) return;
    const spot = FILL_SPOTS[g.active];
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    const markY = IN_BOTTOM - FILL_MARK * (IN_BOTTOM - IN_TOP);
    drawHand(ctx, spot - 12, markY - 6, press);
    if (!this.env.calm) {
      drawTapRing(ctx, spot, markY, (now % 900) / 900, C.amber);
    }
  }
}
