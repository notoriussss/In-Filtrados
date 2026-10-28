import type { Skin } from '../../shop';
import { motionIsReduced } from '../../settings';
import {
  BOARD,
  type Minigame,
  BucketsGame,
  JugFilterGame,
  FillGame,
  FirstRainGame,
  ParticlesGame,
  PressureGame,
  SealGame,
  ValveGame,
  TreatmentGame,
  WateringGame,
} from './minigames';
import { BUCKETS_HERO_X, BucketsScene } from './draw/bucketsScene';
import { JUG_HERO_X, JugScene } from './draw/jugScene';
import { FILL_HERO_X, FillScene } from './draw/fillScene';
import { drawDoneBanner, warmBannerFont } from './draw/hand';
import { Hero } from './draw/hero';
import { PARTICLES_HERO_X, ParticlesScene } from './draw/particlesScene';
import { PRESSURE_HERO_X, PressureScene } from './draw/pressureScene';
import { RAIN_HERO_X, RainScene } from './draw/rainScene';
import { SEAL_HERO_X, SealScene } from './draw/sealScene';
import { TREATMENT_HERO_X, TreatmentScene } from './draw/treatmentScene';
import { BOARD_SCALE } from './draw/pixel';
import { HERO_FEET_Y, type Scene, type SceneEnv } from './draw/scene';
import { VALVE_HERO_X, ValveScene } from './draw/valveScene';
import { WATERING_HERO_X, WateringScene } from './draw/wateringScene';

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
    accessory?: string,
    skin?: Skin,
  ) {
    warmBannerFont();
    this.scene = buildScene(game, color, calm, accessory, skin);
  }

  // frame dibuja un cuadro; now son los ms del requestAnimationFrame.
  frame(ctx: CanvasRenderingContext2D, now: number): void {
    const dt =
      this.last === null ? 16 : Math.min(now - this.last, MAX_FRAME_MS);
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
  accessory?: string,
  skin?: Skin,
): Scene {
  const hero = new Hero(
    color,
    heroXOf(game),
    HERO_FEET_Y,
    accessory,
    skin,
  );
  const env: SceneEnv = { hero, calm };
  if (game instanceof ValveGame) return new ValveScene(game, env);
  if (game instanceof BucketsGame) return new BucketsScene(game, env);
  if (game instanceof ParticlesGame) return new ParticlesScene(game, env);
  if (game instanceof PressureGame) return new PressureScene(game, env);
  if (game instanceof FillGame) return new FillScene(game, env);
  if (game instanceof SealGame) return new SealScene(game, env);
  if (game instanceof FirstRainGame) return new RainScene(game, env);
  if (game instanceof TreatmentGame) return new TreatmentScene(game, env);
  if (game instanceof WateringGame) return new WateringScene(game, env);
  if (game instanceof JugFilterGame) return new JugScene(game, env);
  throw new Error('minijuego sin escena');
}

// Dónde pisa el personaje en cada minijuego.
function heroXOf(game: Minigame): number {
  if (game instanceof ValveGame) return VALVE_HERO_X;
  if (game instanceof BucketsGame) return BUCKETS_HERO_X;
  if (game instanceof ParticlesGame) return PARTICLES_HERO_X;
  if (game instanceof PressureGame) return PRESSURE_HERO_X;
  if (game instanceof FillGame) return FILL_HERO_X;
  if (game instanceof SealGame) return SEAL_HERO_X;
  if (game instanceof FirstRainGame) return RAIN_HERO_X;
  if (game instanceof TreatmentGame) return TREATMENT_HERO_X;
  if (game instanceof WateringGame) return WATERING_HERO_X;
  return JUG_HERO_X;
}
