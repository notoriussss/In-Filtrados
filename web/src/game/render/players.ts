import type { PlayerView } from '@in-filtrados/messages';
import { SKIN_GOTA, skinOf } from '../../shop';
import { phaseOf } from './activityFx';
import {
  type PlayerAnimator,
  type PlayerPose,
  gotaCell,
} from './playerAnim';
import { motionIsReduced } from '../../settings';
import { drawJimena, drawJimenaGhost } from './jimenaDraw';
import { drawPosedSprite } from './spriteDraw';
import {
  GOTA_CELL_H,
  GOTA_CELL_W,
  accessoryLift,
  ghostCell,
  ghostCellIndex,
  gotaAccessoryImage,
  gotaBodyImage,
  gotaGhostImage,
  jimenaGhostImage,
  spriteImageOrFront,
} from './sprites';
import { drawDust, drawSparkles, drawSweat } from './workFx';
import { IDLE_POSE, type Pose } from './workPose';

// Jugadores con los sprites modulares Gota (cuerpos y accesorios del paquete v3)
// en unidades del mundo. Cada celda (40 × 56) se dibuja con los pies en
// y + FEET para que la profundidad (y + 6) coincida con los props del mapa.
export const PLAYER_W = GOTA_CELL_W;
export const PLAYER_H = GOTA_CELL_H;
const FEET = 8; // los pies quedan en y + FEET
const PLAYER_RADIUS = 16;
const DISCONNECTED_ALPHA = 0.4;
const GHOST_ALPHA = 0.8; // las hojas de fantasma ya son pálidas
const GHOST_FLOAT = 3;
const WORK_BOB = 1.5;
const SHADOW = 'rgba(2, 8, 20, 0.45)';
// La transición a fantasma (ASCEND_MS en playerAnim.ts): cuánto sube el
// cuerpo, y los colores de las ondas y de las lucecitas que se escapan.
const ASCEND_RISE = 12;
const RIPPLE = '#7ee6d8';
const SOUL = '#bff6ee';
const WISPS = 6;

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1);
// smooth: 0 hasta a, 1 desde b, suave en medio.
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// depthOf: línea de base para ordenar con los props (baseY = y + 6).
export function depthOf(p: { y: number }): number {
  return p.y + 6;
}

// topOf: dónde termina la cabeza (para poner la etiqueta del nombre).
export function topOf(p: PlayerView): number {
  const lift = skinOf(p.skin) === SKIN_GOTA ? 0 : accessoryLift(p.accessory);
  return p.y + FEET - PLAYER_H - lift - (p.alive ? 0 : GHOST_FLOAT * 2);
}

// Hacia dónde mira cada fantasma (true: derecha); sigue mirando igual
// cuando se detiene o sube y baja.
const ghostFacing = new Map<string, boolean>();

// bodyOf elige cómo se mueve el cuerpo: la pose de la tarea o, con
// movimiento reducido, solo el rebote suave de antes.
function bodyOf(pose: PlayerPose, now: number, calm: boolean): Pose {
  if (!calm) return pose.body;
  const bob = pose.working ? Math.abs(Math.sin(now / 120)) * WORK_BOB : 0;
  return { ...IDLE_POSE, frame: pose.frame, dy: -bob };
}

// paintSprite dibuja al personaje del jugador (Jimena o gota con su
// accesorio) con su cuadro y pose sobre target; sirve a vivos y a
// fantasmas. Mientras carga, un círculo.
function paintSprite(
  target: CanvasRenderingContext2D,
  p: PlayerView,
  pose: PlayerPose,
  body: Pose,
  now: number,
): void {
  const feetY = p.y + FEET;
  const cell = gotaCell(pose, now);
  const srcRect = {
    sx: cell.col * GOTA_CELL_W,
    sy: 0,
    sw: GOTA_CELL_W,
    sh: GOTA_CELL_H,
  };

  // Jimena de inicio; la gota solo si el jugador la compró (match lo valida).
  const isGota = skinOf(p.skin) === SKIN_GOTA;
  const bodyImg = isGota ? gotaBodyImage(p.color) : null;
  const accImg = isGota ? gotaAccessoryImage(p.accessory) : null;
  const box = { x: p.x, feetY, w: PLAYER_W, h: PLAYER_H };

  if (bodyImg) {
    drawPosedSprite(target, bodyImg, box, body, srcRect, cell.flip);
    if (accImg) {
      drawPosedSprite(target, accImg, box, body, srcRect, cell.flip);
    }
    return;
  }
  const jimenaImg = spriteImageOrFront(p.color, body.frame);
  if (jimenaImg) {
    drawJimena(target, jimenaImg, body.frame, box, body, p.color, p.accessory);
  } else {
    target.fillStyle = p.color;
    target.beginPath();
    target.arc(p.x, p.y + body.dy, PLAYER_RADIUS, 0, Math.PI * 2);
    target.fill();
  }
}

