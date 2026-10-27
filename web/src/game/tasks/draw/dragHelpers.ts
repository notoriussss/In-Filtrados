import { C, PX, px, pxLine } from './pixel';

// Herramientas de las escenas que arrastran piezas (clasificar, regar,
// compost): el destino marcado con guiones y la flecha de puntos que
// avanza. El dibujo por escena queda en su propio archivo.

export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type ZoneTone = 'idle' | 'good' | 'bad';

const TONE: Record<ZoneTone, string> = {
  idle: C.aqua,
  good: C.leaf,
  bad: C.coral,
};

// drawDropZone marca con guiones un rectángulo destino mientras se
// arrastra algo encima; good/bad dice si soltar ahí saldría bien.
export function drawDropZone(
  ctx: CanvasRenderingContext2D,
  box: Box,
  now: number,
  calm: boolean,
  tone: ZoneTone = 'idle',
): void {
  const color = TONE[tone];
  ctx.globalAlpha =
    tone === 'idle' ? (calm ? 0.7 : 0.55 + 0.25 * Math.sin(now / 160)) : 0.9;
  const dash = 8;
  for (let x = box.x - 6; x < box.x + box.w + 6; x += dash * 2) {
    px(ctx, x, box.y - 6, dash, PX, color);
    px(ctx, x, box.y + box.h + 4, dash, PX, color);
  }
  for (let y = box.y - 6; y < box.y + box.h + 6; y += dash * 2) {
    px(ctx, box.x - 6, y, PX, dash, color);
    px(ctx, box.x + box.w + 4, y, PX, dash, color);
  }
  ctx.globalAlpha = 1;
}

// drawMarchArrow: flecha de puntos que avanza de a hacia b, con punta.
export function drawMarchArrow(
  ctx: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  now: number,
  calm: boolean,
  color: string = C.amber,
): void {
  const march = calm ? 0 : (now / 50) % 12;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 12) return;
  for (let d = march; d < len - 8; d += 12) {
    const k = d / len;
    px(
      ctx,
      a.x + (b.x - a.x) * k,
      a.y + (b.y - a.y) * k,
      PX * 2,
      PX * 2,
      color,
    );
  }
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  for (const da of [Math.PI * 0.8, -Math.PI * 0.8]) {
    pxLine(
      ctx,
      b.x,
      b.y,
      b.x + Math.cos(ang + da) * 10,
      b.y + Math.sin(ang + da) * 10,
      color,
      2,
    );
  }
}
