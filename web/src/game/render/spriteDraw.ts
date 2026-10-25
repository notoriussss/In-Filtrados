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

export function drawPosedSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: SpriteBox,
  pose: Pose,
): void {
  const unit = box.w / POSE_UNIT;
  const w = box.w * pose.sx;
  const h = box.h * pose.sy;
  const left = box.x + pose.dx * unit - w / 2;
  const top = box.feetY + pose.dy * unit - h;
  if (pose.lean === 0) {
    ctx.drawImage(img, left, top, w, h);
    return;
  }
  const rows = img.naturalHeight;
  const sliceRows = Math.max(1, Math.round(rows / SLICES));
  const rowH = h / rows;
  for (let r = 0; r < rows; r += sliceRows) {
    const n = Math.min(sliceRows, rows - r);
    const mid = (r + n / 2) / rows;
    const shift = pose.lean * unit * (1 - mid) ** LEAN_CURVE;
    ctx.drawImage(
      img,
      0,
      r,
      img.naturalWidth,
      n,
      left + shift,
      top + r * rowH,
      w,
      n * rowH + SEAM,
    );
  }
}
