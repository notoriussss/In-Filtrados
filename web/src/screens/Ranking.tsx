import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { HintBar } from '../ui/kit';
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
import '../styles/ranking.css';

type Column = { key: SortKey; label: string };

const MATCHES: Column = { key: 'matches', label: T.MATCHES };
const WINS: Column = { key: 'wins', label: T.WINS };
const RATE: Column = { key: 'rate', label: T.RATE };
const IMPOSTOR: Column = { key: 'impostor', label: T.IMPOSTOR };
const LITERS: Column = { key: 'liters', label: T.LITERS };
const COINS: Column = { key: 'coins', label: T.COINS };

const SORT_COLUMNS: Column[] = [WINS, RATE, MATCHES, IMPOSTOR, COINS, LITERS];

// Ranking: escenario abierto con barra de ordenamiento rápido y filas tipo
// tarjeta, siguiendo el mismo lenguaje visual unificado de la tienda y sala.
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
  const activeSortLabel =
    SORT_COLUMNS.find((c) => c.key === sort)?.label ?? T.WINS;

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
      <div className="rk-vignette" />

      {/* BARRA SUPERIOR */}
      <header className="rk-header">
        <button
          type="button"
          className="rk-back-btn"
          onClick={props.onClose}
        >
          {T.BACK}
        </button>

        <div className="rk-header-right">
          {error && (
            <div className="rk-alert-pill" role="alert">
              {error}
            </div>
          )}
          {mine >= 0 && (
            <div className="rk-pos-pill">
              {T.position(mine + 1, rows.length)}
            </div>
          )}
        </div>
      </header>

      {/* CUERPO PRINCIPAL ABIERTO */}
      <section className="rk-main">
        <header className="rk-toolbar">
          <div className="rk-toolbar-title">
            <span className="rk-title-main">{T.TITLE}</span>
            <span className="rk-title-dot">·</span>
            <span className="rk-title-sub">{activeSortLabel}</span>
          </div>

          <div className="rk-sort-bar" role="group" aria-label={T.SORT_BY}>
            <span className="rk-sort-lbl">{T.SORT_BY}</span>
            {SORT_COLUMNS.map((c) => {
              const isActive = sort === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  className={`rk-sort-pill ${isActive ? 'active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => setSort(c.key)}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </header>

        <div className="rk-scroll">
          {rows.length === 0 ? (
            <p className="rk-empty">
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
                  {head(COINS)}
                  {head(LITERS)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const crew = crewStats(r);
                  const place = i < 3 ? `rk-p${i + 1}` : '';
                  const rowCls = [place, i === mine ? 'rk-self' : '']
                    .filter(Boolean)
                    .join(' ');
                  const colCls = (key: SortKey) =>
                    `num ${sort === key ? 'active-col' : ''}`.trim();

                  return (
                    <tr key={r.playerId} className={rowCls}>
                      <td className="pos">
                        <span className="rk-medal">{i + 1}</span>
                      </td>
                      <td className="name">
                        {r.username}
                        {i === mine && (
                          <span className="rk-you-tag">{T.YOU}</span>
                        )}
                      </td>
                      <td className={colCls('matches')}>{r.matchesPlayed}</td>
                      <td className={colCls('wins')}>{r.wins}</td>
                      <td className={colCls('rate')}>
                        {percent(winRate(r))}
                      </td>
                      <td className="num">{T.ratio(crew.wins, crew.played)}</td>
                      <td className={colCls('impostor')}>
                        {T.ratio(r.winsAsImpostor, r.timesImpostor)}
                      </td>
                      <td className={colCls('coins')}>{r.coinsEarned}</td>
                      <td className={colCls('liters')}>
                        {T.liters(r.litersSaved)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <p className="rk-foot-note">{T.HINT}</p>
      </section>

      <HintBar hints={[['Esc', T.BACK]]} />
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
