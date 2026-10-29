// Ranking de jugadores: las estadísticas de todos, de `GET /api/ranking`
// (docs/tasks.md 0.6). `players` ya las manda ordenadas por victorias;
// aquí solo se calculan los porcentajes y se reordena por la columna que
// el jugador elija.

export type RankingEntry = {
  playerId: string;
  username: string;
  matchesPlayed: number;
  wins: number;
  timesImpostor: number;
  winsAsImpostor: number;
  coinsEarned: number;
  litersSaved: number; // litros que sus tareas sumaron al embalse
};

export type RankingResponse = { entries: RankingEntry[] };

export type SortKey =
  | 'wins'
  | 'rate'
  | 'matches'
  | 'impostor'
  | 'liters'
  | 'coins';

// winRate: victorias entre partidas, de 0 a 1 (0 si aún no juega).
export function winRate(e: RankingEntry): number {
  return e.matchesPlayed > 0 ? e.wins / e.matchesPlayed : 0;
}

// Como cuidador cuenta todo lo que no fue como infiltrado.
export function crewStats(e: RankingEntry): { played: number; wins: number } {
  return {
    played: Math.max(0, e.matchesPlayed - e.timesImpostor),
    wins: Math.max(0, e.wins - e.winsAsImpostor),
  };
}

const VALUE: Record<SortKey, (e: RankingEntry) => number> = {
  wins: (e) => e.wins,
  rate: winRate,
  matches: (e) => e.matchesPlayed,
  impostor: (e) => e.winsAsImpostor,
  liters: (e) => e.litersSaved,
  coins: (e) => e.coinsEarned,
};

// sortRanking ordena de mayor a menor sin tocar la lista original; a
// igualdad queda el orden que mandó el servidor (victorias, menos partidas,
// nombre), porque Array.sort es estable.
export function sortRanking(
  entries: RankingEntry[],
  key: SortKey,
): RankingEntry[] {
  const value = VALUE[key];
  return [...entries].sort((a, b) => value(b) - value(a));
}

// percent: 0.4 → "40 %".
export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
