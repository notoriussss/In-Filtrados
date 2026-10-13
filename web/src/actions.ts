// Acción contextual de la tecla E (S2-09). Solo elige qué ofrecer y qué
// mensaje mandar: match valida rango, rol, quietud y tiempo de espera.
import type {
  ClientMessage,
  PlayerView,
  Role,
  TankView,
} from '@in-filtrados/messages';
import type { GameMap } from './map';
import { ACTION_TEXT, GAME_RULES } from './constants';

export type ActionKind = 'task' | 'clean' | 'report' | 'contaminate';

export type Action = {
  kind: ActionKind;
  label: string;
  enabled: boolean;
  tankSlot?: number;
  stationId?: string;
};

// contextAction devuelve la acción para lo que tiene cerca el jugador, con
// esta prioridad: reportar un tanque muerto, contaminar (solo el impostor
// junto a un tanque ajeno), limpiar y hacer tarea. null si no hay nada.
export function contextAction(
  me: PlayerView,
  role: Role,
  tanks: TankView[],
  map: GameMap,
  now: number,
  contaminateReadyAt: number,
): Action | null {
  const tankPos = (slot: number) => map.tanks.find((t) => t.slot === slot);
  const nearestTank = (
    range: number,
    accept: (t: TankView) => boolean,
  ): TankView | null => {
    let best: TankView | null = null;
    let bestDist = Infinity;
    for (const t of tanks) {
      const pos = tankPos(t.slot);
      if (!pos || !accept(t)) continue;
      const d = distance(me.x, me.y, pos.x, pos.y);
      if (d <= range && d < bestDist) {
        best = t;
        bestDist = d;
      }
    }
    return best;
  };

  if (me.alive) {
    const dead = nearestTank(GAME_RULES.REPORT_RANGE, (t) => t.dead);
    if (dead) {
      return {
        kind: 'report',
        label: ACTION_TEXT.REPORT,
        enabled: true,
        tankSlot: dead.slot,
      };
    }

    if (role === 'IMPOSTOR') {
      const target = nearestTank(
        GAME_RULES.TANK_RANGE,
        (t) => !t.dead && t.ownerId !== me.id,
      );
      if (target) {
        const waitMs = contaminateReadyAt - now;
        return {
          kind: 'contaminate',
          label:
            waitMs > 0
              ? ACTION_TEXT.contaminateWait(Math.ceil(waitMs / 1000))
              : ACTION_TEXT.CONTAMINATE,
          enabled: waitMs <= 0,
          tankSlot: target.slot,
        };
      }
    }

    const dirty = nearestTank(
      GAME_RULES.TANK_RANGE,
      (t) => !t.dead && t.contamination > 0,
    );
    if (dirty) {
      return {
        kind: 'clean',
        label: ACTION_TEXT.CLEAN,
        enabled: true,
        tankSlot: dirty.slot,
      };
    }
  }

  // El snapshot no dice qué estaciones son mías: se ofrece en cualquiera y
  // match ignora las que no están asignadas.
  let station: string | null = null;
  let stationDist = Infinity;
  for (const s of map.stations) {
    const d = distance(me.x, me.y, s.x, s.y);
    if (d <= GAME_RULES.TASK_RANGE && d < stationDist) {
      station = s.id;
      stationDist = d;
    }
  }
  if (station !== null) {
    return {
      kind: 'task',
      label: ACTION_TEXT.TASK,
      enabled: true,
      stationId: station,
    };
  }
  return null;
}

// actionMessage es lo que se manda al empezar la acción.
export function actionMessage(action: Action): ClientMessage {
  switch (action.kind) {
    case 'report':
      return { type: 'report', tankSlot: action.tankSlot! };
    case 'contaminate':
      return { type: 'contaminate', tankSlot: action.tankSlot! };
    case 'clean':
      return { type: 'interact', tankSlot: action.tankSlot! };
    case 'task':
      return { type: 'interact', stationId: action.stationId! };
  }
}

// holdDuration: cuánto hay que quedarse quieto; 0 si es instantánea.
export function holdDuration(kind: ActionKind): number {
  switch (kind) {
    case 'contaminate':
      return GAME_RULES.CONTAMINATE_MS;
    case 'clean':
      return GAME_RULES.CLEAN_MS;
    case 'task':
      return GAME_RULES.TASK_MS;
    case 'report':
      return 0;
  }
}

// HoldAction es una acción en curso que exige quedarse quieto.
export class HoldAction {
  readonly duration: number;

  constructor(
    readonly action: Action,
    private readonly startedAt: number,
  ) {
    this.duration = holdDuration(action.kind);
  }

  // progress va de 0 a 1.
  progress(now: number): number {
    if (this.duration <= 0) return 1;
    const p = (now - this.startedAt) / this.duration;
    return Math.min(Math.max(p, 0), 1);
  }

  done(now: number): boolean {
    return this.progress(now) >= 1;
  }

  // sameTarget: la acción cercana sigue siendo la misma que se empezó.
  sameTarget(other: Action | null): boolean {
    return (
      other !== null &&
      other.kind === this.action.kind &&
      other.tankSlot === this.action.tankSlot &&
      other.stationId === this.action.stationId
    );
  }
}

// tankRose: el tanque del dueño subió lo bastante para avisarle. No dice
// quién lo contaminó; el snapshot tampoco lo sabe.
export function tankRose(
  prev: TankView[],
  next: TankView[],
  ownerId: string,
): boolean {
  const before = prev.find((t) => t.ownerId === ownerId);
  const after = next.find((t) => t.ownerId === ownerId);
  if (!before || !after) return false;
  const rise = after.contamination - before.contamination;
  return rise >= GAME_RULES.TANK_ALERT_MIN_RISE;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
