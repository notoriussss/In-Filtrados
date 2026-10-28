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
): void {
  if (pose.heading === 'right') ghostFacing.set(p.id, true);
  else if (pose.heading === 'left') ghostFacing.set(p.id, false);
  const t = now + phaseOf(p.id);
  const float = calm
    ? GHOST_FLOAT
    : GHOST_FLOAT + Math.sin(t / 400) * GHOST_FLOAT;
  const body: Pose = { ...IDLE_POSE, dy: -float };
  const index = ghostCellIndex(t, ghostFacing.get(p.id) ?? false, calm);
  const feetY = p.y + FEET;
  const box = { x: p.x, feetY, w: PLAYER_W, h: PLAYER_H };
  const alpha = p.connected ? GHOST_ALPHA : DISCONNECTED_ALPHA;

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
    drawGhostPlayer(ctx, p, pose, now, calm);
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
