import type { StationType } from '../map';
import { STATION_COLORS } from '../canvas/renderMap';
import { TASK_TEXT } from '../constants';
import {
  BOARD,
  BUCKET_SIZE,
  BucketsGame,
  type Minigame,
  PARTICLE_RADIUS,
  ParticlesGame,
  REUSE_TANK,
  VALVE_RADIUS,
  ValveGame,
  createMinigame,
} from './minigames';

// S2-11: panel del minijuego encima del canvas. La lógica está en
// minigames.ts; aquí solo se dibuja y se traducen los clics. No hay
// instrucciones escritas: una mano animada señala qué hacer.

export type MinigameView = {
  destroy(): void;
};

type Options = {
  onComplete: () => void; // una sola vez, al terminar
  onClose: () => void; // el jugador lo cerró
};

const SCALE = 1.6; // píxeles del canvas por unidad del tablero
const HAND = '👆';
const HAND_FONT = '34px system-ui, sans-serif';
const DONE_FONT = 'bold 34px system-ui, sans-serif';
const WATER = '#3d85c6';
const GREY_WATER = '#8a9aa6';
const DIRT = '#7a5230';
const PIPE = '#6b7280';
const BOARD_BG = '#18242c';
const HINT_COLOR = '#ffd166';
const DONE_COLOR = '#22c55e';

export function mountMinigame(
  root: HTMLElement,
  type: StationType,
  opts: Options,
): MinigameView {
  const game = createMinigame(type);
  root.innerHTML = `
    <div class="minigame-panel">
      <header class="minigame-header">
        <span class="task-dot" data-ref="dot"></span>
        <h3 data-ref="title"></h3>
        <button class="minigame-close" data-ref="close"
          aria-label="${TASK_TEXT.CLOSE}">✕</button>
      </header>
      <canvas class="minigame-canvas" data-ref="canvas"></canvas>
      <div class="minigame-progress">
        <div class="minigame-progress-fill" data-ref="fill"></div>
      </div>
    </div>
  `;
  const ref = <T extends HTMLElement>(name: string): T =>
    root.querySelector<T>(`[data-ref="${name}"]`)!;
  ref('title').textContent = TASK_TEXT.GAME_TITLES[type];
  ref('dot').style.background = STATION_COLORS[type];
  const fill = ref('fill');
  const canvas = ref<HTMLCanvasElement>('canvas');
  canvas.width = BOARD.w * SCALE;
  canvas.height = BOARD.h * SCALE;
  const ctx = canvas.getContext('2d')!;
  root.hidden = false;

  const toBoard = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * BOARD.w) / rect.width,
      y: ((e.clientY - rect.top) * BOARD.h) / rect.height,
    };
  };
  const onDown = (e: PointerEvent) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    game.pointerDown(toBoard(e));
  };
  const onMove = (e: PointerEvent) => game.pointerMove(toBoard(e));
  const onUp = () => game.pointerUp();
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  ref('close').addEventListener('click', () => opts.onClose());

  let completed = false;
  let last = performance.now();
  let frame = 0;
  const loop = (now: number) => {
    game.step(Math.min(now - last, 100));
    last = now;
    draw(ctx, game, now);
    fill.style.width = `${Math.round(game.progress() * 100)}%`;
    if (game.done && !completed) {
      completed = true;
      opts.onComplete();
    }
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(frame);
      root.hidden = true;
      root.replaceChildren();
    },
  };
}

function draw(
  ctx: CanvasRenderingContext2D,
  game: Minigame,
  now: number,
): void {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = BOARD_BG;
  ctx.fillRect(0, 0, BOARD.w, BOARD.h);
  if (game instanceof ValveGame) drawValve(ctx, game, now);
  else if (game instanceof BucketsGame) drawBuckets(ctx, game, now);
  else if (game instanceof ParticlesGame) drawParticles(ctx, game, now);
  if (game.done) drawDone(ctx);
}

// Reducir: tubo con una fuga a la derecha y la válvula a la izquierda.
// Mientras más llena la barra, menos gotea.
function drawValve(
  ctx: CanvasRenderingContext2D,
  game: ValveGame,
  now: number,
): void {
  const { x, y } = game.center;
  ctx.fillStyle = PIPE;
  ctx.fillRect(0, y - 14, 300, 28);

  // Gotas que caen de la punta del tubo.
  const flow = 1 - game.fill;
  ctx.fillStyle = WATER;
  for (let i = 0; i < 4; i++) {
    const t = ((now / 500 + i / 4) % 1);
    const r = 4 + 4 * flow;
    if (flow <= 0.02) break;
    ctx.globalAlpha = flow;
    ctx.beginPath();
    ctx.arc(310, y + 10 + t * 110, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const pool = 18 * flow + 4;
  ctx.fillRect(280, BOARD.h - pool, 70, pool);

  // Progreso alrededor de la válvula.
  ctx.beginPath();
  ctx.arc(
    x,
    y,
    VALVE_RADIUS + 8,
    -Math.PI / 2,
    -Math.PI / 2 + game.fill * Math.PI * 2,
  );
  ctx.strokeStyle = DONE_COLOR;
  ctx.lineWidth = 6;
  ctx.stroke();

  // Volante con 4 rayos que gira.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(game.angle);
  ctx.strokeStyle = '#e07a5f';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, VALVE_RADIUS - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 6;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos(a) * (VALVE_RADIUS - 6),
      Math.sin(a) * (VALVE_RADIUS - 6),
    );
    ctx.stroke();
  }
  ctx.fillStyle = '#e07a5f';
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!game.holding && !game.done) {
    // Mano que "presiona" la válvula: sube y baja.
    const press = Math.abs(Math.sin(now / 250)) * 8;
    drawHand(ctx, x + 6, y + 18 + press);
    drawRing(ctx, x, y, VALVE_RADIUS + 14, now);
  }
}

