import type { Frame } from './assets';

// El tanque contaminado al 100 % sale del mismo sprite del tanque: el
// cuadro de agua llena (nivel 100) con el medidor teñido de agua turbia
// y el cuerpo con un poco de sedimento que sube desde la base. Misma
// silueta, mismos contornos y mismas proporciones que los demás.

// Medidor: de la sombra al brillo del agua turbia (r, g, b).
const MURK_DARK = [52, 50, 22] as const;
const MURK_LIGHT = [150, 138, 58] as const;
// Sedimento del cuerpo: cuánto se multiplica cada canal en la base.
const SEDIMENT = [0.86, 0.8, 0.52] as const;
const SEDIMENT_MIN = 0.1; // arriba casi no se nota
const SEDIMENT_RANGE = 0.38; // y crece hacia la base
const SEDIMENT_CURVE = 1.6;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// pollutedPixels devuelve una copia de full (RGBA de w × h, agua al 100)
// con el agua turbia. Los píxeles que cambian entre full y empty (nivel
// 0) son el agua del medidor; el resto es el cuerpo.
export function pollutedPixels(
  full: Uint8ClampedArray,
  empty: Uint8ClampedArray,
  w: number,
  h: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(full);
  for (let y = 0; y < h; y++) {
    const depth = Math.pow(y / h, SEDIMENT_CURVE);
    const sediment = SEDIMENT_MIN + SEDIMENT_RANGE * depth;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (out[i + 3] === 0) continue;
      const isWater =
        out[i] !== empty[i] ||
        out[i + 1] !== empty[i + 1] ||
        out[i + 2] !== empty[i + 2];
      if (isWater) {
        const lum = 0.3 * out[i] + 0.59 * out[i + 1] + 0.11 * out[i + 2];
        const t = Math.min(Math.max((lum - 70) / 110, 0), 1);
        for (let c = 0; c < 3; c++) {
          out[i + c] = lerp(MURK_DARK[c], MURK_LIGHT[c], t);
        }
      } else {
        for (let c = 0; c < 3; c++) {
          out[i + c] = out[i + c] * lerp(1, SEDIMENT[c], sediment);
        }
      }
    }
  }
  return out;
}

function pixelsOf(
  atlas: HTMLImageElement,
  f: Frame,
): ImageData | null {
  const canvas = document.createElement('canvas');
  canvas.width = f.w;
  canvas.height = f.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(atlas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  return ctx.getImageData(0, 0, f.w, f.h);
}

// buildPollutedTank arma el sprite una sola vez al cargar los assets.
// null si el navegador no deja leer los píxeles: entonces se dibuja el
// tanque vacío de siempre.
export function buildPollutedTank(
  atlas: HTMLImageElement,
  frames: Map<number, Frame>,
): HTMLCanvasElement | null {
  const fullFrame = frames.get(100);
  const emptyFrame = frames.get(0);
  if (!fullFrame || !emptyFrame) return null;
  try {
    const full = pixelsOf(atlas, fullFrame);
    const empty = pixelsOf(atlas, emptyFrame);
    if (!full || !empty) return null;
    const { width, height } = full;
    const data = pollutedPixels(full.data, empty.data, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    full.data.set(data);
    ctx.putImageData(full, 0, 0);
    return canvas;
  } catch {
    return null;
  }
}
