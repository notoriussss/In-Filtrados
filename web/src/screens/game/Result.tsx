import { skinOf } from '../../shop';
import { useEffect, useState } from 'react';
import type { EndReason, Snapshot, Winner } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { Gauge } from '../../ui/kit';
import { api, type MeResponse } from '../../api';
import { session } from '../../session';
import { gameMap, type StationType } from '../../map';
import { coinsEarned, endSubtitle } from '../../game/meeting';
import { APP_TEXT, RESULT_TEXT as T } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';
import '../../styles/result.css';

const COINS_POLL_MS = 1500;
const COINS_POLL_TRIES = 12; // players suma las monedas en segundo plano
const LITERS_PER_POINT = 100; // litersPerPoint en match
const POINTS: Record<StationType, number> = {
  reduce: 3,
  reuse: 4,
  recycle: 5,
};

const TYPE_NAMES: Record<StationType, string> = {
  reduce: APP_TEXT.REDUCE,
  reuse: APP_TEXT.REUSE,
  recycle: APP_TEXT.RECYCLE,
};

// myImpact: tus tareas por tipo y los litros que ahorraron (S2-04).
export function myImpact(snap: Snapshot) {
  const out: Record<StationType, { done: number; total: number }> = {
    reduce: { done: 0, total: 0 },
    reuse: { done: 0, total: 0 },
    recycle: { done: 0, total: 0 },
  };
  for (const t of snap.myTasks) {
    const st = gameMap.stations.find((s) => s.id === t.stationId);
    if (!st) continue;
    out[st.type].total++;
    if (t.done) out[st.type].done++;
  }
  return out;
}

