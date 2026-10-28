import { skinOf } from '../../shop';
import { useEffect } from 'react';
import type {
  EmergencyKind,
  PlayerView,
  Snapshot,
} from '@in-filtrados/messages';
import {
  Icon,
  type IconName,
  type IconPalette,
  TASK_ICONS,
} from '../../ui/Icon';
import { Chip, Gauge } from '../../ui/kit';
import { gameMap, meetingMarker } from '../../map';
import { roomName } from '../../game/tasks/tasks';
import { emergencyBanner, sabotageButtons } from '../../game/emergency';
import type { Action } from '../../game/actions';
import type { GameSession, GameState } from '../../game/session';
import { pauseMessage } from '../../game/pause';
import { session } from '../../session';
import { APP_TEXT, HUD_TEXT } from '../../texts';
import { Gota } from '../../ui/Gota';
import { useNow } from './useNow';

const TYPE_NAMES = {
  reduce: APP_TEXT.REDUCE,
  reuse: APP_TEXT.REUSE,
  recycle: APP_TEXT.RECYCLE,
} as const;

const ACTION_SLOT: Record<
  Action['kind'],
  { label: string; icon: IconName; palette: IconPalette }
> = {
  task: { label: HUD_TEXT.USE, icon: 'tap', palette: 'ink' },
  report: { label: HUD_TEXT.REPORT, icon: 'eye', palette: 'amber' },
  contaminate: { label: HUD_TEXT.CONTAMINATE, icon: 'oil', palette: 'coral' },
  fix: { label: HUD_TEXT.FIX, icon: 'gear', palette: 'amber' },
  meeting: { label: HUD_TEXT.MEETING, icon: 'speaker', palette: 'amber' },
};

const SABOTAGE_KEYS: Record<string, EmergencyKind> = {
  Digit1: 'pipe',
  Digit2: 'steam',
};

// Hud (maqueta 16-hud-eco): tareas arriba a la izquierda, aviso al
// centro, embalse a la derecha; abajo tu jugador, la barra de acciones y
// el minimapa. Todo sale del snapshot: el HUD no decide nada.
export function Hud(props: { game: GameSession; state: GameState }) {
  const { game, state } = props;
  const snap = state.snapshot;
  const now = useNow(200);
  const meId = game.meId;
  const me = snap?.players.find((p) => p.id === meId);
  const sabotage = snap ? sabotageButtons(snap, snap.tick) : null;

  // Teclas 1 y 2: sabotajes del impostor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const kind = SABOTAGE_KEYS[e.code];
      if (!kind || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT') return;
      const s = game.getState().snapshot;
      const button = s
        ? sabotageButtons(s, s.tick)?.find((b) => b.kind === kind)
        : undefined;
      if (button?.enabled) game.sabotage(kind);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [game]);

  if (!snap || snap.phase !== 'PLAYING') return null;
  return (
    <div className="hud">
      <TasksPanel snap={snap} />
      <AlertPanel state={state} now={now} />
      <ReservoirPanel snap={snap} />
      <PlayerCard snap={snap} me={me} />
      <nav className="panel glass hot" aria-label="Acciones">
        <ActionSlot action={state.action} onUse={game.triggerAction} />
        {sabotage?.map((b, i) => (
          <button
            key={b.kind}
            className="slotk danger"
            disabled={!b.enabled}
            onClick={() => game.sabotage(b.kind)}
          >
            <span className="key">{i + 1}</span>
            <Icon
              name={b.kind === 'pipe' ? 'tap' : 'warning'}
              palette="coral"
              size={44}
            />
            <span>{b.kind === 'pipe' ? HUD_TEXT.PIPE : HUD_TEXT.STEAM}</span>
            {b.detail && <span className="cd">{b.detail}</span>}
          </button>
        ))}
      </nav>
      <Minimap snap={snap} meId={meId} now={now} />
    </div>
  );
}

