import type { Activity, PlayerView } from '@in-filtrados/messages';

// Animaciones en el mapa de lo que hace cada jugador (PlayerView.activity).
// Cada tarea de las 3R tiene la suya, así desde lejos se distingue quién
// cierra una fuga, quién junta agua y quién filtra. Limpiar y contaminar
// un tanque se ven igual a propósito: estar junto a un tanque no prueba
// nada (docs/design/game-plan.md, pistas).

const WATER = '#5ab4ff';
const GREY_WATER = '#9fb3c2';
const DIRTY = '#8a6a3c';
const METAL = '#b8c2cc';
const METAL_DARK = '#6b7680';
const WOOD = '#9a6b3f';
const SPARK = '#ffd166';
const FOAM = '#e8f4ff';
const OUTLINE = 'rgba(0, 0, 0, 0.6)';

// Dónde se dibuja el efecto respecto del jugador: a su derecha, a la
// altura de las manos.
const SIDE_X = 22;
const HAND_Y = -6;

// renderActivities dibuja en unidades del mundo (el contexto ya tiene la
// transformación de la cámara).
export function renderActivities(
  ctx: CanvasRenderingContext2D,
  players: PlayerView[],
  now: number,
  visible?: (p: PlayerView) => boolean,
): void {
  for (const p of players) {
    if (!p.activity) continue;
    if (visible && !visible(p)) continue;
    const s = { x: p.x, y: p.y - 10 };
    // Cada jugador con su propia fase, para que no se muevan al unísono.
    const t = now + phaseOf(p.id);
    ctx.save();
    ctx.globalAlpha = p.alive ? 1 : 0.5;
    drawActivity(ctx, p.activity, s.x, s.y, t);
    ctx.restore();
  }
}

export function drawActivity(
  ctx: CanvasRenderingContext2D,
  activity: Activity,
  x: number,
  y: number,
  t: number,
): void {
  switch (activity) {
    case 'reduce':
      drawFixLeak(ctx, x + SIDE_X, y + HAND_Y, t);
      break;
    case 'reuse':
      drawPourBucket(ctx, x + SIDE_X, y + HAND_Y - 14, t);
      break;
    case 'recycle':
      drawFilter(ctx, x + SIDE_X + 2, y + HAND_Y - 16, t);
      break;
    case 'tank':
      drawTankWork(ctx, x, y, t);
      break;
    case 'fix':
      drawRepair(ctx, x + SIDE_X, y + HAND_Y, t);
      break;
  }
}

