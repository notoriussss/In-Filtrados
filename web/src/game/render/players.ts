import type { PlayerView } from '@in-filtrados/messages';
import { phaseOf } from './activityFx';
import type { PlayerAnimator, PlayerPose } from './playerAnim';
import { motionIsReduced } from '../../settings';
import { drawPosedSprite } from './spriteDraw';
import { SPRITE_H, SPRITE_W, spriteImageOrFront } from './sprites';
import { drawDust, drawSparkles, drawSweat } from './workFx';
import { IDLE_POSE, type Pose } from './workPose';

// Jugadores con los sprites de Jimena, en unidades del mundo. Cada
// sprite (88 × 125) se dibuja de 40 de ancho, como las celdas de 40 × 56
// del paquete v3, con los pies un poco por debajo de (x, y) para que el
// orden por profundidad (y + 6) coincida con los props del mapa.
export const PLAYER_W = 40;
export const PLAYER_H = (SPRITE_H * PLAYER_W) / SPRITE_W;
const FEET = 8; // los pies quedan en y + FEET
const PLAYER_RADIUS = 16;
const DISCONNECTED_ALPHA = 0.4;
const GHOST_ALPHA = 0.55;
const GHOST_FLOAT = 3;
const WORK_BOB = 1.5;
const SHADOW = 'rgba(2, 8, 20, 0.45)';

// depthOf: línea de base para ordenar con los props (baseY = y + 6).
export function depthOf(p: { y: number }): number {
  return p.y + 6;
}

// topOf: dónde termina la cabeza (para poner la etiqueta del nombre).
export function topOf(p: PlayerView): number {
  return p.y + FEET - PLAYER_H - (p.alive ? 0 : GHOST_FLOAT * 2);
}

// bodyOf elige cómo se mueve el cuerpo: fantasma flotando, la pose de
// la tarea o, con movimiento reducido, solo el rebote suave de antes.
function bodyOf(
  p: PlayerView,
  pose: PlayerPose,
  now: number,
  calm: boolean,
): Pose {
  if (!p.alive) {
    const float = GHOST_FLOAT + Math.sin(now / 400) * GHOST_FLOAT;
    return { ...IDLE_POSE, dy: -float };
  }
  if (!calm) return pose.body;
  const bob = pose.working ? Math.abs(Math.sin(now / 120)) * WORK_BOB : 0;
  return { ...IDLE_POSE, frame: pose.frame, dy: -bob };
}

// drawPlayer dibuja un jugador: sombra, sprite con su cuadro y su pose
// (PlayerAnimator) y, si es fantasma, flotando y transparente. Mientras
// el sprite carga, un círculo.
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  animator: PlayerAnimator,
  now: number,
): void {
  const pose = animator.pose(p, now);
  const ghost = !p.alive;
  const calm = motionIsReduced();
  const body = bodyOf(p, pose, now, calm);
  let alpha = 1;
  if (!p.connected) alpha = DISCONNECTED_ALPHA;
  else if (ghost) alpha = GHOST_ALPHA;
  const feetY = p.y + FEET;

  ctx.globalAlpha = alpha;
  if (!ghost) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(
      p.x + body.dx,
      feetY - 1,
      13 * body.shadow,
      4 * body.shadow,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  const img = spriteImageOrFront(p.color, ghost ? 'front' : body.frame);
  if (img) {
    const box = { x: p.x, feetY, w: PLAYER_W, h: PLAYER_H };
    drawPosedSprite(ctx, img, box, body);
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y + body.dy, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (ghost || calm || !p.connected) return;
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
