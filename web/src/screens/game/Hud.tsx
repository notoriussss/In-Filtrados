import { skinOf } from '../../shop';
import { useEffect } from 'react';
import type {
  EmergencyKind,
  PlayerView,
  Snapshot,
} from '@in-filtrados/messages';
import { Gauge } from '../../ui/kit';
import { gameMap, meetingMarker } from '../../map';
import { roomName } from '../../game/tasks/tasks';
import { emergencyBanner, sabotageButtons } from '../../game/emergency';
import type { Action } from '../../game/actions';
import type { GameSession, GameState } from '../../game/session';
import { pauseMessage } from '../../game/pause';
import {
  clockLevel,
  formatClock,
  matchSecondsLeft,
} from '../../game/matchClock';
import { session } from '../../session';
import { APP_TEXT, HUD_TEXT } from '../../texts';
import { Gota } from '../../ui/Gota';
import { useNow } from './useNow';
import '../../styles/hud.css';

const TYPE_NAMES = {
  reduce: APP_TEXT.REDUCE,
  reuse: APP_TEXT.REUSE,
  recycle: APP_TEXT.RECYCLE,
} as const;

const ACTION_SLOT: Record<Action['kind'], { label: string }> = {
  task: { label: HUD_TEXT.USE },
  report: { label: HUD_TEXT.REPORT },
  contaminate: { label: HUD_TEXT.CONTAMINATE },
  fix: { label: HUD_TEXT.FIX },
  meeting: { label: HUD_TEXT.MEETING },
};

const SABOTAGE_KEYS: Record<string, EmergencyKind> = {
  Digit1: 'pipe',
  Digit2: 'steam',
};

