import type { PlayerView, TankView } from '@in-filtrados/messages';
import type { GameMap } from '../map';
import { type Camera, worldToScreen } from './camera';

const TANK_RADIUS = 18; // el mismo círculo de renderMap
const CLEAN_RGB = [106, 168, 79]; // #6aa84f
const DIRTY_RGB = [122, 74, 30]; // #7a4a1e
const DEAD_COLOR = '#8a8f94';
const OUTLINE = '#333a40';
const BAR_WIDTH = 48;
const BAR_HEIGHT = 7;
const BAR_GAP = 6;
const BAR_BG = 'rgba(0, 0, 0, 0.6)';
// Más alto que el de renderPlayers para no encimarse con un jugador al lado.
const NAME_GAP = 14;
const NAME_FONT = 'bold 12px system-ui, sans-serif';
const NAME_COLOR = '#ffffff';
const NAME_OUTLINE = 'rgba(0, 0, 0, 0.7)';
const PLANT_COLOR = '#5b3a1a';
const PROGRESS_RADIUS = 26;
const PROGRESS_WIDTH = 5;
const PROGRESS_BG = 'rgba(0, 0, 0, 0.45)';
const PROGRESS_FG = '#ffffff';

// tankColor pasa de verde (0) a café (100) según la contaminación.
export function tankColor(contamination: number): string {
  const t = Math.min(Math.max(contamination, 0), 100) / 100;
  const [r, g, b] = CLEAN_RGB.map((c, i) =>
    Math.round(c + (DIRTY_RGB[i] - c) * t),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

// renderTanks dibuja cada tanque del snapshot con su barra de
// contaminación y el nombre del dueño (S2-09). Muerto: gris con una
// planta marchita.
export function renderTanks(
  ctx: CanvasRenderingContext2D,
  tanks: TankView[],
  players: PlayerView[],
  map: GameMap,
  camera: Camera,
): void {
  ctx.lineJoin = 'round';
  for (const tank of tanks) {
    const pos = map.tanks.find((t) => t.slot === tank.slot);
    if (!pos) continue;
    const s = worldToScreen(camera, pos.x, pos.y);
    const color = tank.dead ? DEAD_COLOR : tankColor(tank.contamination);

    ctx.beginPath();
    ctx.arc(s.x, s.y, TANK_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    if (tank.dead) drawWiltedPlant(ctx, s.x, s.y);

    const barX = s.x - BAR_WIDTH / 2;
    const barY = s.y + TANK_RADIUS + BAR_GAP;
    ctx.fillStyle = BAR_BG;
    ctx.fillRect(barX, barY, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = color;
    const clampCont = Math.min(Math.max(tank.contamination, 0), 100);
    ctx.fillRect(
      barX,
      barY,
      (BAR_WIDTH * clampCont) / 100,
      BAR_HEIGHT,
    );

    const owner = players.find((p) => p.id === tank.ownerId);
    const name = owner?.name ?? tank.ownerId;
    if (!name) continue;
    const nameY = s.y - TANK_RADIUS - NAME_GAP;
    ctx.font = NAME_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = NAME_OUTLINE;
    ctx.strokeText(name, s.x, nameY);
    ctx.fillStyle = NAME_COLOR;
    ctx.fillText(name, s.x, nameY);
  }
}

// Tallo doblado hacia abajo con dos hojas caídas.
function drawWiltedPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.strokeStyle = PLANT_COLOR;
  ctx.fillStyle = PLANT_COLOR;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.quadraticCurveTo(x, y - 8, x + 9, y - 2);
  ctx.stroke();
  drawLeaf(ctx, x + 10, y + 1, 0.9);
  drawLeaf(ctx, x - 1, y + 2, 2.3);
}

function drawLeaf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, 5, 2.5, angle, 0, Math.PI * 2);
  ctx.fill();
}

// renderHoldProgress dibuja el círculo de progreso alrededor del jugador
// mientras se queda quieto haciendo una acción. progress va de 0 a 1.
export function renderHoldProgress(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  x: number,
  y: number,
  progress: number,
): void {
  const s = worldToScreen(camera, x, y);
  ctx.lineWidth = PROGRESS_WIDTH;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(s.x, s.y, PROGRESS_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = PROGRESS_BG;
  ctx.stroke();
  const start = -Math.PI / 2;
  ctx.beginPath();
  ctx.arc(s.x, s.y, PROGRESS_RADIUS, start, start + progress * Math.PI * 2);
  ctx.strokeStyle = PROGRESS_FG;
  ctx.stroke();
  ctx.lineCap = 'butt';
}
