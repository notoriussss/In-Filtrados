import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@in-filtrados/messages';
import { pauseMessage } from './pause';

function snap(paused: boolean, waitingFor: string[]): Snapshot {
  const player = (id: string, name: string) => ({
    id,
    name,
    color: '#fff',
    x: 0,
    y: 0,
    connected: !waitingFor.includes(id),
    alive: true,
  });
  return {
    type: 'snapshot',
    tick: 10,
    phase: 'PLAYING',
    players: [player('a', 'Ana'), player('b', 'Beto'), player('c', 'Caro')],
    tanks: [],
    reservoir: 0,
    myRole: 'CREW',
    myTaskProgress: { completed: 0, total: 4 },
    meeting: null,
    chat: [],
    oilDrops: [],
    paused,
    waitingFor,
  };
}

describe('pauseMessage', () => {
  it('says nothing while the match runs', () => {
    expect(pauseMessage(snap(false, []), false)).toBeNull();
    expect(pauseMessage(null, false)).toBeNull();
  });

  it('names who the room is waiting for', () => {
    expect(pauseMessage(snap(true, ['b', 'c']), false)).toBe(
      'Partida en pausa: esperando a Beto, Caro',
    );
  });

  it('match down wins over the last snapshot', () => {
    expect(pauseMessage(snap(false, []), true)).toBe(
      'Partida en pausa: reconectando con el servidor de la partida…',
    );
  });
});
