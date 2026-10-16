import type { Emergency } from '@in-filtrados/messages';
import type { FixPoint, GameMap, Rect, StationType, Zone } from '../map';
import { type Camera, worldToScreen } from './camera';

// Mapa de noche: el fondo fijo (pisos de cada zona, el canal con sus
// puentes y los puntos de referencia) se pinta una sola vez en un
// lienzo aparte y cada cuadro solo se copia; encima van las estaciones,
// el agua animada y las emergencias.

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

const GROUND = '#1d3326';
const GROUND_DOTS = 'rgba(255, 255, 255, 0.035)';
const HEDGE = '#0f1f16';
const CANAL = '#1d4f78';
const CANAL_EDGE = '#5d6b73';
const PLANK = '#7a5534';
const PLANK_DARK = '#4e341f';
const LABEL = 'rgba(232, 240, 255, 0.78)';
const LABEL_SHADOW = 'rgba(0, 0, 0, 0.8)';
const DIM_ALPHA = 0.35;
const PULSE_MS = 900;
const PULSE_GROW = 14;
const MARK_COLOR = '#ffd166';
const ALERT = '#ff4d4d';
const STATION_RADIUS = 14;

// Pisos de cada zona en la versión nocturna.
const ZONE_FLOORS: Record<string, { fill: string; detail: string }> = {
  reservoir: { fill: '#163f63', detail: 'rgba(120, 190, 255, 0.18)' },
  rooftops: { fill: '#4a2f24', detail: 'rgba(255, 170, 120, 0.12)' },
  plaza: { fill: '#4b4433', detail: 'rgba(255, 240, 200, 0.10)' },
  treatment: { fill: '#24433f', detail: 'rgba(160, 255, 230, 0.10)' },
  pumps: { fill: '#2e3439', detail: 'rgba(200, 220, 240, 0.10)' },
  garden: { fill: '#3a2c1d', detail: 'rgba(140, 200, 110, 0.18)' },
  laundry: { fill: '#352f45', detail: 'rgba(220, 200, 255, 0.10)' },
};

let staticLayer: { canvas: HTMLCanvasElement; map: GameMap } | null = null;

export function renderMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  marks?: StationMarks,
  now = 0,
): void {
  const layer = mapLayer(map);
  const origin = worldToScreen(camera, 0, 0);
  if (layer) {
    ctx.drawImage(layer, origin.x, origin.y);
  } else {
    ctx.save();
    ctx.translate(origin.x, origin.y);
    paintStatic(ctx, map);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(origin.x, origin.y);
  paintWater(ctx, map, now);
  for (const station of map.stations) {
    const color = STATION_COLORS[station.type];
    if (marks && marks.pending.has(station.id)) {
      drawPendingRing(ctx, station.x, station.y, marks.now);
      drawStation(ctx, station.type, station.x, station.y, color, now);
      continue;
    }
    ctx.globalAlpha = marks ? DIM_ALPHA : 1;
    drawStation(ctx, station.type, station.x, station.y, color, now);
    ctx.globalAlpha = 1;
    if (marks && marks.done.has(station.id)) {
      drawCheck(ctx, station.x, station.y);
    }
  }
  ctx.restore();
}

// renderFixPoints dibuja los puntos de reparación: apagados si no hay
// emergencia y, si la hay, con el agua o el vapor saliendo y un anillo
// rojo que late (S3-05).
export function renderFixPoints(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  emergency: Emergency | null,
  now: number,
): void {
  for (const fp of map.fixPoints) {
    const s = worldToScreen(camera, fp.x, fp.y);
    const active = emergency !== null && emergency.kind === fp.kind;
    const held = active && emergency.heldPoints.includes(fp.id);
    drawFixPoint(ctx, fp, s.x, s.y, active, held, now);
  }
}

function mapLayer(map: GameMap): HTMLCanvasElement | null {
  if (staticLayer && staticLayer.map === map) return staticLayer.canvas;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const c = canvas.getContext('2d');
  if (!c) return null;
  paintStatic(c, map);
  staticLayer = { canvas, map };
  return canvas;
}

// paintStatic pinta lo que no se mueve, en coordenadas del mundo.
function paintStatic(ctx: CanvasRenderingContext2D, map: GameMap): void {
  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, map.width, map.height);
  // Pasto con puntitos, siempre en el mismo lugar.
  ctx.fillStyle = GROUND_DOTS;
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 1400; i++) {
    ctx.fillRect(rand() * map.width, rand() * map.height, 2, 2);
  }

  for (const zone of map.zones) {
    if (zone.id === 'stream') continue;
    paintZone(ctx, zone);
  }

  const [outer, canal] = splitWalls(map);
  ctx.fillStyle = HEDGE;
  for (const w of outer) ctx.fillRect(w.x, w.y, w.w, w.h);
  for (const w of canal) {
    ctx.fillStyle = CANAL_EDGE;
    ctx.fillRect(w.x - 3, w.y - 3, w.w + 6, w.h + 6);
    ctx.fillStyle = CANAL;
    ctx.fillRect(w.x, w.y, w.w, w.h);
  }
  for (const b of bridges(map, canal)) paintBridge(ctx, b);

  paintLandmarks(ctx, map);

  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const zone of map.zones) {
    if (zone.id === 'stream') continue;
    ctx.fillStyle = LABEL_SHADOW;
    ctx.fillText(zone.name.toUpperCase(), zone.x + 15, zone.y + 13);
    ctx.fillStyle = LABEL;
    ctx.fillText(zone.name.toUpperCase(), zone.x + 14, zone.y + 12);
  }
}

