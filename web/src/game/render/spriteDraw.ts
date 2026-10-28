import { POSE_UNIT, type Pose } from './workPose';

// Dibujo de un sprite con su pose (workPose.ts): el escalado parte de los
// pies y la inclinación corre cada franja del sprite hacia un lado, más
// mientras más arriba está. Así la cabeza se echa adelante sin girar el
// sprite, que dejaría los píxeles torcidos.

const SLICES = 31; // franjas por sprite (4 filas en uno de 125)
const SEAM = 0.4; // las franjas se montan un poco para no dejar rayas
const LEAN_CURVE = 1.4; // el torso se dobla más cerca de la cabeza

export type SpriteBox = {
  x: number; // centro de los pies
  feetY: number;
  w: number; // ancho del sprite sin pose
  h: number;
};

export type SourceRect = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

// Una capa que va pegada a otra (un accesorio sobre el cuerpo) debe
// moverse igual que ella: pasa lo que mide el cuerpo y cuántas filas de
// la capa quedan sobre su primera fila (el margen de arriba).
export type PoseRef = {
  unitW: number; // ancho del cuerpo, para convertir la pose
  rows: number; // filas del cuerpo
  rowOffset: number; // filas de esta capa por encima del cuerpo
};

export function drawPosedSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: SpriteBox,
  pose: Pose,
  srcRect?: SourceRect,
  flip?: boolean,
  ref?: PoseRef,
): void {
  const unit = (ref?.unitW ?? box.w) / POSE_UNIT;
  const w = box.w * pose.sx;
  const h = box.h * pose.sy;
  const left = box.x + pose.dx * unit - w / 2;
  const top = box.feetY + pose.dy * unit - h;

  const sx = srcRect ? srcRect.sx : 0;
  const sy = srcRect ? srcRect.sy : 0;
  const sw = srcRect ? srcRect.sw : img.naturalWidth;
  const sh = srcRect ? srcRect.sh : img.naturalHeight;

  if (flip) {
    ctx.save();
    ctx.translate(box.x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-box.x, 0);
  }

  if (pose.lean === 0) {
    ctx.drawImage(img, sx, sy, sw, sh, left, top, w, h);
  } else {
    const rows = sh;
    const sliceRows = Math.max(1, Math.round(rows / SLICES));
    const rowH = h / rows;
    for (let r = 0; r < rows; r += sliceRows) {
      const n = Math.min(sliceRows, rows - r);
      const mid = ref
        ? (r + n / 2 - ref.rowOffset) / ref.rows
        : (r + n / 2) / rows;
      const shift = pose.lean * unit * (1 - mid) ** LEAN_CURVE;
      ctx.drawImage(
        img,
        sx,
        sy + r,
        sw,
        n,
        left + shift,
        top + r * rowH,
        w,
        n * rowH + SEAM,
      );
    }
  }

  if (flip) {
    ctx.restore();
  }
}

