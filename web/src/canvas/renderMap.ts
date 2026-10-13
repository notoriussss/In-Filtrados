import type { GameMap, StationType } from '../map';
import { type Camera, worldToScreen } from './camera';

const WALL_COLOR = '#333a40';
const STATION_RADIUS = 14;
const TANK_RADIUS = 18;

export const STATION_COLORS: Record<StationType, string> = {
  reduce: '#e07a5f',
  reuse: '#3d85c6',
  recycle: '#6aa84f',
};

// S2-11: qué estaciones son del jugador. Las pendientes se resaltan y
// las demás (ajenas o ya hechas) se atenúan. Sin esto, todas iguales.
export type StationMarks = {
  pending: ReadonlySet<string>;
  done: ReadonlySet<string>;
  now: number; // ms, para el pulso
};

const DIM_ALPHA = 0.35;
const PULSE_MS = 900;
const PULSE_GROW = 14;
const MARK_COLOR = '#ffd166';

export function renderMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  marks?: StationMarks,
): void {
  for (const zone of map.zones) {
    const p = worldToScreen(camera, zone.x, zone.y);
    ctx.fillStyle = zone.color;
    ctx.fillRect(p.x, p.y, zone.w, zone.h);
  }

  ctx.fillStyle = WALL_COLOR;
  for (const wall of map.walls) {
    const p = worldToScreen(camera, wall.x, wall.y);
    ctx.fillRect(p.x, p.y, wall.w, wall.h);
  }

  for (const station of map.stations) {
    const p = worldToScreen(camera, station.x, station.y);
    const color = STATION_COLORS[station.type];
    if (marks && marks.pending.has(station.id)) {
      drawPendingStation(ctx, p.x, p.y, color, marks.now);
      continue;
    }
    ctx.globalAlpha = marks ? DIM_ALPHA : 1;
    drawCircle(ctx, p.x, p.y, STATION_RADIUS, color);
    ctx.globalAlpha = 1;
    if (marks && marks.done.has(station.id)) drawCheck(ctx, p.x, p.y);
  }

  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tank of map.tanks) {
    const p = worldToScreen(camera, tank.x, tank.y);
    drawCircle(ctx, p.x, p.y, TANK_RADIUS, '#f2f2f2');
    ctx.fillStyle = '#1b2a33';
    ctx.fillText(String(tank.slot + 1), p.x, p.y);
  }

  // Labels last, so walls and circles never cover them.
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1b2a33';
  for (const zone of map.zones) {
    const p = worldToScreen(camera, zone.x, zone.y);
    ctx.fillText(zone.name, p.x + 28, p.y + 28);
  }
}

// Estación propia pendiente: anillo que pulsa y un "!" encima.
function drawPendingStation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  now: number,
): void {
  const t = (now % PULSE_MS) / PULSE_MS;
  ctx.beginPath();
  ctx.arc(x, y, STATION_RADIUS + 4 + t * PULSE_GROW, 0, Math.PI * 2);
  ctx.strokeStyle = MARK_COLOR;
  ctx.globalAlpha = 1 - t;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawCircle(ctx, x, y, STATION_RADIUS, color);
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1b2a33';
  ctx.strokeText('!', x, y - STATION_RADIUS - 2);
  ctx.fillStyle = MARK_COLOR;
  ctx.fillText('!', x, y - STATION_RADIUS - 2);
}

// Estación propia ya hecha: una palomita blanca.
function drawCheck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - 6, y);
  ctx.lineTo(x - 1, y + 5);
  ctx.lineTo(x + 7, y - 5);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = WALL_COLOR;
  ctx.stroke();
}
