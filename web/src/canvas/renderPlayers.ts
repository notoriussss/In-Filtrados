import type { PlayerView } from '@in-filtrados/messages';
import { type Camera, worldToScreen } from './camera';
import type { PlayerAnimator } from './playerAnim';
import { SPRITE_H, SPRITE_W, spriteImage } from './sprites';

const PLAYER_RADIUS = 16; // docs/tasks.md 0.4
// Tamaño del sprite en el mundo: un poco más ancho que el círculo de
// colisión, con los pies en el borde inferior del círculo.
export const SPRITE_SCALE = 0.44;
const DRAW_W = SPRITE_W * SPRITE_SCALE;
const DRAW_H = SPRITE_H * SPRITE_SCALE;
const FEET_OFFSET = PLAYER_RADIUS - 2;
const DISCONNECTED_ALPHA = 0.35;
const GHOST_ALPHA = 0.45;
const GHOST_FLOAT = 4; // unidades que sube y baja el fantasma
const WORK_BOB = 2; // rebote mientras hace algo
const NAME_GAP = 4; // entre la cabeza y su nombre
const NAME_FONT = 'bold 13px system-ui, sans-serif';
const NAME_COLOR = '#ffffff';
const NAME_OUTLINE = 'rgba(0, 0, 0, 0.75)';
const ME_RING = 'rgba(255, 255, 255, 0.55)';
const SHADOW = 'rgba(0, 0, 0, 0.35)';

export type RenderPlayersOptions = {
  animator: PlayerAnimator;
  now: number;
  // Solo se dibujan los jugadores que devuelve true (visión limitada y
  // fantasmas, S3-05). Sin esto, todos.
  visible?: (p: PlayerView) => boolean;
};

// renderPlayers dibuja a cada jugador con su sprite y su animación de
// caminar, el nombre encima y una sombra. Los desconectados y los
// fantasmas, semitransparentes; los fantasmas además flotan. Mientras el
// sprite carga se dibuja el círculo de color de siempre (S1-19).
export function renderPlayers(
  ctx: CanvasRenderingContext2D,
  players: PlayerView[],
  camera: Camera,
  meId: string,
  opts: RenderPlayersOptions,
): void {
  const { animator, now } = opts;
  animator.forget(new Set(players.map((p) => p.id)));
  // Los de más abajo se dibujan después, para que tapen a los de atrás.
  const ordered = [...players].sort((a, b) => a.y - b.y);
  ctx.lineJoin = 'round';
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false; // pixel art nítido
  for (const p of ordered) {
    const pose = animator.pose(p, now);
    if (opts.visible && !opts.visible(p)) continue;
    const s = worldToScreen(camera, p.x, p.y);
    const ghost = !p.alive;
    let alpha = 1;
    if (!p.connected) alpha = DISCONNECTED_ALPHA;
    else if (ghost) alpha = GHOST_ALPHA;

    let lift = 0;
    if (ghost) lift = GHOST_FLOAT + Math.sin(now / 400) * GHOST_FLOAT;
    else if (p.activity) lift = Math.abs(Math.sin(now / 120)) * WORK_BOB;
    const feetY = s.y + FEET_OFFSET;

    ctx.globalAlpha = alpha;
    if (!ghost) {
      ctx.beginPath();
      ctx.ellipse(s.x, feetY, DRAW_W * 0.38, 5, 0, 0, Math.PI * 2);
      ctx.fillStyle = SHADOW;
      ctx.fill();
    }
    if (p.id === meId) {
      ctx.beginPath();
      ctx.ellipse(s.x, feetY, DRAW_W * 0.55, 8, 0, 0, Math.PI * 2);
      ctx.strokeStyle = ME_RING;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    const frame = ghost ? 'front' : pose.frame;
    const img = spriteImage(p.color, frame);
    const top = feetY - DRAW_H - lift;
    if (img) {
      ctx.drawImage(img, s.x - DRAW_W / 2, top, DRAW_W, DRAW_H);
    } else {
      ctx.beginPath();
      ctx.arc(s.x, s.y - lift, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    if (ghost) drawHalo(ctx, s.x, top);

    const nameY = top - NAME_GAP;
    ctx.font = NAME_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3;
    ctx.strokeStyle = NAME_OUTLINE;
    ctx.strokeText(p.name, s.x, nameY);
    ctx.fillStyle = NAME_COLOR;
    ctx.fillText(p.name, s.x, nameY);
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = smoothing;
}

// Aureola sobre la cabeza del fantasma.
function drawHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  top: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, top + 2, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2;
  ctx.stroke();
}
