import { TASK_TEXT } from '../../../constants';
import { BOARD } from '../minigames';
import { C, PX, bake, px, pxRing, spriteFromRows, stamp } from './pixel';

// La mano que enseña qué hacer (los minijuegos no llevan instrucciones
// escritas) y el cartel de «¡Listo!» al terminar. Son sprites de píxeles,
// no emojis: se ven igual en todos los equipos.

const HAND_ROWS = [
  '....oo.......',
  '...owwo......',
  '...owwo......',
  '...owwo......',
  '...owwooo....',
  '...owwowwoo..',
  'oo.owwowwowo.',
  'owoowwwwwwwwo',
  'owwowwwwwwwwo',
  '.owwwwwwwwwo.',
  '..owwwwwwwwo.',
  '..owwwwwwwo..',
  '...owwwwwso..',
  '...oooooooo..',
];
// La punta del dedo, en píxeles de arte desde el centro del sprite.
const TIP = { x: -2, y: -7 };

let hand: HTMLCanvasElement | null = null;

function handSprite(): HTMLCanvasElement {
  hand ??= spriteFromRows(HAND_ROWS, {
    o: C.ink,
    w: '#fff4d6',
    s: '#e0b878',
  });
  return hand;
}

// drawHand pone la punta del dedo en (x, y). press va de 0 (levantada) a
// 1 (apretando): la mano baja un poco al apretar.
export function drawHand(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  press: number,
): void {
  const down = press * 4;
  stamp(ctx, handSprite(), x - TIP.x * PX, y - TIP.y * PX + down);
}

// drawTapRing: anillo que se abre desde el punto tocado; k de 0 a 1.
export function drawTapRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  k: number,
  color: string = C.amber,
): void {
  ctx.globalAlpha = Math.max(0, 1 - k);
  pxRing(ctx, x, y, 4 + k * 22, color, 1);
  ctx.globalAlpha = 1;
}

const CHECK_ROWS = [
  '.......ww',
  '......www',
  'w....www.',
  'ww..www..',
  'www.ww...',
  '.wwww....',
  '..www....',
  '...w.....',
];

let check: HTMLCanvasElement | null = null;

const BANNER = { w: 132, h: 34 };
const BANNER_FONT = '12px "Press Start 2P", monospace';
const SLIDE_MS = 380;

export function warmBannerFont(): void {
  try {
    void document.fonts?.load(BANNER_FONT);
  } catch {
    // Sin soporte de fuentes: se dibuja con la de respaldo.
  }
}

// drawDoneBanner baja desde arriba con un rebote corto; since son los ms
// desde que se terminó.
export function drawDoneBanner(
  ctx: CanvasRenderingContext2D,
  since: number,
  calm: boolean,
): void {
  const k = calm ? 1 : Math.min(1, since / SLIDE_MS);
  const back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
  const y = 14 - (1 - back) * 40;
  const x = (BOARD.w - BANNER.w) / 2;
  check ??= bake(9, 8, (c) => {
    c.fillStyle = C.ink;
    CHECK_ROWS.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === 'w') c.fillRect(rx, ry, 1, 1);
      }
    });
  });
  px(ctx, x - 4, y - 4, BANNER.w + 8, BANNER.h + 8, C.leafHi);
  px(ctx, x - 2, y - 2, BANNER.w + 4, BANNER.h + 4, C.ink);
  px(ctx, x, y, BANNER.w, BANNER.h, C.leafLo);
  px(ctx, x, y, BANNER.w, 4, C.leaf);
  px(ctx, x, y + BANNER.h - 4, BANNER.w, 4, '#1f6b40');
  // Marca de listo.
  px(ctx, x + 8, y + 7, 20, 20, C.leaf);
  stamp(ctx, check, x + 18, y + 17, { scale: 1.6 });
  ctx.font = BANNER_FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.ink;
  ctx.fillText(TASK_TEXT.DONE, x + 38 + 1.5, y + BANNER.h / 2 + 2);
  ctx.fillStyle = C.white;
  ctx.fillText(TASK_TEXT.DONE, x + 38, y + BANNER.h / 2);
}
