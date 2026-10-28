import { IDLE_POSE, flourishPose } from '../../render/workPose';
import {
  BOARD,
  PIPES_COLS,
  PIPES_GRID,
  PIPES_ROWS,
  PIPES_TILE,
  type PipeKind,
  type PipesGame,
} from '../minigames';
import { drawDropZone } from './dragHelpers';
import { drawHand } from './hand';
import { swingPose } from './particlesScene';
import { type Scene, type SceneEnv, celebrateK } from './scene';
import {
  C,
  PX,
  bakeBoard,
  px,
  pxDisc,
  pxLine,
} from './pixel';
import { roomLayer } from './room';

// Reciclar (sorter-1, Tuberías del ecopunto): conectar las tuberías. El
// agua limpia sale de la fuente de la izquierda y hay que llevarla al
// tanque de la derecha girando los tramos con un clic. El agua avanza por
// los tramos que ya están bien y se queda goteando en el primero que no.

export const PIPES_HERO_X = 30;
const HALF = PIPES_TILE / 2;
const GRID_W = PIPES_COLS * PIPES_TILE;
const GRID_H = PIPES_ROWS * PIPES_TILE;
const TURN_RATE = 14; // qué tan rápido gira un tramo hasta su sitio
const FLOW_RATE = 5; // qué tan rápido avanza el agua por los tramos
const WATER_DEEP = C.waterDeep;

// Hacia dónde apunta cada extremo de un tramo con vuelta 0: el recto va de
// izquierda a derecha y el codo de arriba a la derecha.
const BASE_ENDS: Record<PipeKind, [number, number][]> = {
  straight: [
    [-1, 0],
    [1, 0],
  ],
  elbow: [
    [0, -1],
    [1, 0],
  ],
};

type Puff = { x: number; y: number; at: number };

export class PipesScene implements Scene {
  private readonly back: HTMLCanvasElement;
  private readonly turns: number[]; // cuartos de vuelta que lleva cada tramo
  private readonly shown: number[]; // y lo que se ve girado
  private readonly puffs: Puff[] = [];
  private flowShown = 0;
  private tankFill = 0;
  private tapAt = -1e9;
  private touched = false;
  private doneAt: number | null = null;
  readonly settleMs = 1300;

  constructor(
    private readonly game: PipesGame,
    private readonly env: SceneEnv,
  ) {
    this.turns = game.tiles.map((t) => t.rot);
    this.shown = [...this.turns];
    this.back = bakeBoard((c) => {
      c.drawImage(roomLayer(), 0, 0, BOARD.w, BOARD.h);
      this.drawPlate(c);
      this.drawEnds(c);
    });
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
    this.drawPipes(ctx);
    this.drawSource(ctx, now);
    this.drawTank(ctx);
    this.drawPuffs(ctx, now);
    this.driveHero(now, dt);
    this.env.hero.draw(ctx, now, {
      calm: this.env.calm,
      celebrate: celebrateK(this.doneAt, now),
    });
    this.drawHint(ctx, now);
  }

  private consume(now: number): void {
    for (const e of this.game.drainEvents()) {
      if (e.type !== 'pop') continue;
      this.turns[e.index] += 1;
      this.tapAt = now;
      this.touched = true;
      this.puffs.push({ x: e.x, y: e.y, at: now });
    }
  }

  private update(dt: number): void {
    const turn = 1 - Math.exp((-dt / 1000) * TURN_RATE);
    this.turns.forEach((target, i) => {
      this.shown[i] += (target - this.shown[i]) * turn;
    });
    const g = this.game;
    this.flowShown +=
      (g.flow - this.flowShown) * (1 - Math.exp((-dt / 1000) * FLOW_RATE));
    const full = g.connected && this.flowShown > g.tiles.length - 0.3;
    this.tankFill += ((full ? 1 : 0) - this.tankFill) * (1 - Math.exp(-dt / 400));
  }

