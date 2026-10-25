import { FLOURISH_MS } from '../../render/workPose';
import type { Hero } from './hero';

// Lo que comparten las escenas de los minijuegos: el personaje, si el
// jugador pidió movimiento reducido y cómo celebrar al terminar.

export type SceneEnv = {
  hero: Hero;
  calm: boolean; // movimiento reducido: sin brincos, chispas ni olas
};

// Dónde pisa el personaje: un poco por debajo de la línea del piso.
export const HERO_FEET_Y = 244;

export interface Scene {
  frame(ctx: CanvasRenderingContext2D, now: number, dtMs: number): void;
  // Cuándo se terminó el minijuego (ms), o null si sigue en juego. En las
  // escenas con animación final (verter, entregar la suciedad) se marca
  // cuando esa animación acaba.
  readonly doneSince: number | null;
  // Cuánto se queda el tablero tras terminar, para que se vea la
  // celebración antes de cerrar.
  readonly settleMs: number;
}

// celebrateK da el avance 0 a 1 del brinco de alegría, que se repite
// mientras el minijuego sigue abierto; null si todavía no termina.
export function celebrateK(doneAt: number | null, now: number): number | null {
  if (doneAt === null) return null;
  return ((now - doneAt) / FLOURISH_MS) % 1;
}
