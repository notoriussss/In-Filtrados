import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type GrpcServerEvent, toServerMessage } from './server-events';

test('snapshot keeps only the fields of the contract', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 7,
      phase: 'MEETING',
      players: [],
      tanks: [
        {
          slot: 1,
          ownerId: 'p1',
          contamination: 35,
          dead: false,
          extra: 'x',
        },
      ],
      reservoir: 12,
      myRole: 'IMPOSTOR',
      myTaskProgress: { completed: 1, total: 4 },
      meeting: {
        reporterId: 'p2',
        tankSlot: 1,
        reason: 'MEETING_REASON_REPORT',
        votesCast: [],
        endsAtTick: 900,
        votingClosed: false,
        ejectedId: '',
        wasImpostor: false,
      },
      chat: [{ id: 'm1', playerId: 'p2', text: 'hola', tick: 5 }],
      oilDrops: [
        {
          x: 100,
          y: 200,
          color: '#e6194b',
          expiresAtTick: 307,
          extra: 'x',
        },
      ],
    },
  } as unknown as GrpcServerEvent;

  assert.deepEqual(toServerMessage(ev), {
    type: 'snapshot',
    tick: 7,
    phase: 'MEETING',
    players: [],
    tanks: [{ slot: 1, ownerId: 'p1', contamination: 35, dead: false }],
    reservoir: 12,
    myRole: 'IMPOSTOR',
    myTaskProgress: { completed: 1, total: 4 },
    meeting: {
      reporterId: 'p2',
      tankSlot: 1,
      reason: 'report',
      votesCast: [],
      endsAtTick: 900,
      votingClosed: false,
      ejectedId: null,
      wasImpostor: false,
    },
    chat: [{ id: 'm1', playerId: 'p2', text: 'hola', tick: 5 }],
    oilDrops: [
      { x: 100, y: 200, color: '#e6194b', expiresAtTick: 307 },
    ],
    paused: false,
    waitingFor: [],
    myTasks: [],
    myActiveTask: null,
    emergency: null,
    mySabotage: null,
    myMeeting: null,
    tasksPerPlayer: 0,
  });
});

test('snapshot with meeting result maps ejectedId', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 20,
      phase: 'MEETING',
      players: [],
      tanks: [],
      reservoir: 0,
      myRole: 'CREW',
      myTaskProgress: { completed: 0, total: 4 },
      meeting: {
        reporterId: 'p1',
        tankSlot: 0,
        reason: 'MEETING_REASON_EMERGENCY',
        votesCast: ['p1', 'p2'],
        endsAtTick: 1000,
        votingClosed: true,
        ejectedId: 'p2',
        wasImpostor: true,
      },
      chat: [],
    },
  } as unknown as GrpcServerEvent;

  assert.deepEqual(toServerMessage(ev), {
    type: 'snapshot',
    tick: 20,
    phase: 'MEETING',
    players: [],
    tanks: [],
    reservoir: 0,
    myRole: 'CREW',
    myTaskProgress: { completed: 0, total: 4 },
    meeting: {
      reporterId: 'p1',
      tankSlot: 0,
      reason: 'emergency',
      votesCast: ['p1', 'p2'],
      endsAtTick: 1000,
      votingClosed: true,
      ejectedId: 'p2',
      wasImpostor: true,
    },
    chat: [],
    oilDrops: [],
    paused: false,
    waitingFor: [],
    myTasks: [],
    myActiveTask: null,
    emergency: null,
    mySabotage: null,
    myMeeting: null,
    tasksPerPlayer: 0,
  });
});

test('snapshot without meeting sends null', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 1,
      phase: 'LOBBY',
      players: [],
      tanks: [],
      reservoir: 0,
      myRole: 'NO_ROLE',
      myTaskProgress: null,
      meeting: null,
      chat: [],
    },
  } as unknown as GrpcServerEvent;

  const msg = toServerMessage(ev);
  assert.equal(msg?.type, 'snapshot');
  if (msg?.type !== 'snapshot') return;
  assert.equal(msg.meeting, null);
  assert.deepEqual(msg.myTaskProgress, { completed: 0, total: 0 });
  assert.deepEqual(msg.oilDrops, []);
  assert.equal(msg.paused, false);
  assert.deepEqual(msg.waitingFor, []);
  assert.deepEqual(msg.myTasks, []);
  assert.equal(msg.myActiveTask, null);
});

test('snapshot in pause says who it is waiting for', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 40,
      phase: 'PLAYING',
      players: [],
      tanks: [],
      reservoir: 0,
      myRole: 'CREW',
      myTaskProgress: { completed: 0, total: 4 },
      meeting: null,
      chat: [],
      oilDrops: [],
      paused: true,
      waitingFor: ['p2'],
    },
  } as unknown as GrpcServerEvent;

  const msg = toServerMessage(ev);
  if (msg?.type !== 'snapshot') throw new Error('esperaba snapshot');
  assert.equal(msg.paused, true);
  assert.deepEqual(msg.waitingFor, ['p2']);
});

