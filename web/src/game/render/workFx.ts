import { easeOut } from './workPose';

// Detalles de cuerpo mientras trabaja: gotas de sudor, polvo al pisar y
// las estrellas del brinco de alegría. Son cuadritos de píxel, como el
// resto del mapa, en unidades del mundo.

const SWEAT = '#bdeaff';
const DUST = '#d6e2ee';
const STAR = '#ffd166';
const STAR_CORE = '#ffffff';
const SWEAT_FROM = 0.3; // por debajo de este esfuerzo no suda
const SWEAT_DROPS = 3;

function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  ctx.fillRect(Math.round(x), Math.round(y), size, size);
}

// drawSweat lanza gotas desde la sien en arco, hacia los lados.
export function drawSweat(
  ctx: CanvasRenderingContext2D,
  x: number,
  headY: number,
  t: number,
  strain: number,
): void {
  if (strain < SWEAT_FROM) return;
  ctx.fillStyle = SWEAT;
  for (let i = 0; i < SWEAT_DROPS; i++) {
    const k = (t / 520 + i / SWEAT_DROPS) % 1;
    const side = i % 2 === 0 ? 1 : -1;
    ctx.globalAlpha = (1 - k) * Math.min(1, strain * 1.4);
    const px = x + side * (9 + k * 9);
    const py = headY + 8 - Math.sin(k * Math.PI) * 9 + k * k * 14;
    dot(ctx, px, py, 2);
    dot(ctx, px, py + 2, 1);
  }
  ctx.globalAlpha = 1;
}

// drawDust levanta dos nubecitas a los lados de los pies; k va de 0 a 1.
export function drawDust(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  k: number,
): void {
  ctx.fillStyle = DUST;
  ctx.globalAlpha = (1 - k) * 0.85;
  const rise = easeOut(k);
  const size = Math.max(1, Math.round(4 - 3 * k));
  for (const side of [-1, 1]) {
    dot(ctx, x + side * (7 + rise * 11), feetY - 2 - rise * 5, size);
    dot(ctx, x + side * (4 + rise * 6), feetY - 1 - rise * 2, size);
  }
  ctx.globalAlpha = 1;
}

// drawSparkles rodea al jugador de estrellas que se abren y se apagan;
// k va de 0 a 1 durante el brinco de alegría.
export function drawSparkles(
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
  k: number,
): void {
  const reach = 18 + 22 * easeOut(k);
  ctx.globalAlpha = Math.max(0, 1 - k * k);
  const stars = 6;
  for (let i = 0; i < stars; i++) {
    const a = (i / stars) * Math.PI * 2 + 0.4;
    const sx = x + Math.cos(a) * reach;
    const sy = centerY + Math.sin(a) * reach * 0.8 - k * 6;
    const arm = k < 0.5 ? 3 : 2;
    ctx.fillStyle = i % 2 === 0 ? STAR : STAR_CORE;
    dot(ctx, sx - arm - 1, sy, 2);
    dot(ctx, sx + arm, sy, 2);
    dot(ctx, sx, sy - arm - 1, 2);
    dot(ctx, sx, sy + arm, 2);
    dot(ctx, sx, sy, 2);
  }
  ctx.globalAlpha = 1;
}
