import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@in-filtrados/messages';
import { myImpact } from './Result';

describe('myImpact', () => {
  it('counts my tasks by 3R type', () => {
    const snap = {
      myTasks: [
        { stationId: 'leak-1', done: true },
        { stationId: 'valve-1', done: false },
        { stationId: 'rain-1', done: true },
        { stationId: 'filter-1', done: false },
        { stationId: 'missing', done: true },
      ],
    } as Snapshot;
    expect(myImpact(snap)).toEqual({
      reduce: { done: 1, total: 2 },
      reuse: { done: 1, total: 1 },
      recycle: { done: 0, total: 1 },
    });
  });
});