// Result: pantalla unificada de fin de partida. Muestra quién ganó,
// roles revelados, métricas de impacto 3R y monedas acumuladas.
export function Result(props: {
  snap: Snapshot;
  meId: string;
  winner: Winner | null;
  reason?: EndReason | null;
  impostorIds: string[];
  before: MeResponse | null;
  onExit: () => void;
}) {
  const { snap, meId, winner } = props;
  const [coins, setCoins] = useState<number | null>(null);
  const crewWon = winner === 'crew';
  const roomCode = session.loadSession()?.roomCode ?? '';
  // Sala cerrada por el host: no hay ganador y players no suma monedas.
  const hostLeft = props.reason === 'host_left';
  const subtitle = endSubtitle(
    winner,
    props.reason,
    props.impostorIds.length,
  );

  useEffect(() => {
    const data = session.loadSession();
    const before = props.before;
    if (!data || !before || hostLeft) return;
    let tries = 0;
    let alive = true;
    const poll = async () => {
      tries++;
      try {
        const after = await api.getMe(data.token);
        const got = coinsEarned(before, after);
        if (got !== null) {
          if (alive) setCoins(got);
          return;
        }
      } catch {
        // players caído: se reintenta.
      }
      if (alive && tries < COINS_POLL_TRIES) setTimeout(poll, COINS_POLL_MS);
    };
    poll();
    return () => {
      alive = false;
    };
  }, [props.before, hostLeft]);

  const impact = myImpact(snap);
  const cleanTanks = snap.tanks.filter((t) => !t.dead).length;
  const title =
    winner === null ? T.ENDED : crewWon ? T.CREW_WON : T.IMPOSTOR_WON;

  return (
    <div className="overlay-stage solid">
      <Stage className="scr-result" background={BACKGROUNDS.mapBlur}>
        <div
          className={`result-vignette ${
            crewWon || winner === null ? '' : 'bad'
          }`}
        />

        {/* HERO / TÍTULO DE RESULTADO */}
        <header className="result-hero">
          <h1
            className={`result-title ${
              crewWon || winner === null ? '' : 'bad'
            }`}
          >
            {title}
          </h1>
          {subtitle && <span className="result-sub">{subtitle}</span>}
        </header>

        {/* PANELES PRINCIPALES */}
        <div className="result-content">
          {/* 1. JUGADORES Y ROLES */}
          <section className="result-panel" aria-label={T.PLAYERS}>
            <header className="result-panel-header">
              <span className="result-panel-title">{T.PLAYERS}</span>
              {roomCode && (
                <span className="result-room-pill">{T.room(roomCode)}</span>
              )}
            </header>

            <div className="result-players-list">
              {snap.players.map((p) => {
                const impostor = props.impostorIds.includes(p.id);
                const isMe = p.id === meId;
                const statusCls = !p.alive
                  ? 'ghost'
                  : p.connected
                    ? 'alive'
                    : 'offline';
                const statusTxt = !p.alive
                  ? T.GHOST
                  : p.connected
                    ? T.ALIVE
                    : T.OFFLINE;

                return (
                  <div
                    key={p.id}
                    className={`result-player-row ${isMe ? 'is-me' : ''}`}
                  >
                    <div className="result-player-avatar">
                      <Gota
                        color={p.color}
                        accessory={p.accessory}
                        skin={skinOf(p.skin)}
                        scale={1.8}
                        portrait
                      />
                    </div>

                    <strong className="result-player-name">
                      {p.name}
                      {isMe && ` ${T.YOU}`}
                    </strong>

                    <span
                      className={`result-role-pill ${
                        impostor ? 'impostor' : 'crew'
                      }`}
                    >
                      {impostor ? T.IMPOSTOR : T.CREW}
                    </span>

                    <span className={`result-status-pill ${statusCls}`}>
                      {statusTxt}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. TU IMPACTO 3R Y ESTADÍSTICAS */}
          <section className="result-panel" aria-label={T.IMPACT}>
            <header className="result-panel-header">
              <span className="result-panel-title">{T.IMPACT}</span>
            </header>

            <div className="result-impact-items">
              {(['reduce', 'reuse', 'recycle'] as const).map((type) => {
                const r = impact[type];
                const liters = r.done * POINTS[type] * LITERS_PER_POINT;
                const gaugeVal = r.total ? r.done / r.total : 0;
                const tone =
                  type === 'reduce' ? '' : type === 'reuse' ? 'amber' : 'leaf';

                return (
                  <div key={type} className="result-impact-row">
                    <div className="result-impact-meta">
                      <strong className="result-impact-title">
                        {TYPE_NAMES[type]} · {T.tasksOf(r.done, r.total)}
                      </strong>
                      <span className="result-impact-liters">
                        {T.liters(liters)}
                      </span>
                    </div>
                    <Gauge value={gaugeVal} tone={tone} height={22} />
                  </div>
                );
              })}
            </div>

            <div className="result-stats-well">
              <div className="result-stat-box">
                <strong className="result-stat-val">
                  {cleanTanks}/{snap.tanks.length}
                </strong>
                <span className="result-stat-lbl">{T.CLEAN_TANKS}</span>
              </div>
              <div className="result-stat-box">
                <strong className="result-stat-val">
                  {snap.reservoir} %
                </strong>
                <span className="result-stat-lbl">{T.RESERVOIR}</span>
              </div>
              <div className="result-stat-box">
                <strong className="result-stat-val">
                  {hostLeft ? '+0' : coins === null ? '…' : `+${coins}`}
                </strong>
                <span className="result-stat-lbl">{T.COINS}</span>
              </div>
            </div>

            <p className="result-fact-note">
              {coins === null && !hostLeft ? T.COINS_PENDING : T.FACT}
            </p>
          </section>
        </div>

        {/* BARRA INFERIOR DE ACCIONES */}
        <footer className="result-footer">
          <button
            type="button"
            className="result-btn sec"
            onClick={props.onExit}
          >
            {T.EXIT}
          </button>
          <button
            type="button"
            className="result-btn pri"
            onClick={props.onExit}
          >
            {T.BACK}
          </button>
        </footer>
      </Stage>
    </div>
  );
}
