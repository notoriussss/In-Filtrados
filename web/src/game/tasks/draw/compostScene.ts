import {
  FLOURISH_MS,
  IDLE_POSE,
  flourishPose,
  workPose,
} from '../../render/workPose';
import {
  BOARD,
  type CompostGame,
  COMPOST_BIN,
  COMPOST_SIZE,
  FLOOR_Y,
} from '../minigames';
import { drawMarchArrow } from './dragHelpers';
import { drawHand, drawTapRing } from './hand';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  clamp01,
  hash01,
  px,
  spriteFromRows,
  stamp,
} from './pixel';
import { roomLayer } from './room';

// Reciclar (compost-1): capas del compost. Tres sacos en el piso y la
// compostera de tablas a la derecha: se arrastran en el orden que marca
// la mano (seco, húmedo, tierra), dos rondas; el saco equivocado se
// sacude y vuelve.

export const COMPOST_HERO_X = 214;
const POUR_FLY_MS = 240;
const POUR_HOLD_MS = 460;
const POUR_FADE_MS = 180;
const POUR_MS = POUR_FLY_MS + POUR_HOLD_MS + POUR_FADE_MS;
const RIM = { x: COMPOST_BIN.x + COMPOST_BIN.w / 2 - 10, y: COMPOST_BIN.y - 2 };
const SHRUG_MS = 420;

// Saco de arpilla con el contenido asomando en la boca. Letras:
// o borde, s arpilla, c contenido, h luz del contenido.
const SACK_ROWS = [
  '...oooo...',
  '..occcco..',
  '..ohccco..',
  '.osccccso.',
  '.osccccso.',
  '.oshcccso.',
  '.osccccso.',
  '.osccccso.',
  '..osssso..',
  '...oooo...',
];

export function layerColors(index: number): { body: string; hi: string } {
  // 0 hojas secas, 1 restos de comida, 2 tierra.
  if (index === 0) return { body: C.amberLo, hi: C.amber };
  if (index === 1) return { body: C.leafLo, hi: C.leaf };
  return { body: C.dirt, hi: C.dirtHi };
}

const sprites = new Map<number, HTMLCanvasElement>();

function sackSprite(index: number): HTMLCanvasElement {
  let s = sprites.get(index);
  if (!s) {
    const col = layerColors(index);
    s = spriteFromRows(SACK_ROWS, {
      o: C.ink,
      s: '#9fb3c2',
      c: col.body,
      h: col.hi,
    });
    sprites.set(index, s);
  }
  return s;
}

// La compostera: marco de madera, postes y borde superior. Las capas de
// contenido van en el cuadro, creciendo desde abajo.
function drawCompost(c: CanvasRenderingContext2D): void {
  const b = COMPOST_BIN;
  px(c, b.x - 4, b.y - 4, b.w + 8, b.h + 4, C.ink);
  px(c, b.x, b.y, b.w, b.h, '#1c1207');
  // Postes laterales.
  px(c, b.x, b.y, 10, b.h, C.dirtLo);
  px(c, b.x + b.w - 10, b.y, 10, b.h, C.dirtLo);
  px(c, b.x, b.y, 10, PX, C.dirt);
  px(c, b.x + b.w - 10, b.y, 10, PX, C.dirt);
  // Borde superior.
  px(c, b.x, b.y - 2, b.w, 6, C.dirtHi);
  px(c, b.x, b.y + 2, b.w, PX, C.dirtLo);
}

// drawLayer ya no va: las capas se dibujan por frame con drawLayerBand.

type Pour = { index: number; at: number; x: number; y: number };

