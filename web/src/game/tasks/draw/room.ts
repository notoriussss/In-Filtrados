import { BOARD, FLOOR_Y } from '../minigames';
import { C, PX, bakeBoard, px, pxEllipse } from './pixel';

// El cuarto de bombas que hay detrás de los tres minijuegos: pared de
// paneles remachados, franja de peligro, piso de placas y una lámpara en
// el techo. Se hornea una vez; cada escena le suma sus piezas.

const PANEL_W = 72;
const GLOW_LAYERS = [
  { rx: 150, ry: 84, color: 'rgba(126, 230, 216, 0.035)' },
  { rx: 104, ry: 58, color: 'rgba(126, 230, 216, 0.045)' },
  { rx: 62, ry: 34, color: 'rgba(207, 238, 255, 0.06)' },
];

function drawWall(c: CanvasRenderingContext2D): void {
  px(c, 0, 0, BOARD.w, FLOOR_Y, C.wall);
  for (let x = 0; x < BOARD.w; x += PANEL_W) {
    px(c, x, 0, PX, FLOOR_Y, C.seam);
    px(c, x + PX, 0, PX, FLOOR_Y, C.wallHi);
    for (const y of [16, 112, 196]) {
      px(c, x + 8, y, PX, PX, C.line);
      px(c, x + PANEL_W - 10, y, PX, PX, C.line);
    }
  }
  // Riel del techo y sombra bajo él.
  px(c, 0, 0, BOARD.w, 8, C.wallLo);
  px(c, 0, 8, BOARD.w, PX, C.seam);
  c.globalAlpha = 0.5;
  px(c, 0, 10, BOARD.w, 4, C.seam);
  c.globalAlpha = 1;
}

function drawLamp(c: CanvasRenderingContext2D): void {
  for (const g of GLOW_LAYERS) {
    pxEllipse(c, BOARD.w / 2, 10, g.rx, g.ry, g.color);
  }
  const x = BOARD.w / 2 - 14;
  px(c, x, 8, 28, 8, C.metalDeep);
  px(c, x + 2, 8, 24, 2, C.metalMid);
  px(c, x + 4, 16, 20, 4, C.white);
  px(c, x + 6, 16, 16, 2, C.waterHi);
}

// Franja de peligro: rayas diagonales de ámbar apagado y tinta.
function drawHazard(c: CanvasRenderingContext2D): void {
  const top = FLOOR_Y - 8;
  px(c, 0, top - PX, BOARD.w, PX, C.metalDeep);
  for (let ax = 0; ax < BOARD.w / PX; ax++) {
    for (let ay = 0; ay < 4; ay++) {
      const on = (ax + ay) % 6 < 3;
      px(c, ax * PX, top + ay * PX, PX, PX, on ? C.amberLo : C.ink);
    }
  }
}

function drawFloor(c: CanvasRenderingContext2D): void {
  px(c, 0, FLOOR_Y, BOARD.w, BOARD.h - FLOOR_Y, C.floor);
  px(c, 0, FLOOR_Y, BOARD.w, PX, C.floorHi);
  px(c, 0, FLOOR_Y + PX, BOARD.w, PX, C.line);
  for (let x = 0; x < BOARD.w; x += 60) {
    px(c, x, FLOOR_Y + 4, PX, BOARD.h - FLOOR_Y, C.floorLo);
    px(c, x + 28, FLOOR_Y + 14, 2, 2, C.floorHi);
  }
  // Sombra del fondo del piso, a punto de píxeles.
  for (let ax = 0; ax < BOARD.w / PX; ax += 2) {
    px(c, ax * PX, FLOOR_Y + 6, PX, PX, C.floorLo);
  }
  px(c, 0, BOARD.h - 6, BOARD.w, 6, C.floorLo);
}

function drawFrame(c: CanvasRenderingContext2D): void {
  // Marco interior oscuro para que el tablero se asiente en su panel.
  c.globalAlpha = 0.4;
  px(c, 0, 0, BOARD.w, 4, C.ink);
  px(c, 0, BOARD.h - 4, BOARD.w, 4, C.ink);
  px(c, 0, 0, 4, BOARD.h, C.ink);
  px(c, BOARD.w - 4, 0, 4, BOARD.h, C.ink);
  c.globalAlpha = 1;
}

let room: HTMLCanvasElement | null = null;

// roomLayer devuelve el fondo ya horneado.
export function roomLayer(): HTMLCanvasElement {
  room ??= bakeBoard((c) => {
    drawWall(c);
    drawLamp(c);
    drawHazard(c);
    drawFloor(c);
    drawFrame(c);
  });
  return room;
}
