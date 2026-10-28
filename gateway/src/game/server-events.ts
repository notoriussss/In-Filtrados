import type {
  Activity,
  ChatMessage,
  Emergency,
  EmergencyKind,
  EndReason,
  ErrorCode,
  Meeting,
  MeetingButton,
  MyTask,
  OilDrop,
  PlayerView,
  SabotageStatus,
  ServerMessage,
  Snapshot,
  TankView,
} from '@in-filtrados/messages';

// Shapes of the gRPC ServerEvent as @grpc/proto-loader decodes it
// (camelCase, enums as strings, longs as numbers, defaults on).
type GrpcMeeting = Omit<Meeting, 'ejectedId' | 'reason'> & {
  ejectedId?: string | null;
  reason?: string;
};

type GrpcPlayerView = Omit<PlayerView, 'activity' | 'accessory' | 'skin'> & {
  activity?: string;
  accessory?: string;
  skin?: string;
};

type GrpcEmergency = Omit<Emergency, 'kind'> & { kind: string };

type GrpcSnapshot = Omit<
  Snapshot,
  | 'type'
  | 'players'
  | 'meeting'
  | 'myTasks'
  | 'myActiveTask'
  | 'emergency'
  | 'mySabotage'
  | 'myMeeting'
> & {
  players?: GrpcPlayerView[];
  meeting: GrpcMeeting | null;
  myTasks?: MyTask[];
  myActiveTask?: string;
  emergency?: GrpcEmergency | null;
  mySabotage?: SabotageStatus | null;
  myMeeting?: MeetingButton | null;
};

const ACTIVITIES: readonly string[] = [
  'reduce',
  'reuse',
  'recycle',
  'tank',
  'fix',
];
const EMERGENCY_KINDS: readonly string[] = ['pipe', 'steam'];
const VALID_END_REASONS: readonly EndReason[] = [
  'reservoir_full',
  'impostors_ejected',
  'tanks_contaminated',
  'timeout',
];

function normalizeEndReason(raw?: string): EndReason | undefined {
  if (!raw) return undefined;
  return VALID_END_REASONS.includes(raw as EndReason)
    ? (raw as EndReason)
    : undefined;
}

type GrpcMatchEnded = {
  winner: string;
  impostorIds: string[];
  reason?: string;
};

export type GrpcServerEvent =
  | { event: 'snapshot'; snapshot: GrpcSnapshot }
  | { event: 'error'; error: { code: string; message: string } }
  | { event: 'matchEnded'; matchEnded: GrpcMatchEnded };

// toServerMessage turns a Play stream event into the WebSocket message.
// It copies field by field so nothing outside messages/ reaches the browser.
export function toServerMessage(ev: GrpcServerEvent): ServerMessage | null {
  if (ev.event === 'snapshot') {
    return toSnapshot(ev.snapshot);
  }
  if (ev.event === 'matchEnded') {
    const winner = ev.matchEnded.winner;
    if (winner !== 'crew' && winner !== 'impostor') return null;
    const reason = normalizeEndReason(ev.matchEnded.reason);
    return {
      type: 'matchEnded',
      winner,
      impostorIds: [...(ev.matchEnded.impostorIds ?? [])],
      ...(reason ? { reason } : {}),
    };
  }
  if (ev.event === 'error') {
    return {
      type: 'error',
      code: ev.error.code as ErrorCode,
      message: ev.error.message,
    };
  }
  return null;
}

function toSnapshot(s: GrpcSnapshot): Snapshot {
  return {
    type: 'snapshot',
    tick: s.tick,
    phase: s.phase,
    players: (s.players ?? []).map(toPlayer),
    tanks: (s.tanks ?? []).map(toTank),
    reservoir: s.reservoir ?? 0,
    myRole: s.myRole ?? 'NO_ROLE',
    myTaskProgress: {
      completed: s.myTaskProgress?.completed ?? 0,
      total: s.myTaskProgress?.total ?? 0,
    },
    meeting: s.meeting ? toMeeting(s.meeting) : null,
    chat: (s.chat ?? []).map(toChat),
    oilDrops: (s.oilDrops ?? []).map(toOilDrop),
    paused: Boolean(s.paused),
    waitingFor: [...(s.waitingFor ?? [])],
    myTasks: (s.myTasks ?? []).map(toMyTask),
    myActiveTask:
      s.myActiveTask && s.myActiveTask.length > 0
        ? s.myActiveTask
        : null,
    emergency: toEmergency(s.emergency),
    mySabotage: s.mySabotage
      ? {
          readyAtTick: s.mySabotage.readyAtTick,
          pipesLeft: s.mySabotage.pipesLeft,
        }
      : null,
    myMeeting: s.myMeeting
      ? {
          readyAtTick: s.myMeeting.readyAtTick,
          callsLeft: s.myMeeting.callsLeft,
        }
      : null,
    tasksPerPlayer: s.tasksPerPlayer ?? 0,
  };
}

function toPlayer(p: GrpcPlayerView): PlayerView {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    x: p.x,
    y: p.y,
    connected: Boolean(p.connected),
    alive: Boolean(p.alive),
    activity:
      p.activity && ACTIVITIES.includes(p.activity)
        ? (p.activity as Activity)
        : null,
    accessory: p.accessory ?? '',
    skin: p.skin || 'jimena',
  };
}

// S3-05: emergencia activa; null si no hay o si el tipo no se conoce.
function toEmergency(e?: GrpcEmergency | null): Emergency | null {
  if (!e || !EMERGENCY_KINDS.includes(e.kind)) return null;
  return {
    kind: e.kind as EmergencyKind,
    endsAtTick: e.endsAtTick,
    heldPoints: [...(e.heldPoints ?? [])],
  };
}

function toTank(t: TankView): TankView {
  return {
    slot: t.slot,
    ownerId: t.ownerId,
    contamination: t.contamination,
    dead: t.dead,
  };
}

function toMeeting(m: GrpcMeeting): Meeting {
  return {
    reporterId: m.reporterId,
    tankSlot: m.tankSlot,
    reason:
      m.reason === 'MEETING_REASON_EMERGENCY' ? 'emergency' : 'report',
    votesCast: [...(m.votesCast ?? [])],
    endsAtTick: m.endsAtTick,
    votingClosed: Boolean(m.votingClosed),
    ejectedId:
      m.ejectedId && m.ejectedId.length > 0 ? m.ejectedId : null,
    wasImpostor: Boolean(m.wasImpostor),
  };
}

function toChat(c: ChatMessage): ChatMessage {
  return {
    id: c.id,
    playerId: c.playerId,
    text: c.text,
    tick: c.tick,
  };
}

function toOilDrop(d: OilDrop): OilDrop {
  return {
    x: d.x,
    y: d.y,
    color: d.color,
    expiresAtTick: d.expiresAtTick,
  };
}

function toMyTask(t: MyTask): MyTask {
  return {
    stationId: t.stationId,
    done: Boolean(t.done),
  };
}
