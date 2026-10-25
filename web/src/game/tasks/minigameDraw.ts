import { motionIsReduced } from '../../settings';
import {
  BOARD,
  BucketsGame,
  type Minigame,
  ParticlesGame,
  ValveGame,
} from './minigames';
import { BUCKETS_HERO_X, BucketsScene } from './draw/bucketsScene';
import { drawDoneBanner, warmBannerFont } from './draw/hand';
import { Hero } from './draw/hero';
import { PARTICLES_HERO_X, ParticlesScene } from './draw/particlesScene';
import { BOARD_SCALE } from './draw/pixel';
import { HERO_FEET_Y, type Scene } from './draw/scene';
import { VALVE_HERO_X, ValveScene } from './draw/valveScene';

// S2-11: dibujo de los minijuegos de las 3R en su tablero (BOARD). La
// lógica está en minigames.ts y el panel en screens/game/Minigame.tsx;
// aquí solo se dibuja. Cada minijuego tiene su escena (draw/) y el
// personaje del jugador, que se mueve con lo que hace. No hay
// instrucciones escritas: una mano animada señala qué hacer.

export { BOARD_SCALE };

const MAX_FRAME_MS = 100;

export class MinigameView {
  private readonly scene: Scene;
  private last: number | null = null;

  // calm: el jugador pidió movimiento reducido (settings.ts).
  constructor(
    game: Minigame,
    color: string | undefined,
    private readonly calm: boolean = motionIsReduced(),
  ) {
    warmBannerFont();
    this.scene = buildScene(game, color, calm);
  }

  // frame dibuja un cuadro; now son los ms del requestAnimationFrame.
  frame(ctx: CanvasRenderingContext2D, now: number): void {
    const dt = this.last === null ? 16 : Math.min(now - this.last, MAX_FRAME_MS);
    this.last = now;
    ctx.setTransform(BOARD_SCALE, 0, 0, BOARD_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, BOARD.w, BOARD.h);
    this.scene.frame(ctx, now, dt);
    const since = this.scene.doneSince;
    if (since !== null) drawDoneBanner(ctx, now - since, this.calm);
  }

  // settled: ya terminó y se alcanzó a ver la celebración; recién ahí se
  // avisa al servidor y se cierra el panel.
  settled(now: number): boolean {
    const since = this.scene.doneSince;
    return since !== null && now - since >= this.scene.settleMs;
  }
}

function buildScene(
  game: Minigame,
  color: string | undefined,
  calm: boolean,
): Scene {
  if (game instanceof ValveGame) {
    const hero = new Hero(color, VALVE_HERO_X, HERO_FEET_Y);
    return new ValveScene(game, { hero, calm });
  }
  if (game instanceof BucketsGame) {
    const hero = new Hero(color, BUCKETS_HERO_X, HERO_FEET_Y);
    return new BucketsScene(game, { hero, calm });
  }
  if (game instanceof ParticlesGame) {
    const hero = new Hero(color, PARTICLES_HERO_X, HERO_FEET_Y);
    return new ParticlesScene(game, { hero, calm });
  }
  throw new Error('minijuego sin escena');
}
