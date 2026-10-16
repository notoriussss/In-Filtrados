import type { PlayerView, Snapshot } from '@in-filtrados/messages';
import { type Camera, worldToScreen } from './camera';
import { GAME_RULES } from '../constants';

// S3-05: visión limitada. Cada jugador vivo ve un círculo de 300
// unidades a su alrededor (la mitad con vapor en la planta); fuera del
// círculo el mapa queda a oscuras y no se dibuja a nadie. Los fantasmas
// ven todo. Solo cambia lo que se dibuja: match sigue mandando todo.

// visionRadius devuelve el radio de visión, o null si no hay límite
// (fantasma, sala de espera, reunión o fin de partida).
export function visionRadius(
  snap: Snapshot | null,
  me: PlayerView | undefined,
): number | null {
  if (!snap || !me || snap.phase !== 'PLAYING' || !me.alive) return null;
  if (snap.emergency?.kind === 'steam') {
    return GAME_RULES.VISION_RADIUS * GAME_RULES.STEAM_VISION_FACTOR;
  }
  return GAME_RULES.VISION_RADIUS;
}

// canSee: el punto queda dentro del círculo de visión.
export function canSee(
  me: { x: number; y: number },
  x: number,
  y: number,
  radius: number | null,
): boolean {
  if (radius === null) return true;
  return Math.hypot(x - me.x, y - me.y) <= radius;
}

// visiblePlayer decide si se dibuja a p: uno mismo siempre; los vivos
// no ven a los fantasmas; y nadie fuera del círculo de visión.
export function visiblePlayer(
  viewer: PlayerView | undefined,
  p: PlayerView,
  radius: number | null,
): boolean {
  if (!viewer || p.id === viewer.id) return true;
  if (viewer.alive && !p.alive) return false;
  return canSee(viewer, p.x, p.y, radius);
}

// renderDarkness oscurece todo fuera del círculo, con un borde suave.
// Sin radio (fantasmas) deja una noche leve para que se vea igual.
export function renderDarkness(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  center: { x: number; y: number } | undefined,
  radius: number | null,
  shown: number | null = radius,
): void {
  if (radius === null || !center || shown === null) {
    ctx.fillStyle = 'rgba(5, 10, 25, 0.18)';
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);
    return;
  }
  const s = worldToScreen(camera, center.x, center.y);
  const inner = Math.max(shown - GAME_RULES.VISION_EDGE, 0);
  const g = ctx.createRadialGradient(s.x, s.y, inner, s.x, s.y, shown);
  g.addColorStop(0, 'rgba(4, 8, 20, 0)');
  g.addColorStop(1, 'rgba(4, 8, 20, 0.93)');
  ctx.beginPath();
  ctx.rect(0, 0, camera.viewWidth, camera.viewHeight);
  ctx.arc(s.x, s.y, shown, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(4, 8, 20, 0.93)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(s.x, s.y, shown, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
}

// approach acerca el radio dibujado al real poco a poco, para que el
// vapor cierre y abra la visión con una transición y no de golpe.
export function approach(
  current: number | null,
  target: number | null,
  dtMs: number,
): number | null {
  if (target === null) return null;
  if (current === null) return target;
  const step = (GAME_RULES.VISION_SPEED * dtMs) / 1000;
  if (Math.abs(target - current) <= step) return target;
  return current + Math.sign(target - current) * step;
}