export class CompostScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawCompost(c);
  });
  private readonly shown: {
    x: number;
    y: number;
    tilt: number;
    lift: number;
  }[];
  private readonly pours: Pour[] = [];
  private seenSteps = 0; // capas que ya se ven puestas
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private doneAt: number | null = null;
  readonly settleMs = 1200;

  constructor(
    private readonly game: CompostGame,
    private readonly env: SceneEnv,
  ) {
    this.shown = game.sacks.map((s) => ({ x: s.x, y: s.y, tilt: 0, lift: 0 }));
    env.hero.lookAt('left');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(now, dt);
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    for (let i = 0; i < this.seenSteps; i++) this.drawLayerBand(ctx, i);
    this.drawSacks(ctx);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawPours(ctx, now);
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
    const k = 1 - Math.exp((-dt / 1000) * 16);
    for (const [i, s] of this.game.sacks.entries()) {
      const st = this.shown[i];
      const dragging = this.game.dragging === i;
      const rate = dragging ? k : 1 - Math.exp((-dt / 1000) * 12);
      st.x += (s.x - st.x) * rate;
      st.y += (s.y - st.y) * rate;
      const vx = (s.x - st.x) / Math.max(dt, 1);
      const tilt =
        dragging && !this.env.calm
          ? Math.max(-0.4, Math.min(0.4, vx * 1.4))
          : 0;
      st.tilt += (tilt - st.tilt) * (1 - Math.exp((-dt / 1000) * 10));
      if (!dragging) {
        st.lift += (0 - st.lift) * (1 - Math.exp((-dt / 1000) * 10));
      }
    }
    // La capa sube cuando el contenido aterriza, no al soltar.
    const pouring = this.pours.filter((p) => now - p.at >= POUR_FLY_MS).length;
    this.seenSteps = this.game.steps - this.pours.length + pouring;
    for (let i = this.pours.length - 1; i >= 0; i--) {
      if (now - this.pours[i].at >= POUR_MS) {
        this.pours.splice(i, 1);
      }
    }
    if (this.game.done && this.pours.length === 0 && this.doneAt === null) {
      this.doneAt = now;
    }
  }

  private drawLayerBand(ctx: CanvasRenderingContext2D, layer: number): void {
    const b = COMPOST_BIN;
    const top = b.y + 8;
    const bottom = FLOOR_Y - 6;
    const h = (bottom - top) / 6;
    const y = bottom - (layer + 1) * h;
    const col = layerColors(layerColorsIndex(layer));
    px(ctx, b.x + 4, y, b.w - 8, Math.max(2, h - 1), col.body);
    px(ctx, b.x + 4, y, b.w - 8, PX, col.hi);
  }

  private drawSacks(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    for (const [i, s] of g.sacks.entries()) {
      if (g.dragging === i) continue;
      const st = this.shown[i];
      stamp(
        ctx,
        sackSprite(s.index),
        st.x + COMPOST_SIZE / 2,
        st.y + COMPOST_SIZE / 2,
      );
    }
  }

  private driveHero(now: number, dt: number): void {
    const g = this.game;
    const hero = this.env.hero;
    if (g.done) {
      hero.lookAt('left');
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    if (g.dragging !== null) {
      const s = g.sacks[g.dragging];
      const left = s.x + COMPOST_SIZE / 2 < COMPOST_HERO_X;
      hero.lookAt(left ? 'left' : 'right');
      hero.drive(workPose('tank', now, 1), dt);
      return;
    }
    const since = now - this.cheerAt;
    if (since < FLOURISH_MS) {
      hero.lookAt('left');
      hero.drive(flourishPose(since / FLOURISH_MS), dt);
      return;
    }
    const sinceShrug = now - this.shrugAt;
    if (sinceShrug < SHRUG_MS && !this.env.calm) {
      const wobble = Math.sin(sinceShrug / 38) * (1 - sinceShrug / SHRUG_MS);
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

  // El saco vuela al borde de la compostera, se inclina y vierte.
  private drawPours(ctx: CanvasRenderingContext2D, now: number): void {
    for (const p of this.pours) {
      const t = now - p.at;
      const fromX = p.x;
      const fromY = p.y;
      const fly = clamp01(t / POUR_FLY_MS);
      const e = 1 - (1 - fly) ** 3;
      const x = fromX + (RIM.x - fromX) * e;
      const y = fromY + (RIM.y - fromY) * e - Math.sin(Math.PI * fly) * 20;
      const hold = clamp01((t - POUR_FLY_MS) / POUR_HOLD_MS);
      const tilt = 1.1 * Math.min(1, e + hold * 0.1);
      const fade = clamp01((t - POUR_FLY_MS - POUR_HOLD_MS) / POUR_FADE_MS);
      ctx.globalAlpha = 1 - fade;
      stamp(ctx, sackSprite(p.index), x, y - fade * 10, { angle: tilt });
      ctx.globalAlpha = 1;
      if (t >= POUR_FLY_MS && fade < 1) this.drawStream(ctx, p, now);
    }
  }

  private drawStream(
    ctx: CanvasRenderingContext2D,
    p: Pour,
    now: number,
  ): void {
    const col = layerColors(p.index);
    const y = RIM.y + 2;
    px(ctx, RIM.x + 6, y, 8, 10, col.body);
    px(ctx, RIM.x + 7, y, 2, 10, col.hi);
    if (this.env.calm) return;
    for (let i = 0; i < 3; i++) {
      px(
        ctx,
        RIM.x + 6 + hash01(i + Math.floor(now / 90)) * 8,
        y + 4,
        PX,
        PX,
        col.hi,
      );
    }
  }

  // La mano señala el saco que toca y la flecha va a la compostera.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done) return;
    const sack = g.sacks[g.required];
    if (!sack) return;
    const st = this.shown[g.required];
    const sx = st.x + COMPOST_SIZE / 2;
    const sy = st.y + COMPOST_SIZE / 2;
    drawMarchArrow(
      ctx,
      { x: sx + 22, y: sy },
      { x: COMPOST_BIN.x + COMPOST_BIN.w / 2, y: COMPOST_BIN.y + 6 },
      now,
      this.env.calm,
    );
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, sx - 6, sy - 12, press);
    drawTapRing(ctx, sx, sy, this.env.calm ? 0.3 : (now % 900) / 900);
  }
}

// El contenido de la capa `layer` según el orden de las rondas.
function layerColorsIndex(layer: number): number {
  return layer % 3;
}