function paintZone(ctx: CanvasRenderingContext2D, zone: Zone): void {
  const floor = ZONE_FLOORS[zone.id] ?? {
    fill: shade(zone.color),
    detail: 'rgba(255, 255, 255, 0.08)',
  };
  roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 18);
  ctx.fillStyle = floor.fill;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = floor.detail;
  ctx.lineWidth = 2;
  if (zone.id === 'garden') {
    // Surcos de tierra.
    for (let y = zone.y + 40; y < zone.y + zone.h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(zone.x, y);
      ctx.lineTo(zone.x + zone.w, y);
      ctx.stroke();
    }
  } else if (zone.id === 'reservoir') {
    for (let y = zone.y + 30; y < zone.y + zone.h; y += 22) {
      ctx.beginPath();
      for (let x = zone.x; x <= zone.x + zone.w; x += 20) {
        ctx.lineTo(x, y + Math.sin(x / 20) * 3);
      }
      ctx.stroke();
    }
  } else {
    // Baldosas.
    const step = zone.id === 'rooftops' ? 24 : 40;
    for (let x = zone.x; x < zone.x + zone.w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, zone.y);
      ctx.lineTo(x, zone.y + zone.h);
      ctx.stroke();
    }
    for (let y = zone.y; y < zone.y + zone.h; y += step) {
      ctx.beginPath();
      ctx.moveTo(zone.x, y);
      ctx.lineTo(zone.x + zone.w, y);
      ctx.stroke();
    }
  }
  ctx.restore();
  roundRect(ctx, zone.x, zone.y, zone.w, zone.h, 18);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = 4;
  ctx.stroke();
}

// Puntos de referencia para hablar en la reunión ("estaba en el
// molino"): molino, torre de agua, pozo, cascada, invernadero y sábanas.
function paintLandmarks(ctx: CanvasRenderingContext2D, map: GameMap): void {
  const zone = (id: string) => map.zones.find((z) => z.id === id);
  const roof = zone('rooftops');
  if (roof) drawWindmill(ctx, roof.x + roof.w - 70, roof.y + 90);
  const plaza = zone('plaza');
  if (plaza) {
    drawWell(ctx, plaza.x + plaza.w / 2, plaza.y + plaza.h - 50);
    drawWaterTower(ctx, plaza.x + plaza.w - 40, plaza.y + 60);
  }
  const res = zone('reservoir');
  if (res) drawWaterfall(ctx, res.x + res.w - 90, res.y);
  const garden = zone('garden');
  if (garden) drawGreenhouse(ctx, garden.x + 20, garden.y + 20);
  const laundry = zone('laundry');
  if (laundry) drawSheets(ctx, laundry.x + 40, laundry.y + 70);
  const pumps = zone('pumps');
  if (pumps) drawPumpPanel(ctx, pumps.x + pumps.w - 60, pumps.y + 40);
  const plant = zone('treatment');
  if (plant) drawPlantTanks(ctx, plant.x + 60, plant.y + 70);
}

