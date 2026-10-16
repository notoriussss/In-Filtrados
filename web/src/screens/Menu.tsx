import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Gota, SERVER_COLORS } from '../ui/Gota';
import { Button, Chip, HintBar, Pill } from '../ui/kit';
import { api, type MeResponse } from '../api';
import { session } from '../session';
import { ERROR_MESSAGES } from '../constants';
import { APP_TEXT, MENU_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import { Logo } from './Logo';

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

  return (
    <Stage className="scr-menu" background={BACKGROUNDS.hero}>
      <div className="shade l" />
      <Logo />
      <nav className="menu-list" aria-label="Menú principal">
        <Button variant="pri" icon="play" onClick={create} disabled={busy}>
          {MENU_TEXT.CREATE}
        </Button>
        <Button icon="globe" onClick={props.onJoin}>
          {MENU_TEXT.JOIN}
        </Button>
        <Button variant="sec" icon="book" onClick={props.onHelp}>
          {MENU_TEXT.HELP}
        </Button>
        <Button variant="sec" icon="gear" onClick={props.onSettings}>
          {MENU_TEXT.SETTINGS}
        </Button>
        <Button variant="sec" icon="door" onClick={props.onLogout}>
          {MENU_TEXT.LOGOUT}
        </Button>
        {error && (
          <Chip tone="bad" big icon="cross">
            {error}
          </Chip>
        )}
      </nav>
      {/* gotas en el mirador, como en la maqueta */}
      {[
        { c: 0, left: 1150, top: 691 },
        { c: 1, left: 1340, top: 756 },
        { c: 3, left: 1485, top: 671 },
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
      <div style={{ position: 'absolute', left: 1285, top: 20 }}>
        <Gota color={SERVER_COLORS[4]} scale={3} walk animate />
      </div>
      <div
        className="col"
        style={{ position: 'absolute', left: 110, bottom: 34, gap: 8 }}
      >
        <Pill icon="user" style={{ alignSelf: 'flex-start' }}>
          {data?.username}
          <span className={`dot ${ping === null ? 'bad' : ''}`} />
          {ping === null
            ? MENU_TEXT.OFFLINE
            : `${MENU_TEXT.CONNECTED} · ${MENU_TEXT.ping(ping)}`}
        </Pill>
        {me && (
          <Pill icon="trophy" style={{ alignSelf: 'flex-start' }}>
            {MENU_TEXT.coins(me.coins)} ·{' '}
            {MENU_TEXT.stats(me.matchesPlayed, me.wins)}
          </Pill>
        )}
      </div>
      <Pill
        icon="globe"
        style={{ position: 'absolute', right: 50, bottom: 34 }}
      >
        {APP_TEXT.VERSION}
      </Pill>
      <HintBar
        hints={[
          ['Tab', MENU_TEXT.HINT_CHOOSE],
          ['Enter', MENU_TEXT.HINT_ACCEPT],
        ]}
      />
    </Stage>
  );
}
