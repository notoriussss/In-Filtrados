// Cómo se ve un fantasma: el mismo personaje de siempre, pálido y con
// la parte de abajo deshecha en una cola ondulada, que flota sobre un
// halo en vez de una sombra y parpadea suave. Todo se dibuja encima del
// sprite del jugador (su color, skin y accesorio), no con un dibujo
// aparte. Colores de la dirección B-noche.

const AQUA = '#7ee6d8';
const MIST = 'rgba(170, 225, 255, 0.38)';
const HALO = 'rgba(150, 220, 255, 0.2)';
const MURK = '#2d2a14';

// Área del fantasma alrededor de sus pies, en unidades del mundo.
const AREA_W = 160;
const AREA_H = 200;
const ABOVE_FEET = 150;
const TAIL_TOP = 14; // dónde empieza a deshacerse, sobre los pies
const SCALLOPS = 3;

const BASE_ALPHA = 0.66;
const SHIMMER = 0.08;
const CALM_ALPHA = 0.62;

// ghostAlpha: opacidad del fantasma; con movimiento reducido no parpadea.
export function ghostAlpha(t: number, calm: boolean): number {
  if (calm) return CALM_ALPHA;
  return BASE_ALPHA + SHIMMER * Math.sin(t / 500);
}

// tailEdge: altura (sobre los pies) a la que se corta la cola en x, de 0
// a 1 a lo ancho del cuerpo. Cada onda se desplaza con el tiempo.
export function tailEdge(u: number, t: number): number {
  const wave = Math.sin(u * Math.PI * 2 * SCALLOPS + t / 220);
  return TAIL_TOP - 3 * wave;
}

let scratch: HTMLCanvasElement | null = null;

function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return scratch;
}

// drawGhost pinta el cuerpo con paint en un lienzo aparte, le da el
// aspecto de fantasma y lo pone en el mundo. paint dibuja en
// coordenadas del mundo, igual que un jugador vivo. styled false deja el
// sprite como viene (la hoja Gota ya trae su fila de fantasma). float es
// cuánto flota sobre el suelo: la cola sigue al cuerpo, el halo no.
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  float: number,
  t: number,
  calm: boolean,
  styled: boolean,
  paint: (target: CanvasRenderingContext2D) => void,
): void {
  const base = ctx.globalAlpha;
  drawHalo(ctx, x, feetY, t, calm);

  const m = ctx.getTransform();
  const scale = Math.min(Math.max(Math.ceil(Math.hypot(m.a, m.b)), 1), 4);
  const left = x - AREA_W / 2;
  const top = feetY - ABOVE_FEET;
  const canvas = scratchCanvas(AREA_W * scale, AREA_H * scale);
  const off = canvas.getContext('2d');
  if (!off) {
    ctx.globalAlpha = base * ghostAlpha(t, calm);
    paint(ctx);
    ctx.globalAlpha = 1;
    return;
  }
  off.setTransform(1, 0, 0, 1, 0, 0);
  off.clearRect(0, 0, canvas.width, canvas.height);
  off.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
  off.imageSmoothingEnabled = false;
  paint(off);
  if (styled) mistAndTail(off, x, feetY - float, left, t);

  ctx.globalAlpha = base * ghostAlpha(t, calm);
  ctx.drawImage(canvas, left, top, AREA_W, AREA_H);
  ctx.globalAlpha = 1;
  if (!calm) drawMotes(ctx, x, feetY - float, t);
}

// Tiñe de frío lo ya dibujado y le quita la parte de abajo con una cola
// de ondas (todo con el sprite como molde: nada se sale de su silueta).
function mistAndTail(
  off: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  left: number,
  t: number,
): void {
  off.globalCompositeOperation = 'source-atop';
  off.fillStyle = MIST;
  off.fillRect(left, feetY - ABOVE_FEET, AREA_W, AREA_H);

  off.globalCompositeOperation = 'destination-out';
  const fade = off.createLinearGradient(0, feetY - 30, 0, feetY - TAIL_TOP);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
  off.fillStyle = fade;
  off.fillRect(left, feetY - 30, AREA_W, 30 - TAIL_TOP);

  const half = 14; // el cuerpo mide unos 28 de ancho
  off.fillStyle = '#000';
  off.beginPath();
  off.moveTo(x - half - 2, feetY + 20);
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    off.lineTo(x - half + u * half * 2, feetY - tailEdge(u, t));
  }
  off.lineTo(x + half + 2, feetY + 20);
  off.closePath();
  off.fill();
  off.globalCompositeOperation = 'source-over';
}

// Halo pálido en el suelo, en lugar de la sombra de un vivo.
function drawHalo(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  t: number,
  calm: boolean,
): void {
  const pulse = calm ? 1 : 1 + 0.12 * Math.sin(t / 400);
  ctx.fillStyle = HALO;
  ctx.beginPath();
  ctx.ellipse(x, feetY - 1, 12 * pulse, 3.4 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Dos puntitos de luz que suben desde la cola y se apagan.
function drawMotes(
  ctx: CanvasRenderingContext2D,
  x: number,
  feetY: number,
  t: number,
): void {
  ctx.fillStyle = AQUA;
  for (let i = 0; i < 2; i++) {
    const k = ((t / 1700 + i * 0.5) % 1 + 1) % 1;
    ctx.globalAlpha = 0.55 * (1 - k);
    const sway = Math.sin(t / 300 + i * 2.1) * 4;
    ctx.fillRect(x + (i ? 6 : -7) + sway, feetY - 4 - k * 24, 2, 2);
  }
  ctx.globalAlpha = 1;
}

// drawGhostHaunt: lo que hace un fantasma cuando daña un tanque (se
// dibuja con la actividad 'tank'): una onda fría crece desde él y de la
// mano le caen gotas turbias del color del agua sucia. (x, y) es el
// centro del cuerpo; t va en milisegundos.
export function drawGhostHaunt(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
): void {
  const ring = (t / 900) % 1;
  ctx.strokeStyle = AQUA;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6 * (1 - ring);
  ctx.beginPath();
  ctx.ellipse(x, y + 14, 8 + ring * 18, 3 + ring * 7, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = MURK;
  for (let i = 0; i < 3; i++) {
    const k = (t / 700 + i / 3) % 1;
    ctx.globalAlpha = 0.85 * (1 - k * k);
    ctx.fillRect(x + 12 + i * 3, y + k * 18, 2, 3);
  }
  ctx.globalAlpha = 1;
}
