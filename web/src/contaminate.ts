import type {
  ClientMessage,
  PlayerView,
  Snapshot,
  TankView,
} from '@in-filtrados/messages';
import { gameMap, type Tank } from './map';
import { isMovementKey } from './input';
import { type Camera, worldToScreen } from './canvas/camera';
import { CONTAMINATE_MESSAGES } from './constants';

// Tecla C: el impostor contamina el tanque ajeno más cercano y debe
// quedarse quieto 3 s. match decide; aquí solo se muestra el progreso.
const CONTAMINATE_KEY = 'KeyC';
export const TANK_RANGE = 40; // tankRange en match
const CONTAMINATE_MS = 3000; // contaminateTicks en match: 3 s quieto
const CONFIRM_GRACE_MS = 600; // margen para que llegue el snapshot

const RING_RADIUS = 28;
const RING_WIDTH = 6;
const RING_BG = 'rgba(0, 0, 0, 0.35)';
const RING_COLOR = '#ffd166';
const LABEL_FONT = 'bold 16px system-ui, sans-serif';
const LABEL_BG = 'rgba(0, 0, 0, 0.7)';
const LABEL_GAP = 8;
const LABEL_HEIGHT = 22;

type Pending = { slot: number; startedAt: number; before: number };

// pickTank elige el tanque ajeno y vivo más cercano a tankRange o menos;
// null si no hay ninguno.
export function pickTank(
  me: { x: number; y: number },
  tanks: TankView[],
  spots: Tank[],
  meId: string,
): TankView | null {
  let best: TankView | null = null;
  let bestDist = Infinity;
  for (const tank of tanks) {
    const spot = spots.find((s) => s.slot === tank.slot);
    if (!spot || tank.ownerId === meId || tank.dead) continue;
    const d = Math.hypot(spot.x - me.x, spot.y - me.y);
    if (d <= TANK_RANGE && d < bestDist) {
      best = tank;
      bestDist = d;
    }
  }
  return best;
}

export class ContaminateKey {
  private pending: Pending | null = null;

  constructor(
    private readonly meId: string,
    private readonly me: () => PlayerView | undefined,
    private readonly snapshot: () => Snapshot | null,
    private readonly send: (msg: ClientMessage) => void,
  ) {}

  attach(target: Window): () => void {
    const onKeyDown = (e: KeyboardEvent) => this.keyDown(e);
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }

  private keyDown(e: KeyboardEvent): void {
    if (this.pending && isMovementKey(e.code)) {
      this.pending = null; // moverse cancela, igual que en match
      return;
    }
    if (e.code !== CONTAMINATE_KEY || e.repeat) return;
    const snap = this.snapshot();
    const me = this.me();
    if (
      !snap ||
      !me ||
      snap.phase !== 'PLAYING' ||
      snap.myRole !== 'IMPOSTOR'
    ) {
      return;
    }
    const tank = pickTank(me, snap.tanks, gameMap.tanks, this.meId);
    if (!tank) return;
    this.send({ type: 'contaminate', tankSlot: tank.slot });
    this.pending = {
      slot: tank.slot,
      startedAt: performance.now(),
      before: tank.contamination,
    };
  }

  // render dibuja el anillo de 3 s y "¡Quieto! Contaminando…" sobre el
  // jugador mientras la contaminación está en curso.
  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const p = this.pending;
    if (!p) return;
    const snap = this.snapshot();
    const me = this.me();
    const elapsed = performance.now() - p.startedAt;
    const tank = snap?.tanks.find((t) => t.slot === p.slot);
    if (
      !snap ||
      !me ||
      snap.phase !== 'PLAYING' ||
      (tank && tank.contamination > p.before) ||
      elapsed > CONTAMINATE_MS + CONFIRM_GRACE_MS
    ) {
      this.pending = null;
      return;
    }
    const s = worldToScreen(camera, me.x, me.y);
    const fraction = Math.min(elapsed / CONTAMINATE_MS, 1);
    const left = Math.max((CONTAMINATE_MS - elapsed) / 1000, 0);
    drawRing(ctx, s.x, s.y, fraction);
    drawLabel(
      ctx,
      s.x,
      s.y + RING_RADIUS + LABEL_GAP,
      CONTAMINATE_MESSAGES.still(left.toFixed(1)),
    );
  }
}

function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fraction: number,
): void {
  const start = -Math.PI / 2;
  ctx.lineWidth = RING_WIDTH;
  ctx.beginPath();
  ctx.arc(x, y, RING_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = RING_BG;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, RING_RADIUS, start, start + fraction * Math.PI * 2);
  ctx.strokeStyle = RING_COLOR;
  ctx.stroke();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
): void {
  ctx.font = LABEL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = LABEL_BG;
  ctx.fillRect(x - w / 2 - 6, y - 2, w + 12, LABEL_HEIGHT);
  ctx.fillStyle = RING_COLOR;
  ctx.fillText(text, x, y);
}
