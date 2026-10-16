import type {
  Emergency,
  OilDrop,
  PlayerView,
  TankView,
} from '@in-filtrados/messages';
import type { GameMap } from '../../map';
import type { Frame, MapAssets } from './assets';
import {
  type Camera,
  applyWorldTransform,
  visibleRect,
  worldToScreen,
} from './camera';
import {
  type StationMarks,
  drawBar,
  drawFixArrows,
  drawFixPoints,
  drawHoldProgress,
  drawOilDrops,
  drawStationMarks,
  drawTag,
  drawTankGrime,
} from './effects';
import { renderActivities } from './activityFx';
import type { PlayerAnimator } from './playerAnim';
import { depthOf, drawPlayer, topOf } from './players';
import { renderDarkness } from './vision';

// Lo que necesita un cuadro del mundo. Todo sale del último snapshot y de
// la interpolación; el renderer no decide nada del juego.
export type WorldFrame = {
  camera: Camera;
  dpr: number;
  now: number; // ms, para las animaciones
  tick: number | null; // tick del servidor dibujado (gotas de aceite)
  players: PlayerView[]; // ya interpolados
  meId: string;
  tanks: TankView[];
  oilDrops: OilDrop[];
  emergency: Emergency | null;
  marks: StationMarks | null;
  visionRadius: number | null; // null: sin límite (fantasma, reunión)
  visible: (p: PlayerView) => boolean;
  canSee: (x: number, y: number) => boolean;
  hold: { progress: number; spin: number } | null;
};

const BACKGROUND = '#04101f';
const TANK_BAR_W = 40;

// tankLevel: el atlas trae el nivel de agua limpia (0 a 100 de 10 en 10)
// y match manda contaminación; un tanque muerto se ve vacío.
export function tankLevel(t: Pick<TankView, 'contamination' | 'dead'>) {
  if (t.dead) return 0;
  const clean = 100 - Math.min(Math.max(t.contamination, 0), 100);
  return Math.round(clean / 10) * 10;
}

type Drawable = { depth: number; draw: () => void };

export class WorldRenderer {
  constructor(
    private readonly assets: MapAssets,
    private readonly map: GameMap,
    private readonly animator: PlayerAnimator,
  ) {}

  render(ctx: CanvasRenderingContext2D, f: WorldFrame): void {
    const { camera, dpr, now } = f;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, camera.viewWidth, camera.viewHeight);

    applyWorldTransform(ctx, camera, dpr);
    ctx.imageSmoothingEnabled = false;
    const view = visibleRect(camera);
    this.drawLayer(ctx, this.assets.ground, view);
    if (f.tick !== null) {
      drawOilDrops(
        ctx,
        f.oilDrops.filter((d) => f.canSee(d.x, d.y)),
        f.tick,
      );
    }
    this.drawDepthSorted(ctx, f, view);
    // La luz de noche del paquete se multiplica sobre todo el mundo.
    ctx.globalCompositeOperation = 'multiply';
    this.drawLayer(ctx, this.assets.nightLight, view);
    ctx.globalCompositeOperation = 'source-over';

    drawFixPoints(ctx, this.map.fixPoints, f.emergency, now);
    renderActivities(ctx, f.players, now, f.visible);
    this.drawLabels(ctx, f);
    renderDarkness(ctx, view, this.me(f), f.visionRadius);
    if (f.marks) drawStationMarks(ctx, this.map.stations, f.marks, now);
    const me = this.me(f);
    if (f.hold && me) {
      drawHoldProgress(ctx, me.x, me.y, f.hold.progress, f.hold.spin);
    }

