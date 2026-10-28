import { describe, expect, it } from 'vitest';
import type { Meeting, Snapshot } from '@in-filtrados/messages';
import {
  coinsEarned,
  endSubtitle,
  endTitle,
  meetingView,
  resultText,
  secondsLeft,
} from './meeting';

const player = (
  id: string,
  name: string,
  connected: boolean,
  alive: boolean,
) => ({
  id,
  name,
  color: '#e6194b',
  x: 0,
  y: 0,
  connected,
  alive,
  activity: null,
});

const players = [
  player('a', 'Ana', true, true),
  player('b', 'Beto', true, true),
  player('c', 'Caro', false, true),
  player('d', 'Dani', true, false),
];

function snap(meeting: Partial<Meeting>, tick = 100): Snapshot {
  return {
    type: 'snapshot',
    tick,
    phase: 'MEETING',
    players,
    tanks: [{ slot: 3, ownerId: 'd', contamination: 100, dead: true }],
    reservoir: 0,
    myRole: 'CREW',
    myTaskProgress: { completed: 0, total: 4 },
    meeting: {
      reporterId: 'a',
      tankSlot: 3,
      reason: 'report',
      votesCast: [],
      endsAtTick: 1000,
      votingClosed: false,
      ejectedId: null,
      wasImpostor: false,
      ...meeting,
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
    tasksPerPlayer: 6,
  };
}

describe('secondsLeft', () => {
  it('rounds up and never goes below zero', () => {
    expect(secondsLeft(1000, 100)).toBe(45);
    expect(secondsLeft(1000, 999)).toBe(1);
    expect(secondsLeft(1000, 1200)).toBe(0);
  });
});

describe('meetingView', () => {
  it('is null outside a meeting', () => {
    expect(meetingView({ ...snap({}), phase: 'PLAYING' }, 'a')).toBeNull();
  });

  it('says who reported, and whose tank', () => {
    const v = meetingView(snap({}), 'a')!;
    expect(v.reporterText).toBe('Ana reportó un tanque muerto');
    expect(v.tankText).toBe('Tanque de Dani');
    expect(v.countdownText).toBe('Votación: 45 s');
  });

  it('says who called an emergency meeting, without a tank', () => {
    const v = meetingView(
      snap({ reason: 'emergency', tankSlot: -1 }),
      'a',
    )!;
    expect(v.reporterText).toBe(
      'Ana convocó una reunión de emergencia',
    );
    expect(v.tankText).toBe('');
  });

  it('a living player can vote for the living, not for ghosts', () => {
    const v = meetingView(snap({}), 'a')!;
    expect(v.canVote).toBe(true);
    expect(v.canChat).toBe(true);
    const votable = v.players.filter((p) => p.votable).map((p) => p.id);
    expect(votable).toEqual(['a', 'b', 'c']);
  });

  it('shows who voted but not for whom, and blocks a second vote', () => {
    const v = meetingView(snap({ votesCast: ['a', 'b'] }), 'a')!;
    expect(v.players.filter((p) => p.voted).map((p) => p.id)).toEqual([
      'a',
      'b',
    ]);
    expect(v.canVote).toBe(false);
    expect(v.hint).toBe('Ya votaste. Esperando a los demás…');
  });

  it('a ghost reads the chat but cannot vote or write', () => {
    const v = meetingView(snap({}), 'd')!;
    expect(v.canVote).toBe(false);
    expect(v.canChat).toBe(false);
    expect(v.players.some((p) => p.votable)).toBe(false);
  });

  it('switches to the result once voting closes', () => {
    const v = meetingView(
      snap(
        {
          votingClosed: true,
          ejectedId: 'b',
          wasImpostor: true,
          endsAtTick: 200,
        },
        120,
      ),
      'a',
    )!;
    expect(v.stage).toBe('result');
    expect(v.canVote).toBe(false);
    expect(v.resultTitle).toBe('Expulsaron a Beto');
    expect(v.resultDetail).toBe('Beto era el infiltrado');
    expect(v.countdownText).toBe('Volvemos al huerto en 4 s');
  });
});

describe('resultText', () => {
  it('nobody out on a tie or skip', () => {
    expect(resultText(null, false, players).title).toBe(
      'Nadie salió: hubo empate o saltaron el voto',
    );
  });

  it('a crewmate ejected', () => {
    expect(resultText('c', false, players).detail).toBe(
      'Caro no era el infiltrado',
    );
  });
});

describe('end of match', () => {
  it('says who won', () => {
    expect(endTitle('crew')).toBe('¡Ganaron los cuidadores!');
    expect(endTitle('impostor')).toBe('¡Ganó el infiltrado!');
    expect(endTitle(null)).toBe('La partida terminó');
  });

  it('distinguishes why crew or impostor won in subtitle', () => {
    expect(endSubtitle('crew', 'reservoir_full')).toBe(
      'El embalse se llenó con las tareas 3R.',
    );
    expect(endSubtitle('crew', 'impostors_ejected', 1)).toBe(
      'El infiltrado fue descubierto y expulsado.',
    );
    expect(endSubtitle('crew', 'impostors_ejected', 2)).toBe(
      'Los infiltrados fueron expulsados.',
    );
    expect(endSubtitle('crew', null)).toBe(
      'El embalse se llenó o el infiltrado quedó fuera.',
    );
    expect(endSubtitle('impostor', 'tanks_contaminated')).toBe(
      'Los tanques se contaminaron.',
    );
    expect(endSubtitle('impostor', 'timeout')).toBe(
      'Se acabó el tiempo.',
    );
    expect(endSubtitle('impostor', null)).toBe(
      'Los tanques se contaminaron o se acabó el tiempo.',
    );
    expect(endSubtitle(null)).toBe('');
  });

  it('coins appear only after players counted the match', () => {
    const before = { coins: 10, matchesPlayed: 1 };
    expect(coinsEarned(before, { coins: 10, matchesPlayed: 1 })).toBeNull();
    expect(coinsEarned(before, { coins: 45, matchesPlayed: 2 })).toBe(35);
  });
});
