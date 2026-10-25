import {
  FLOURISH_MS,
  IDLE_POSE,
  REACH,
  TUCK,
  WIND,
  flourishPose,
} from '../../render/workPose';
import {
  BOARD,
  FLOOR_Y,
  PARTICLE_COUNT,
  type ParticlesGame,
} from '../minigames';
import { drawHand, drawTapRing } from './hand';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import type { Pose } from '../../render/workPose';
import {
  C,
  PX,
  bakeBoard,
  clamp01,
  hash01,
  mix,
  px,
  pxDisc,
  pxLine,
  pxRing,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reciclar: un acuario con agua sucia y una máquina filtradora. El
// personaje lanza una red a cada mugre que se toca; la red la trae, la
// mugre viaja a la máquina y al llegar se enciende una luz. El agua se
// aclara con cada una.

export const PARTICLES_HERO_X = 50;
const TANK = { x: 100, y: 40, w: 250, bottom: FLOOR_Y };
const WATER_TOP = TANK.y + 20;
const WATER_BOTTOM = TANK.bottom - 12;
const HAND = { x: 78, y: 204 }; // donde la mano sostiene la red
const INTAKE = { x: 56, y: 100 }; // boca de la máquina
const LAMPS = { x: 22, y: 134, gap: 18 };
const THRUST_MS = 170;
const RETURN_MS = 250;
const DELIVER_MS = 340;
const NET_MS = THRUST_MS + RETURN_MS + DELIVER_MS;
const FLASH_MS = 320;
const DIRTY_WATER = '#6b5b3e';
const CLEAN_WATER = '#2b7bb5';

const BLOB_ROWS = [
  '...oooo.....',
  '..oddhhoo...',
  '.odddhhddoo.',
  'oddddddddddo',
  'odeeddeeddlo',
  'odepddepddlo',
  'oddddddddllo',
  'odddlddlllo.',
  '.olllllllloo',
  '..oolllloo..',
  '....oooo....',
];
const BLOB_COLORS = {
  o: '#1d140a',
  d: C.dirt,
  h: C.dirtHi,
  l: C.dirtLo,
  e: '#ffffff',
  p: C.ink,
};

type Net = { index: number; at: number; x: number; y: number };
type Bit = { x: number; y: number; vx: number; vy: number; life: number };
type Ripple = { x: number; y: number; at: number };

function drawMachine(c: CanvasRenderingContext2D): void {
  const x = 8;
  const y = 92;
  const w = 84;
  px(c, x - 2, y - 2, w + 4, FLOOR_Y - y + 2, C.metalInk);
  px(c, x, y, w, FLOOR_Y - y, C.metalDark);
  px(c, x, y, w, 4, C.metalHi);
  px(c, x, y, 4, FLOOR_Y - y, C.metalMid);
  px(c, x + w - 6, y, 6, FLOOR_Y - y, C.metalDeep);
  // Panel de las luces.
  px(c, x + 8, 122, w - 16, 28, C.metalInk);
  px(c, x + 10, 124, w - 20, 24, '#10202e');
  // Rejillas de ventilación.
  for (let i = 0; i < 4; i++)
    px(c, x + 12, 164 + i * 8, w - 24, PX, C.metalInk);
  // Boca por donde entra la suciedad.
  px(c, INTAKE.x - 14, INTAKE.y - 8, 28, 10, C.metalInk);
  px(c, INTAKE.x - 12, INTAKE.y - 6, 24, 6, C.ink);
  px(c, INTAKE.x - 18, INTAKE.y - 10, 36, 4, C.metalMid);
  // Tubo que lleva el agua limpia al acuario.
  px(c, x + w, 108, 18, 12, C.metalInk);
  px(c, x + w, 110, 18, 8, C.metalMid);
  px(c, x + w, 110, 18, PX, C.metalHi);
}

// Acuario: vidrio, marco y base. La parte de atrás va antes del agua.
function drawTankBack(c: CanvasRenderingContext2D): void {
  px(
    c,
    TANK.x + 4,
    TANK.y + 8,
    TANK.w - 8,
    TANK.bottom - TANK.y - 14,
    '#071a2e',
  );
}

function drawTankFront(c: CanvasRenderingContext2D): void {
  const { x, y, w, bottom } = TANK;
  px(c, x - 4, y, w + 8, 10, C.metalInk);
  px(c, x - 2, y + 2, w + 4, 6, C.metalMid);
  px(c, x - 2, y + 2, w + 4, PX, C.metalHi);
  px(c, x - 4, bottom - 12, w + 8, 12, C.metalInk);
  px(c, x - 2, bottom - 10, w + 4, 8, C.metalMid);
  px(c, x - 2, bottom - 10, w + 4, PX, C.metalHi);
  for (const sx of [x - 4, x + w - 4]) {
    px(c, sx, y, 8, bottom - y, C.metalInk);
    px(c, sx + 2, y + 2, 4, bottom - y - 4, C.metalDark);
    px(c, sx + 2, y + 2, 2, bottom - y - 4, C.metalMid);
  }
  c.globalAlpha = 0.16;
  px(c, x + 18, y + 24, 6, 90, C.white);
  px(c, x + 30, y + 24, 2, 40, C.white);
  c.globalAlpha = 1;
}

const easeOut = (k: number) => 1 - (1 - clamp01(k)) ** 3;
const easeInOut = (k: number) => {
  const c = clamp01(k);
  return c * c * (3 - 2 * c);
};

export class ParticlesScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawMachine(c);
    drawTankBack(c);
  });
  private readonly front = bakeBoard(drawTankFront);
  private readonly blob = spriteFromRows(BLOB_ROWS, BLOB_COLORS);
  private readonly nets: Net[] = [];
  private readonly bits: Bit[] = [];
  private readonly ripples: Ripple[] = [];
  private readonly flashes: number[] = Array(PARTICLE_COUNT).fill(-1e9);
  private lit = 0;
  private clean = 0;
  private popAt = -1e9;
  private missAt = -1e9;
  private doneAt: number | null = null;
  readonly settleMs = DELIVER_MS + FLOURISH_MS;

  constructor(
    private readonly game: ParticlesGame,
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
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawGear(ctx, now);
    this.drawLamps(ctx, now);
    this.drawWater(ctx, now);
    this.drawParticles(ctx, now);
    ctx.drawImage(this.front, 0, 0, BOARD.w, BOARD.h);
    this.drawRipples(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawNets(ctx, now);
    this.drawBits(ctx);
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type === 'pop') {
        this.nets.push({ index: e.index, at: now, x: e.x, y: e.y });
        this.popAt = now;
      } else if (e.type === 'miss') {
        this.ripples.push({ x: e.x, y: e.y, at: now });
        this.missAt = now;
      }
    }
  }

  private update(now: number, dt: number): void {
    this.clean +=
      (this.game.progress() - this.clean) * (1 - Math.exp((-dt / 1000) * 1.8));
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i];
      const t = now - n.at;
      if (t >= THRUST_MS && !this.burst.has(n.index)) this.spawnBurst(n);
      if (t >= NET_MS) {
        this.lit += 1;
        this.flashes[n.index] = now;
        this.nets.splice(i, 1);
        this.burst.delete(n.index);
      }
    }
    for (const b of this.bits) {
      b.life -= dt;
      b.x += (b.vx * dt) / 1000;
      b.y += (b.vy * dt) / 1000;
      b.vy += (260 * dt) / 1000;
    }
    for (let i = this.bits.length - 1; i >= 0; i--) {
      if (this.bits[i].life <= 0) this.bits.splice(i, 1);
    }
    if (this.game.done && this.nets.length === 0 && this.doneAt === null) {
      this.doneAt = now;
    }
  }

  private readonly burst = new Set<number>();

  // Al llegar la red, la mugre se desbarata en pedacitos.
  private spawnBurst(n: Net): void {
    this.burst.add(n.index);
    if (this.env.calm) return;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + hash01(i + n.index) * 0.6;
      const sp = 40 + 50 * hash01(i + 9);
      this.bits.push({
        x: n.x,
        y: n.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 380,
      });
    }
  }

  private driveHero(now: number, dt: number): void {
    const hero = this.env.hero;
    if (this.game.done) {
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    const t = now - this.popAt;
    if (t < 420) {
      hero.drive(swingPose(t), dt);
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

  private drawWater(ctx: CanvasRenderingContext2D, now: number): void {
    const body = mix(DIRTY_WATER, CLEAN_WATER, this.clean);
    const deep = mix('#4a3d27', C.waterDeep, this.clean);
    const x = TANK.x + 4;
    const w = TANK.w - 8;
    px(ctx, x, WATER_TOP, w, WATER_BOTTOM - WATER_TOP, body);
    const mid = mix(body, deep, 0.5);
    px(ctx, x, WATER_BOTTOM - 70, w, 30, mid);
    px(ctx, x, WATER_BOTTOM - 40, w, 40, deep);
    // Trama entre las franjas para que el cambio no sea un escalón.
    for (let sx = x; sx < x + w; sx += PX * 2) {
      px(ctx, sx, WATER_BOTTOM - 72, PX, PX, mid);
      px(ctx, sx + PX, WATER_BOTTOM - 42, PX, PX, deep);
    }
    // Rayos de luz que se mueven despacio.
    const drift = this.env.calm ? 0 : (now / 40) % 48;
    ctx.globalAlpha = 0.1 + 0.08 * this.clean;
    for (let sx = -48; sx < w; sx += 48) {
      for (let k = 0; k < 90; k += PX) {
        px(ctx, x + sx + drift + k * 0.6, WATER_TOP + k, 6, PX, C.white);
      }
    }
    ctx.globalAlpha = 1;
    // Superficie con olas de píxeles.
    for (let sx = x; sx < x + w; sx += 6) {
      const wave = this.env.calm
        ? 0
        : Math.round(Math.sin(sx / 11 + now / 300) * 1.3) * PX;
      px(
        ctx,
        sx,
        WATER_TOP - 2 + wave,
        6,
        4,
        mix('#9a8660', C.waterHi, this.clean),
      );
    }
    this.drawBubbles(ctx, now);
  }

  private drawBubbles(ctx: CanvasRenderingContext2D, now: number): void {
    const clock = this.env.calm ? 0 : now / 1000;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 6; i++) {
      const k = (clock * 0.35 + i / 6) % 1;
      const bx = 330 + Math.sin(k * 9 + i) * 4;
      const by = WATER_BOTTOM - 8 - k * (WATER_BOTTOM - WATER_TOP - 14);
      pxRing(ctx, bx, by, 2 + (i % 2) * 2, C.waterHi, 1);
    }
    ctx.globalAlpha = 1;
    px(ctx, 324, WATER_BOTTOM - 8, 12, 8, C.metalInk);
    px(ctx, 326, WATER_BOTTOM - 6, 8, 4, C.metalMid);
  }

  private drawParticles(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    for (const [i, p] of g.particles.entries()) {
      if (p.removed) continue;
      const pos = g.positionOf(p);
      const squish = this.env.calm ? 0 : Math.sin(now / 260 + i * 2) * 0.06;
      stamp(ctx, this.blob, pos.x, pos.y, { scale: 1 + squish });
    }
    // La mugre atrapada sigue ahí hasta que la red llega.
    for (const n of this.nets) {
      const t = now - n.at;
      if (t < THRUST_MS) stamp(ctx, this.blob, n.x, n.y);
    }
  }

  private netTip(
    n: Net,
    now: number,
  ): { x: number; y: number; carrying: boolean } {
    const t = now - n.at;
    if (t < THRUST_MS) {
      const k = easeOut(t / THRUST_MS);
      return {
        x: HAND.x + (n.x - HAND.x) * k,
        y: HAND.y + (n.y - HAND.y) * k,
        carrying: false,
      };
    }
    const back = easeInOut((t - THRUST_MS) / RETURN_MS);
    return {
      x: n.x + (HAND.x - n.x) * back,
      y: n.y + (HAND.y - n.y) * back,
      carrying: true,
    };
  }

  // La red es una vara con un aro de malla; sale de la mano, toca la
  // mugre y vuelve con ella.
  private drawNets(ctx: CanvasRenderingContext2D, now: number): void {
    for (const n of this.nets) {
      const t = now - n.at;
      if (t >= THRUST_MS + RETURN_MS) {
        this.drawDelivery(ctx, t - THRUST_MS - RETURN_MS);
        continue;
      }
      const tip = this.netTip(n, now);
      pxLine(ctx, HAND.x, HAND.y, tip.x, tip.y, C.ink, 3);
      pxLine(ctx, HAND.x, HAND.y, tip.x, tip.y, C.amberLo, 2);
      pxLine(ctx, HAND.x, HAND.y, tip.x, tip.y, C.amber, 1);
      pxRing(ctx, tip.x, tip.y, 9, C.ink, 3);
      pxRing(ctx, tip.x, tip.y, 9, C.metalHi, 1);
      ctx.globalAlpha = 0.5;
      pxDisc(ctx, tip.x, tip.y, 7, '#cfeeff');
      ctx.globalAlpha = 1;
      if (tip.carrying) stamp(ctx, this.blob, tip.x, tip.y, { scale: 0.7 });
    }
  }

  // La mugre vuela de la mano a la boca de la máquina, en arco.
  private drawDelivery(ctx: CanvasRenderingContext2D, t: number): void {
    const k = easeInOut(t / DELIVER_MS);
    const x = HAND.x + (INTAKE.x - HAND.x) * k;
    const y = HAND.y + (INTAKE.y - HAND.y) * k - Math.sin(Math.PI * k) * 26;
    stamp(ctx, this.blob, x, y, { scale: 0.7 - 0.35 * k, angle: k * 6 });
  }

  private drawBits(ctx: CanvasRenderingContext2D): void {
    for (const b of this.bits) {
      ctx.globalAlpha = clamp01(b.life / 260);
      px(ctx, b.x, b.y, PX, PX, C.dirtHi);
    }
    ctx.globalAlpha = 1;
  }

  private drawRipples(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const k = (now - r.at) / 450;
      if (k >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }
      drawTapRing(ctx, r.x, r.y, k, C.waterHi);
    }
  }

  private drawGear(ctx: CanvasRenderingContext2D, now: number): void {
    const cx = 50;
    const cy = 108;
    const spin = this.env.calm ? 0 : now / (900 - 600 * this.clean);
    pxDisc(ctx, cx, cy, 12, C.ink);
    pxDisc(ctx, cx, cy, 10, C.metalMid);
    for (let i = 0; i < 8; i++) {
      const a = spin + (i * Math.PI) / 4;
      pxLine(
        ctx,
        cx + Math.cos(a) * 8,
        cy + Math.sin(a) * 8,
        cx + Math.cos(a) * 13,
        cy + Math.sin(a) * 13,
        C.metalHi,
        2,
      );
    }
    pxDisc(ctx, cx, cy, 5, C.metalDeep);
    pxDisc(ctx, cx, cy, 2, C.ink);
  }

  private drawLamps(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = LAMPS.x + i * LAMPS.gap;
      px(ctx, x - 2, LAMPS.y - 2, 14, 14, C.ink);
      const on = i < this.lit;
      px(ctx, x, LAMPS.y, 10, 10, on ? C.leaf : '#3a2f1e');
      if (on) {
        px(ctx, x, LAMPS.y, 10, 2, C.leafHi);
        px(ctx, x, LAMPS.y + 8, 10, 2, C.leafLo);
      } else {
        px(ctx, x, LAMPS.y, 10, 2, '#4d3f28');
      }
      const k = (now - this.flashes[i]) / FLASH_MS;
      if (k >= 0 && k < 1 && !this.env.calm) {
        ctx.globalAlpha = 1 - k;
        pxRing(ctx, x + 5, LAMPS.y + 5, 6 + k * 14, C.leafHi, 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  // La mano toca la primera mugre y un anillo pulsa a su alrededor.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.done || this.nets.length > 0) return;
    const first = g.particles.find((p) => !p.removed);
    if (!first) return;
    const pos = g.positionOf(first);
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawTapRing(ctx, pos.x, pos.y, this.env.calm ? 0.3 : (now % 900) / 900);
    drawHand(ctx, pos.x + 4, pos.y + 12, press);
  }
}

// Lanzar la red: toma impulso con el brazo doblado, lo estira de golpe y
// vuelve a la postura compacta.
function swingPose(t: number): Pose {
  if (t < 80) {
    const u = t / 80;
    return {
      ...IDLE_POSE,
      frame: WIND,
      lean: -2.6 * u,
      sy: 1 + 0.04 * u,
      strain: 0.6,
    };
  }
  if (t < 200) {
    const u = (t - 80) / 120;
    return {
      ...IDLE_POSE,
      frame: REACH,
      dx: 1.6 * u,
      lean: -2.6 + 9 * u,
      sy: 1.04 - 0.14 * u,
      sx: 1 + 0.06 * u,
      strain: 1,
    };
  }
  const w = easeOut((t - 200) / 220);
  return {
    ...IDLE_POSE,
    frame: w < 0.5 ? REACH : TUCK,
    lean: 6.4 * (1 - w),
    sy: 0.9 + 0.1 * w,
    sx: 1.06 - 0.06 * w,
    strain: 0.6,
  };
}