  private driveHero(now: number, dt: number): void {
    const hero = this.env.hero;
    hero.lookAt('right');
    if (this.game.done) {
      hero.drive(flourishPose(celebrateK(this.doneAt, now) ?? 0), dt);
      return;
    }
    const since = now - this.tapAt;
    if (since < 420) {
      hero.drive(swingPose(since), dt);
      return;
    }
    const breathe = Math.sin(now / 480);
    hero.drive(
      { ...IDLE_POSE, sy: 1 + 0.012 * breathe, dy: 0.2 * breathe },
      dt,
    );
  }

  // La placa con la cuadrícula de casillas.
  private drawPlate(c: CanvasRenderingContext2D): void {
    const g = PIPES_GRID;
    px(c, g.x - 8, g.y - 8, GRID_W + 16, GRID_H + 16, C.metalInk);
    px(c, g.x - 5, g.y - 5, GRID_W + 10, GRID_H + 10, C.metalDeep);
    px(c, g.x - 2, g.y - 2, GRID_W + 4, GRID_H + 4, C.wallLo);
    for (let i = 1; i < PIPES_COLS; i++) {
      px(c, g.x + i * PIPES_TILE - 1, g.y, PX, GRID_H, C.wall);
    }
    for (let i = 1; i < PIPES_ROWS; i++) {
      px(c, g.x, g.y + i * PIPES_TILE - 1, GRID_W, PX, C.wall);
    }
  }

  // La fuente a la izquierda y el tanque a la derecha, con su tubo corto
  // hasta la cuadrícula.
  private drawEnds(c: CanvasRenderingContext2D): void {
    const sy = PIPES_GRID.y + (this.game.startRow + 0.5) * PIPES_TILE;
    const ey = PIPES_GRID.y + (this.game.endRow + 0.5) * PIPES_TILE;
    this.stub(c, 40, PIPES_GRID.x, sy);
    this.stub(c, PIPES_GRID.x + GRID_W, PIPES_GRID.x + GRID_W + 26, ey);
    // Fuente: cisterna redonda con su llave.
    px(c, 6, sy - 24, 36, 48, C.metalInk);
    px(c, 8, sy - 22, 32, 44, C.metalDark);
    px(c, 11, sy - 20, 5, 40, C.metalMid);
    px(c, 8, sy - 22, 32, PX, C.metalHi);
    px(c, 14, sy - 8, 20, 14, C.water);
    px(c, 14, sy - 8, 20, PX, C.waterHi);
    // Tanque de destino.
    const tx = PIPES_GRID.x + GRID_W + 24;
    px(c, tx, ey - 30, 42, 60, C.metalInk);
    px(c, tx + 2, ey - 28, 38, 56, C.wallLo);
    px(c, tx + 5, ey - 26, 4, 50, C.waterHi);
    px(c, tx - 2, ey - 34, 46, 6, C.metalInk);
    px(c, tx, ey - 32, 42, 3, C.metalMid);
  }

  private stub(
    c: CanvasRenderingContext2D,
    x0: number,
    x1: number,
    y: number,
  ): void {
    pxLine(c, x0, y, x1, y, C.metalInk, 7);
    pxLine(c, x0, y, x1, y, C.metalMid, 5);
    pxLine(c, x0, y - 3, x1, y - 3, C.metalHi, 1);
  }

  // Los extremos de un tramo girado `turns` cuartos de vuelta.
  private ends(kind: PipeKind, turns: number, cx: number, cy: number) {
    const a = (turns * Math.PI) / 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return BASE_ENDS[kind].map(([x, y]) => ({
      x: cx + (x * cos - y * sin) * HALF,
      y: cy + (x * sin + y * cos) * HALF,
    }));
  }

