// Acción contextual de la tecla E (S2-09). Solo elige qué ofrecer y qué
// mensaje mandar: match valida rango, rol, quietud y tiempo de espera.
import type {
  ClientMessage,
  Emergency,
  EmergencyKind,
  MeetingButton,
  MyTask,
  PlayerView,
  Role,
  TankView,
} from '@in-filtrados/messages';
import { type GameMap, meetingMarker } from '../map';
import { ACTION_TEXT, GAME_RULES } from '../constants';

export type ActionKind =
  | 'task'
  | 'report'
  | 'contaminate'
  | 'fix'
  | 'meeting';

export type Action = {
  kind: ActionKind;
  label: string;
  enabled: boolean;
  tankSlot?: number;
  stationId?: string;
  // S3-05: punto de reparación y de qué emergencia.
  pointId?: string;
  emergency?: EmergencyKind;
};

// contextAction devuelve la acción para lo que tiene cerca el jugador, con
// esta prioridad: arreglar la emergencia activa (S3-05), reportar un
// tanque muerto, contaminar (solo el impostor junto a un tanque ajeno),
// y hacer tarea. Nadie limpia tanques: el daño es permanente. null si no
// hay nada.
// reported son los tanques que ya tuvieron reunión: no se reportan otra
// vez y no deben tapar lo que haya cerca.
export function contextAction(
  me: PlayerView,
  role: Role,
  tanks: TankView[],
  map: GameMap,
  now: number,
  contaminateReadyAt: number,
  reported: ReadonlySet<number> = new Set(),
  myTasks?: readonly MyTask[],
  emergency: Emergency | null = null,
  meeting: MeetingButton | null = null,
  tick = 0,
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

  if (me.alive && emergency) {
    const point = (map.fixPoints ?? []).find(
      (fp) =>
        fp.kind === emergency.kind &&
        distance(me.x, me.y, fp.x, fp.y) <= GAME_RULES.FIX_RANGE,
    );
    if (point) {
      return {
        kind: 'fix',
        label:
          point.kind === 'pipe' ? ACTION_TEXT.FIX_PIPE : ACTION_TEXT.FIX_STEAM,
        enabled: true,
        pointId: point.id,
        emergency: point.kind,
      };
    }
  }

  if (me.alive) {
    const dead = nearestTank(
      GAME_RULES.REPORT_RANGE,
      (t) => t.dead && !reported.has(t.slot),
    );
    if (dead) {
      return {
        kind: 'report',
        label: ACTION_TEXT.REPORT,
        enabled: true,
        tankSlot: dead.slot,
      };
    }

    const table = meetingMarker(map);
    if (
      meeting &&
      table &&
      emergency === null &&
      distance(me.x, me.y, table.x, table.y) <= GAME_RULES.MEETING_RANGE
    ) {
      if (meeting.callsLeft <= 0) {
        return {
          kind: 'meeting',
          label: ACTION_TEXT.NO_MEETINGS,
          enabled: false,
        };
      }
      if (tick < meeting.readyAtTick) {
        const wait = Math.ceil(
          (meeting.readyAtTick - tick) / GAME_RULES.TICKS_PER_SECOND,
        );
        return {
          kind: 'meeting',
          label: ACTION_TEXT.meetingWait(wait),
          enabled: false,
        };
      }
      return {
        kind: 'meeting',
        label: ACTION_TEXT.CALL_MEETING,
        enabled: true,
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
  }

  // Solo se ofrecen estaciones propias pendientes (S2-11). Si no se pasa
  // myTasks (modo prueba o compatibilidad), se revisan todas.
  let station: string | null = null;
  let stationDist = Infinity;
  for (const s of map.stations) {
    if (myTasks && !myTasks.some((t) => t.stationId === s.id && !t.done)) {
      continue;
    }
    const d = distance(me.x, me.y, s.x, s.y);
    if (d <= (s.radius ?? GAME_RULES.TASK_RANGE) && d < stationDist) {
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
    case 'task':
      return { type: 'interact', stationId: action.stationId! };
    case 'fix':
      return { type: 'fix', pointId: action.pointId! };
    case 'meeting':
      return { type: 'callMeeting' };
  }
}

// holdDuration: cuánto hay que quedarse quieto; 0 si es instantánea.
export function holdDuration(kind: ActionKind): number {
  switch (kind) {
    case 'contaminate':
      return GAME_RULES.CONTAMINATE_MS;
    case 'task':
      return GAME_RULES.TASK_MS;
    case 'fix':
      return GAME_RULES.STEAM_FIX_MS;
    case 'report':
    case 'meeting':
      return 0;
  }
}

// holdDurationOf: como holdDuration, pero la tubería no termina sola:
// se sostiene hasta que alguien sostiene el otro extremo.
export function holdDurationOf(action: Action): number {
  if (action.kind === 'fix' && action.emergency === 'pipe') {
    return Infinity;
  }
  return holdDuration(action.kind);
}

// HoldAction es una acción en curso que exige quedarse quieto.
export class HoldAction {
  readonly duration: number;

  constructor(
    readonly action: Action,
    private readonly startedAt: number,
  ) {
    this.duration = holdDurationOf(action);
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
      other.stationId === this.action.stationId &&
      other.pointId === this.action.pointId
    );
  }
}

// tankRose: el tanque del dueño subió lo bastante para avisarle. No dice
// quién lo contaminó; el snapshot tampoco lo sabe. Al impostor nunca le
// avisa porque su tanque sube solo (driftImpostorTanks en match).
export function tankRose(
  prev: TankView[],
  next: TankView[],
  ownerId: string,
  role?: Role,
): boolean {
  if (role === 'IMPOSTOR') return false;
  const before = prev.find((t) => t.ownerId === ownerId);
  const after = next.find((t) => t.ownerId === ownerId);
  if (!before || !after) return false;
  const rise = after.contamination - before.contamination;
  return rise >= GAME_RULES.TANK_ALERT_MIN_RISE;
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}