// paintWater anima el canal y el embalse (brillos que corren).
function paintWater(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  now: number,
): void {
  const [, canal] = splitWalls(map);
  ctx.strokeStyle = 'rgba(160, 210, 255, 0.35)';
  ctx.lineWidth = 2;
  for (const w of canal) {
    for (let i = 0; i < Math.floor(w.w / 60); i++) {
      const x = w.x + ((i * 60 + now / 25) % w.w);
      const y = w.y + 10 + ((i * 13) % (w.h - 18));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(x + 18, w.x + w.w), y);
      ctx.stroke();
    }
  }
  const res = map.zones.find((z) => z.id === 'reservoir');
  if (res) {
    // Espuma de la cascada.
    ctx.fillStyle = 'rgba(220, 240, 255, 0.5)';
    for (let i = 0; i < 6; i++) {
      const k = ((now / 600 + i / 6) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(
        res.x + res.w - 75 + Math.sin(i * 2) * 14,
        res.y + 60 + k * 10,
        3 + k * 4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// Las paredes del borde del mundo son el seto; las demás, el canal.
function splitWalls(map: GameMap): [Rect[], Rect[]] {
  const outer: Rect[] = [];
  const canal: Rect[] = [];
  for (const w of map.walls) {
    const border =
      w.x <= 0 ||
      w.y <= 0 ||
      w.x + w.w >= map.width ||
      w.y + w.h >= map.height;
    (border ? outer : canal).push(w);
  }
  return [outer, canal];
}

// bridges son los huecos del canal: entre el borde y el primer tramo,
// entre tramos y entre el último tramo y el borde.
export function bridges(map: GameMap, canal: Rect[]): Rect[] {
  if (canal.length === 0) return [];
  const sorted = [...canal].sort((a, b) => a.x - b.x);
  const y = sorted[0].y;
  const h = sorted[0].h;
  const wall = map.walls.find((w) => w.x <= 0 && w.h > w.w);
  const left = wall ? wall.x + wall.w : 0;
  const rightWall = map.walls.find(
    (w) => w.x + w.w >= map.width && w.h > w.w,
  );
  const right = rightWall ? rightWall.x : map.width;
  const out: Rect[] = [];
  let x = left;
  for (const seg of sorted) {
    if (seg.x > x) out.push({ x, y, w: seg.x - x, h });
    x = seg.x + seg.w;
  }
  if (right > x) out.push({ x, y, w: right - x, h });
  return out;
}

function paintBridge(ctx: CanvasRenderingContext2D, b: Rect): void {
  ctx.fillStyle = CANAL;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  const pad = 6;
  ctx.fillStyle = PLANK_DARK;
  ctx.fillRect(b.x, b.y - pad, b.w, b.h + pad * 2);
  ctx.fillStyle = PLANK;
  for (let x = b.x + 2; x < b.x + b.w - 2; x += 12) {
    ctx.fillRect(x, b.y - pad + 2, 10, b.h + pad * 2 - 4);
  }
  ctx.fillStyle = PLANK_DARK;
  ctx.fillRect(b.x, b.y - pad, b.w, 3);
  ctx.fillRect(b.x, b.y + b.h + pad - 3, b.w, 3);
}

// drawStation dibuja la estación según su R: una tubería con válvula
// (reducir), un barril de lluvia (reutilizar) o un filtro (reciclar).
function drawStation(
  ctx: CanvasRenderingContext2D,
  type: StationType,
  x: number,
  y: number,
  color: string,
  now: number,
): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  if (type === 'reduce') {
    ctx.fillStyle = '#6b7680';
    ctx.fillRect(x - 16, y - 4, 32, 8);
    ctx.strokeRect(x - 16, y - 4, 32, 8);
    ctx.beginPath();
    ctx.arc(x, y - 10, 8, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 10);
    ctx.lineTo(x + 8, y - 10);
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x, y - 2);
    ctx.stroke();
    // Gota que cae de la fuga.
    const k = (now % 1200) / 1200;
    ctx.save();
    ctx.fillStyle = '#5ab4ff';
    ctx.globalAlpha *= 1 - k;
    ctx.beginPath();
    ctx.arc(x + 12, y + 6 + k * 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (type === 'reuse') {
    ctx.fillStyle = '#7a5534';
    roundRect(ctx, x - 11, y - 14, 22, 28, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, y - 12, 18, 5);
    ctx.strokeStyle = '#3d2a19';
    ctx.beginPath();
    ctx.moveTo(x - 11, y - 3);
    ctx.lineTo(x + 11, y - 3);
    ctx.moveTo(x - 11, y + 7);
    ctx.lineTo(x + 11, y + 7);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#c9d6df';
    ctx.beginPath();
    ctx.moveTo(x - 13, y - 14);
    ctx.lineTo(x + 13, y - 14);
    ctx.lineTo(x + 6, y + 4);
    ctx.lineTo(x + 6, y + 14);
    ctx.lineTo(x - 6, y + 14);
    ctx.lineTo(x - 6, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x - 9, y - 10, 18, 5);
    ctx.fillStyle = '#d9c08c';
    ctx.fillRect(x - 6, y - 5, 12, 4);
    ctx.fillStyle = '#2f2f35';
    ctx.fillRect(x - 5, y - 1, 10, 4);
  }
}

// Estación propia pendiente: anillo que pulsa y un "!" encima.
function drawPendingRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
): void {
  const t = (now % PULSE_MS) / PULSE_MS;
  ctx.beginPath();
  ctx.arc(x, y, STATION_RADIUS + 6 + t * PULSE_GROW, 0, Math.PI * 2);
  ctx.strokeStyle = MARK_COLOR;
  ctx.globalAlpha = 1 - t;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#1b2a33';
  const bounce = Math.abs(Math.sin(now / 250)) * 4;
  ctx.strokeText('!', x, y - STATION_RADIUS - 8 - bounce);
  ctx.fillStyle = MARK_COLOR;
  ctx.fillText('!', x, y - STATION_RADIUS - 8 - bounce);
}

// Estación propia ya hecha: una palomita.
function drawCheck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): void {
  ctx.beginPath();
  ctx.arc(x + 12, y - 12, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#22c55e';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 8, y - 12);
  ctx.lineTo(x + 11, y - 9);
  ctx.lineTo(x + 16, y - 15);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawFixPoint(
  ctx: CanvasRenderingContext2D,
  fp: FixPoint,
  x: number,
  y: number,
  active: boolean,
  held: boolean,
  now: number,
): void {
  if (active) {
    const t = (now % 700) / 700;
    ctx.beginPath();
    ctx.arc(x, y, 22 + t * 16, 0, Math.PI * 2);
    ctx.strokeStyle = held ? '#22c55e' : ALERT;
    ctx.globalAlpha = 1 - t;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = active ? 1 : 0.55;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 2;
  if (fp.kind === 'pipe') {
    ctx.fillStyle = '#58636d';
    ctx.fillRect(x - 22, y - 7, 44, 14);
    ctx.strokeRect(x - 22, y - 7, 44, 14);
    ctx.fillStyle = '#8b97a2';
    ctx.fillRect(x - 6, y - 10, 12, 20);
    ctx.strokeRect(x - 6, y - 10, 12, 20);
    if (active && !held) drawSpray(ctx, x, y - 10, now);
  } else {
    ctx.fillStyle = '#58636d';
    ctx.fillRect(x - 5, y - 4, 10, 18);
    ctx.beginPath();
    ctx.arc(x, y - 8, 11, 0, Math.PI * 2);
    ctx.strokeStyle = active ? ALERT : '#c0392b';
    ctx.lineWidth = 4;
    ctx.stroke();
    if (active) drawSteam(ctx, x, y - 18, now);
  }
  ctx.globalAlpha = 1;
}

// Chorro de agua de la tubería rota.
function drawSpray(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
): void {
  ctx.fillStyle = '#7cc4ff';
  for (let i = 0; i < 10; i++) {
    const k = ((now / 300 + i / 10) % 1);
    const ang = -Math.PI / 2 + Math.sin(i * 1.3) * 0.7;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(ang) * k * 34,
      y + Math.sin(ang) * k * 34 + k * k * 20,
      2.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
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
  for (let i = 0; i < 6; i++) {
    const k = ((now / 1100 + i / 6) % 1);
    ctx.globalAlpha = (1 - k) * 0.6;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(k * 6 + i) * 10,
      y - k * 50,
      6 + k * 14,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawWindmill(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#6d4c35';
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 50);
  ctx.lineTo(x + 14, y + 50);
  ctx.lineTo(x + 7, y);
  ctx.lineTo(x - 7, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#d8c3a5';
  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 36, y + Math.sin(a) * 36);
    ctx.stroke();
  }
}

function drawWell(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, 28, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#6f6a62';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, 20, 10, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#123150';
  ctx.fill();
  ctx.strokeStyle = '#d64545';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 26, 8, 0, Math.PI * 2);
  ctx.stroke();
}

function drawWaterTower(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#8b6f4e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 40);
  ctx.lineTo(x - 8, y);
  ctx.moveTo(x + 14, y + 40);
  ctx.lineTo(x + 8, y);
  ctx.stroke();
  ctx.fillStyle = '#5b7f99';
  roundRect(ctx, x - 18, y - 22, 36, 24, 6);
  ctx.fill();
}

function drawWaterfall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const g = ctx.createLinearGradient(x, y, x, y + 60);
  g.addColorStop(0, '#9fd3ff');
  g.addColorStop(1, 'rgba(159, 211, 255, 0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 25, y + 4, 50, 60);
}

function drawGreenhouse(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(150, 220, 170, 0.18)';
  ctx.strokeStyle = 'rgba(180, 240, 200, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 70);
  ctx.lineTo(x, y + 25);
  ctx.quadraticCurveTo(x + 55, y - 15, x + 110, y + 25);
  ctx.lineTo(x + 110, y + 70);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2f6b3a';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(x + 15 + i * 20, y + 58, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawSheets(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#a7a0b5';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 160, y);
  ctx.stroke();
  const colors = ['#e8e4f2', '#c9d8f0', '#f0d9e2'];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + 8 + i * 52, y, 40, 54);
  });
  ctx.globalAlpha = 1;
}

function drawPumpPanel(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#4a5560';
  roundRect(ctx, x - 26, y - 16, 52, 32, 4);
  ctx.fill();
  ctx.fillStyle = '#7dd87d';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 18 + i * 10, y - 6, 6, 12);
}

