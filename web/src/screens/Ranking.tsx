import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Button, Chip } from '../ui/kit';
import { api } from '../api';
import { session } from '../session';
import {
  type RankingEntry,
  type SortKey,
  crewStats,
  percent,
  sortRanking,
  winRate,
} from '../ranking';
import { ERROR_MESSAGES } from '../constants';
import { RANKING_TEXT as T } from '../texts';
import { BACKGROUNDS } from './backgrounds';

type Column = { key: SortKey; label: string };

const MATCHES: Column = { key: 'matches', label: T.MATCHES };
const WINS: Column = { key: 'wins', label: T.WINS };
const RATE: Column = { key: 'rate', label: T.RATE };
const IMPOSTOR: Column = { key: 'impostor', label: T.IMPOSTOR };
const HARVEST: Column = { key: 'harvest', label: T.HARVEST };
const COINS: Column = { key: 'coins', label: T.COINS };

// Ranking: todos los jugadores con sus estadísticas. Por defecto de más a
// menos victorias; tocar el título de otra columna reordena la tabla.
export function Ranking(props: {
  onClose: () => void;
  onUnauthorized: () => void;
}) {
  const data = session.loadSession();
  const [entries, setEntries] = useState<RankingEntry[] | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<SortKey>('wins');

  useEffect(() => {
    if (!data) return;
    let alive = true;
    api.getRanking(data.token).then(
      (r) => alive && setEntries(r.entries),
      (err: unknown) => {
        if (!alive) return;
        const message = err instanceof Error ? err.message : '';
        if (/401|token/i.test(message)) props.onUnauthorized();
        else setError(message || ERROR_MESSAGES.SERVICE_UNAVAILABLE);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') props.onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props]);

  const rows = entries ? sortRanking(entries, sort) : [];
  const mine = rows.findIndex((r) => r.playerId === data?.playerId);
  const head = (col: Column) => (
    <SortHead
      key={col.key}
      col={col}
      active={sort === col.key}
      onSort={setSort}
    />
  );

  return (
    <Stage className="scr-ranking" background={BACKGROUNDS.mapBlur}>
      <div className="shade dim" />
      <div className="rk-top">
        <div className="row">
          <Button variant="sec" small icon="left" onClick={props.onClose}>
            {T.BACK}
          </Button>
          <span className="h2 screen-title">{T.TITLE}</span>
        </div>
        <div className="row">
          {error && (
            <Chip tone="bad" big icon="cross">
              {error}
            </Chip>
          )}
          {mine >= 0 && (
            <Chip tone="info" big icon="drop">
              {T.position(mine + 1, rows.length)}
            </Chip>
          )}
        </div>
      </div>

      <section className="panel rk-panel">
        {rows.length === 0 ? (
          <p className="muted rk-empty">
            {entries === null ? (error ? '' : T.LOADING) : T.EMPTY}
          </p>
        ) : (
          <table className="rk-table">
            <thead>
              <tr>
                <th className="pos">{T.POS}</th>
                <th className="name">{T.PLAYER}</th>
                {head(MATCHES)}
                {head(WINS)}
                {head(RATE)}
                <th className="num">{T.CREW}</th>
                {head(IMPOSTOR)}
                {head(HARVEST)}
                {head(COINS)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const crew = crewStats(r);
                const place = i < 3 ? `rk-p${i + 1}` : '';
                return (
                  <tr
                    key={r.playerId}
                    className={`${place} ${i === mine ? 'rk-self' : ''}`}
                  >
                    <td className="pos">
                      <span className="rk-medal">{i + 1}</span>
                    </td>
                    <td className="name">
                      {r.username}
                      {i === mine && <small> {T.YOU}</small>}
                    </td>
                    <td className="num">{r.matchesPlayed}</td>
                    <td className="num strong">{r.wins}</td>
                    <td className="num">{percent(winRate(r))}</td>
                    <td className="num">{T.ratio(crew.wins, crew.played)}</td>
                    <td className="num">
                      {T.ratio(r.winsAsImpostor, r.timesImpostor)}
                    </td>
                    <td className="num">{T.liters(r.harvest)}</td>
                    <td className="num">{r.coinsEarned}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
      <p className="muted rk-foot">{T.HINT}</p>
    </Stage>
  );
}

function SortHead(props: {
  col: Column;
  active: boolean;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th
      className={`num ${props.active ? 'on' : ''}`}
      aria-sort={props.active ? 'descending' : 'none'}
    >
      <button
        type="button"
        title={`${T.SORT_BY}: ${props.col.label}`}
        onClick={() => props.onSort(props.col.key)}
      >
        {props.col.label}
        {props.active ? ' ▾' : ''}
      </button>
    </th>
  );
}
