import { drawPosedSprite } from '../../render/spriteDraw';
import {
  GOTA_CELL_H,
  GOTA_CELL_W,
  SPRITE_COLORS,
  SPRITE_H,
  SPRITE_W,
  type SpriteFrame,
  gotaAccessoryImage,
  gotaBodyImage,
  spriteImage,
} from '../../render/sprites';
import { SKIN_GOTA, type Skin } from '../../../shop';
import { drawDust, drawSparkles, drawSweat } from '../../render/workFx';
import {
  IDLE_POSE,
  type Pose,
  amplifyPose,
  lerpPose,
} from '../../render/workPose';
import { BOARD_SCALE, C, PX, px } from './pixel';

// El personaje del jugador dentro del tablero del minijuego, con su color
// y sus mismos cuadros del mapa. Cada escena le dice qué pose tomar en
// cada cuadro y el héroe la alcanza con suavidad, así que pasa de esperar
// a trabajar sin saltos.

// Un píxel del sprite mide un píxel de pantalla: sin escalado raro.
const HERO_W = SPRITE_W / BOARD_SCALE;
const HERO_H = SPRITE_H / BOARD_SCALE;
// El personaje es pequeño en el tablero: se exagera el movimiento.
const AMPLITUDE = 1.4;
const DEFAULT_COLOR = '#4363d8';
const FOLLOW_RATE = 16; // qué tan rápido alcanza la pose meta, por segundo

export type Face = 'left' | 'right';

function mirrorFrame(frame: SpriteFrame): SpriteFrame {
  if (frame.startsWith('right-'))
    return frame.replace('right-', 'left-') as SpriteFrame;
  if (frame.startsWith('left-'))
    return frame.replace('left-', 'right-') as SpriteFrame;
  return frame;
}

function mirrorPose(p: Pose): Pose {
  return { ...p, frame: mirrorFrame(p.frame), dx: -p.dx, lean: -p.lean };
}

function frameToGotaCol(frame: SpriteFrame): number {
  if (frame === 'right-walking1' || frame === 'left-walking1') return 8;
  if (frame === 'right-passing1' || frame === 'left-passing1') return 9;
  if (frame === 'right-walking2' || frame === 'left-walking2') return 10;
  if (frame === 'right-passing2' || frame === 'left-passing2') return 11;
  if (frame.startsWith('back')) return 12;
  return 0;
}

export class Hero {
  private pose: Pose = IDLE_POSE;
  private face: Face = 'right';
  private readonly color: string;
  private readonly accessory?: string;
  private readonly skin: Skin | undefined;

  constructor(
    color: string | undefined,
    readonly x: number,
    readonly feetY: number,
    accessory?: string,
    skin?: Skin,
  ) {
    this.skin = skin;
    const known = color && SPRITE_COLORS[color.toLowerCase()];
    this.color = known && color ? color : DEFAULT_COLOR;
    this.accessory = accessory;
  }

  // lookAt gira al personaje hacia el lado donde pasa algo.
  lookAt(face: Face): void {
    this.face = face;
  }

  // drive acerca la pose actual a la meta; el cuadro cambia al instante.
  drive(target: Pose, dtMs: number): void {
    const k = 1 - Math.exp((-dtMs / 1000) * FOLLOW_RATE);
    this.pose = lerpPose(this.pose, target, k);
  }

  // headTop es la altura de la cabeza, para colgarle cosas encima.
  get headTop(): number {
    return this.feetY - HERO_H * this.pose.sy + this.pose.dy * AMPLITUDE;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    now: number,
    opts: { calm: boolean; celebrate: number | null },
  ): void {
    const raw = opts.calm
      ? { ...IDLE_POSE, frame: this.pose.frame }
      : this.pose;
    const shown = amplifyPose(
      this.face === 'left' ? mirrorPose(raw) : raw,
      AMPLITUDE,
    );
    this.drawShadow(ctx, shown.shadow);

    // Jimena de inicio; la gota solo si el jugador la compró.
    const isGota = this.skin === SKIN_GOTA;
    const bodyImg = isGota ? gotaBodyImage(this.color) : null;
    const accImg = isGota ? gotaAccessoryImage(this.accessory) : null;

    if (bodyImg) {
      const col = frameToGotaCol(shown.frame);
      const flip =
        shown.frame.startsWith('left-') ||
        (this.face === 'left' && shown.frame === 'front');
      const srcRect = {
        sx: col * GOTA_CELL_W,
        sy: 0,
        sw: GOTA_CELL_W,
        sh: GOTA_CELL_H,
      };
      const box = {
        x: this.x,
        feetY: this.feetY,
        w: GOTA_CELL_W,
        h: GOTA_CELL_H,
      };
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      drawPosedSprite(ctx, bodyImg, box, shown, srcRect, flip);
      if (accImg) {
        drawPosedSprite(ctx, accImg, box, shown, srcRect, flip);
      }
      ctx.restore();
    } else {
      const img = spriteImage(this.color, shown.frame);
      if (img) {
        const box = { x: this.x, feetY: this.feetY, w: HERO_W, h: HERO_H };
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        drawPosedSprite(ctx, img, box, shown);
        ctx.restore();
      }
    }

    if (opts.calm) return;
    const head = this.headTop;
    const lean = shown.lean;
    drawSweat(ctx, this.x + shown.dx + lean, head, now, this.pose.strain);
    if (shown.dust !== null) drawDust(ctx, this.x, this.feetY, shown.dust);
    if (opts.celebrate !== null) {
      drawSparkles(ctx, this.x, this.feetY - HERO_H * 0.55, opts.celebrate);
    }
  }

  // Sombra de píxeles bajo los pies; se achica cuando salta.
  private drawShadow(ctx: CanvasRenderingContext2D, scale: number): void {
    ctx.globalAlpha = 0.45;
    const half = Math.round((HERO_W * 0.3 * scale) / PX) * PX;
    px(ctx, this.x - half, this.feetY - PX, half * 2, PX, C.ink);
    px(
      ctx,
      this.x - half + PX * 2,
      this.feetY - PX * 2,
      half * 2 - PX * 4,
      PX,
      C.ink,
    );
    ctx.globalAlpha = 1;
  }
}
