import type { PlayerView } from '@in-filtrados/messages';
import { SKIN_GOTA, skinOf } from '../../shop';
import { phaseOf } from './activityFx';
import {
  type PlayerAnimator,
  type PlayerPose,
  gotaCell,
} from './playerAnim';
import { motionIsReduced } from '../../settings';
import { drawJimena } from './jimenaDraw';
import { drawPosedSprite } from './spriteDraw';
import {
  GOTA_CELL_H,
  GOTA_CELL_W,
  accessoryLift,
  gotaAccessoryImage,
  gotaBodyImage,
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
const GHOST_ALPHA = 0.62;
const GHOST_FLOAT = 3;
const WORK_BOB = 1.5;
const SHADOW = 'rgba(2, 8, 20, 0.45)';

// depthOf: línea de base para ordenar con los props (baseY = y + 6).
export function depthOf(p: { y: number }): number {
  return p.y + 6;
}

// topOf: dónde termina la cabeza (para poner la etiqueta del nombre).
export function topOf(p: PlayerView): number {
  const lift = skinOf(p.skin) === SKIN_GOTA ? 0 : accessoryLift(p.accessory);
  return p.y + FEET - PLAYER_H - lift - (p.alive ? 0 : GHOST_FLOAT * 2);
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

// drawPlayer dibuja un jugador: sombra, sprite gota (cuerpo y accesorio)
// con su cuadro y pose (PlayerAnimator) y, si es fantasma, flotando y
// transparente con la fila 1 de la hoja. Mientras carga, un círculo.
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

  const cell = gotaCell(pose, now);
  const row = ghost ? 1 : 0;
  const srcRect = {
    sx: cell.col * GOTA_CELL_W,
    sy: row * GOTA_CELL_H,
    sw: GOTA_CELL_W,
    sh: GOTA_CELL_H,
  };

  // Jimena de inicio; la gota solo si el jugador la compró (match lo valida).
  const isGota = skinOf(p.skin) === SKIN_GOTA;
  const bodyImg = isGota ? gotaBodyImage(p.color) : null;
  const accImg = isGota ? gotaAccessoryImage(p.accessory) : null;

  if (bodyImg) {
    const box = { x: p.x, feetY, w: PLAYER_W, h: PLAYER_H };
    drawPosedSprite(ctx, bodyImg, box, body, srcRect, cell.flip);
    if (accImg) {
      drawPosedSprite(ctx, accImg, box, body, srcRect, cell.flip);
    }
  } else {
    const frame = ghost ? 'front' : body.frame;
    const jimenaImg = spriteImageOrFront(p.color, frame);
    if (jimenaImg) {
      const box = { x: p.x, feetY, w: PLAYER_W, h: PLAYER_H };
      drawJimena(
        ctx,
        jimenaImg,
        frame,
        box,
        body,
        p.color,
        p.accessory,
      );
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y + body.dy, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
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