// Hud: diseño unificado de consola de monitoreo sin íconos pixelados ni
// marcos toscos. La posición y el estado del juego vienen del snapshot.
export function Hud(props: { game: GameSession; state: GameState }) {
  const { game, state } = props;
  const snap = state.snapshot;
  const now = useNow(200);
  const meId = game.meId;
  const me = snap?.players.find((p) => p.id === meId);
  const sabotage = snap ? sabotageButtons(snap, snap.tick) : null;

  // Teclas 1 y 2: sabotajes del infiltrado.
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
      <ClockPanel snap={snap} />
      <PlayerCard snap={snap} me={me} />

      <nav className="hud-panel hud-hotbar" aria-label="Acciones">
        <ActionSlot action={state.action} onUse={game.triggerAction} />
        {sabotage?.map((b, i) => (
          <button
            key={b.kind}
            type="button"
            className="hud-action-slot danger"
            disabled={!b.enabled}
            onClick={() => game.sabotage(b.kind)}
          >
            <span className="hud-slot-key">{i + 1}</span>
            <span className="hud-slot-label">
              {b.kind === 'pipe' ? HUD_TEXT.PIPE : HUD_TEXT.STEAM}
            </span>
            {b.detail && <span className="hud-slot-cd">{b.detail}</span>}
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
    <section className="hud-panel hud-tasks" aria-label={HUD_TEXT.TASKS}>
      <header className="hud-panel-header">
        <div className="hud-header-title tasks">
          <span>{HUD_TEXT.TASKS}</span>
        </div>
        <span className="hud-counter-pill">
          {done}/{myTasks.length}
        </span>
      </header>

      <div className="hud-task-list">
        {myTasks.map((t) => {
          const st = gameMap.stations.find((s) => s.id === t.stationId);
          if (!st) return null;
          const typeName = TYPE_NAMES[st.type];
          const taskName = st.name ?? roomName(st, gameMap.zones);

          return (
            <div
              key={t.stationId}
              className={`hud-task-item ${t.done ? 'done' : ''}`}
            >
              <div className="hud-task-meta">
                <span className="hud-task-type-badge">{typeName}</span>
                <span className="hud-task-name">{taskName}</span>
              </div>
              <span
                className={`hud-task-status-pill ${
                  t.done ? 'done' : 'missing'
                }`}
              >
                {t.done ? HUD_TEXT.DONE : HUD_TEXT.MISSING}
              </span>
            </div>
          );
        })}
      </div>

      <div className="hud-team-gauge-row">
        <span className="hud-gauge-lbl">{HUD_TEXT.TEAM}</span>
        <Gauge value={snap.reservoir / 100} tone="leaf" />
        <span className="hud-gauge-num">
          {HUD_TEXT.percent(snap.reservoir)}
        </span>
      </div>
    </section>
  );
}

// AlertPanel: emergencia (sabotaje o mala suerte, se ven igual), la
// pausa por alguien desconectado o el aviso de que mi tanque llegó a 0.
function AlertPanel(props: { state: GameState; now: number }) {
  const { state, now } = props;
  const snap = state.snapshot!;
  const banner = emergencyBanner(snap, gameMap, snap.tick);
  const paused = pauseMessage(snap, state.matchDown);

  let cls = '';
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
    title = HUD_TEXT.PAUSED;
    text = paused;
  } else if (state.tankEmptyUntil > now) {
    cls = 'ghost';
    title = HUD_TEXT.TANK_EMPTY;
    text = HUD_TEXT.TANK_EMPTY_HINT;
  } else {
    return null;
  }

  return (
    <aside
      className={`hud-panel hud-alert-banner ${cls}`}
      role="alert"
    >
      <div className="hud-alert-tx">
        <strong className="hud-alert-title">{title}</strong>
        <span className="hud-alert-hint">{text}</span>
      </div>
      {time && <span className="hud-alert-time">{time}</span>}
    </aside>
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
    <section
      className="hud-panel hud-reservoir"
      aria-label={HUD_TEXT.RESERVOIR}
    >
      <header className="hud-panel-header">
        <div className="hud-header-title res">
          <span>{HUD_TEXT.RESERVOIR}</span>
        </div>
        {code && <span className="hud-code-pill">{code}</span>}
      </header>

      <div className="hud-metric-row">
        <span className="hud-metric-lbl">{HUD_TEXT.LEVEL}</span>
        <Gauge value={snap.reservoir / 100} />
        <span className="hud-gauge-num">
          {HUD_TEXT.percent(snap.reservoir)}
        </span>
      </div>

      <div className="hud-metric-row">
        <span className="hud-metric-lbl">{HUD_TEXT.PURITY}</span>
        <Gauge value={purity / 100} tone="leaf" />
        <span className="hud-gauge-num">{HUD_TEXT.percent(purity)}</span>
      </div>
    </section>
  );
}

// ClockPanel: lo que falta para que se acabe el tiempo y ganen los
// infiltrados; lo manda match en el snapshot.
function ClockPanel(props: { snap: Snapshot }) {
  const seconds = matchSecondsLeft(props.snap);
  if (seconds === null) return null;
  const level = clockLevel(seconds);
  return (
    <section
      className={`hud-panel hud-clock ${level}`}
      aria-label={HUD_TEXT.CLOCK}
    >
      <span className="hud-clock-lbl">{HUD_TEXT.CLOCK}</span>
      <span className="hud-clock-time" role="timer">
        {formatClock(seconds)}
      </span>
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
    <section className="hud-panel hud-me-card" aria-label={me.name}>
      <div className="hud-me-portrait">
        <Gota
          color={me.color}
          accessory={me.accessory}
          skin={skinOf(me.skin)}
          portrait
          scale={2.2}
        />
      </div>

      <div className="hud-me-info">
        <div className="hud-me-top">
          <strong className="hud-me-name" title={me.name}>
            {me.name}
          </strong>
          <span className={`hud-role-pill ${role.tone}`}>
            {role.text}
          </span>
        </div>

        <div className="hud-tank-meter-row">
          <span className="hud-metric-lbl">{HUD_TEXT.MY_TANK}</span>
          <Gauge
            value={clean / 100}
            tone={clean < 40 ? 'bad' : clean < 70 ? 'amber' : 'leaf'}
          />
          <span className="hud-gauge-num">
            {tank ? HUD_TEXT.percent(clean) : HUD_TEXT.NO_TANK}
          </span>
        </div>
      </div>
    </section>
  );
}

function ActionSlot(props: { action: Action | null; onUse: () => void }) {
  const a = props.action;
  const slot = a ? ACTION_SLOT[a.kind] : ACTION_SLOT.task;
  const isEnabled = Boolean(a?.enabled);

  return (
    <button
      type="button"
      className={`hud-action-slot ${isEnabled ? 'active' : ''}`}
      disabled={!isEnabled}
      onClick={props.onUse}
    >
      <span className="hud-slot-key">E</span>
      <span className="hud-slot-label">
        {a ? a.label : slot.label}
      </span>
    </button>
  );
}

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
  const myTank = snap.tanks.find((t) => t.ownerId === meId);
  const tankSpot = myTank
    ? gameMap.tanks.find((t) => t.slot === myTank.slot)
    : undefined;

  return (
    <section className="hud-panel hud-minimap" aria-label={HUD_TEXT.MAP}>
      <header className="hud-map-top">
        <span className="hud-map-lbl">{HUD_TEXT.MAP}</span>
        {meeting && (
          <span className="hud-map-legend">
            {HUD_TEXT.MEETING_POINT}
          </span>
        )}
      </header>

      <div className="hud-map-box">
        <img
          className="hud-map-img"
          src="/assets/map/manglar-verde/minimap.png"
          alt=""
        />
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
        {myTank && tankSpot && (
          <span
            className={`dot tank ${myTank.dead ? 'dead' : ''}`}
            title={HUD_TEXT.MY_TANK}
            style={pos(tankSpot.x, tankSpot.y)}
          />
        )}
        {me && <span className="dot me" style={pos(me.x, me.y)} />}
      </div>
    </section>
  );
}