// Reutilizar: cubetas de agua gris a la izquierda y el tanque a la
// derecha, que se llena con cada cubeta.
function drawBuckets(
  ctx: CanvasRenderingContext2D,
  game: BucketsGame,
  now: number,
): void {
  const t = REUSE_TANK;
  const level = (t.h - 8) * game.progress();
  ctx.fillStyle = GREY_WATER;
  ctx.fillRect(t.x + 4, t.y + t.h - 4 - level, t.w - 8, level);
  ctx.strokeStyle = '#d0d7de';
  ctx.lineWidth = 4;
  ctx.strokeRect(t.x, t.y, t.w, t.h);

  const next = game.buckets.find((b) => !b.inTank);
  if (next && game.dragging === null && !game.done) {
    // Flecha punteada de la cubeta al tanque y una mano que la recorre.
    const sx = next.x + BUCKET_SIZE;
    const sy = next.y + BUCKET_SIZE / 2;
    const ex = t.x + t.w / 2;
    const ey = t.y + t.h / 2;
    ctx.setLineDash([8, 8]);
    ctx.lineDashOffset = -now / 40;
    ctx.strokeStyle = HINT_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    const k = (now % 1400) / 1400;
    drawHand(ctx, sx - 20 + (ex - sx + 20) * k, sy + 14 + (ey - sy) * k);
  }

  for (const b of game.buckets) {
    if (b.inTank) continue;
    drawBucket(ctx, b.x, b.y);
  }
  if (game.dragging !== null) {
    const b = game.buckets[game.dragging];
    drawBucket(ctx, b.x, b.y); // la que se arrastra va encima
  }
}

function drawBucket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  const s = BUCKET_SIZE;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 8);
  ctx.lineTo(x + s - 4, y + 8);
  ctx.lineTo(x + s - 10, y + s);
  ctx.lineTo(x + 10, y + s);
  ctx.closePath();
  ctx.fillStyle = '#9ca3af';
  ctx.fill();
  ctx.fillStyle = GREY_WATER;
  ctx.fillRect(x + 7, y + 10, s - 14, 8);
  ctx.beginPath();
  ctx.arc(x + s / 2, y + 8, s / 2 - 6, Math.PI, 0);
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth = 3;
  ctx.stroke();
}

// Reciclar: agua con partículas de suciedad que flotan.
function drawParticles(
  ctx: CanvasRenderingContext2D,
  game: ParticlesGame,
  now: number,
): void {
  const clean = game.progress();
  ctx.fillStyle = mix('#6b5b3e', WATER, clean);
  ctx.fillRect(0, 40, BOARD.w, BOARD.h - 40);
  ctx.fillStyle = '#ffffff22';
  for (let i = 0; i < 6; i++) {
    const wx = ((now / 30 + i * 70) % (BOARD.w + 60)) - 30;
    ctx.fillRect(wx, 48 + i * 34, 30, 3);
  }

  let first = true;
  for (const p of game.particles) {
    if (p.removed) continue;
    const pos = game.positionOf(p);
    ctx.fillStyle = DIRT;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, PARTICLE_RADIUS, 0, Math.PI * 2);
    ctx.arc(pos.x + 7, pos.y - 4, PARTICLE_RADIUS * 0.6, 0, Math.PI * 2);
    ctx.fill();
    drawRing(ctx, pos.x, pos.y, PARTICLE_RADIUS + 8, now);
    if (first) {
      const tap = Math.abs(Math.sin(now / 250)) * 6;
      drawHand(ctx, pos.x + 4, pos.y + 16 + tap);
      first = false;
    }
  }
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.font = HAND_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(HAND, x, y);
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  now: number,
): void {
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 200);
  ctx.strokeStyle = HINT_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawDone(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, BOARD.w, BOARD.h);
  ctx.beginPath();
  ctx.arc(BOARD.w / 2, BOARD.h / 2 - 16, 34, 0, Math.PI * 2);
  ctx.fillStyle = DONE_COLOR;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(BOARD.w / 2 - 16, BOARD.h / 2 - 16);
  ctx.lineTo(BOARD.w / 2 - 4, BOARD.h / 2 - 4);
  ctx.lineTo(BOARD.w / 2 + 18, BOARD.h / 2 - 30);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.font = DONE_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(TASK_TEXT.DONE, BOARD.w / 2, BOARD.h / 2 + 26);
}

// mix mezcla dos colores #rrggbb; k = 0 da a, k = 1 da b.
function mix(a: string, b: string, k: number): string {
  const ch = (c: string, i: number) =>
    parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
}
