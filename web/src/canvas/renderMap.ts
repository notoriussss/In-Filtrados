import type { GameMap, StationType } from '../map';
import { type Camera, worldToScreen } from './camera';

const WALL_COLOR = '#333a40';
const STATION_RADIUS = 14;
const TANK_RADIUS = 18;

const STATION_COLORS: Record<StationType, string> = {
  reduce: '#e07a5f',
  reuse: '#3d85c6',
  recycle: '#6aa84f',
};

export function renderMap(ctx: CanvasRenderingContext2D, map: GameMap, camera: Camera): void {
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
    drawCircle(ctx, p.x, p.y, STATION_RADIUS, STATION_COLORS[station.type]);
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

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = WALL_COLOR;
  ctx.stroke();
}
