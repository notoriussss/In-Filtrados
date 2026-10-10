import type { PlayerView } from '@in-filtrados/messages';
import { type Camera, worldToScreen } from './camera';

const PLAYER_RADIUS = 16; // docs/tasks.md 0.4
const DISCONNECTED_ALPHA = 0.35;
const NAME_GAP = 6; // between the circle and its name
const NAME_FONT = 'bold 13px system-ui, sans-serif';
const NAME_COLOR = '#ffffff';
const NAME_OUTLINE = 'rgba(0, 0, 0, 0.7)';
const ME_OUTLINE = '#ffffff';

// renderPlayers draws each player as a circle of its color with its name
// above; disconnected players are drawn semi-transparent (S1-19).
export function renderPlayers(
  ctx: CanvasRenderingContext2D,
  players: PlayerView[],
  camera: Camera,
  meId: string,
): void {
  ctx.font = NAME_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  for (const p of players) {
    const s = worldToScreen(camera, p.x, p.y);
    ctx.globalAlpha = p.connected ? 1 : DISCONNECTED_ALPHA;

    ctx.beginPath();
    ctx.arc(s.x, s.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.id === meId) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = ME_OUTLINE;
      ctx.stroke();
    }

    const nameY = s.y - PLAYER_RADIUS - NAME_GAP;
    ctx.lineWidth = 3;
    ctx.strokeStyle = NAME_OUTLINE;
    ctx.strokeText(p.name, s.x, nameY);
    ctx.fillStyle = NAME_COLOR;
    ctx.fillText(p.name, s.x, nameY);
  }
  ctx.globalAlpha = 1;
}