// drawGhostPlayer dibuja al jugador muerto: su mismo personaje como
// fantasma (hojas de web/tools/gen_ghost_sprites.py), con la cola
// ondeando y flotando. Mira hacia donde fue por última vez.
function drawGhostPlayer(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  pose: PlayerPose,
  now: number,
  calm: boolean,
  fade = 1,
  rise = 0,
): void {
  if (pose.heading === 'right') ghostFacing.set(p.id, true);
  else if (pose.heading === 'left') ghostFacing.set(p.id, false);
  const t = now + phaseOf(p.id);
  const float = calm
    ? GHOST_FLOAT
    : GHOST_FLOAT + Math.sin(t / 400) * GHOST_FLOAT;
  const body: Pose = { ...IDLE_POSE, dy: -float - rise };
  const index = ghostCellIndex(t, ghostFacing.get(p.id) ?? false, calm);
  const feetY = p.y + FEET;
  const box = { x: p.x, feetY, w: PLAYER_W, h: PLAYER_H };
  const alpha = (p.connected ? GHOST_ALPHA : DISCONNECTED_ALPHA) * fade;

  ctx.globalAlpha = alpha * 0.4;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(p.x, feetY - 1, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha;
  if (skinOf(p.skin) === SKIN_GOTA) {
    const sheet = gotaGhostImage(p.color);
    if (sheet) {
      const cell = ghostCell(index, GOTA_CELL_W, GOTA_CELL_H);
      drawPosedSprite(ctx, sheet, box, body, cell);
      const acc = gotaAccessoryImage(p.accessory);
      const front = ghostCell(0, GOTA_CELL_W, GOTA_CELL_H);
      if (acc) drawPosedSprite(ctx, acc, box, body, front);
    }
  } else {
    const sheet = jimenaGhostImage(p.color, p.accessory);
    if (sheet) drawJimenaGhost(ctx, sheet, box, body, index);
  }
  ctx.globalAlpha = 1;
}

// drawAscension dibuja el momento en que un jugador se vuelve fantasma
// (k de 0 a 1): se sacude y destella, el cuerpo se eleva mientras su
// sprite vivo se desvanece en el del fantasma, y salen ondas al suelo y
// lucecitas hacia arriba. Con movimiento reducido solo se funde.
function drawAscension(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  pose: PlayerPose,
  now: number,
  calm: boolean,
  k: number,
): void {
  const feetY = p.y + FEET;
  const living = 1 - smooth(0.25, 0.7, k);
  const ghost = smooth(0.3, 0.85, k);
  const flinch = calm ? 0 : clamp01(1 - k / 0.25);
  const rise = calm
    ? 0
    : ASCEND_RISE * Math.sin(Math.PI * clamp01((k - 0.2) / 0.8));
  const base = bodyOf(pose, now, calm);
  const body: Pose = {
    ...base,
    sy: base.sy * (1 - 0.1 * flinch),
    dx: base.dx + Math.sin(k * 90) * 1.4 * flinch,
    dy: base.dy - rise,
  };
  const online = p.connected ? 1 : DISCONNECTED_ALPHA;

  if (!calm) drawRipples(ctx, p.x, feetY, k);

  if (living > 0) {
    ctx.globalAlpha = living * online;
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(p.x, feetY - 1, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = living * online;
    paintSprite(ctx, p, pose, body, now);
    // Destello: el mismo sprite sumado a sí mismo aclara el color.
    if (flinch > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flinch * 0.85 * online;
      paintSprite(ctx, p, pose, body, now);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
  drawGhostPlayer(ctx, p, pose, now, calm, ghost, rise);
  if (!calm) drawWisps(ctx, p, feetY, k);
  ctx.globalAlpha = 1;
}

// Dos ondas que se abren en el suelo, una detrás de la otra.
function drawRipples(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  k: number,
): void {
  ctx.strokeStyle = RIPPLE;
  ctx.lineWidth = 1.5;
  for (const delay of [0, 0.22]) {
    const t = clamp01((k - delay) / 0.7);
    if (t <= 0 || t >= 1) continue;
    ctx.globalAlpha = (1 - t) * 0.75;
    ctx.beginPath();
    ctx.ellipse(x, feetY - 1, 6 + t * 28, 2 + t * 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Lucecitas que se desprenden del cuerpo y suben ondulando.
function drawWisps(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  feetY: number,
  k: number,
): void {
  ctx.fillStyle = SOUL;
  for (let i = 0; i < WISPS; i++) {
    const t = clamp01((k - i * 0.07) / 0.6);
    if (t <= 0 || t >= 1) continue;
    const x = p.x + Math.sin(i * 2.1 + t * 5) * (5 + i * 1.5);
    const y = feetY - PLAYER_H * 0.35 - t * 34;
    ctx.globalAlpha = Math.sin(Math.PI * t);
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.globalAlpha = 1;
}

// drawPlayer dibuja un jugador: sombra y personaje con su cuadro y pose
// (PlayerAnimator); el muerto va por drawGhostPlayer.
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  animator: PlayerAnimator,
  now: number,
): void {
  const pose = animator.pose(p, now);
  const calm = motionIsReduced();
  if (!p.alive) {
    if (pose.ascend != null) {
      drawAscension(ctx, p, pose, now, calm, pose.ascend);
    } else {
      drawGhostPlayer(ctx, p, pose, now, calm);
    }
    return;
  }
  const body = bodyOf(pose, now, calm);

  ctx.globalAlpha = p.connected ? 1 : DISCONNECTED_ALPHA;
  ctx.fillStyle = SHADOW;
  ctx.beginPath();
  ctx.ellipse(
    p.x + body.dx,
    p.y + FEET - 1,
    13 * body.shadow,
    4 * body.shadow,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  paintSprite(ctx, p, pose, body, now);

  ctx.globalAlpha = 1;
  if (calm || !p.connected) return;
  drawBodyFx(ctx, p, pose, body, now);
}

// drawBodyFx dibuja lo que sale del cuerpo: sudor, polvo y estrellas.
function drawBodyFx(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  pose: PlayerPose,
  body: Pose,
  now: number,
): void {
  const feetY = p.y + FEET;
  const headY = feetY - PLAYER_H * body.sy + body.dy;
  const t = now + phaseOf(p.id);
  drawSweat(ctx, p.x + body.dx + body.lean, headY, t, body.strain);
  if (body.dust !== null) drawDust(ctx, p.x, feetY, body.dust);
  if (pose.celebrate !== null) {
    drawSparkles(ctx, p.x, feetY - PLAYER_H * 0.55, pose.celebrate);
  }
}
