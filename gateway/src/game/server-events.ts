import type {
  ChatMessage,
  ErrorCode,
  Meeting,
  MyTask,
  OilDrop,
  ServerMessage,
  Snapshot,
  TankView,
} from '@in-filtrados/messages';

// Shapes of the gRPC ServerEvent as @grpc/proto-loader decodes it
// (camelCase, enums as strings, longs as numbers, defaults on).
type GrpcMeeting = Omit<Meeting, 'ejectedId'> & {
  ejectedId?: string | null;
};

type GrpcSnapshot = Omit<
  Snapshot,
  'type' | 'meeting' | 'myTasks' | 'myActiveTask'
> & {
  meeting: GrpcMeeting | null;
  myTasks?: MyTask[];
  myActiveTask?: string;
};

type GrpcMatchEnded = { winner: string; impostorIds: string[] };

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
    return {
      type: 'matchEnded',
      winner,
      impostorIds: [...(ev.matchEnded.impostorIds ?? [])],
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
    players: s.players ?? [],
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
    lastVisitors: [...(m.lastVisitors ?? [])],
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
