import { describe, expect, it } from 'vitest';
import { gameMap } from '../../map';
import {
  MIN_TASK_MS,
  SEND_MARGIN_MS,
  buildTaskList,
  completionDelay,
  pickStation,
  zoneOf,
} from './tasks';

describe('zoneOf', () => {
  it('finds the zone that contains the point', () => {
    expect(zoneOf({ x: 600, y: 1500 }, gameMap.zones)?.id).toBe('humedal');
  });

  it('is null outside every zone', () => {
    expect(zoneOf({ x: 5, y: 5 }, gameMap.zones)).toBeNull();
  });
});

describe('buildTaskList', () => {
  it('gives type, zone and done for each own task', () => {
    const rows = buildTaskList(
      [
        { stationId: 'leak-1', done: true },
        { stationId: 'rain-1', done: false },
        { stationId: 'missing', done: false },
      ],
      gameMap,
    );
    expect(rows).toEqual([
      {
        stationId: 'leak-1',
        type: 'reduce',
        zoneName: 'Casa de bombeo solar',
        done: true,
      },
      {
        stationId: 'rain-1',
        type: 'reuse',
        zoneName: 'Patio de cisternas',
        done: false,
      },
    ]);
  });
});

describe('pickStation', () => {
  const tasks = [
    { stationId: 'leak-1', done: false },
    { stationId: 'valve-1', done: true },
  ];
  const stations = gameMap.stations;

  it('finds an own pending station in range', () => {
    const s = pickStation({ x: 336, y: 830 }, tasks, stations);
    expect(s?.id).toBe('leak-1');
  });

  it('ignores stations too far, done or not mine', () => {
    // A 60 de leak-1 (radio 56), junto a valve-1 (hecha) y junto a
    // rain-1 (no es mía).
    expect(pickStation({ x: 336, y: 844 }, tasks, stations)).toBeNull();
    expect(pickStation({ x: 2192, y: 1600 }, tasks, stations)).toBeNull();
    expect(pickStation({ x: 2128, y: 1200 }, tasks, stations)).toBeNull();
  });
});

describe('completionDelay', () => {
  it('waits until 3 s after the start, plus a margin', () => {
    expect(completionDelay(1000, 2000)).toBe(
      MIN_TASK_MS + SEND_MARGIN_MS - 1000,
    );
  });

  it('sends right away when the game took longer', () => {
    expect(completionDelay(1000, 1000 + MIN_TASK_MS + 999)).toBe(0);
  });
});
