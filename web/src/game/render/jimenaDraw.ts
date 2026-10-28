import { type SpriteBox, drawPosedSprite } from './spriteDraw';
import {
  ACCESSORY_CELL_H,
  ACCESSORY_CELL_W,
  ACCESSORY_PAD_Y,
  SPRITE_H,
  SPRITE_W,
  type SpriteFrame,
  accessoryCell,
  jimenaBakedImage,
} from './sprites';
import type { Pose } from './workPose';

// Dibuja un cuadro de Jimena. La hoja del color y accesorio trae al
// personaje completo (el accesorio ya va integrado en su rejilla de
// píxeles), con margen para lo que sobresale del cuadro: se dibuja más
// grande que el cuerpo suelto pero con los mismos pies y la misma pose. Si la
// hoja todavía no cargó se usa el cuadro suelto.
export function drawJimena(
  ctx: CanvasRenderingContext2D,
  body: HTMLImageElement,
  frame: SpriteFrame,
  box: SpriteBox,
  pose: Pose,
  color: string,
  accessory?: string,
): void {
  const baked = jimenaBakedImage(color, accessory);
  if (!baked) {
    drawPosedSprite(ctx, body, box, pose);
    return;
  }
  const layerBox: SpriteBox = {
    x: box.x,
    feetY: box.feetY,
    w: (box.w * ACCESSORY_CELL_W) / SPRITE_W,
    h: (box.h * ACCESSORY_CELL_H) / SPRITE_H,
  };
  const ref = {
    unitW: box.w,
    rows: SPRITE_H,
    rowOffset: ACCESSORY_PAD_Y,
  };
  drawPosedSprite(ctx, baked, layerBox, pose, accessoryCell(frame), false, ref);
}
