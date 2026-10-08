import type { PlayerView } from '@in-filtrados/messages';
import { type Camera, worldToScreen } from './camera';

const PLAYER_RADIUS = 16; // docs/tasks.md 0.4

export function renderPlayers(ctx: CanvasRenderingContext2D, players: PlayerView[], camera: Camera, meId: string): void {
  for (const p of players) {
    const s = worldToScreen(camera, p.x, p.y);
    ctx.globalAlpha = p.connected ? 1 : 0.35;
    ctx.beginPath();
    ctx.arc(s.x, s.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.id === meId) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
