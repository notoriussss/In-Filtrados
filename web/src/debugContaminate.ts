// TEMP S2-12: tecla C para contaminar el tanque más cercano mientras no
// existe la interfaz de S2-10. NO va en el PR: borrar este archivo y las
// líneas marcadas "TEMP S2-12" en screens/game.ts.
import type {
  ClientMessage,
  PlayerView,
  Snapshot,
} from '@in-filtrados/messages';
import { gameMap } from './map';
import { isMovementKey } from './input';
import { type Camera, worldToScreen } from './canvas/camera';

const CONTAMINATE_KEY = 'KeyC';
const TANK_RANGE = 40; // igual que tankRange en match
const CONTAMINATE_MS = 3000; // contaminateTicks en match: 3 s quieto
const CONFIRM_GRACE_MS = 600; // margen para que llegue el snapshot
const MESSAGE_MS = 4000;

const RING_RADIUS = 28;
const RING_WIDTH = 6;
const RING_BG = 'rgba(0, 0, 0, 0.35)';
const RING_COLOR = '#ffd166';
const FONT = 'bold 16px system-ui, sans-serif';
const BIG_FONT = 'bold 26px system-ui, sans-serif';
const PANEL_BG = 'rgba(0, 0, 0, 0.7)';
const TEXT_COLOR = '#ffd166';
const OK_COLOR = '#7bd389';
const BAD_COLOR = '#ff7b7b';

const TEXTS = {
  help: 'PRUEBA: párate junto a un tanque ajeno y aprieta C una vez',
  still: (s: string) => `¡Quieto! Contaminando… ${s} s`,
  moved: 'Te moviste: se canceló. Aprieta C otra vez y no te muevas',
  own: (n: number) => `El tanque ${n} es tuyo: busca el de otro jugador`,
  missing: (n: number, total: number) =>
    `El tanque ${n} no existe: con ${total} jugadores solo hay 1 a ${total}`,
  far: (n: number, d: number) =>
    `Muy lejos del tanque ${n} (${d} u, máx. ${TANK_RANGE}): acércate`,
  ended: 'La partida terminó. Crea una sala nueva para probar otra vez',
  done: (n: number, pct: number) =>
    `¡Tanque ${n} contaminado (${pct}%)! Camina y mira tu rastro`,
  failed: 'No se completó (¿espera de 20 s entre contaminaciones?)',
  drops: (n: number) => `Gotas en el mapa: ${n}`,
} as const;

type Pending = { slot: number; startedAt: number; before: number };
type Message = { text: string; color: string; until: number };

let pending: Pending | null = null;
let message: Message | null = null;

function say(text: string, color = TEXT_COLOR): void {
  message = { text, color, until: performance.now() + MESSAGE_MS };
}

export function attachDebugContaminate(
  target: Window,
  myPosition: () => { x: number; y: number } | undefined,
  snapshot: () => Snapshot | null,
  meId: string,
  send: (msg: ClientMessage) => void,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (pending && isMovementKey(e.code)) {
      pending = null;
      say(TEXTS.moved, BAD_COLOR);
      return;
    }
    if (e.code !== CONTAMINATE_KEY || e.repeat) return;
    const snap = snapshot();
    const me = myPosition();
    if (!snap || !me || snap.myRole !== 'IMPOSTOR') return;
    if (snap.phase !== 'PLAYING') {
      say(TEXTS.ended, BAD_COLOR);
      return;
    }
    let nearest = gameMap.tanks[0];
    let best = Infinity;
    for (const t of gameMap.tanks) {
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d < best) {
        best = d;
        nearest = t;
      }
    }
    if (!nearest) return;
    const n = nearest.slot + 1;
    const tank = snap.tanks.find((t) => t.slot === nearest.slot);
    if (!tank) {
      say(TEXTS.missing(n, snap.tanks.length), BAD_COLOR);
      return;
    }
    if (tank.ownerId === meId) {
      say(TEXTS.own(n), BAD_COLOR);
      return;
    }
    if (best > TANK_RANGE) {
      say(TEXTS.far(n, Math.round(best)), BAD_COLOR);
      return;
    }
    send({ type: 'contaminate', tankSlot: nearest.slot });
    pending = {
      slot: nearest.slot,
      startedAt: performance.now(),
      before: tank.contamination,
    };
    message = null;
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}

// renderDebugHint dibuja la ayuda, el anillo de 3 s sobre el jugador y el
// resultado según el snapshot del servidor. Solo para el impostor.
export function renderDebugHint(
  ctx: CanvasRenderingContext2D,
  snap: Snapshot | null,
  me: PlayerView | undefined,
  camera: Camera,
): void {
  if (!snap || snap.myRole !== 'IMPOSTOR') return;
  const now = performance.now();
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.font = FONT;

  if (snap.phase !== 'PLAYING') {
    pending = null;
    banner(ctx, camera, TEXTS.ended);
    return;
  }

  if (pending) {
    const elapsed = now - pending.startedAt;
    const slot = pending.slot;
    const tank = snap.tanks.find((t) => t.slot === slot);
    if (tank && tank.contamination > pending.before) {
      say(TEXTS.done(slot + 1, tank.contamination), OK_COLOR);
      pending = null;
    } else if (elapsed > CONTAMINATE_MS + CONFIRM_GRACE_MS) {
      say(TEXTS.failed, BAD_COLOR);
      pending = null;
    } else if (me) {
      const fraction = Math.min(elapsed / CONTAMINATE_MS, 1);
      const left = Math.max((CONTAMINATE_MS - elapsed) / 1000, 0);
      ring(ctx, camera, me, fraction);
      label(ctx, camera, me, TEXTS.still(left.toFixed(1)));
    }
  }

  const lines: [string, string][] = [
    [TEXTS.help, TEXT_COLOR],
    [TEXTS.drops(snap.oilDrops.length), TEXT_COLOR],
  ];
  if (message && now < message.until) {
    lines.push([message.text, message.color]);
  }
  const width = Math.max(
    ...lines.map(([text]) => ctx.measureText(text).width),
  );
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(8, 8, width + 16, lines.length * 22 + 10);
  lines.forEach(([text, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, 16, 14 + i * 22);
  });
}

function ring(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  me: PlayerView,
  fraction: number,
): void {
  const s = worldToScreen(camera, me.x, me.y);
  ctx.lineWidth = RING_WIDTH;
  ctx.beginPath();
  ctx.arc(s.x, s.y, RING_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = RING_BG;
  ctx.stroke();
  ctx.beginPath();
  const start = -Math.PI / 2;
  ctx.arc(s.x, s.y, RING_RADIUS, start, start + fraction * Math.PI * 2);
  ctx.strokeStyle = RING_COLOR;
  ctx.stroke();
}

function label(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  me: PlayerView,
  text: string,
): void {
  const s = worldToScreen(camera, me.x, me.y);
  const y = s.y + RING_RADIUS + 8;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(s.x - w / 2 - 6, y - 2, w + 12, 22);
  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign = 'center';
  ctx.fillText(text, s.x, y);
  ctx.textAlign = 'left';
}

function banner(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  text: string,
): void {
  ctx.font = BIG_FONT;
  const w = ctx.measureText(text).width;
  const x = camera.viewWidth / 2;
  const y = camera.viewHeight / 2 - 20;
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(x - w / 2 - 16, y - 10, w + 32, 52);
  ctx.fillStyle = BAD_COLOR;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
  ctx.font = FONT;
}
