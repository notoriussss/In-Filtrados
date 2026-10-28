import { IDLE_POSE, flourishPose } from '../../render/workPose';
import {
  BOARD,
  type PressureGame,
  PRESSURE_BUTTON,
  PRESSURE_TUBE,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
import { swingPose } from './particlesScene';
import {
  HERO_FEET_Y,
  type Scene,
  type SceneEnv,
  celebrateK,
} from './scene';
import { C, PX, bakeBoard, clamp01, px, pxDisc, pxRing } from './pixel';
import { roomLayer } from './room';

// Reducir (valve-1): regular la presión. Un acumulador de agua con la
// aguja barriendo su carátula; hay que presionar el botón cuando el
// nivel pasa por la franja verde, que se encoge con cada acierto. Una
// presión mal regulada desperdicia agua: cada error revienta la junta de
// la tubería y deja un charco en el piso que crece.

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
// La junta de la tubería, por donde se escapa el agua, y el charco.
const JOINT = { x: 61, y: 58 };
const PUDDLE = { x: 52, y: HERO_FEET_Y };
const LEAK_MAX = 4;
const SPRAY_MS = 650;
const GRAVITY = 420;

type Bit = { x: number; y: number; vx: number; vy: number };

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
  private sprayAt = -1e9;
  private leaks = 0; // errores de presión: tamaño del charco
  private readonly bits: Bit[] = [];
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

    this.updateSpray(now, dt);
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawPuddle(ctx);
    this.drawWater(ctx, now);
    this.drawLamps(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawSpray(ctx);
    this.drawButton(ctx, now);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'pop') {
        this.tapAt = now;
      } else if (e.type === 'miss') {
        this.missAt = now;
        // Un clic fuera del botón no es un error de presión.
        if (this.onButton(e.x, e.y)) {
          this.sprayAt = now;
          this.leaks = Math.min(LEAK_MAX, this.leaks + 1);
        }
      }
    }
  }

  private onButton(x: number, y: number): boolean {
    const b = PRESSURE_BUTTON;
    return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  // Un chorro sale de la junta mientras dura el error y cae al piso.
  private updateSpray(now: number, dt: number): void {
    if (!this.env.calm && now - this.sprayAt < SPRAY_MS) {
      for (let i = 0; i < 2; i++) {
        this.bits.push({
          x: JOINT.x,
          y: JOINT.y,
          vx: -20 - Math.random() * 60,
          vy: -90 - Math.random() * 50,
        });
      }
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const bit = this.bits[i];
      bit.x += (bit.vx * dt) / 1000;
      bit.y += (bit.vy * dt) / 1000;
      bit.vy += (GRAVITY * dt) / 1000;
      if (bit.y >= PUDDLE.y) this.bits.splice(i, 1);
    }
  }

  private drawSpray(ctx: CanvasRenderingContext2D): void {
    for (const bit of this.bits) {
      px(ctx, bit.x, bit.y, PX, PX * 2, bit.vy > 0 ? C.waterHi : C.water);
    }
  }

  // El agua que se perdió: un charco en el piso que crece con cada error.
  private drawPuddle(ctx: CanvasRenderingContext2D): void {
    if (this.leaks === 0) return;
    const w = 12 + this.leaks * 10;
    const x = PUDDLE.x - w / 2;
    px(ctx, x, PUDDLE.y, w, 4, C.waterDeep);
    px(ctx, x + 4, PUDDLE.y - 2, w - 8, 2, C.water);
    px(ctx, x + w / 4, PUDDLE.y - 2, w / 4, PX, C.waterHi);
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
