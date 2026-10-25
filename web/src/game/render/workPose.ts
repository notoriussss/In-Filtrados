import type { Activity } from '@in-filtrados/messages';
import type { SpriteFrame } from './sprites';

// Poses de trabajo: qué hace el cuerpo del jugador mientras cumple una
// tarea. Los sprites de Jimena solo traen cinco cuadros, así que el
// movimiento sale de combinar tres cosas: el cuadro (de frente, brazo
// recogido o brazo estirado), una inclinación por franjas y un estiramiento
// o aplastamiento desde los pies. Todo es solo dibujo: el servidor solo
// manda PlayerView.activity.
//
// Cada ritmo coincide con el efecto de activityFx.ts (la llave, la
// cubeta, el filtro, el cucharón y el martillo) para que el cuerpo y la
// herramienta se muevan juntos.

// Las medidas están en unidades de un sprite de 40 de ancho.
export const POSE_UNIT = 40;

export type Pose = {
  frame: SpriteFrame;
  dx: number; // desplazamiento del cuerpo (+x a la derecha)
  dy: number; // +y hacia abajo
  lean: number; // cuánto se corre la cabeza respecto de los pies
  sx: number; // escala horizontal desde los pies
  sy: number; // escala vertical desde los pies
  shadow: number; // escala de la sombra (se achica en el aire)
  strain: number; // 0 a 1: esfuerzo, para el sudor
  dust: number | null; // 0 a 1 mientras sube el polvo del piso; null si no hay
  hit: boolean; // golpe en este instante (sacudida)
};

export const IDLE_POSE: Pose = {
  frame: 'front',
  dx: 0,
  dy: 0,
  lean: 0,
  sx: 1,
  sy: 1,
  shadow: 1,
  strain: 0,
  dust: null,
  hit: false,
};

// Tiempo que tarda el cuerpo en entrar al ritmo de la tarea, para que no
// salte de golpe de la pose quieta a la del trabajo.
export const RAMP_MS = 260;

// Duración del brinco de alegría al terminar la tarea.
export const FLOURISH_MS = 700;
// En qué punto del brinco (0 a 1) vuelve a pisar el suelo.
const FLOURISH_LAND = 0.72;

// Los tres cuadros de lado que sirven para trabajar (ver sprites.ts).
// REACH: el brazo estirado hacia adelante; WIND: el brazo doblado con el
// puño al pecho, para tomar impulso; TUCK: postura compacta con los brazos
// al costado.
export const REACH: SpriteFrame = 'right-walking1';
export const WIND: SpriteFrame = 'right-walking2';
export const TUCK: SpriteFrame = 'right-passing1';

export function easeOut(k: number): number {
  const c = Math.min(Math.max(k, 0), 1);
  return 1 - (1 - c) ** 3;
}

function mixPose(a: Pose, b: Pose, k: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    frame: k < 0.35 ? a.frame : b.frame,
    dx: m(a.dx, b.dx),
    dy: m(a.dy, b.dy),
    lean: m(a.lean, b.lean),
    sx: m(a.sx, b.sx),
    sy: m(a.sy, b.sy),
    shadow: m(a.shadow, b.shadow),
    strain: m(a.strain, b.strain),
    dust: k > 0.5 ? b.dust : null,
    hit: b.hit && k > 0.5,
  };
}

// workPose devuelve la pose de la actividad en el instante t (ms) con
// ramp de 0 a 1 (cuánto lleva entrando al ritmo).
export function workPose(activity: Activity, t: number, ramp: number): Pose {
  const raw = rawPose(activity, t);
  return mixPose(IDLE_POSE, raw, easeOut(ramp));
}

function rawPose(activity: Activity, t: number): Pose {
  switch (activity) {
    case 'reduce':
      return crankPose(t);
    case 'reuse':
      return pourPose(t);
    case 'recycle':
      return hopPose(t);
    case 'tank':
      return stirPose(t);
    case 'fix':
      return hammerPose(t);
  }
}

// Reducir: gira la llave. Empuja hacia adelante con el brazo estirado y
// vuelve con el brazo recogido, apoyándose con todo el cuerpo.
function crankPose(t: number): Pose {
  const s = Math.sin(t / 180);
  const push = Math.max(0, s);
  return {
    ...IDLE_POSE,
    frame: s > 0 ? REACH : TUCK,
    dx: 1.4 * s,
    dy: -0.5 * Math.abs(s),
    lean: 3.6 * s,
    sx: 1 + 0.03 * push,
    sy: 1 - 0.05 * push,
    strain: push,
  };
}

// Reutilizar: levanta la cubeta (se estira y se echa hacia atrás) y la
// inclina para verter (se agacha hacia adelante).
function pourPose(t: number): Pose {
  const pour = (Math.sin(t / 300) + 1) / 2;
  const lift = 1 - pour;
  return {
    ...IDLE_POSE,
    frame: pour > 0.5 ? REACH : WIND,
    dx: 0.8 * pour,
    dy: -1.4 * lift,
    lean: -1.2 + 5 * pour,
    sx: 1 - 0.03 * lift,
    sy: 1 + 0.05 * lift,
    strain: 0.35 + 0.4 * pour,
  };
}

const HOP_MS = 700;
const LAND_WINDOW = 0.16;
const DUST_WINDOW = 0.35;

