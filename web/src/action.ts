import type {
  ClientMessage,
  PlayerView,
  Snapshot,
  TankView,
} from '@in-filtrados/messages';
import { gameMap, type Tank } from './map';
import { isMovementKey } from './input';
import { type Camera, worldToScreen } from './canvas/camera';
import { ACTION_MESSAGES } from './constants';

// Tecla E: acción contextual según lo que haya cerca (S2-09 paso 3).
// - Tanque muerto no reportado -> report
// - Tanque ajeno vivo (si es impostor) -> contaminate (3 s quieto)
// - Estación propia pendiente -> interact (lo agrega S2-11)
export const ACTION_KEY = 'KeyE';
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

export type ResolvedAction =
  | { type: 'report'; tank: TankView }
  | { type: 'contaminate'; tank: TankView };

// pickTank elige el tanque ajeno y vivo más cercano a TANK_RANGE o menos;
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

// pickReportableTank elige el tanque muerto no reportado más cercano
// a TANK_RANGE o menos; null si no hay ninguno.
export function pickReportableTank(
  me: { x: number; y: number },
  tanks: TankView[],
  spots: Tank[],
  reportedSlots?: ReadonlySet<number>,
): TankView | null {
  let best: TankView | null = null;
  let bestDist = Infinity;
  for (const tank of tanks) {
    if (!tank.dead) continue;
    if (reportedSlots && reportedSlots.has(tank.slot)) continue;
    const spot = spots.find((s) => s.slot === tank.slot);
    if (!spot) continue;
    const d = Math.hypot(spot.x - me.x, spot.y - me.y);
    if (d <= TANK_RANGE && d < bestDist) {
      best = tank;
      bestDist = d;
    }
  }
  return best;
}

// pickAction resuelve la acción contextual priorizando reportar
// un tanque muerto y luego contaminar si el jugador es impostor.
export function pickAction(
  me: { x: number; y: number },
  snap: Snapshot,
  spots: Tank[],
  meId: string,
  reportedSlots?: ReadonlySet<number>,
): ResolvedAction | null {
  const reportable = pickReportableTank(
    me,
    snap.tanks,
    spots,
    reportedSlots,
  );
  if (reportable) {
    return { type: 'report', tank: reportable };
  }
  if (snap.myRole === 'IMPOSTOR') {
    const contaminable = pickTank(me, snap.tanks, spots, meId);
    if (contaminable) {
      return { type: 'contaminate', tank: contaminable };
    }
  }
  return null;
}

export class ActionKey {
  private pending: Pending | null = null;
  private readonly reportedSlots = new Set<number>();

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

  keyDown(e: { code: string; repeat?: boolean }): void {
    if (this.pending && isMovementKey(e.code)) {
      this.pending = null; // moverse cancela, igual que en match
      return;
    }
    if (e.code !== ACTION_KEY || e.repeat) return;
    const snap = this.snapshot();
    const me = this.me();
    if (
      !snap ||
      !me ||
      snap.phase !== 'PLAYING' ||
      !me.alive
    ) {
      return;
    }
    if (snap.meeting) {
      this.reportedSlots.add(snap.meeting.tankSlot);
    }
    const act = pickAction(
      me,
      snap,
      gameMap.tanks,
      this.meId,
      this.reportedSlots,
    );
    if (!act) return;
    if (act.type === 'report') {
      this.send({ type: 'report', tankSlot: act.tank.slot });
      return;
    }
    if (act.type === 'contaminate') {
      this.send({ type: 'contaminate', tankSlot: act.tank.slot });
      this.pending = {
        slot: act.tank.slot,
        startedAt: performance.now(),
        before: act.tank.contamination,
      };
    }
  }

  // render dibuja el anillo de 3 s y "¡Quieto! Contaminando…" sobre el
  // jugador mientras la acción de quedarse quieto está en curso.
  render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const snap = this.snapshot();
    if (snap?.meeting) {
      this.reportedSlots.add(snap.meeting.tankSlot);
    }
    const p = this.pending;
    if (!p) return;
    const me = this.me();
    const elapsed = performance.now() - p.startedAt;
    const tank = snap?.tanks.find((t) => t.slot === p.slot);
    if (
      !snap ||
      !me ||
      !me.alive ||
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
      ACTION_MESSAGES.still(left.toFixed(1)),
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
