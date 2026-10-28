import type { Activity, PlayerView } from '@in-filtrados/messages';
import { phaseOf } from './activityFx';
import type { SpriteFrame } from './sprites';
import {
  FLOURISH_MS,
  IDLE_POSE,
  type Pose,
  RAMP_MS,
  flourishPose,
  workPose,
} from './workPose';

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

export type Heading = 'up' | 'down' | 'left' | 'right';

// Una tarea más corta que esto no termina con brinco de alegría: se
// canceló o el jugador solo pasó rozando la estación.
export const MIN_WORK_MS = 1500;
// Los snapshots pueden perder la actividad un instante; no se corta el
// movimiento por eso.
const ACTIVITY_GRACE_MS = 200;

type Work = { activity: Activity; since: number; lastSeen: number };

type State = {
  x: number;
  y: number;
  at: number;
  heading: Heading;
  movingUntil: number;
  walkStart: number;
  work: Work | null;
  celebrateAt: number | null;
};

export type PlayerPose = {
  frame: SpriteFrame;
  walking: boolean;
  body: Pose; // inclinación, aplastamiento y salto sobre el cuadro
  working: Activity | null;
  celebrate: number | null; // 0 a 1 durante el brinco de alegría
  heading?: Heading;
  stepIndex?: number;
};

export type GotaCell = {
  col: number;
  flip: boolean;
};

// gotaCell determina la columna (0..17) y el volteo horizontal de la hoja Gota.
export function gotaCell(pose: PlayerPose, now: number): GotaCell {
  if (pose.walking) {
    const step = pose.stepIndex ?? 0;
    const h = pose.heading ?? 'down';
    if (h === 'down') {
      return { col: 2 + (step % 4), flip: false };
    }
    if (h === 'up') {
      return { col: 14 + (step % 4), flip: false };
    }
    if (h === 'left') {
      return { col: 8 + (step % 4), flip: true };
    }
    return { col: 8 + (step % 4), flip: false };
  }

  // Si está realizando una actividad de trabajo con pose lateral:
  const workFrame = pose.body.frame;
  if (workFrame === 'right-walking1') {
    return { col: 8, flip: false };
  }
  if (workFrame === 'right-passing1') {
    return { col: 9, flip: false };
  }
  if (workFrame === 'right-walking2') {
    return { col: 10, flip: false };
  }
  if (workFrame === 'left-walking1') {
    return { col: 8, flip: true };
  }
  if (workFrame === 'left-passing1') {
    return { col: 9, flip: true };
  }
  if (workFrame === 'left-walking2') {
    return { col: 10, flip: true };
  }

  // Celebración al terminar una tarea (brinco de frente):
  if (pose.celebrate !== null) {
    const step = Math.floor(now / 250) % 2;
    return { col: step, flip: false };
  }

  // Reposo (idle): respiración a 2 fps (500 ms por cuadro) según orientación
  const idleStep = Math.floor(now / 500) % 2;
  const h = pose.heading ?? 'down';
  if (h === 'up') {
    return { col: 12 + idleStep, flip: false };
  }
  if (h === 'left') {
    return { col: 6 + idleStep, flip: true };
  }
  if (h === 'right') {
    return { col: 6 + idleStep, flip: false };
  }
  return { col: idleStep, flip: false };
}

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
        heading: 'down',
        movingUntil: 0,
        walkStart: now,
        work: null,
        celebrateAt: null,
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
    this.trackWork(s, p.activity, now);
    const celebrate = this.celebration(s, now);
    if (!walking) {
      const body = this.bodyAt(s, p, now, celebrate);
      return {
        frame: body.frame,
        walking: false,
        body,
        working: s.work ? s.work.activity : null,
        celebrate,
        heading: s.heading,
      };
    }
    const vertical = s.heading === 'up' || s.heading === 'down';
    const stepMs = vertical ? VERTICAL_STEP_MS : STEP_MS;
    const cycle = CYCLES[s.heading];
    const stepIndex =
      Math.floor((now - s.walkStart) / stepMs) % cycle.length;
    const frame = cycle[stepIndex];
    return {
      frame,
      walking: true,
      body: { ...IDLE_POSE, frame },
      working: null,
      celebrate: null,
      heading: s.heading,
      stepIndex,
    };
  }


  // trackWork lleva cuándo empezó y terminó la tarea, para entrar al
  // ritmo poco a poco y celebrar al acabar.
  private trackWork(s: State, activity: Activity | null, now: number): void {
    if (activity) {
      if (s.work?.activity !== activity) {
        s.work = { activity, since: now, lastSeen: now };
        s.celebrateAt = null;
      }
      s.work.lastSeen = now;
      return;
    }
    const w = s.work;
    if (!w || now - w.lastSeen <= ACTIVITY_GRACE_MS) return;
    if (w.lastSeen - w.since >= MIN_WORK_MS) s.celebrateAt = now;
    s.work = null;
  }

  private celebration(s: State, now: number): number | null {
    if (s.celebrateAt === null) return null;
    const k = (now - s.celebrateAt) / FLOURISH_MS;
    if (k < 1) return k;
    s.celebrateAt = null;
    return null;
  }

  private bodyAt(
    s: State,
    p: PlayerView,
    now: number,
    celebrate: number | null,
  ): Pose {
    if (celebrate !== null) return flourishPose(celebrate);
    const w = s.work;
    if (!w) return IDLE_POSE;
    // Cada jugador con su fase, igual que sus efectos (activityFx.ts).
    const t = now + phaseOf(p.id);
    return workPose(w.activity, t, (now - w.since) / RAMP_MS);
  }

  // forget borra a quien ya no está en el snapshot.
  forget(ids: ReadonlySet<string>): void {
    for (const id of this.states.keys()) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }
}
