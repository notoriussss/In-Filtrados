import { describe, expect, it } from 'vitest';
import { gameMap } from '../map';
import {
  MIN_TASK_MS,
  SEND_MARGIN_MS,
  buildTaskList,
  completionDelay,
  pickStation,
  zoneOf,
} from './tasks';

describe('zoneOf', () => {
  it('picks the smallest zone, not the stream around the map', () => {
    expect(zoneOf({ x: 220, y: 960 }, gameMap.zones)?.id).toBe('pumps');
    expect(zoneOf({ x: 1290, y: 470 }, gameMap.zones)?.id).toBe(
      'treatment',
    );
  });

  it('falls back to the stream outside every room', () => {
    expect(zoneOf({ x: 5, y: 5 }, gameMap.zones)?.id).toBe('stream');
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
        zoneName: 'Cuarto de bombas',
        done: true,
      },
      {
        stationId: 'rain-1',
        type: 'reuse',
        zoneName: 'Techos con barriles',
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
    const s = pickStation({ x: 240, y: 960 }, tasks, stations);
    expect(s?.id).toBe('leak-1');
  });

  it('ignores stations too far, done or not mine', () => {
    expect(pickStation({ x: 300, y: 960 }, tasks, stations)).toBeNull();
    expect(pickStation({ x: 400, y: 800 }, tasks, stations)).toBeNull();
    expect(pickStation({ x: 310, y: 470 }, tasks, stations)).toBeNull();
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