// Reducir: un tubo con una fuga que se va cerrando mientras una llave
// inglesa gira de ida y vuelta. El chorro se achica en ciclos de 3 s.
function drawFixLeak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  const cycle = (t % 3000) / 3000; // 0 = fuga abierta, 1 = cerrada
  const flow = 1 - cycle;
  ctx.fillStyle = METAL_DARK;
  ctx.fillRect(x - 6, y - 4, 26, 8);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, y - 4, 26, 8);
  // Chorro en abanico que sale de la fuga.
  ctx.fillStyle = WATER;
  for (let i = 0; i < 6; i++) {
    const k = (t / 260 + i / 6) % 1;
    const spread = (i - 2.5) * 0.25 * flow;
    const dist = 6 + k * 18 * flow;
    ctx.globalAlpha = (1 - k) * flow;
    ctx.beginPath();
    ctx.arc(
      x + 14 + Math.sin(spread) * dist,
      y - 4 - Math.cos(spread) * dist,
      1.8 + flow,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Llave inglesa que gira sobre la tuerca.
  const angle = Math.sin(t / 180) * 0.8;
  ctx.save();
  ctx.translate(x + 4, y);
  ctx.rotate(angle - 0.6);
  ctx.fillStyle = METAL;
  ctx.fillRect(-2, -16, 4, 16);
  ctx.beginPath();
  ctx.arc(0, -17, 5, Math.PI * 0.15, Math.PI * 1.85);
  ctx.lineWidth = 3;
  ctx.strokeStyle = METAL;
  ctx.stroke();
  ctx.restore();
}

// Reutilizar: una cubeta que se inclina y vierte agua gris en un
// balde; las gotas salpican al caer.
function drawPourBucket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  const tilt = 0.35 + Math.sin(t / 300) * 0.35;
  // Balde de abajo, que recibe el agua.
  const by = y + 30;
  ctx.fillStyle = WOOD;
  ctx.beginPath();
  ctx.moveTo(x - 8, by - 6);
  ctx.lineTo(x + 12, by - 6);
  ctx.lineTo(x + 9, by + 6);
  ctx.lineTo(x - 5, by + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = GREY_WATER;
  ctx.fillRect(x - 6, by - 5, 16, 3);
  // Chorro y gotas entre las dos cubetas.
  if (tilt > 0.25) {
    ctx.strokeStyle = GREY_WATER;
    ctx.lineWidth = 2 + tilt * 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 4);
    ctx.quadraticCurveTo(x + 6, y + 14, x + 3, by - 6);
    ctx.stroke();
    ctx.fillStyle = GREY_WATER;
    for (let i = 0; i < 3; i++) {
      const k = (t / 220 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.beginPath();
      ctx.arc(
        x + 3 + (i - 1) * 6 * k,
        by - 7 - Math.sin(k * Math.PI) * 6,
        1.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Cubeta que vierte, inclinada.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.fillStyle = METAL;
  ctx.beginPath();
  ctx.moveTo(-7, -7);
  ctx.lineTo(7, -7);
  ctx.lineTo(5, 7);
  ctx.lineTo(-5, 7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = GREY_WATER;
  ctx.fillRect(-6, -6, 12, 3);
  ctx.beginPath();
  ctx.arc(0, -7, 7, Math.PI, 0);
  ctx.strokeStyle = METAL_DARK;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// Reciclar: un filtro de tres capas (grava, arena y carbón). Entran
// gotas sucias por arriba, salen limpias por abajo y suben burbujas.
function drawFilter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  const w = 16;
  const layers = ['#8e9399', '#d9c08c', '#2f2f35'];
  ctx.fillStyle = 'rgba(200, 230, 255, 0.35)';
  ctx.fillRect(x - w / 2, y, w, 30);
  layers.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(x - w / 2, y + 8 + i * 6, w, 6);
  });
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2, y, w, 30);
  // Gota sucia que entra y gota limpia que sale.
  const k = (t % 900) / 900;
  ctx.fillStyle = DIRTY;
  ctx.globalAlpha = 1 - k;
  ctx.beginPath();
  ctx.arc(x, y - 10 + k * 14, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = WATER;
  ctx.globalAlpha = k;
  ctx.beginPath();
  ctx.arc(x, y + 32 + k * 10, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Burbujas que suben en zigzag.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = FOAM;
  for (let i = 0; i < 3; i++) {
    const b = (t / 700 + i / 3) % 1;
    ctx.globalAlpha = 1 - b;
    ctx.beginPath();
    ctx.arc(
      x + Math.sin(b * 8 + i) * 4 + (i - 1) * 4,
      y + 6 - b * 20,
      1.5 + b * 1.5,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Flechas giratorias del reciclaje.
  ctx.save();
  ctx.translate(x + 15, y - 6);
  ctx.rotate(t / 500);
  ctx.strokeStyle = '#6ad19a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.rotate((Math.PI * 2) / 3);
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

// Tanque (limpiar o contaminar): ondas en el agua alrededor de los pies
// y un cucharón que revuelve en círculos con espuma. Igual para los dos.
function drawTankWork(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  for (let i = 0; i < 3; i++) {
    const k = (t / 900 + i / 3) % 1;
    ctx.globalAlpha = (1 - k) * 0.8;
    ctx.strokeStyle = FOAM;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 14, 10 + k * 26, 4 + k * 9, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const a = t / 260;
  const lx = x + Math.cos(a) * 14;
  const ly = y + 4 + Math.sin(a) * 5;
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 16);
  ctx.lineTo(lx, ly);
  ctx.stroke();
  ctx.fillStyle = FOAM;
  for (let i = 0; i < 4; i++) {
    const k = (t / 400 + i / 4) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.arc(lx + Math.cos(i * 1.7) * 8 * k, ly - k * 12, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Arreglar una emergencia: martillo que golpea y chispas en cada golpe.
function drawRepair(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  const k = (t % 500) / 500;
  const swing = k < 0.7 ? -1.1 + (k / 0.7) * 1.4 : 0.3 - (k - 0.7) * 4.6;
  ctx.save();
  ctx.translate(x, y + 6);
  ctx.rotate(swing);
  ctx.fillStyle = WOOD;
  ctx.fillRect(-1.5, -18, 3, 18);
  ctx.fillStyle = METAL;
  ctx.fillRect(-6, -22, 12, 6);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(-6, -22, 12, 6);
  ctx.restore();
  // Chispas justo después del golpe.
  if (k > 0.65 && k < 0.95) {
    const burst = (k - 0.65) / 0.3;
    ctx.strokeStyle = SPARK;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 1 - burst;
    for (let i = 0; i < 6; i++) {
      const ang = -Math.PI / 2 + (i - 2.5) * 0.45;
      const r1 = 4 + burst * 8;
      const r2 = r1 + 5;
      ctx.beginPath();
      ctx.moveTo(x + 10 + Math.cos(ang) * r1, y - 4 + Math.sin(ang) * r1);
      ctx.lineTo(x + 10 + Math.cos(ang) * r2, y - 4 + Math.sin(ang) * r2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// phaseOf da a cada jugador un desfase fijo a partir de su id.
export function phaseOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 1000;
}
