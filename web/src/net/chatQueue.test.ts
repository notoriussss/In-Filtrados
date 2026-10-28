import { describe, expect, it } from 'vitest';
import type { ClientMessage, Snapshot } from '@in-filtrados/messages';
import { CHAT_RESEND_MS, CHAT_SEND_GAP_MS, ChatQueue } from './chatQueue';

function meeting(chatIds: string[], phase: Snapshot['phase'] = 'MEETING') {
  return {
    type: 'snapshot',
    tick: 1,
    phase,
    players: [],
    tanks: [],
    reservoir: 0,
    myRole: 'CREW',
    myTaskProgress: { completed: 0, total: 4 },
    meeting: null,
    chat: chatIds.map((id) => ({ id, playerId: 'a', text: 'x', tick: 1 })),
    oilDrops: [],
    paused: false,
    waitingFor: [],
    myTasks: [],
    myActiveTask: null,
    emergency: null,
    mySabotage: null,
    myMeeting: null,
    tasksPerPlayer: 6,
    impostors: 1,
    matchMinutes: 8,
    matchEndsAtTick: 0,
  } as Snapshot;
}

function setup() {
  const sent: ClientMessage[] = [];
  let n = 0;
  const q = new ChatQueue(
    (m) => sent.push(m),
    () => `id-${++n}`,
  );
  const ids = () =>
    sent.map((m) => (m.type === 'chat' ? m.clientMsgId : m.type));
  return { q, sent, ids };
}

describe('ChatQueue', () => {
  it('keeps messages written offline and sends them on reconnect', () => {
    const { q, sent, ids } = setup();
    q.offline();
    q.add('uno', 0);
    q.add('dos', 100);
    expect(sent).toEqual([]);
    expect(q.waiting().map((c) => c.text)).toEqual(['uno', 'dos']);

    q.onSnapshot(meeting([]), 30_000); // volvió la conexión
    expect(ids()).toEqual(['id-1']);
    q.onSnapshot(meeting([]), 30_000 + CHAT_SEND_GAP_MS);
    expect(ids()).toEqual(['id-1', 'id-2']);
  });

  it('spaces messages to respect 1 per second', () => {
    const { q, ids } = setup();
    q.onSnapshot(meeting([]), 0);
    q.add('uno', 0);
    q.add('dos', 10);
    q.onSnapshot(meeting([]), 500);
    expect(ids()).toEqual(['id-1']);
  });

  it('drops a message once the snapshot shows it', () => {
    const { q } = setup();
    q.onSnapshot(meeting([]), 0);
    q.add('uno', 0);
    q.onSnapshot(meeting(['id-1']), 50);
    expect(q.waiting()).toEqual([]);
  });

  it('resends with the same id what was sent right before a cut', () => {
    const { q, ids } = setup();
    q.onSnapshot(meeting([]), 0);
    q.add('uno', 0); // salió, pero la red ya estaba caída
    q.offline();
    q.onSnapshot(meeting([]), 5_000);
    expect(ids()).toEqual(['id-1', 'id-1']);
  });

  it('resends an unconfirmed message after a while online', () => {
    const { q, ids } = setup();
    q.onSnapshot(meeting([]), 0);
    q.add('uno', 0);
    q.onSnapshot(meeting([]), CHAT_RESEND_MS - 1);
    expect(ids()).toEqual(['id-1']);
    q.onSnapshot(meeting([]), CHAT_RESEND_MS);
    expect(ids()).toEqual(['id-1', 'id-1']);
  });

  it('forgets everything when the meeting is over', () => {
    const { q } = setup();
    q.offline();
    q.add('uno', 0);
    q.onSnapshot(meeting([], 'PLAYING'), 10);
    expect(q.waiting()).toEqual([]);
  });
});
