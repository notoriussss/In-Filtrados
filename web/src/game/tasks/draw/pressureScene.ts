import { IDLE_POSE, flourishPose } from '../../render/workPose';
import {
  BOARD,
  type PressureGame,
  PRESSURE_BUTTON,
  PRESSURE_TUBE,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
import { swingPose } from './particlesScene';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import { C, PX, bakeBoard, clamp01, px, pxDisc, pxRing } from './pixel';
import { roomLayer } from './room';

// Reducir (valve-1): regular la presión. Un acumulador de agua con la
// aguja barriendo su carátula; hay que presionar el botón cuando el
// nivel pasa por la franja verde, que se encoge con cada acierto.

const INNER = {
  top: PRESSURE_TUBE.y + 10,
  bottom: PRESSURE_TUBE.y + PRESSURE_TUBE.h - 10,
};
export const PRESSURE_HERO_X = 96;
const BUTTON_DOME = {
  x: PRESSURE_BUTTON.x + 14,
  y: PRESSURE_BUTTON.y + 8,
  w: PRESSURE_BUTTON.w - 28,
  h: 18,
};
const LAMPS = { x: 26, y: 30, gap: 20 };

// Piezas fijas: acumulador, tubería de entrada, caja del botón y luces.
function drawFixtures(c: CanvasRenderingContext2D): void {
  const t = PRESSURE_TUBE;
  // Tubería que alimenta el acumulador, desde la pared.
  px(c, 0, t.y + 6, 70, 14, C.metalInk);
  px(c, 0, t.y + 8, 70, 8, C.metalMid);
  px(c, 0, t.y + 8, 70, PX, C.metalHi);
  px(c, 56, t.y + 2, 10, 22, C.metalInk);
  // Cuerpo: domo arriba, base abajo, cuerpo con brillo.
  px(c, t.x - 6, t.y - 18, t.w + 12, t.h + 24, C.metalInk);
  px(c, t.x - 4, t.y - 16, t.w + 8, 16, C.metalDark);
  px(c, t.x - 4, t.y - 16, t.w + 8, PX, C.metalMid);
  px(c, t.x, t.y, t.w, t.h, C.metalDeep);
  px(c, t.x + 4, t.y + 2, 6, t.h - 4, '#3d4a56');
  // Base y patas.
  px(c, t.x - 14, t.y + t.h, t.w + 28, 12, C.metalInk);
  px(c, t.x - 12, t.y + t.h, t.w + 24, 8, C.metalDark);
  // Ventana del nivel: el fondo detrás del agua.
  px(c, t.x + 6, INNER.top, t.w - 12, INNER.bottom - INNER.top, C.ink);
  // Caja del botón.
  const b = PRESSURE_BUTTON;
  px(c, b.x - 4, b.y - 4, b.w + 8, b.h + 8, C.metalInk);
  px(c, b.x, b.y, b.w, b.h, C.metalDark);
  px(c, b.x, b.y, b.w, PX, C.metalMid);
  for (const [rx, ry] of [
    [6, 6],
    [b.w - 10, 6],
    [6, b.h - 10],
    [b.w - 10, b.h - 10],
  ]) {
    px(c, b.x + rx, b.y + ry, PX, PX, C.metalHi);
  }
  // Marco de las luces de acierto.
  px(c, LAMPS.x - 6, LAMPS.y - 6, 62, 22, C.metalInk);
  px(c, LAMPS.x - 4, LAMPS.y - 4, 58, 18, C.metalDeep);
}

export class PressureScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawFixtures(c);
  });
  private levelShown = 0;
  private tapAt = -1e9;
  private missAt = -1e9;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: PressureGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('right');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    const g = this.game;
    this.levelShown +=
      (g.level - this.levelShown) * (1 - Math.exp((-dt / 1000) * 18));
    if (g.done && this.doneAt === null) this.doneAt = now;

    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawWater(ctx, now);
    this.drawLamps(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawButton(ctx, now);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'pop') {
        this.tapAt = now;
      } else if (e.type === 'miss') {
        this.missAt = now;
      }
    }
  }

  private driveHero(now: number, dt: number): void {
    const hero = this.env.hero;
    if (this.game.done) {
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    const since = now - this.tapAt;
    if (since < 420) {
      hero.lookAt('right');
      hero.drive(swingPose(since), dt);
      return;
    }
    if (now - this.missAt < 380 && !this.env.calm) {
      const m = (now - this.missAt) / 380;
      hero.drive(
        { ...IDLE_POSE, dx: 2 * Math.sin(m * 24) * (1 - m), sy: 0.97 },
        dt,
      );
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.lookAt('right');
    hero.drive(
      { ...IDLE_POSE, lean: 1.2, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // El agua del acumulador sube y baja con la aguja; la franja verde es
  // la presión que toca.
  private drawWater(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    const t = PRESSURE_TUBE;
    const x = t.x + 6;
    const w = t.w - 12;
    const level = clamp01(this.levelShown);
    const surface = INNER.bottom - level * (INNER.bottom - INNER.top);
    // Franja verde: de zoneCenter - zoneHalf a zoneCenter + zoneHalf.
    const zTop =
      INNER.bottom -
      clamp01(g.zoneCenter + g.zoneHalf) * (INNER.bottom - INNER.top);
    const zBottom =
      INNER.bottom -
      clamp01(g.zoneCenter - g.zoneHalf) * (INNER.bottom - INNER.top);
    const inside = Math.abs(g.level - g.zoneCenter) <= g.zoneHalf;
    const missFlash = now - this.missAt < 300 && !this.env.calm;
    const bandColor = missFlash ? C.coral : C.leaf;
    ctx.globalAlpha = inside || missFlash ? 0.85 : 0.5;
    px(ctx, x, zTop, w, zBottom - zTop, bandColor);
    ctx.globalAlpha = 1;
    if (missFlash) {
      px(ctx, x, zTop, w, PX, C.coralHi);
      px(ctx, x, zBottom - PX, w, PX, C.coralHi);
    }
    // El agua hasta el nivel.
    if (surface < INNER.bottom) {
      px(ctx, x, surface, w, INNER.bottom - surface, C.waterLo);
      px(ctx, x, surface + 8, w, INNER.bottom - surface - 8, C.waterDeep);
      const wave = this.env.calm
        ? 0
        : Math.round(Math.sin(now / 210) * 1.4) * PX;
      px(ctx, x, surface + wave, w, 3, C.water);
      px(ctx, x, surface + wave, w, PX, C.waterHi);
    }
    // Marca de la franja en el borde de la ventana.
    px(ctx, x - PX, zTop, PX, PX, C.leaf);
    px(ctx, x - PX, zBottom - PX, PX, PX, C.leaf);
    // Piso del acumulador.
    px(ctx, x, INNER.bottom, w, PX, C.metalInk);
  }

  private drawLamps(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = 0; i < 3; i++) {
      const x = LAMPS.x + i * LAMPS.gap;
      px(ctx, x - 2, LAMPS.y - 2, 14, 14, C.ink);
      const on = i < this.game.hits;
      px(ctx, x, LAMPS.y, 10, 10, on ? C.leaf : '#3a2f1e');
      if (on) px(ctx, x, LAMPS.y, 10, 2, C.leafHi);
      const k = (now - this.tapAt) / 320;
      if (on && k >= 0 && k < 1 && !this.env.calm) {
        ctx.globalAlpha = 1 - k;
        pxRing(ctx, x + 5, LAMPS.y + 5, 5 + k * 12, C.leafHi, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  // El botón se hunde un instante con cada presionada.
  private drawButton(ctx: CanvasRenderingContext2D, now: number): void {
    const b = PRESSURE_BUTTON;
    const press = now - this.tapAt < 150;
    const sink = press ? 6 : 0;
    px(
      ctx,
      BUTTON_DOME.x - 4,
      BUTTON_DOME.y - 4,
      BUTTON_DOME.w + 8,
      BUTTON_DOME.h + 10,
      C.metalInk,
    );
    pxDisc(
      ctx,
      b.x + b.w / 2,
      BUTTON_DOME.y + BUTTON_DOME.h / 2 + sink,
      16,
      press ? C.coralLo : C.coral,
    );
    pxDisc(
      ctx,
      b.x + b.w / 2 - 4,
      BUTTON_DOME.y + BUTTON_DOME.h / 2 - 4 + sink,
      8,
      press ? C.coral : C.coralHi,
    );
    // Piso del botón dentro de su caja.
    px(ctx, b.x + 4, b.y + b.h - 12, b.w - 8, 8, C.metalDeep);
    px(ctx, b.x + 4, b.y + b.h - 12, b.w - 8, PX, C.metalMid);
  }

  // La mano aprieta el botón; cuando la aguja entra en la franja, un
  // anillo pulsa ahí para marcar el momento.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done) return;
    const inside = Math.abs(g.level - g.zoneCenter) <= g.zoneHalf;
    if (inside && !this.env.calm) {
      const y =
        INNER.bottom -
        clamp01(g.zoneCenter) * (INNER.bottom - INNER.top);
      drawTapRing(
        ctx,
        PRESSURE_TUBE.x + PRESSURE_TUBE.w / 2,
        y,
        (now % 700) / 700,
        C.amber,
      );
    }
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(
      ctx,
      PRESSURE_BUTTON.x + PRESSURE_BUTTON.w / 2 + 6,
      PRESSURE_BUTTON.y + 26,
      press,
    );
  }
}
