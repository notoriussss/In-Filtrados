import type { PlayerView } from '@in-filtrados/messages';
import type { SpriteFrame } from './sprites';

// Animación de caminar: el servidor solo manda posiciones, así que el
// navegador deduce si cada jugador camina y hacia dónde mira a partir de
// cuánto se movió entre cuadros. No decide nada del juego.

// Un paso cada STEP_MS mientras camina (dos cuadros por lado).
export const STEP_MS = 140;
// Por debajo de esto (unidades por segundo) se considera quieto; la
// interpolación deja restos pequeños al frenar.
const MOVING_SPEED = 40;
// Tras dejar de moverse, cuánto sigue el último paso antes de quedar de
// frente (evita parpadeos entre snapshots).
const STOP_GRACE_MS = 120;

type State = {
  x: number;
  y: number;
  at: number;
  facing: 'left' | 'right';
  movingUntil: number;
  walkStart: number;
};

export type PlayerPose = {
  frame: SpriteFrame;
  walking: boolean;
};

export class PlayerAnimator {
  private states = new Map<string, State>();

  // pose actualiza el estado del jugador con su posición dibujada en
  // now y devuelve el cuadro que le toca.
  pose(p: PlayerView, now: number): PlayerPose {
    let s = this.states.get(p.id);
    if (!s) {
      s = {
        x: p.x,
        y: p.y,
        at: now,
        facing: 'right',
        movingUntil: 0,
        walkStart: now,
      };
      this.states.set(p.id, s);
    }
    const dt = now - s.at;
    if (dt > 0) {
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const speed = (Math.hypot(dx, dy) * 1000) / dt;
      if (speed > MOVING_SPEED) {
        if (s.movingUntil < now) s.walkStart = now;
        s.movingUntil = now + STOP_GRACE_MS;
        // Solo el movimiento horizontal cambia el lado; al subir o
        // bajar mira hacia donde iba.
        if (Math.abs(dx) > 0.01) s.facing = dx < 0 ? 'left' : 'right';
      }
      s.x = p.x;
      s.y = p.y;
      s.at = now;
    }
    const walking = now <= s.movingUntil;
    if (!walking) return { frame: 'front', walking: false };
    const step = Math.floor((now - s.walkStart) / STEP_MS) % 2;
    return {
      frame: `${s.facing}-walking${step + 1}` as SpriteFrame,
      walking: true,
    };
  }

  // forget borra a quien ya no está en el snapshot.
  forget(ids: ReadonlySet<string>): void {
    for (const id of this.states.keys()) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }
}
