import type { OilDrop } from '@in-filtrados/messages';
import { type Camera, worldToScreen } from './camera';

const OIL_DROP_RADIUS = 7;
// Borde oscuro: la gota se ve aunque el piso sea de su mismo color.
const OIL_DROP_OUTLINE = 'rgba(0, 0, 0, 0.75)';
const OIL_DROP_OUTLINE_WIDTH = 2;
// Igual que oilDropLifeTicks en match: cada gota dura 15 s (S2-12).
export const OIL_DROP_LIFE_TICKS = 300;

// oilDropAlpha va de 1 (recién caída) a 0 (vencida).
export function oilDropAlpha(expiresAtTick: number, tick: number): number {
  const left = (expiresAtTick - tick) / OIL_DROP_LIFE_TICKS;
  return Math.min(Math.max(left, 0), 1);
}

// renderOilDrops dibuja el rastro del impostor con su color, cada gota
// más transparente a medida que se acerca a su vencimiento (S2-12).
export function renderOilDrops(
  ctx: CanvasRenderingContext2D,
  drops: OilDrop[],
  camera: Camera,
  tick: number,
): void {
  for (const d of drops) {
    const alpha = oilDropAlpha(d.expiresAtTick, tick);
    if (alpha === 0) continue;
    const s = worldToScreen(camera, d.x, d.y);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(s.x, s.y, OIL_DROP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.lineWidth = OIL_DROP_OUTLINE_WIDTH;
    ctx.strokeStyle = OIL_DROP_OUTLINE;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
