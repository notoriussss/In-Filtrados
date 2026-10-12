import type { PlayerView, TankView } from '@in-filtrados/messages';
import type { Tank } from '../map';
import { type Camera, worldToScreen } from './camera';

const CLEAN = [76, 175, 80]; // verde rgb(76, 175, 80)
const DIRTY = [121, 85, 72]; // café rgb(121, 85, 72)
const DEAD_TANK_COLOR = '#8a8f94';
const TANK_BORDER = '#333a40';
const TANK_RADIUS = 18;
const BAR_WIDTH = 40;
const BAR_HEIGHT = 6;
const BAR_GAP = 6;
const BAR_BG = 'rgba(0, 0, 0, 0.6)';
const BAR_BORDER = 'rgba(0, 0, 0, 0.7)';
const NAME_GAP = 6;
const NAME_FONT = 'bold 13px system-ui, sans-serif';
const NAME_COLOR = '#ffffff';
const NAME_OUTLINE = 'rgba(0, 0, 0, 0.7)';
const WITHERED_FONT = '16px system-ui, sans-serif';

// tankColor interpola linealmente de verde a café según la contaminación.
export function tankColor(contamination: number): string {
  const t = Math.min(Math.max(contamination, 0), 100) / 100;
  const [r, g, b] = CLEAN.map(
    (c, i) => Math.round(c + (DIRTY[i] - c) * t),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

// renderTanks dibuja para cada tanque con dueño su barra de contaminación
// y nombre, y si está muerto, lo cubre en gris con planta marchita (S2-09).
export function renderTanks(
  ctx: CanvasRenderingContext2D,
  tanks: TankView[],
  spots: Tank[],
  players: PlayerView[],
  camera: Camera,
): void {
  for (const t of tanks) {
    const spot = spots.find((s) => s.slot === t.slot);
    if (!spot) continue;
    const s = worldToScreen(camera, spot.x, spot.y);

    if (t.dead) {
      // Tanque muerto: círculo gris con planta marchita
      ctx.beginPath();
      ctx.arc(s.x, s.y, TANK_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = DEAD_TANK_COLOR;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = TANK_BORDER;
      ctx.stroke();

      ctx.font = WITHERED_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🥀', s.x, s.y);
    }

    // Nombre del dueño arriba
    const owner = players.find((p) => p.id === t.ownerId);
    const name = owner?.name ?? t.ownerId;
    const nameY = s.y - TANK_RADIUS - NAME_GAP;
    ctx.font = NAME_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = NAME_OUTLINE;
    ctx.strokeText(name, s.x, nameY);
    ctx.fillStyle = NAME_COLOR;
    ctx.fillText(name, s.x, nameY);

    // Barra de contaminación debajo
    const barX = s.x - BAR_WIDTH / 2;
    const barY = s.y + TANK_RADIUS + BAR_GAP;
    const clampCont = Math.min(Math.max(t.contamination, 0), 100);
    const fillWidth = (BAR_WIDTH * clampCont) / 100;

    ctx.fillStyle = BAR_BG;
    ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
    if (fillWidth > 0) {
      ctx.fillStyle = tankColor(t.contamination);
      ctx.fillRect(barX, barY, fillWidth, BAR_HEIGHT);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = BAR_BORDER;
    ctx.strokeRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
  }
}
