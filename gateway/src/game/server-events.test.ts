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
        lastVisitors: ['p1'],
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
      lastVisitors: ['p1'],
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
        lastVisitors: ['p1', 'p2'],
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
      lastVisitors: ['p1', 'p2'],
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

test('matchEnded keeps winner and impostors', () => {
  const ev: GrpcServerEvent = {
    event: 'matchEnded',
    matchEnded: { winner: 'impostor', impostorIds: ['p3'] },
  };
  assert.deepEqual(toServerMessage(ev), {
    type: 'matchEnded',
    winner: 'impostor',
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
