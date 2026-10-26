import { useEffect, useState, type KeyboardEvent } from 'react';
import { Stage } from '../ui/Stage';
import { Gota, SERVER_COLORS } from '../ui/Gota';
import { Chip, HintBar } from '../ui/kit';
import { Icon } from '../ui/Icon';
import { api, type MeResponse } from '../api';
import { session } from '../session';
import { ERROR_MESSAGES } from '../constants';
import { APP_TEXT, MENU_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import '../styles/menu.css';

// Menu (maqueta 02-menu): crear sala, unirse, cómo jugar y cerrar
// sesión. Abajo, el jugador conectado con su latencia y su perfil
// (monedas y estadísticas de players, S2-07).
export function Menu(props: {
  error?: string;
  onCreated: (matchId: string, roomCode: string, isCreator: boolean) => void;
  onJoin: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onLogout: () => void;
  onUnauthorized: () => void;
}) {
  const data = session.loadSession();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [ping, setPing] = useState<number | null>(null);
  const [error, setError] = useState(props.error ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    let alive = true;
    const t0 = performance.now();
    api.getMe(data.token).then(
      (p) => {
        if (!alive) return;
        setMe(p);
        setPing(Math.round(performance.now() - t0));
      },
      (err: Error) => {
        if (!alive) return;
        if (/401|token/i.test(err.message)) props.onUnauthorized();
        else setPing(null);
      },
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    if (!data) return;
    setBusy(true);
    setError('');
    try {
      const room = await api.createRoom(data.token);
      props.onCreated(room.matchId, room.roomCode, true);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : ERROR_MESSAGES.SERVICE_UNAVAILABLE,
      );
      setBusy(false);
    }
  };

  // Flechas arriba/abajo mueven el foco entre las franjas del menú.
  const onMenuKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ),
    );
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next = (at + step + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  };

  const strips = [
    { label: MENU_TEXT.CREATE, onClick: create, disabled: busy },
    { label: MENU_TEXT.JOIN_SHORT, onClick: props.onJoin },
    { label: MENU_TEXT.HELP, onClick: props.onHelp },
    { label: MENU_TEXT.LOGOUT, onClick: props.onLogout },
  ];

  return (
    <Stage className="scr-menu" background={BACKGROUNDS.hero}>
      <div className="menu-vignette" />

      {/* gotas a los lados, detrás del menú */}
      {[
        { c: 0, left: 330, top: 700 },
        { c: 1, left: 1480, top: 760 },
        { c: 3, left: 1610, top: 680 },
      ].map((g) => (
        <div key={g.c}>
          <div
            className="shadow"
            style={{
              left: g.left + 12,
              top: g.top + 145,
              width: 96,
              height: 22,
            }}
          />
          <div style={{ position: 'absolute', left: g.left, top: g.top }}>
            <Gota color={SERVER_COLORS[g.c]} scale={3} animate />
          </div>
        </div>
      ))}

      {/* bloque central: logo y menú juntos en el centro de la pantalla */}
      <div className="menu-center">
        <header className="menu-logo">
          <h1>
            <span className="a">{APP_TEXT.TITLE_A}</span>
            <span className="b">{APP_TEXT.TITLE_B}</span>
          </h1>
          <div className="menu-rule">
            <i />
          </div>
          <p className="menu-sub">
            {APP_TEXT.REDUCE}
            <b>·</b>
            {APP_TEXT.REUSE}
            <b>·</b>
            {APP_TEXT.RECYCLE}
          </p>
        </header>

        <nav
          className="menu-strips"
          aria-label={MENU_TEXT.MENU_ARIA}
          onKeyDown={onMenuKey}
        >
          {strips.map((s, i) => (
            <button
              key={s.label}
              type="button"
              className="menu-item"
              autoFocus={i === 0}
              disabled={s.disabled}
              onClick={s.onClick}
            >
              <Icon name="right" palette="light" size={28} />
              {s.label}
              <Icon name="left" palette="light" size={28} />
            </button>
          ))}
          {error && (
            <Chip tone="bad" big icon="cross" className="menu-error">
              {error}
            </Chip>
          )}
        </nav>
      </div>

      <div className="menu-player">
        <div className="menu-player-badge">
          <Icon name="user" palette="light" size={28} />
        </div>
        <div className="who">
          <span className="name">{data?.username}</span>
          <small>
            <span className={`dot gem ${ping === null ? 'bad' : ''}`} />
            {ping === null
              ? MENU_TEXT.OFFLINE
              : `${MENU_TEXT.CONNECTED} · ${MENU_TEXT.ping(ping)}`}
          </small>
        </div>
      </div>

      <div className="menu-corner">
        <div className="menu-profile">
          <button
            type="button"
            className="menu-icon relic"
            aria-label={MENU_TEXT.PROFILE}
          >
            <Icon name="trophy" palette="amber" size={32} />
          </button>
          {me && (
            <div className="menu-tip banner" role="status">
              <div className="tip-header">
                <span className="tip-gem">◆</span>
                <span className="tip-title">REGISTRO</span>
                <span className="tip-gem">◆</span>
              </div>
              <div className="tip-content">
                <span className="coins">{MENU_TEXT.coins(me.coins)}</span>
                <span className="stats">
                  {MENU_TEXT.stats(me.matchesPlayed, me.wins)}
                </span>
              </div>
              <div className="tip-tail">◆</div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="menu-icon relic"
          aria-label={MENU_TEXT.SETTINGS}
          onClick={props.onSettings}
        >
          <svg
            className="gear-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        </button>
      </div>

      <div className="menu-tagline">{MENU_TEXT.TAGLINE}</div>
      <div className="menu-version">{APP_TEXT.VERSION}</div>
      <HintBar
        hints={[
          ['Tab', MENU_TEXT.HINT_CHOOSE],
          ['Enter', MENU_TEXT.HINT_ACCEPT],
        ]}
      />
    </Stage>
  );
}