test('snapshot maps my tasks and the active one', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 50,
      phase: 'PLAYING',
      players: [],
      tanks: [],
      reservoir: 3,
      myRole: 'CREW',
      myTaskProgress: { completed: 1, total: 2 },
      meeting: null,
      chat: [],
      myTasks: [
        { stationId: 'leak-1', done: true, extra: 'x' },
        { stationId: 'rain-1', done: false },
      ],
      myActiveTask: 'rain-1',
    },
  } as unknown as GrpcServerEvent;

  const msg = toServerMessage(ev);
  if (msg?.type !== 'snapshot') throw new Error('esperaba snapshot');
  assert.deepEqual(msg.myTasks, [
    { stationId: 'leak-1', done: true },
    { stationId: 'rain-1', done: false },
  ]);
  assert.equal(msg.myActiveTask, 'rain-1');
});

test('matchEnded keeps winner, impostors and reason', () => {
  const ev: GrpcServerEvent = {
    event: 'matchEnded',
    matchEnded: {
      winner: 'impostor',
      impostorIds: ['p3'],
      reason: 'tanks_contaminated',
    },
  };
  assert.deepEqual(toServerMessage(ev), {
    type: 'matchEnded',
    winner: 'impostor',
    impostorIds: ['p3'],
    reason: 'tanks_contaminated',
  });
});

test('matchEnded with unknown reason drops reason field', () => {
  const ev: GrpcServerEvent = {
    event: 'matchEnded',
    matchEnded: {
      winner: 'crew',
      impostorIds: ['p3'],
      reason: 'unknown_reason',
    },
  };
  assert.deepEqual(toServerMessage(ev), {
    type: 'matchEnded',
    winner: 'crew',
    impostorIds: ['p3'],
  });
});

test('matchEnded with an unknown winner is dropped', () => {
  const ev: GrpcServerEvent = {
    event: 'matchEnded',
    matchEnded: { winner: '', impostorIds: [] },
  };
  assert.equal(toServerMessage(ev), null);
});

test('S3-05: activity, emergency and mySabotage are mapped', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 50,
      phase: 'PLAYING',
      players: [
        {
          id: 'p1',
          name: 'Ana',
          color: '#e6194b',
          x: 1,
          y: 2,
          connected: true,
          alive: true,
          activity: 'recycle',
          extra: 'x',
        },
        {
          id: 'p2',
          name: 'Beto',
          color: '#3cb44b',
          x: 3,
          y: 4,
          connected: true,
          alive: true,
          activity: '',
        },
        {
          id: 'p3',
          name: 'Cata',
          color: '#ffe119',
          x: 5,
          y: 6,
          connected: false,
          alive: false,
          activity: 'hack',
        },
      ],
      tanks: [],
      reservoir: 0,
      myRole: 'IMPOSTOR',
      myTaskProgress: { completed: 0, total: 4 },
      meeting: null,
      emergency: {
        kind: 'pipe',
        endsAtTick: 650,
        heldPoints: ['pipe-west'],
        extra: 'x',
      },
      mySabotage: { readyAtTick: 840, pipesLeft: 1, extra: 'x' },
      myMeeting: { readyAtTick: 1000, callsLeft: 1, extra: 'x' },
    },
  } as unknown as GrpcServerEvent;

  const msg = toServerMessage(ev);
  assert.ok(msg && msg.type === 'snapshot');
  assert.deepEqual(
    msg.players.map((p) => p.activity),
    ['recycle', null, null],
  );
  assert.deepEqual(msg.players[0], {
    id: 'p1',
    name: 'Ana',
    color: '#e6194b',
    x: 1,
    y: 2,
    connected: true,
    alive: true,
    activity: 'recycle',
    accessory: '',
    skin: 'jimena',
  });
  assert.deepEqual(msg.emergency, {
    kind: 'pipe',
    endsAtTick: 650,
    heldPoints: ['pipe-west'],
  });
  assert.deepEqual(msg.mySabotage, { readyAtTick: 840, pipesLeft: 1 });
  assert.deepEqual(msg.myMeeting, { readyAtTick: 1000, callsLeft: 1 });
});

test('S3-05: an unknown emergency kind is dropped', () => {
  const ev = {
    event: 'snapshot',
    snapshot: {
      tick: 1,
      phase: 'PLAYING',
      players: [],
      tanks: [],
      reservoir: 0,
      myRole: 'CREW',
      meeting: null,
      emergency: { kind: 'flood', endsAtTick: 0, heldPoints: [] },
      mySabotage: null,
    },
  } as unknown as GrpcServerEvent;
  const msg = toServerMessage(ev);
  assert.ok(msg && msg.type === 'snapshot');
  assert.equal(msg.emergency, null);
  assert.equal(msg.mySabotage, null);
});

test('snapshot carries the chosen tasksPerPlayer', () => {
  const ev = {
    event: 'snapshot',
    snapshot: { tick: 1, phase: 'LOBBY', tasksPerPlayer: 8 },
  } as unknown as GrpcServerEvent;
  const msg = toServerMessage(ev);
  assert.equal(msg?.type === 'snapshot' && msg.tasksPerPlayer, 8);
});
