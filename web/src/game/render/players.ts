import type { PlayerView } from '@in-filtrados/messages';
import type { PlayerAnimator } from './playerAnim';
import { SPRITE_H, SPRITE_W, spriteImage } from './sprites';

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

// drawPlayer dibuja un jugador: sombra, sprite con su cuadro de la
// animación (ya calculado por PlayerAnimator) y, si es fantasma,
// flotando y transparente. Mientras el sprite carga, un círculo.
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  p: PlayerView,
  animator: PlayerAnimator,
  now: number,
): void {
  const pose = animator.pose(p, now);
  const ghost = !p.alive;
  let alpha = 1;
  if (!p.connected) alpha = DISCONNECTED_ALPHA;
  else if (ghost) alpha = GHOST_ALPHA;
  let lift = 0;
  if (ghost) lift = GHOST_FLOAT + Math.sin(now / 400) * GHOST_FLOAT;
  else if (p.activity) lift = Math.abs(Math.sin(now / 120)) * WORK_BOB;
  const feetY = p.y + FEET;

  ctx.globalAlpha = alpha;
  if (!ghost) {
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(p.x, feetY - 1, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const img = spriteImage(p.color, ghost ? 'front' : pose.frame);
  const top = feetY - PLAYER_H - lift;
  if (img) {
    ctx.drawImage(img, p.x - PLAYER_W / 2, top, PLAYER_W, PLAYER_H);
  } else {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - lift, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