    // Lo que va en coordenadas de pantalla.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFixArrows(
      ctx,
      this.map.fixPoints,
      camera,
      f.emergency,
      me,
      f.visionRadius ?? Math.min(view.w, view.h) / 2,
    );
  }

  // screenOf convierte un punto del mundo a la pantalla (para el HUD).
  screenOf(camera: Camera, x: number, y: number) {
    return worldToScreen(camera, x, y);
  }

  private me(f: WorldFrame): PlayerView | undefined {
    return f.players.find((p) => p.id === f.meId);
  }

  private drawLayer(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    view: { x: number; y: number; w: number; h: number },
  ): void {
    const x = Math.max(0, Math.floor(view.x));
    const y = Math.max(0, Math.floor(view.y));
    const w = Math.min(img.width - x, Math.ceil(view.w) + 2);
    const h = Math.min(img.height - y, Math.ceil(view.h) + 2);
    if (w > 0 && h > 0) ctx.drawImage(img, x, y, w, h, x, y, w, h);
  }

  // Props, tanques y jugadores ordenados por su línea de base, para que
  // un jugador detrás de una mesa quede tapado y delante la tape.
  private drawDepthSorted(
    ctx: CanvasRenderingContext2D,
    f: WorldFrame,
    view: { x: number; y: number; w: number; h: number },
  ): void {
    const items: Drawable[] = [];
    const margin = 200;
    const near = (x: number, y: number, w: number, h: number) =>
      x + w > view.x - margin &&
      x < view.x + view.w + margin &&
      y + h > view.y - margin &&
      y < view.y + view.h + margin;
    const { propsAtlas, propFrames } = this.assets;
    for (const prop of this.assets.props) {
      if (!near(prop.x, prop.y, prop.w, prop.h)) continue;
      const fr = propFrames.get(prop.sprite);
      if (!fr) continue;
      items.push({
        depth: prop.baseY,
        draw: () => blit(ctx, propsAtlas, fr, prop.x, prop.y),
      });
    }
    for (const tank of f.tanks) {
      const spot = this.map.tanks.find((t) => t.slot === tank.slot);
      const fr = this.assets.tankFrames.get(tankLevel(tank));
      if (!spot || !fr) continue;
      const at = spot.draw ?? { x: spot.x - fr.w / 2, y: spot.y - fr.h };
      items.push({
        depth: at.y + fr.h - 8,
        draw: () => {
          blit(ctx, this.assets.tanksAtlas, fr, at.x, at.y);
          drawTankGrime(
            ctx,
            { x: at.x, y: at.y, w: fr.w, h: fr.h },
            tank.contamination,
            tank.dead,
          );
        },
      });
    }
    for (const p of f.players) {
      if (!f.visible(p)) {
        this.animator.pose(p, f.now); // que la animación siga al día
        continue;
      }
      items.push({
        depth: depthOf(p),
        draw: () => drawPlayer(ctx, p, this.animator, f.now),
      });
    }
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();
  }

  // Etiquetas de nombre de los jugadores visibles y de los tanques
  // (dueño y nivel de contaminación), sin la luz de noche encima.
  private drawLabels(ctx: CanvasRenderingContext2D, f: WorldFrame): void {
    for (const tank of f.tanks) {
      const spot = this.map.tanks.find((t) => t.slot === tank.slot);
      if (!spot || !f.canSee(spot.x, spot.y)) continue;
      const owner = f.players.find((p) => p.id === tank.ownerId);
      const top = (spot.draw?.y ?? spot.y - 134) + 6;
      if (owner) drawTag(ctx, owner.name, spot.x, top - 8);
      drawBar(
        ctx,
        spot.x - TANK_BAR_W / 2,
        top - 4,
        TANK_BAR_W,
        tank.contamination / 100,
        tank.dead || tank.contamination >= 60 ? '#ff6b6b' : '#ffd24a',
      );
    }
    for (const p of f.players) {
      if (!f.visible(p)) continue;
      drawTag(ctx, p.name, p.x, topOf(p) - 3, p.id === f.meId);
    }
  }
}

function blit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  fr: Frame,
  x: number,
  y: number,
): void {
  ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, x, y, fr.w, fr.h);
}