  private drawPipes(ctx: CanvasRenderingContext2D): void {
    const g = this.game;
    const water = this.flowShown;
    g.tiles.forEach((t, i) => {
      const cx = PIPES_GRID.x + (t.col + 0.5) * PIPES_TILE;
      const cy = PIPES_GRID.y + (t.row + 0.5) * PIPES_TILE;
      const ends = this.ends(t.kind, this.shown[i], cx, cy);
      for (const e of ends) {
        pxLine(ctx, cx, cy, e.x, e.y, C.metalInk, 8);
      }
      pxDisc(ctx, cx, cy, 8, C.metalInk);
      for (const e of ends) {
        pxLine(ctx, cx, cy, e.x, e.y, C.metalMid, 6);
        pxLine(ctx, cx, cy - 2, e.x, e.y - 2, C.metalHi, 1);
      }
      pxDisc(ctx, cx, cy, 6, C.metalMid);
      if (water > i + 0.5) {
        for (const e of ends) {
          pxLine(ctx, cx, cy, e.x, e.y, WATER_DEEP, 4);
          pxLine(ctx, cx, cy, e.x, e.y, C.water, 2);
        }
        pxDisc(ctx, cx, cy, 3, C.water);
      }
    });
    // El agua que llegó al primer tramo mal puesto se queda en su borde.
    const stuck = g.tiles[g.flow];
    if (stuck && water >= g.flow - 0.2) {
      const x = PIPES_GRID.x + stuck.col * PIPES_TILE;
      const y = PIPES_GRID.y + (stuck.row + 0.5) * PIPES_TILE;
      const from = g.flow === 0 ? 'left' : this.entrySide(g.flow);
      const [bx, by] =
        from === 'left'
          ? [x, y]
          : from === 'top'
            ? [x + HALF, PIPES_GRID.y + stuck.row * PIPES_TILE]
            : [x + HALF, PIPES_GRID.y + (stuck.row + 1) * PIPES_TILE];
      pxDisc(ctx, bx, by, 6, WATER_DEEP);
      pxDisc(ctx, bx, by, 4, C.water);
    }
  }

  // Por qué lado de la cuadrícula entra el agua al tramo i (no es el
  // izquierdo, porque viene de otro tramo de otra fila).
  private entrySide(i: number): 'left' | 'top' | 'bottom' {
    const prev = this.game.tiles[i - 1];
    const cur = this.game.tiles[i];
    if (cur.col > prev.col) return 'left';
    return cur.row > prev.row ? 'top' : 'bottom';
  }

  // Goteo de la fuente: siempre hay agua esperando.
  private drawSource(ctx: CanvasRenderingContext2D, now: number): void {
    const sy = PIPES_GRID.y + (this.game.startRow + 0.5) * PIPES_TILE;
    if (this.env.calm) return;
    const t = (now / 600) % 1;
    px(ctx, 52, sy - 4 + t * 8, PX, PX * 2, C.waterHi);
  }

  private drawTank(ctx: CanvasRenderingContext2D): void {
    const ey = PIPES_GRID.y + (this.game.endRow + 0.5) * PIPES_TILE;
    const tx = PIPES_GRID.x + GRID_W + 24;
    const h = this.tankFill * 48;
    if (h < 1) return;
    px(ctx, tx + 5, ey + 24 - h, 32, h, C.water);
    px(ctx, tx + 5, ey + 24 - h, 32, PX, C.waterHi);
    px(ctx, tx + 7, ey + 26 - h, 4, Math.max(0, h - 4), C.waterHi);
  }

  private drawPuffs(ctx: CanvasRenderingContext2D, now: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      const k = (now - p.at) / 320;
      if (k >= 1) {
        this.puffs.splice(i, 1);
        continue;
      }
      if (this.env.calm) continue;
      ctx.globalAlpha = 1 - k;
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        px(ctx, p.x + dx * (6 + k * 12), p.y + dy * (6 + k * 12), PX * 2, PX * 2, C.waterHi);
      }
      ctx.globalAlpha = 1;
    }
  }

  // El tramo que sigue se marca con guiones; hasta el primer clic, la
  // mano lo señala desde abajo a la derecha.
  private drawHint(ctx: CanvasRenderingContext2D, now: number): void {
    const g = this.game;
    if (g.connected) return;
    const t = g.tiles[g.flow];
    const box = {
      x: PIPES_GRID.x + t.col * PIPES_TILE,
      y: PIPES_GRID.y + t.row * PIPES_TILE,
      w: PIPES_TILE,
      h: PIPES_TILE,
    };
    drawDropZone(ctx, box, now, this.env.calm, 'idle');
    if (this.touched) return;
    const press = this.env.calm ? 1 : 0.5 + 0.5 * Math.sin(now / 240);
    drawHand(ctx, box.x + box.w - 6, box.y + box.h - 2, press);
  }
}
