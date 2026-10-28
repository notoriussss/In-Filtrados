import {
  FLOURISH_MS,
  IDLE_POSE,
  flourishPose,
  workPose,
} from '../../render/workPose';
import {
  BOARD,
  type BiofilterGame,
  BIOFILTER_BIN,
  BIOFILTER_ORDER,
  BIOFILTER_SIZE,
  BIOFILTER_STEPS,
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

// Reciclar (compost-1, Lombrifiltro): capas del biofiltro. Tres bolsas en
// el piso y la columna de vidrio a la derecha: se arrastran en el orden
// que marca la mano (grava, arena, carbón), dos rondas; la bolsa
// equivocada se sacude y vuelve. Al cerrar una ronda, el agua sucia baja
// por las capas y se junta limpia abajo.

export const BIOFILTER_HERO_X = 214;
const POUR_FLY_MS = 240;
const POUR_HOLD_MS = 460;
const POUR_FADE_MS = 180;
const POUR_MS = POUR_FLY_MS + POUR_HOLD_MS + POUR_FADE_MS;
const SHRUG_MS = 420;
const FLOW_MS = 1100;
// Alto de la reserva de agua limpia al pie de la columna.
const RESERVOIR_H = 14;
// La bolsa mide 10 px de arte: a escala 2 llena su zona de 40 de agarre.
const BAG_SCALE = 2;
const DIRTY_WATER = '#8a6a3c';
const RIM = {
  x: BIOFILTER_BIN.x + BIOFILTER_BIN.w / 2 - 10,
  y: BIOFILTER_BIN.y - 2,
};
// Por dónde se apilan las capas: de la reserva hacia arriba.
const STACK_TOP = BIOFILTER_BIN.y + 8;
const STACK_BOTTOM = FLOOR_Y - 6 - RESERVOIR_H;
const BAND_H = (STACK_BOTTOM - STACK_TOP) / BIOFILTER_STEPS;

// Bolsa de arpilla con el contenido asomando en la boca. Letras:
// o borde, s arpilla, c contenido, h luz del contenido.
const BAG_ROWS = [
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
  // 0 grava, 1 arena, 2 carbón.
  if (index === 0) return { body: '#6f7a86', hi: '#a9b4bf' };
  if (index === 1) return { body: '#c9a45c', hi: '#ecd391' };
  return { body: '#323d4f', hi: '#8693a6' };
}

const sprites = new Map<number, HTMLCanvasElement>();

function bagSprite(index: number): HTMLCanvasElement {
  let s = sprites.get(index);
  if (!s) {
    const col = layerColors(index);
    s = spriteFromRows(BAG_ROWS, {
      o: C.ink,
      s: '#9fb3c2',
      c: col.body,
      h: col.hi,
    });
    sprites.set(index, s);
  }
  return s;
}

// La columna del biofiltro: tubo de vidrio con marco y collar de metal.
// Las capas van en el cuadro, creciendo desde la reserva de abajo.
function drawFilter(c: CanvasRenderingContext2D): void {
  const b = BIOFILTER_BIN;
  px(c, b.x - 4, b.y - 4, b.w + 8, b.h + 4, C.metalInk);
  px(c, b.x, b.y, b.w, b.h, C.wallLo);
  px(c, b.x + 4, b.y + 4, 3, b.h - 8, C.line);
  px(c, b.x + b.w - 7, b.y + 4, 2, b.h - 8, C.floorLo);
  // Collar de arriba y base de abajo.
  px(c, b.x - 6, b.y - 8, b.w + 12, 8, C.metalInk);
  px(c, b.x - 4, b.y - 6, b.w + 8, 4, C.metalMid);
  px(c, b.x - 4, b.y - 6, b.w + 8, PX, C.metalHi);
  px(c, b.x - 6, b.y + b.h - 2, b.w + 12, 6, C.metalInk);
  px(c, b.x - 4, b.y + b.h, b.w + 8, PX, C.metalDark);
  // Reserva de abajo, donde se junta el agua limpia.
  px(c, b.x + 8, FLOOR_Y - 6 - RESERVOIR_H, b.w - 16, RESERVOIR_H, C.ink);
}

type Pour = { index: number; at: number; x: number; y: number };

export class BiofilterScene implements Scene {
  private readonly back = bakeBoard((c) => {
    c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
    drawFilter(c);
  });
  private readonly shown: {
    x: number;
    y: number;
    tilt: number;
    lift: number;
  }[];
  private readonly pours: Pour[] = [];
  private seenSteps = 0; // capas que ya se ven puestas
  private flowAt = -1e9; // cuando el agua sucia empezó a bajar
  private cheerAt = -1e9;
  private shrugAt = -1e9;
  private doneAt: number | null = null;
  readonly settleMs = 1200;

  constructor(
    private readonly game: BiofilterGame,
    private readonly env: SceneEnv,
  ) {
    this.shown = game.bags.map((s) => ({ x: s.x, y: s.y, tilt: 0, lift: 0 }));
    env.hero.lookAt('left');
  }

  get doneSince(): number | null {
    return this.doneAt;
  }

  frame(ctx: CanvasRenderingContext2D, now: number, dt: number): void {
    this.consume(now);
    this.update(now, dt);
    ctx.drawImage(this.back, 0, 0, BOARD.w, BOARD.h);
    this.drawReservoir(ctx);
    for (let i = 0; i < this.seenSteps; i++) this.drawLayerBand(ctx, i);
    this.drawFlow(ctx, now);
    this.drawBags(ctx, false);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawBags(ctx, true);
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
    for (const [i, s] of this.game.bags.entries()) {
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
    const seen = this.game.steps - this.pours.length + pouring;
    if (seen > this.seenSteps && seen % BIOFILTER_ORDER.length === 0) {
      this.flowAt = now;
    }
    this.seenSteps = seen;
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
    const b = BIOFILTER_BIN;
    const y = STACK_BOTTOM - (layer + 1) * BAND_H;
    const col = layerColors(layer % BIOFILTER_ORDER.length);
    px(ctx, b.x + 8, y, b.w - 16, Math.max(2, BAND_H - 1), col.body);
    px(ctx, b.x + 8, y, b.w - 16, PX, col.hi);
    // Granos sueltos: la capa no es una franja lisa.
    for (let i = 0; i < 9; i++) {
      const gx = b.x + 10 + hash01(layer * 13 + i) * (b.w - 24);
      const gy = y + 2 + hash01(layer * 7 + i * 3) * Math.max(0, BAND_H - 5);
      px(ctx, gx, gy, PX, PX, col.hi);
    }
  }

  // El agua limpia que ya se juntó: sube con cada ronda cerrada.
  private drawReservoir(ctx: CanvasRenderingContext2D): void {
    const rounds = Math.floor(this.seenSteps / BIOFILTER_ORDER.length);
    const level = clamp01(rounds / this.rounds());
    if (level <= 0) return;
    const h = Math.max(PX, level * (RESERVOIR_H - 2));
    const b = BIOFILTER_BIN;
    px(ctx, b.x + 10, STACK_BOTTOM + RESERVOIR_H - h, b.w - 20, h, C.water);
    px(ctx, b.x + 10, STACK_BOTTOM + RESERVOIR_H - h, b.w - 20, PX, C.waterHi);
  }

  private rounds(): number {
    return BIOFILTER_STEPS / BIOFILTER_ORDER.length;
  }

  // El agua sucia baja por las capas: marrón arriba, clara debajo de la
  // pila que ya la limpió.
  private drawFlow(ctx: CanvasRenderingContext2D, now: number): void {
    const since = now - this.flowAt;
    if (since < 0 || since >= FLOW_MS || this.env.calm) return;
    const b = BIOFILTER_BIN;
    const top = STACK_BOTTOM - this.seenSteps * BAND_H;
    for (let i = 0; i < 5; i++) {
      const t = clamp01((since - i * 110) / 520);
      if (t <= 0 || t >= 1) continue;
      const y = RIM.y + t * (STACK_BOTTOM + RESERVOIR_H - RIM.y - 4);
      const x = b.x + b.w / 2 + (i - 2) * 12;
      px(ctx, x, y, PX, PX * 2, y < top ? DIRTY_WATER : C.waterHi);
    }
  }

  // held: las bolsas que se arrastran van encima del personaje y
  // levantadas; las demás, detrás.
  private drawBags(ctx: CanvasRenderingContext2D, held: boolean): void {
    const g = this.game;
    for (const [i, s] of g.bags.entries()) {
      if ((g.dragging === i) !== held) continue;
      const st = this.shown[i];
      stamp(
        ctx,
        bagSprite(s.index),
        st.x + BIOFILTER_SIZE / 2,
        st.y + BIOFILTER_SIZE / 2 - 2 * st.lift,
        { scale: BAG_SCALE, angle: st.tilt },
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
      const s = g.bags[g.dragging];
      const left = s.x + BIOFILTER_SIZE / 2 < BIOFILTER_HERO_X;
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

  // La bolsa vuela al borde de la columna, se inclina y vierte.
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
      stamp(ctx, bagSprite(p.index), x, y - fade * 10, {
        angle: tilt,
        scale: BAG_SCALE,
      });
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

  // La mano señala la bolsa que toca y la flecha va a la columna.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.dragging !== null || g.done) return;
    const bag = g.bags[g.required];
    if (!bag) return;
    const st = this.shown[g.required];
    const sx = st.x + BIOFILTER_SIZE / 2;
    const sy = st.y + BIOFILTER_SIZE / 2;
    drawMarchArrow(
      ctx,
      { x: sx + 22, y: sy },
      { x: BIOFILTER_BIN.x + BIOFILTER_BIN.w / 2, y: BIOFILTER_BIN.y + 6 },
      now,
      this.env.calm,
    );
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, sx - 6, sy - 12, press);
    drawTapRing(ctx, sx, sy, this.env.calm ? 0.3 : (now % 900) / 900);
  }
}
