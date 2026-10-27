import { IDLE_POSE, flourishPose } from '../../render/workPose';
import {
  FLOOR_Y,
  type SealGame,
  BOARD,
  SEAL_GOAL,
  SEAL_PIPE,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
import { swingPose } from './particlesScene';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  hash01,
  px,
  pxDisc,
  pxLine,
  pxRing,
} from './pixel';
import { roomLayer } from './room';

// Reducir (leak-2): sellar la fuga. Una tubería del ecotaller con
// grietas que se abren solas: hacer clic en cada una le pone cinta.
// Se sellan 5; una grieta que queda abierta mucho tiempo abre otra.

const GRAVITY = 420;
const JET_DROPS = 10;
export const SEAL_HERO_X = 120;
const LAMPS = { x: 26, y: 30, gap: 16 };

function drawFixtures(c: CanvasRenderingContext2D): void {
  const p = SEAL_PIPE;
  // Soportes de pared bajo la tubería.
  for (const x of [56, 168, 280]) {
    px(c, x, p.y + p.h, 14, 12, C.metalDeep);
    px(c, x, p.y + p.h, 14, PX, C.metalMid);
  }
  // Tubo con volumen.
  px(c, p.x - PX, p.y - PX, p.w + PX * 2, p.h + PX * 2, C.metalInk);
  px(c, p.x, p.y, p.w, 4, C.metalHi);
  px(c, p.x, p.y + 4, p.w, 6, C.metal);
  px(c, p.x, p.y + 10, p.w, 8, C.metalMid);
  px(c, p.x, p.y + 18, p.w, p.h - 18, C.metalDark);
  // Juntas atornilladas.
  for (const x of [40, 140, 240]) {
    px(c, x, p.y - 4, 10, p.h + 8, C.metalInk);
    px(c, x + 2, p.y - 2, 6, p.h + 4, C.metalMid);
    px(c, x + 2, p.y - 2, 3, p.h + 4, C.metalHi);
  }
  drawToolbox(c);
}

// La caja de herramientas del ecotaller, con el rollo de cinta.
function drawToolbox(c: CanvasRenderingContext2D): void {
  const x = 24;
  const y = 196;
  px(c, x - 3, y - 3, 58, 228 - y + 3, C.metalInk);
  px(c, x, y, 52, 228 - y, C.coralLo);
  px(c, x, y, 52, 4, C.coral);
  px(c, x + 6, y + 12, 40, PX, C.coralHi);
  // Asa.
  px(c, x + 16, y - 8, 20, 8, C.metalInk);
  px(c, x + 18, y - 6, 16, 4, C.metalMid);
  // Rollo de cinta encima.
  pxDisc(c, x + 40, y - 10, 7, C.metalInk);
  pxDisc(c, x + 40, y - 10, 5, C.grey);
  pxDisc(c, x + 40, y - 10, 2, C.metalDeep);
}

export class SealScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawFixtures(c);
  });
  private popAt = -1e9;
  private missAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1100;

  constructor(
    private readonly game: SealGame,
    private readonly env: SceneEnv,
  ) {
    env.hero.lookAt('right');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, _dt: number): void {
    this.consume(now);
    if (this.game.done && this.doneAt === null) this.doneAt = now;
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawLamps(ctx, now);
    this.drawJets(ctx, now);
    this.drawCracks(ctx, now);
    this.driveHero(now, _dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'pop') {
        this.popAt = now;
        this.touched = true;
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
    // Mira hacia la grieta más vieja abierta.
    const open = this.game.openCracks;
    if (open.length > 0) {
      const left = open[0].x < SEAL_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
    }
    const since = now - this.popAt;
    if (since < 420) {
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
    hero.drive(
      { ...IDLE_POSE, lean: 1.2, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  private drawLamps(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = 0; i < SEAL_GOAL; i++) {
      const x = LAMPS.x + i * LAMPS.gap;
      px(ctx, x - 2, LAMPS.y - 2, 12, 12, C.ink);
      const on = i < this.game.sealedCount;
      px(ctx, x, LAMPS.y, 8, 8, on ? C.leaf : '#3a2f1e');
      if (on) px(ctx, x, LAMPS.y, 8, 2, C.leafHi);
      const k = (now - this.popAt) / 320;
      if (k >= 0 && k < 1 && !this.env.calm) {
        ctx.globalAlpha = 1 - k;
        pxRing(ctx, x + 4, LAMPS.y + 4, 4 + k * 10, C.leafHi, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Chorros que salen de cada grieta abierta, hasta el piso.
  private drawJets(ctx: CanvasRenderingContext2D, now: number): void {
    for (const c of this.game.openCracks) {
      const clock = this.env.calm ? 0 : now / 1000;
      for (let k = 0; k < JET_DROPS; k++) {
        const h = hash01(c.index * 13 + k);
        const life = 0.4 + 0.25 * h;
        const t = (((clock + k * 0.09) / life) % 1) * life;
        const vx = (10 + 44 * h) * (h > 0.5 ? 1 : -1);
        const vy = -(20 + 70 * hash01(c.index * 7 + k));
        const x = c.x + vx * t;
        const y = c.y + vy * t + 0.5 * GRAVITY * t * t;
        if (y >= FLOOR_Y) continue;
        px(ctx, x, y, PX, PX * 2, k % 3 === 0 ? C.waterHi : C.water);
      }
      // Charquito bajo la grieta.
      if (!this.env.calm) this.drawPuddle(ctx, c.x);
    }
  }

  private drawPuddle(ctx: CanvasRenderingContext2D, cx: number): void {
    const rows = [
      { dy: 0, w: 10, color: C.waterLo },
      { dy: 2, w: 12, color: C.waterDeep },
    ];
    for (const r of rows) {
      px(ctx, cx - r.w, FLOOR_Y + r.dy, r.w * 2, PX, r.color);
    }
  }

  // Las grietas: agujero abierto con aviso pulsante, o parche de cinta.
  private drawCracks(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    for (const c of g.cracks) {
      if (c.sealed) {
        this.drawPatch(ctx, c.x, c.y);
        continue;
      }
      // Agujero: borde de tinta y fondo oscuro con reflejo.
      pxDisc(ctx, c.x, c.y, 8, C.ink);
      pxDisc(ctx, c.x, c.y, 6, '#10202e');
      px(ctx, c.x - 3, c.y - 3, 3, PX, C.waterHi);
      // Aviso pulsante alrededor.
      const k = this.env.calm
        ? 0.3
        : ((now / 900 + c.index * 0.37) % 1);
      drawTapRing(ctx, c.x, c.y, k, C.amber);
    }
  }

  // Parche de cinta: dos tiras grises cruzadas con brillo.
  private drawPatch(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    px(ctx, x - 11, y - 6, 22, 12, C.metalInk);
    px(ctx, x - 9, y - 4, 18, 8, C.metal);
    px(ctx, x - 9, y - 4, 18, PX, C.metalHi);
    pxLine(ctx, x - 6, y + 3, x - 2, y - 3, C.metalDark, 1);
  }

  // La mano toca la grieta más vieja que siga abierta.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done) return;
    const open = [...g.openCracks].sort((a, b) => a.openedAt - b.openedAt);
    if (open.length === 0) return;
    const c = open[0];
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, c.x + 4, c.y + 14, press);
    if (!this.touched) {
      drawTapRing(ctx, c.x, c.y, this.env.calm ? 0.3 : (now % 900) / 900);
    }
  }
}
