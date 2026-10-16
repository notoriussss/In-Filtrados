import { useEffect, useState } from 'react';
import type { Snapshot, Winner } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { Icon, TASK_ICONS } from '../../ui/Icon';
import { Button, Chip, Gauge, TitleBar } from '../../ui/kit';
import { api, type MeResponse } from '../../api';
import { session } from '../../session';
import { gameMap, type StationType } from '../../map';
import { coinsEarned } from '../../game/meeting';
import { APP_TEXT, RESULT_TEXT as T } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';

const COINS_POLL_MS = 1500;
const COINS_POLL_TRIES = 12; // players suma las monedas en segundo plano
const LITERS_PER_POINT = 100; // litersPerPoint en match
const POINTS: Record<StationType, number> = { reduce: 3, reuse: 4, recycle: 5 };

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

// Result (maqueta 12-resultado): quién ganó, los roles revelados y tu
// impacto. Las monedas llegan cuando players procesa match.finished.
export function Result(props: {
  snap: Snapshot;
  meId: string;
  winner: Winner | null;
  impostorIds: string[];
  before: MeResponse | null;
  onExit: () => void;
}) {
  const { snap, meId, winner } = props;
  const [coins, setCoins] = useState<number | null>(null);
  const crewWon = winner === 'crew';

  useEffect(() => {
    const data = session.loadSession();
    const before = props.before;
    if (!data || !before) return;
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
  }, [props.before]);

  const impact = myImpact(snap);
  const cleanTanks = snap.tanks.filter((t) => !t.dead).length;
  const title =
    winner === null ? T.ENDED : crewWon ? T.CREW_WON : T.IMPOSTOR_WON;
  return (
    <div className="overlay-stage solid">
      <Stage className="scr-result" background={BACKGROUNDS.mapBlur}>
        <div
          className={crewWon || winner === null ? 'shade dim' : 'shade bad'}
        />
        <div
          className={`big1 ${crewWon || winner === null ? '' : 'bad'}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 40,
            fontSize: 68,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
        {winner && (
          <div
            className="sub1"
            style={{ position: 'absolute', left: 0, right: 0, top: 150 }}
          >
            {crewWon ? T.CREW_SUB : T.IMPOSTOR_SUB}
          </div>
        )}
        <section
          className="panel"
          style={{
            left: 60,
            top: 250,
            width: 1080,
            height: 720,
            padding: '22px 30px',
          }}
        >
          <TitleBar icon="user" title={T.PLAYERS} size={34}>
            <Chip tone="info">
              {T.room(session.loadSession()?.roomCode ?? '')}
            </Chip>
          </TitleBar>
          <div className="tr head">
            <span />
            <span>{T.PLAYER}</span>
            <span>{T.ROLE}</span>
            <span />
            <span>{T.STATE}</span>
          </div>
          {snap.players.map((p) => {
            const impostor = props.impostorIds.includes(p.id);
            return (
              <div className={`tr ${p.id === meId ? 'on' : ''}`} key={p.id}>
                <span className="av">
                  <Gota color={p.color} scale={1.2} portrait />
                </span>
                <b>
                  {p.name}
                  {p.id === meId && ' (tú)'}
                </b>
                <Chip tone={impostor ? 'bad' : 'ok'}>
                  {impostor ? T.IMPOSTOR : T.CREW}
                </Chip>
                <span />
                {p.alive ? (
                  <Chip tone="ok" icon="check">
                    {p.connected ? T.ALIVE : T.OFFLINE}
                  </Chip>
                ) : (
                  <Chip tone="warn">{T.GHOST}</Chip>
                )}
              </div>
            );
          })}
        </section>
        <section
          className="panel"
          style={{
            left: 1180,
            top: 250,
            width: 680,
            height: 720,
            padding: '22px 30px',
          }}
        >
          <TitleBar icon="drop" palette="water" title={T.IMPACT} size={30} />
          {(['reduce', 'reuse', 'recycle'] as const).map((type) => {
            const r = impact[type];
            const ic = TASK_ICONS[type];
            const liters = r.done * POINTS[type] * LITERS_PER_POINT;
            return (
              <div className="imp" key={type}>
                <div className="row">
                  <Icon name={ic.name} palette={ic.palette} size={34} />
                  <b className="grow">
                    {
                      {
                        reduce: APP_TEXT.REDUCE,
                        reuse: APP_TEXT.REUSE,
                        recycle: APP_TEXT.RECYCLE,
                      }[type]
                    }
                    {' · '}
                    {T.tasksOf(r.done, r.total)}
                  </b>
                  <span className="num h3">{T.liters(liters)}</span>
                </div>
                <Gauge
                  value={r.total ? r.done / r.total : 0}
                  tone={
                    type === 'reduce' ? '' : type === 'reuse' ? 'amber' : 'leaf'
                  }
                  height={26}
                />
              </div>
            );
          })}
          <div className="well" style={{ marginTop: 6 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="stat">
                <b className="num">
                  {cleanTanks}/{snap.tanks.length}
                </b>
                <span>{T.CLEAN_TANKS}</span>
              </div>
              <div className="stat">
                <b className="num">{snap.reservoir} %</b>
                <span>{T.RESERVOIR}</span>
              </div>
              <div className="stat">
                <b className="num">{coins === null ? '…' : `+${coins}`}</b>
                <span>{T.COINS}</span>
              </div>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 16 }}>
            {coins === null ? T.COINS_PENDING : T.FACT}
          </p>
        </section>
        <div
          className="row"
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: 990,
            justifyContent: 'space-between',
          }}
        >
          <Button variant="sec" icon="door" onClick={props.onExit}>
            {T.EXIT}
          </Button>
          <Button variant="pri" icon="play" onClick={props.onExit}>
            {T.BACK}
          </Button>
        </div>
      </Stage>
    </div>
  );
}
