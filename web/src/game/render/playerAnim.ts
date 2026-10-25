import type { PlayerView } from '@in-filtrados/messages';
import type { SpriteFrame } from './sprites';

// Animación de caminar: el servidor solo manda posiciones, así que el
// navegador deduce si cada jugador camina y hacia dónde mira a partir de
// cuánto se movió entre cuadros. No decide nada del juego.

// De lado el ciclo tiene cuatro cuadros (brazo atrás, al costado,
// adelante, al costado); cada uno dura STEP_MS.
export const STEP_MS = 75;
// De frente y de espalda también son cuatro (pierna izquierda, quieto,
// pierna derecha, quieto).
export const VERTICAL_STEP_MS = 100;
// Por debajo de esto (unidades por segundo) se considera quieto; la
// interpolación deja restos pequeños al frenar.
const MOVING_SPEED = 40;
// Tras dejar de moverse, cuánto sigue el último paso antes de quedar de
// frente (evita parpadeos entre snapshots).
const STOP_GRACE_MS = 120;

type Heading = 'up' | 'down' | 'left' | 'right';

type State = {
  x: number;
  y: number;
  at: number;
  heading: Heading;
  movingUntil: number;
  walkStart: number;
};

export type PlayerPose = {
  frame: SpriteFrame;
  walking: boolean;
};

const UP_CYCLE: SpriteFrame[] = [
  'back-walking1',
  'back',
  'back-walking2',
  'back',
];
const DOWN_CYCLE: SpriteFrame[] = [
  'front-walking1',
  'front',
  'front-walking2',
  'front',
];
const LEFT_CYCLE: SpriteFrame[] = [
  'left-walking1',
  'left-passing1',
  'left-walking2',
  'left-passing2',
];
const RIGHT_CYCLE: SpriteFrame[] = [
  'right-walking1',
  'right-passing1',
  'right-walking2',
  'right-passing2',
];
const CYCLES: Record<Heading, SpriteFrame[]> = {
  up: UP_CYCLE,
  down: DOWN_CYCLE,
  left: LEFT_CYCLE,
  right: RIGHT_CYCLE,
};

// headingOf: el eje que más se movió manda; en diagonal exacta, de lado.
function headingOf(dx: number, dy: number): Heading {
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? 'up' : 'down';
  return dx < 0 ? 'left' : 'right';
}

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
        heading: 'right',
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
        s.heading = headingOf(dx, dy);
      }
      s.x = p.x;
      s.y = p.y;
      s.at = now;
    }
    const walking = now <= s.movingUntil;
    if (!walking) return { frame: 'front', walking: false };
    const vertical = s.heading === 'up' || s.heading === 'down';
    const stepMs = vertical ? VERTICAL_STEP_MS : STEP_MS;
    const cycle = CYCLES[s.heading];
    const i = Math.floor((now - s.walkStart) / stepMs) % cycle.length;
    return { frame: cycle[i], walking: true };
  }

  // forget borra a quien ya no está en el snapshot.
  forget(ids: ReadonlySet<string>): void {
    for (const id of this.states.keys()) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }
}
