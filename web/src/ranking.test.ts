import { describe, expect, it } from 'vitest';
import {
  type RankingEntry,
  crewStats,
  percent,
  sortRanking,
  winRate,
} from './ranking';

function entry(name: string, extra: Partial<RankingEntry> = {}): RankingEntry {
  return {
    playerId: name,
    username: name,
    matchesPlayed: 0,
    wins: 0,
    timesImpostor: 0,
    winsAsImpostor: 0,
    harvest: 0,
    coinsEarned: 0,
    ...extra,
  };
}

describe('winRate', () => {
  it('is wins over matches, and 0 before the first match', () => {
    expect(winRate(entry('a', { matchesPlayed: 4, wins: 1 }))).toBe(0.25);
    expect(winRate(entry('b'))).toBe(0);
  });

  it('is written as a rounded percentage', () => {
    expect(percent(1 / 3)).toBe('33 %');
    expect(percent(0)).toBe('0 %');
  });
});

describe('crewStats', () => {
  it('leaves out the matches played as infiltrado', () => {
    const e = entry('a', {
      matchesPlayed: 10,
      wins: 6,
      timesImpostor: 3,
      winsAsImpostor: 1,
    });
    expect(crewStats(e)).toEqual({ played: 7, wins: 5 });
  });

  it('never goes below zero with inconsistent data', () => {
    const e = entry('a', { timesImpostor: 2, winsAsImpostor: 1 });
    expect(crewStats(e)).toEqual({ played: 0, wins: 0 });
  });
});

describe('sortRanking', () => {
  const list = [
    entry('ana', { matchesPlayed: 10, wins: 5, harvest: 50 }),
    entry('beto', { matchesPlayed: 2, wins: 2, harvest: 90 }),
    entry('caro', { matchesPlayed: 5, wins: 5, harvest: 10 }),
  ];

  it('orders by the chosen column, highest first', () => {
    expect(sortRanking(list, 'harvest').map((e) => e.username)).toEqual([
      'beto',
      'ana',
      'caro',
    ]);
    expect(sortRanking(list, 'rate').map((e) => e.username)).toEqual([
      'beto',
      'caro',
      'ana',
    ]);
  });

  it('keeps the server order between ties and does not touch the input', () => {
    const copy = [...list];
    expect(sortRanking(list, 'wins').map((e) => e.username)).toEqual([
      'ana',
      'caro',
      'beto',
    ]);
    expect(list).toEqual(copy);
  });
});
