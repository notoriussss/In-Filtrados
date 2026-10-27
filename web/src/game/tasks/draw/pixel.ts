// Herramientas de dibujo pixel-art para los minijuegos. El tablero está en
// unidades (BOARD) y un píxel de arte mide PX unidades; con BOARD_SCALE = 2
// eso da 4 píxeles de pantalla, igual que los píxeles de los sprites de
// los personajes. Todo lo que se dibuja se ajusta a esa rejilla.

import { BOARD } from '../minigames';

export const PX = 2;
// Píxeles de pantalla por unidad del tablero.
export const BOARD_SCALE = 2;

// Paleta del kit B-noche (styles/ui-kit.css) más los metales y el agua
// que necesitan las escenas.
export const C = {
  ink: '#04101f',
  wall: '#0a1f3a',
  wallHi: '#0d2a46',
  wallLo: '#071a30',
  seam: '#051224',
  line: '#1c4d75',
  lineHi: '#4a9bd0',
  floor: '#0d2a46',
  floorHi: '#1c4d75',
  floorLo: '#08203a',
  aqua: '#7ee6d8',
  water: '#3fb2ff',
  waterHi: '#9fd8ff',
  waterLo: '#2b7bb5',
  waterDeep: '#1c5a8a',
  leaf: '#5fe08a',
  leafHi: '#c8ffd9',
  leafLo: '#2f8a55',
  amber: '#ffd24a',
  amberHi: '#fff0a8',
  amberLo: '#a58a1e',
  coral: '#ff6b6b',
  coralHi: '#ffc2c2',
  coralLo: '#b34545',
  metalHi: '#d6dee6',
  metal: '#b8c2cc',
  metalMid: '#8d99a6',
  metalDark: '#5c6773',
  metalDeep: '#3a434d',
  metalInk: '#1a2028',
  grey: '#9fb3c2',
  greyHi: '#c4d3de',
  greyLo: '#6f8394',
  dirt: '#8a6a3c',
  dirtHi: '#b08c58',
  dirtLo: '#5e4526',
  white: '#e8f8ff',
} as const;

export function snap(v: number): number {
  return Math.round(v / PX) * PX;
}

// px rellena un rectángulo en unidades del tablero, ajustado a la rejilla.
export function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const x0 = snap(x);
  const y0 = snap(y);
  ctx.fillRect(
    x0,
    y0,
    Math.max(PX, snap(x + w) - x0),
    Math.max(PX, snap(y + h) - y0),
  );
}

// pxLine dibuja una línea de cuadritos de grosor thick (en píxeles de arte).
export function pxLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thick = 1,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / PX));
  const size = thick * PX;
  ctx.fillStyle = color;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    ctx.fillRect(
      snap(x0 + (x1 - x0) * k - size / 2),
      snap(y0 + (y1 - y0) * k - size / 2),
      size,
      size,
    );
  }
}

// pxRing dibuja un arco de círculo (de a0 a a1, en radianes, 0 a la
// derecha y los ángulos crecen hacia abajo) con cuadritos.
export function pxRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  thick = 1,
  a0 = 0,
  a1 = Math.PI * 2,
): void {
  const size = thick * PX;
  const step = (PX * 0.5) / Math.max(r, 1);
  ctx.fillStyle = color;
  for (let a = a0; a <= a1; a += step) {
    ctx.fillRect(
      snap(cx + Math.cos(a) * r - size / 2),
      snap(cy + Math.sin(a) * r - size / 2),
      size,
      size,
    );
  }
}

// pxDisc rellena un círculo.
export function pxDisc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const r2 = r * r;
  for (let y = -r; y <= r; y += PX) {
    for (let x = -r; x <= r; x += PX) {
      if (x * x + y * y <= r2) ctx.fillRect(snap(cx + x), snap(cy + y), PX, PX);
    }
  }
}

// pxEllipse rellena una elipse; sirve para luces y charcos.
export function pxEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
): void {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y += PX) {
    for (let x = -rx; x <= rx; x += PX) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d <= 1) ctx.fillRect(snap(cx + x), snap(cy + y), PX, PX);
    }
  }
}

// bake dibuja una sola vez en un canvas aparte, para escenas estáticas o
// sprites que luego se estampan (y se giran) sin repetir el trabajo.
export function bake(
  w: number,
  h: number,
  draw: (c: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  if (c) {
    c.imageSmoothingEnabled = false;
    draw(c);
  }
  return cv;
}

// bakeBoard hornea una escena estática del tamaño del tablero (ya a la
// escala de pantalla) para estamparla de un golpe en cada cuadro.
export function bakeBoard(
  draw: (c: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  return bake(BOARD.w * BOARD_SCALE, BOARD.h * BOARD_SCALE, (c) => {
    c.scale(BOARD_SCALE, BOARD_SCALE);
    draw(c);
  });
}

// spriteFromRows arma un sprite de un píxel por carácter. '.' es
// transparente; el resto se busca en la paleta.
export function spriteFromRows(
  rows: string[],
  palette: Record<string, string>,
): HTMLCanvasElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  return bake(w, h, (c) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const color = palette[row[x]];
        if (!color) continue;
        c.fillStyle = color;
        c.fillRect(x, y, 1, 1);
      }
    });
  });
}

// stamp dibuja un sprite de píxeles de arte con su centro en (cx, cy),
// girado y a escala. Sin suavizado, para que los píxeles queden nítidos.
export function stamp(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  cx: number,
  cy: number,
  opts: { angle?: number; scale?: number; flip?: boolean } = {},
): void {
  const k = (opts.scale ?? 1) * PX;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(snap(cx), snap(cy));
  if (opts.angle) ctx.rotate(opts.angle);
  ctx.scale(opts.flip ? -k : k, k);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
  ctx.restore();
}

// mix mezcla dos colores #rrggbb; k = 0 da a, k = 1 da b.
export function mix(a: string, b: string, k: number): string {
  const ch = (c: string, i: number) =>
    parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
}

export function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 1);
}

// hash01 vive en minigames.ts porque también la usa la lógica de los
// juegos; aquí solo se reexporta para las escenas.
export { hash01 } from '../minigames';
