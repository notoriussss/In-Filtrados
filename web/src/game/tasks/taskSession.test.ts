import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientMessage, MyTask, Snapshot } from '@in-filtrados/messages';
import { gameMap } from '../../map';
import { MIN_TASK_MS, SEND_MARGIN_MS } from './tasks';
import { TaskSession } from './taskSession';

const PENDING: MyTask[] = [{ stationId: 'leak-1', done: false }];

function snap(
  myTasks: MyTask[],
  myActiveTask: string | null,
  phase: Snapshot['phase'] = 'PLAYING',
): Snapshot {
  return {
    type: 'snapshot',
    tick: 1,
    phase,
    players: [],
    tanks: [],
    reservoir: 0,
    myRole: 'CREW',
    myTaskProgress: { completed: 0, total: myTasks.length },
    meeting: null,
    chat: [],
    oilDrops: [],
    paused: false,
    waitingFor: [],
    myTasks,
    myActiveTask,
    emergency: null,
    mySabotage: null,
    myMeeting: null,
    tasksPerPlayer: 6,
    impostors: 1,
    matchMinutes: 8,
    matchEndsAtTick: 0,
  };
}

function setup() {
  const state = {
    now: 0,
    current: snap(PENDING, null) as Snapshot | null,
    sent: [] as ClientMessage[],
    mounted: [] as { type: string; complete: () => void }[],
    destroyed: 0,
    button: false,
    opened: 0,
    closed: 0,
  };
  const session = new TaskSession({
    stations: gameMap.stations,
    send: (m) => state.sent.push(m),
    me: () => ({ x: 336, y: 800 }), // junto a leak-1
    snapshot: () => state.current,
    mount: (type, opts) => {
      state.mounted.push({ type, complete: opts.onComplete });
      return { destroy: () => state.destroyed++ };
    },
    showButton: (v) => (state.button = v),
    onOpen: () => state.opened++,
    onClose: () => state.closed++,
    now: () => state.now,
  });
  const push = (s: Snapshot) => {
    state.current = s;
    session.onSnapshot(s);
  };
  return { session, state, push };
}

describe('TaskSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the button only next to an own pending station', () => {
    const { session, state, push } = setup();
    session.frame();
    expect(state.button).toBe(true);
    push(snap([{ stationId: 'leak-1', done: true }], null));
    session.frame();
    expect(state.button).toBe(false);
  });

  it('opens the game only after match confirms the start', () => {
    const { session, state, push } = setup();
    session.start();
    expect(state.sent).toEqual([{ type: 'interact', stationId: 'leak-1' }]);
    expect(state.mounted).toHaveLength(0);
    push(snap(PENDING, 'leak-1'));
    expect(state.mounted.map((m) => m.type)).toEqual(['reduce']);
    expect(state.opened).toBe(1);
    expect(session.isOpen()).toBe(true);
  });

  it('waits for the 3 s before sending completed', () => {
    const { session, state, push } = setup();
    session.start();
    state.now = 100;
    push(snap(PENDING, 'leak-1'));
    state.now = 1100; // terminó en 1 s
    state.mounted[0].complete();
    expect(state.sent).toHaveLength(1);
    vi.advanceTimersByTime(MIN_TASK_MS + SEND_MARGIN_MS - 1000 - 1);
    expect(state.sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(state.sent[1]).toEqual({
      type: 'interact',
      stationId: 'leak-1',
      completed: true,
    });
    expect(session.isOpen()).toBe(false);
    expect(state.destroyed).toBe(1);
  });

  it('closes without sending when match cancels the task', () => {
    const { session, state, push } = setup();
    session.start();
    push(snap(PENDING, 'leak-1'));
    state.mounted[0].complete();
    push(snap(PENDING, null)); // se alejó
    vi.runAllTimers();
    expect(session.isOpen()).toBe(false);
    expect(state.closed).toBe(1);
    expect(state.sent).toHaveLength(1);
  });

  it('closes when a meeting starts', () => {
    const { session, push } = setup();
    session.start();
    push(snap(PENDING, 'leak-1'));
    push(snap(PENDING, null, 'MEETING'));
    expect(session.isOpen()).toBe(false);
  });

  it('forgets a start that match never confirmed', () => {
    const { session, state, push } = setup();
    session.start();
    state.now = 5000;
    push(snap(PENDING, null));
    push(snap(PENDING, 'leak-1'));
    expect(state.mounted).toHaveLength(0);
  });
});
