import type { Emergency, OilDrop } from '@in-filtrados/messages';
import type { FixPoint, Station } from '../../map';
import { type Camera, worldToScreen } from './camera';

// Lo que se dibuja encima del mapa, en unidades del mundo (el contexto ya
// tiene la transformación de la cámara): gotas de aceite, etiquetas de
// nombre, marcas de tareas, puntos de reparación y el círculo de
// progreso. Colores de la dirección B-noche.

const INK = '#04101f';
const PANEL = '#0d2a46';
const AQUA = '#7ee6d8';
const AMBER = '#ffd24a';
const CORAL = '#ff6b6b';
const LEAF = '#5fe08a';
const TEXT = '#e8f8ff';
const WATER = '#7cc4ff';
export const TAG_FONT = '13px VT323, ui-monospace, monospace';

// Igual que oilDropLifeTicks en match: cada gota dura 15 s (S2-12).
export const OIL_DROP_LIFE_TICKS = 300;

// oilDropAlpha va de 1 (recién caída) a 0 (vencida).
export function oilDropAlpha(expiresAtTick: number, tick: number): number {
  const left = (expiresAtTick - tick) / OIL_DROP_LIFE_TICKS;
  return Math.min(Math.max(left, 0), 1);
}

// drawOilDrops: el rastro del impostor, del color de su personaje, como
// las gotas de aceite del paquete (mancha oscura con brillo de color).
export function drawOilDrops(
  ctx: CanvasRenderingContext2D,
  drops: OilDrop[],
  tick: number,
): void {
  for (const d of drops) {
    const alpha = oilDropAlpha(d.expiresAtTick, tick);
    if (alpha === 0) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#241a33';
    ctx.beginPath();
    ctx.ellipse(d.x, d.y + 10, 6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = d.color;
    ctx.fillRect(d.x - 3, d.y + 8, 2, 2);
    ctx.fillStyle = '#b48bf0';
    ctx.fillRect(d.x + 1, d.y + 9, 2, 1);
  }
  ctx.globalAlpha = 1;
}

// Manchas de aceite sobre el cuerpo del tanque, en fracciones del
// cuadro (x, y, radio): aparecen más a medida que sube la contaminación.
const TANK_STAINS = [
  [0.3, 0.55, 0.07],
  [0.62, 0.38, 0.05],
  [0.45, 0.72, 0.08],
  [0.2, 0.36, 0.05],
  [0.7, 0.66, 0.06],
  [0.38, 0.28, 0.04],
] as const;

// drawTankGrime: el atlas solo cambia la mirilla de agua; esto suma
// manchas de aceite según la contaminación y, si el tanque murió, un
// charco oscuro en la base. (x, y, w, h) es el cuadro del tanque.
export function drawTankGrime(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  contamination: number,
  dead: boolean,
): void {
  const level = dead ? 100 : Math.min(Math.max(contamination, 0), 100);
  const count = Math.ceil((level / 100) * TANK_STAINS.length);
  if (dead) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#241a33';
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.w * 0.45,
      box.y + box.h * 0.93,
      box.w * 0.42,
      box.h * 0.06,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = dead ? 0.85 : 0.65;
  for (const [fx, fy, fr] of TANK_STAINS.slice(0, count)) {
    const cx = box.x + box.w * fx;
    const cy = box.y + box.h * fy;
    const r = box.w * fr;
    ctx.fillStyle = '#241a33';
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Chorrito que baja de la mancha y un brillo violeta.
    ctx.fillRect(cx - 1, cy, 2, r * 1.6);
    ctx.fillStyle = '#b48bf0';
    ctx.fillRect(cx - r * 0.4, cy - r * 0.4, 2, 2);
  }
  ctx.globalAlpha = 1;
}

// drawTag: etiqueta de nombre del diseño (.tag): caja oscura con borde
// de píxel; la propia en aqua. (x, bottom) es el centro inferior.
export function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  bottom: number,
  self = false,
): void {
  ctx.font = TAG_FONT;
  const w = Math.ceil(ctx.measureText(text).width) + 10;
  const h = 14;
  const left = Math.round(x - w / 2);
  const top = Math.round(bottom - h);
  ctx.fillStyle = PANEL;
  ctx.fillRect(left - 1.5, top - 1.5, w + 3, h + 3);
  ctx.fillStyle = self ? AQUA : 'rgba(4, 16, 31, 0.88)';
  ctx.fillRect(left, top, w, h);
  ctx.fillStyle = self ? INK : TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, top + h / 2 + 1);
}

// drawBar: medidor en bloques (.gauge) de ancho w; value de 0 a 1.
export function drawBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  value: number,
  color: string,
): void {
  const h = 5;
  ctx.fillStyle = '#1c4d75';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  const fill = Math.round(w * Math.min(Math.max(value, 0), 1));
  for (let i = 0; i < fill; i += 4)
    ctx.fillRect(x + i, y, Math.min(3, fill - i), h);
}

// StationMarks: qué estaciones son del jugador (S2-11).
export type StationMarks = {
  pending: ReadonlySet<string>;
  done: ReadonlySet<string>;
};

// drawStationMarks: las estaciones propias pendientes llevan un "!" que
// rebota y un anillo que late; las hechas, una palomita. Se dibujan
// encima de la oscuridad: son la guía del jugador, como en el HUD.
export function drawStationMarks(
  ctx: CanvasRenderingContext2D,
  stations: Station[],
  marks: StationMarks,
  now: number,
): void {
  const t = (now % 900) / 900;
  for (const s of stations) {
    if (marks.pending.has(s.id)) {
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + 8, 18 + t * 10, 7 + t * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const bounce = Math.abs(Math.sin(now / 250)) * 4;
      drawBang(ctx, s.x, s.y - 52 - bounce);
    } else if (marks.done.has(s.id)) {
      drawCheck(ctx, s.x, s.y - 44);
    }
  }
}