function TasksPanel(props: { snap: Snapshot }) {
  const { snap } = props;
  const myTasks = snap.myTasks ?? [];
  const done = myTasks.filter((t) => t.done).length;
  return (
    <section className="panel glass tasks" aria-label={HUD_TEXT.TASKS}>
      <div className="ttl hud-ttl">
        <Icon name="check" palette="leaf" />
        <span style={{ flex: 1 }}>{HUD_TEXT.TASKS.toUpperCase()}</span>
        <span className="tg ok num">
          {done}/{myTasks.length}
        </span>
      </div>
      {myTasks.map((t) => {
        const st = gameMap.stations.find((s) => s.id === t.stationId);
        if (!st) return null;
        const ic = TASK_ICONS[st.type];
        return (
          <div className={`task ${t.done ? 'done' : ''}`} key={t.stationId}>
            <Icon name={ic.name} palette={ic.palette} size={40} />
            <div>
              <b>{TYPE_NAMES[st.type].toUpperCase()}</b>
              <span className="d">
                {st.name ?? roomName(st, gameMap.zones)}
              </span>
            </div>
            {t.done ? (
              <span className="tg ok">
                <Icon name="check" palette="leaf" size={20} />
                {HUD_TEXT.DONE.toUpperCase()}
              </span>
            ) : (
              <span className="tg warn">
                <Icon name="clock" palette="amber" size={20} />
                {HUD_TEXT.MISSING.toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
      <div className="team">
        <span>{HUD_TEXT.TEAM.toUpperCase()}</span>
        <Gauge value={snap.reservoir / 100} tone="leaf" />
        <span className="num">{HUD_TEXT.percent(snap.reservoir)}</span>
      </div>
    </section>
  );
}

// AlertPanel: emergencia (sabotaje o mala suerte, se ven igual), aviso
// del tanque propio o la pausa por alguien desconectado.
function AlertPanel(props: { state: GameState; now: number }) {
  const { state, now } = props;
  const snap = state.snapshot!;
  const banner = emergencyBanner(snap, gameMap, snap.tick);
  const paused = pauseMessage(snap, state.matchDown);
  let cls = '';
  let icon: IconName = 'warning';
  let title = '';
  let text = '';
  let time: string | null = null;
  if (banner) {
    cls = banner.kind === 'steam' ? 'steam' : '';
    title = banner.title;
    text = banner.hint;
    time = banner.time;
  } else if (paused) {
    cls = 'calm';
    icon = 'clock';
    title = HUD_TEXT.PAUSED;
    text = paused;
  } else if (state.tankAlertUntil > now) {
    title = HUD_TEXT.TANK_ALERT;
    text = HUD_TEXT.TANK_ALERT_HINT;
  } else {
    return null;
  }
  return (
    <div className={`panel alert ${cls}`} role="alert">
      <Icon name={icon} palette="amber" size={52} />
      <div className="tx">
        <b>{title.toUpperCase()}</b>
        <span>{text}</span>
      </div>
      {time && <div className="t num">{time}</div>}
    </div>
  );
}

function ReservoirPanel(props: { snap: Snapshot }) {
  const { snap } = props;
  const alive = snap.tanks.filter((t) => !t.dead);
  const purity = alive.length
    ? Math.round(
        alive.reduce((sum, t) => sum + (100 - t.contamination), 0) /
          alive.length,
      )
    : 0;
  const code = session.loadSession()?.roomCode;
  return (
    <section className="panel glass res" aria-label={HUD_TEXT.RESERVOIR}>
      <div className="ttl hud-ttl">
        <Icon name="drop" palette="water" />
        <span style={{ flex: 1 }}>{HUD_TEXT.RESERVOIR.toUpperCase()}</span>
        {code && <span className="tg warn">{code}</span>}
      </div>
      <div className="m">
        <span>{HUD_TEXT.LEVEL}</span>
        <Gauge value={snap.reservoir / 100} />
        <span className="num">{HUD_TEXT.percent(snap.reservoir)}</span>
      </div>
      <div className="m">
        <span>{HUD_TEXT.PURITY}</span>
        <Gauge value={purity / 100} tone="leaf" />
        <span className="num">{HUD_TEXT.percent(purity)}</span>
      </div>
    </section>
  );
}

function PlayerCard(props: { snap: Snapshot; me?: PlayerView }) {
  const { snap, me } = props;
  if (!me) return null;
  const tank = snap.tanks.find((t) => t.ownerId === me.id);
  const role = !me.alive
    ? { tone: 'warn' as const, text: HUD_TEXT.GHOST }
    : snap.myRole === 'IMPOSTOR'
      ? { tone: 'bad' as const, text: HUD_TEXT.IMPOSTOR }
      : { tone: 'ok' as const, text: HUD_TEXT.CREW };
  const clean = tank ? 100 - tank.contamination : 0;
  return (
    <section className="panel glass me-card" aria-label={me.name}>
      <div className="row" style={{ gap: 18 }}>
        <Gota
          color={me.color}
          accessory={me.accessory}
          skin={skinOf(me.skin)}
          portrait
          scale={2.5}
          className="portrait"
        />

        <div className="who-box">
          <div className="who">
            <b className="hud-name" title={me.name}>
              {me.name.toUpperCase()}
            </b>
            <Chip tone={role.tone} icon="drop">
              {role.text.toUpperCase()}
            </Chip>
          </div>
          <div className="m card-meter">
            <span>{HUD_TEXT.MY_TANK}</span>
            <Gauge
              value={clean / 100}
              tone={clean < 40 ? 'bad' : clean < 70 ? 'amber' : 'leaf'}
            />
            <span className="num" style={{ textAlign: 'right' }}>
              {tank ? HUD_TEXT.percent(clean) : HUD_TEXT.NO_TANK}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function ActionSlot(props: { action: Action | null; onUse: () => void }) {
  const a = props.action;
  const slot = a ? ACTION_SLOT[a.kind] : ACTION_SLOT.task;
  return (
    <button
      className={`slotk ${a?.enabled ? 'on' : ''}`}
      disabled={!a || !a.enabled}
      onClick={props.onUse}
    >
      <span className="key">E</span>
      <Icon name={slot.icon} palette={slot.palette} size={44} />
      <span>{(a ? a.label : slot.label).toUpperCase()}</span>
    </button>
  );
}

// Minimap: la miniatura del mapa con tu posición, tus tareas pendientes
// y, si hay una emergencia, dónde se arregla. Nunca muestra a los demás.
function Minimap(props: { snap: Snapshot; meId: string; now: number }) {
  const { snap, meId } = props;
  const me = snap.players.find((p) => p.id === meId);
  const pos = (x: number, y: number) => ({
    left: `${(x / gameMap.width) * 100}%`,
    top: `${(y / gameMap.height) * 100}%`,
  });
  const pending = (snap.myTasks ?? []).filter((t) => !t.done);
  const meeting = meetingMarker(gameMap);
  const meetingReady =
    !!snap.myMeeting &&
    snap.myMeeting.callsLeft > 0 &&
    snap.tick >= snap.myMeeting.readyAtTick;
  return (
    <section className="panel glass mini" aria-label={HUD_TEXT.MAP}>
      <div className="lab">
        <span>{HUD_TEXT.MAP.toUpperCase()}</span>
        {meeting && (
          <span className="mm-key">
            <i />
            {HUD_TEXT.MEETING_POINT.toUpperCase()}
          </span>
        )}
      </div>
      <div className="map-box">
        <img src="/assets/map/manglar-verde/minimap.png" alt="" />
        {pending.map((t) => {
          const st = gameMap.stations.find((s) => s.id === t.stationId);
          return st ? (
            <span
              key={t.stationId}
              className="dot task"
              style={pos(st.x, st.y)}
            />
          ) : null;
        })}
        {snap.emergency &&
          gameMap.fixPoints
            .filter((f) => f.kind === snap.emergency!.kind)
            .map((f) => (
              <span key={f.id} className="dot fix" style={pos(f.x, f.y)} />
            ))}
        {meeting && (
          <span
            className={`dot meet ${meetingReady ? 'ready' : ''}`}
            title={meeting.name}
            style={pos(meeting.x, meeting.y)}
          />
        )}
        {me && <span className="dot me" style={pos(me.x, me.y)} />}
      </div>
    </section>
  );
}
