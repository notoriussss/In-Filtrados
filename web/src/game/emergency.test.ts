import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@in-filtrados/messages';
import { gameMap } from '../map';
import { EMERGENCY_TEXT, SABOTAGE_TEXT } from '../constants';
import { emergencyBanner, sabotageButtons } from './emergency';

function snap(extra: Partial<Snapshot>): Snapshot {
  return {
    type: 'snapshot',
    tick: 1000,
    phase: 'PLAYING',
    players: [],
    tanks: [],
    reservoir: 0,
    myRole: 'IMPOSTOR',
    myTaskProgress: { completed: 0, total: 0 },
    meeting: null,
    chat: [],
    oilDrops: [],
    paused: false,
    waitingFor: [],
    myTasks: [],
    myActiveTask: null,
    emergency: null,
    mySabotage: { readyAtTick: 0, pipesLeft: 2 },
    myMeeting: null,
    tasksPerPlayer: 6,
    ...extra,
  };
}

describe('emergencyBanner', () => {
  it('is null without an emergency', () => {
    expect(emergencyBanner(snap({}), gameMap, 1000)).toBeNull();
  });

  it('counts down the pipe and the held ends', () => {
    const s = snap({
      emergency: {
        kind: 'pipe',
        endsAtTick: 1300,
        heldPoints: ['pipe-west'],
      },
    });
    const b = emergencyBanner(s, gameMap, 1000)!;
    expect(b.kind).toBe('pipe');
    expect(b.time).toBe(EMERGENCY_TEXT.pipeTime(15));
    expect(b.hint).toBe(EMERGENCY_TEXT.pipeHint(1, 2));
  });

  it('shows steam without a countdown', () => {
    const s = snap({
      emergency: { kind: 'steam', endsAtTick: 0, heldPoints: [] },
    });
    expect(emergencyBanner(s, gameMap, 1000)?.time).toBeNull();
  });
});

describe('sabotageButtons', () => {
  it('is only for the impostor', () => {
    expect(sabotageButtons(snap({ myRole: 'CREW' }), 1000)).toBeNull();
  });

  it('waits for the shared cooldown', () => {
    const s = snap({ mySabotage: { readyAtTick: 1100, pipesLeft: 2 } });
    const [pipe, steam] = sabotageButtons(s, 1000)!;
    expect(pipe.enabled).toBe(false);
    expect(steam.detail).toBe(SABOTAGE_TEXT.wait(5));
  });

  it('turns off the pipe after two breaks', () => {
    const s = snap({ mySabotage: { readyAtTick: 0, pipesLeft: 0 } });
    const [pipe, steam] = sabotageButtons(s, 1000)!;
    expect(pipe.enabled).toBe(false);
    expect(pipe.detail).toBe(SABOTAGE_TEXT.NO_PIPES);
    expect(steam.enabled).toBe(true);
  });

  it('is disabled while an emergency is running', () => {
    const s = snap({
      emergency: { kind: 'steam', endsAtTick: 0, heldPoints: [] },
    });
    const buttons = sabotageButtons(s, 1000)!;
    expect(buttons.every((b) => !b.enabled)).toBe(true);
  });
});