// Signo "!" de píxel, ámbar con contorno oscuro.
function drawBang(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(x - 4, y - 12, 8, 24);
  ctx.fillStyle = AMBER;
  ctx.fillRect(x - 2, y - 10, 4, 12);
  ctx.fillRect(x - 2, y + 5, 4, 4);
}

function drawCheck(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(x - 8, y - 8, 16, 16);
  ctx.fillStyle = LEAF;
  const px = [
    [-5, 0],
    [-3, 2],
    [-1, 4],
    [1, 2],
    [3, 0],
    [5, -2],
  ];
  for (const [dx, dy] of px) ctx.fillRect(x + dx - 1, y + dy - 2, 3, 3);
}

// drawFixPoints: con una emergencia activa, el punto suelta agua (la
// tubería) o vapor (la válvula) y un anillo rojo late; verde si ya hay
// alguien sosteniéndolo (S3-05).
export function drawFixPoints(
  ctx: CanvasRenderingContext2D,
  points: FixPoint[],
  emergency: Emergency | null,
  now: number,
): void {
  if (!emergency) return;
  for (const fp of points) {
    if (fp.kind !== emergency.kind) continue;
    const held = emergency.heldPoints.includes(fp.id);
    const t = (now % 700) / 700;
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = held ? LEAF : CORAL;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(fp.x, fp.y + 6, 22 + t * 14, 9 + t * 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (fp.kind === 'pipe') {
      drawPipe(ctx, fp.x, fp.y);
      if (!held) drawSpray(ctx, fp.x + 8, fp.y - 8, now);
    } else {
      drawValve(ctx, fp.x, fp.y);
      drawSteam(ctx, fp.x, fp.y - 18, now);
    }
  }
}

function drawPipe(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(x - 24, y - 6, 48, 12);
  ctx.fillStyle = '#8fa3b2';
  ctx.fillRect(x - 23, y - 5, 46, 10);
  ctx.fillStyle = '#c5d3dc';
  ctx.fillRect(x - 23, y - 5, 46, 3);
  ctx.fillStyle = '#58636d';
  ctx.fillRect(x - 6, y - 8, 12, 16);
}

function drawValve(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#58636d';
  ctx.fillRect(x - 4, y - 6, 8, 16);
  ctx.strokeStyle = CORAL;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 10, 9, 0, Math.PI * 2);
  ctx.moveTo(x - 9, y - 10);
  ctx.lineTo(x + 9, y - 10);
  ctx.moveTo(x, y - 19);
  ctx.lineTo(x, y - 1);
  ctx.stroke();
}

// Chorro de agua de la tubería rota.
function drawSpray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
): void {
  ctx.fillStyle = WATER;
  for (let i = 0; i < 12; i++) {
    const k = (now / 300 + i / 12) % 1;
    const ang = -Math.PI / 2 + Math.sin(i * 1.3) * 0.8;
    ctx.globalAlpha = 1 - k;
    ctx.fillRect(
      x + Math.cos(ang) * k * 34,
      y + Math.sin(ang) * k * 34 + k * k * 22,
      3,
      3,
    );
  }
  ctx.globalAlpha = 1;
}

// Nubes de vapor que suben de la válvula.
function drawSteam(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
): void {
  ctx.fillStyle = '#e6eef5';
  for (let i = 0; i < 7; i++) {
    const k = (now / 1100 + i / 7) % 1;
    ctx.globalAlpha = (1 - k) * 0.6;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(k * 6 + i) * 10,
      y - k * 56,
      6 + k * 14,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// drawHoldProgress: círculo de progreso de las acciones que exigen
// quedarse quieto; con spin gira (la tubería espera al otro extremo).
export function drawHoldProgress(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  spin = 0,
): void {
  const r = 26;
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(4, 16, 31, 0.6)';
  ctx.beginPath();
  ctx.arc(x, y - 18, r, 0, Math.PI * 2);
  ctx.stroke();
  const start = -Math.PI / 2 + spin;
  ctx.strokeStyle = AQUA;
  ctx.beginPath();
  ctx.arc(x, y - 18, r, start, start + progress * Math.PI * 2);
  ctx.stroke();
}

// drawFixArrows: flechas rojas en el borde de la pantalla hacia los
// puntos de la emergencia que quedan fuera de la vista. Se dibuja en
// coordenadas de pantalla (sin la transformación de la cámara).
export function drawFixArrows(
  ctx: CanvasRenderingContext2D,
  points: FixPoint[],
  camera: Camera,
  emergency: Emergency | null,
  me: { x: number; y: number } | undefined,
  near: number,
): void {
  if (!emergency || !me) return;
  const margin = 40;
  const cx = camera.viewWidth / 2;
  const cy = camera.viewHeight / 2;
  for (const fp of points) {
    if (fp.kind !== emergency.kind) continue;
    if (Math.hypot(fp.x - me.x, fp.y - me.y) <= near) continue;
    const s = worldToScreen(camera, fp.x, fp.y);
    const m = worldToScreen(camera, me.x, me.y);
    const ang = Math.atan2(s.y - m.y, s.x - m.x);
    const x = cx + Math.cos(ang) * (cx - margin);
    const y = cy + Math.sin(ang) * (cy - margin);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -13);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-12, 13);
    ctx.closePath();
    ctx.fillStyle = emergency.heldPoints.includes(fp.id) ? LEAF : CORAL;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}