function drawPlantTanks(ctx: CanvasRenderingContext2D, x: number, y: number) {
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.arc(x + i * 70, y, 26, 0, Math.PI * 2);
    ctx.fillStyle = '#3d6b64';
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 255, 230, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// shade oscurece un color #rrggbb para la noche.
function shade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const k = 0.35;
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

// renderFixArrows: flechas rojas en el borde de la pantalla hacia los
// puntos de la emergencia que quedan lejos de la vista (S3-05).
export function renderFixArrows(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  emergency: Emergency | null,
  me: { x: number; y: number } | undefined,
  near: number,
): void {
  if (!emergency || !me) return;
  const margin = 34;
  const cx = camera.viewWidth / 2;
  const cy = camera.viewHeight / 2;
  for (const fp of map.fixPoints) {
    if (fp.kind !== emergency.kind) continue;
    if (Math.hypot(fp.x - me.x, fp.y - me.y) <= near) continue;
    const s = worldToScreen(camera, fp.x, fp.y);
    const m = worldToScreen(camera, me.x, me.y);
    const ang = Math.atan2(s.y - m.y, s.x - m.x);
    // Punto sobre un óvalo dentro de la pantalla en esa dirección.
    const x = cx + Math.cos(ang) * (cx - margin);
    const y = cy + Math.sin(ang) * (cy - margin);
    const held = emergency.heldPoints.includes(fp.id);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fillStyle = held ? '#22c55e' : ALERT;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}