// Reciclar: bombea el filtro con brincos al ritmo de las burbujas;
// estira en el aire, se aplasta al caer y cambia de lado cada brinco.
function hopPose(t: number): Pose {
  const k = (t % HOP_MS) / HOP_MS;
  const air = Math.sin(Math.PI * k);
  const squash = Math.max(0, 1 - k / LAND_WINDOW);
  const side = Math.floor(t / HOP_MS) % 2 === 0 ? 1 : -1;
  return {
    ...IDLE_POSE,
    frame: air > 0.5 ? REACH : TUCK,
    dy: -5 * air,
    lean: 2.4 * side * air,
    sx: 1 - 0.07 * air + 0.12 * squash,
    sy: 1 + 0.1 * air - 0.14 * squash,
    shadow: 1 - 0.4 * air,
    strain: 0.3,
    dust: k < DUST_WINDOW ? k / DUST_WINDOW : null,
  };
}

// Tanque (limpiar o contaminar): revuelve con todo el cuerpo, en círculo.
// Igual para los dos a propósito (docs/design/game-plan.md, pistas).
function stirPose(t: number): Pose {
  const a = t / 260;
  const s = Math.sin(a);
  const c = Math.cos(a);
  return {
    ...IDLE_POSE,
    frame: s > 0 ? REACH : WIND,
    dx: 1.8 * c,
    dy: -0.9 * Math.abs(c),
    lean: 3.8 * s,
    sy: 1 - 0.02 * c,
    strain: 0.5,
  };
}

const HAMMER_MS = 500;
const WIND_UP_END = 0.7;
const STRIKE_END = 0.82;

// Arreglar: se echa hacia atrás y se empina para tomar impulso, golpea
// con todo el peso (se aplasta y sacude la pantalla) y rebota.
function hammerPose(t: number): Pose {
  const k = (t % HAMMER_MS) / HAMMER_MS;
  if (k < WIND_UP_END) {
    const u = easeOut(k / WIND_UP_END);
    return {
      ...IDLE_POSE,
      frame: WIND,
      dy: -1.8 * u,
      lean: -1.2 - 3.4 * u,
      sx: 1 - 0.03 * u,
      sy: 1 + 0.08 * u,
      strain: 0.5 * u,
    };
  }
  if (k < STRIKE_END) {
    const v = (k - WIND_UP_END) / (STRIKE_END - WIND_UP_END);
    return {
      ...IDLE_POSE,
      frame: REACH,
      dx: v < 0.5 ? 1 : -1,
      dy: -1.8 + 3.4 * v,
      lean: -4.6 + 10.4 * v,
      sx: 0.97 + 0.15 * v,
      sy: 1.08 - 0.22 * v,
      strain: 1,
      dust: v > 0.6 ? 0 : null,
      hit: true,
    };
  }
  const w = easeOut((k - STRIKE_END) / (1 - STRIKE_END));
  return {
    ...IDLE_POSE,
    frame: w < 0.5 ? REACH : TUCK,
    dy: 1.6 * (1 - w),
    lean: 5.8 * (1 - w) - 1.2 * w,
    sx: 1.12 - 0.15 * w,
    sy: 0.86 + 0.14 * w,
    strain: 0.6,
    dust: w,
  };
}

// flourishPose es el brinco de alegría de cuando se termina la tarea.
// k va de 0 a 1 durante FLOURISH_MS.
export function flourishPose(k: number): Pose {
  const c = Math.min(Math.max(k, 0), 1);
  const crouch = Math.max(0, 1 - c / 0.12);
  const air = Math.sin(
    Math.PI * Math.min(1, Math.max(0, c - 0.12) / (FLOURISH_LAND - 0.12)),
  );
  const land =
    c > FLOURISH_LAND ? Math.max(0, 1 - (c - FLOURISH_LAND) / 0.13) : 0;
  return {
    ...IDLE_POSE,
    frame: air > 0.1 ? REACH : 'front',
    dy: -9 * air + 1.2 * crouch,
    sx: 1 + 0.12 * crouch - 0.06 * air + 0.12 * land,
    sy: 1 - 0.14 * crouch + 0.12 * air - 0.12 * land,
    shadow: 1 - 0.45 * air,
    dust: c >= FLOURISH_LAND ? (c - FLOURISH_LAND) / (1 - FLOURISH_LAND) : null,
  };
}

// amplifyPose exagera una pose (para verla desde lejos, como en el
// tablero de un minijuego donde el personaje es pequeño).
export function amplifyPose(p: Pose, k: number): Pose {
  return {
    ...p,
    dx: p.dx * k,
    dy: p.dy * k,
    lean: p.lean * k,
    sx: 1 + (p.sx - 1) * k,
    sy: 1 + (p.sy - 1) * k,
  };
}

// lerpPose acerca la pose a hacia b una fracción k. El cuadro, el polvo y
// el golpe no se mezclan: los toma la meta.
export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    frame: b.frame,
    dx: m(a.dx, b.dx),
    dy: m(a.dy, b.dy),
    lean: m(a.lean, b.lean),
    sx: m(a.sx, b.sx),
    sy: m(a.sy, b.sy),
    shadow: m(a.shadow, b.shadow),
    strain: m(a.strain, b.strain),
    dust: b.dust,
    hit: b.hit,
  };
}
