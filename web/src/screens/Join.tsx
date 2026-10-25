import { type FormEvent, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Button, Chip, TitleBar } from '../ui/kit';
import { api } from '../api';
import { session } from '../session';
import { ERROR_MESSAGES } from '../constants';
import { JOIN_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';

// Los códigos de sala de match: 4 caracteres sin O, 0, I ni 1 (S1-09).
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

export function normalizeCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

// Join (maqueta 04-unirse, panel izquierdo): unirse con el código que
// dio quien creó la sala. Los errores siguen la maqueta 11-conexión.
export function Join(props: {
  onJoined: (matchId: string, roomCode: string, isCreator: boolean) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = ROOM_CODE_RE.test(code);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const data = session.loadSession();
    if (!valid || !data) return;
    setBusy(true);
    setError('');
    try {
      const room = await api.joinRoom(data.token, code);
      props.onJoined(room.matchId, room.roomCode, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/404|not.?found|no existe/i.test(msg)) setError(JOIN_TEXT.NOT_FOUND);
      else if (/llena|full|exhausted/i.test(msg)) setError(JOIN_TEXT.FULL);
      else setError(msg || ERROR_MESSAGES.SERVICE_UNAVAILABLE);
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      setCode(normalizeCode(await navigator.clipboard.readText()));
    } catch {
      // Sin permiso para leer el portapapeles: se escribe a mano.
    }
  };

  return (
    <Stage className="scr-join" background={BACKGROUNDS.heroBlur}>
      <div className="shade dim" />
      <form
        className="panel"
        style={{
          left: 640,
          top: 140,
          width: 640,
          height: 800,
          padding: '30px 34px',
        }}
        onSubmit={submit}
      >
        <TitleBar icon="globe" title={JOIN_TEXT.TITLE} />
        <div className={`field ${error ? 'inp-bad' : ''}`}>
          <label className="lab" htmlFor="room-code">
            {JOIN_TEXT.CODE}
          </label>
          <input
            id="room-code"
            value={code}
            autoFocus
            autoComplete="off"
            maxLength={4}
            size={4}
            onChange={(e) => {
              setError('');
              setCode(normalizeCode(e.target.value));
            }}
            style={{
              width: 'calc(100% - 8px)',
              maxWidth: 'calc(100% - 8px)',
              boxSizing: 'border-box',
              fontSize: 56,
              letterSpacing: '.3em',
              textAlign: 'center',
              height: 96,
              paddingLeft: '.3em',
            }}
          />
        </div>
        <div className="row" style={{ marginTop: 16, gap: 16 }}>
          <Button variant="sec" small icon="copy" onClick={paste}>
            {JOIN_TEXT.PASTE}
          </Button>
          {valid && !error && (
            <Chip tone="ok" icon="check">
              {JOIN_TEXT.VALID}
            </Chip>
          )}
          {error && (
            <Chip tone="bad" icon="cross">
              {error}
            </Chip>
          )}
        </div>
        <p className="small muted" style={{ marginTop: 28 }}>
          {JOIN_TEXT.RULE}
        </p>
        <div
          className="row"
          style={{
            position: 'absolute',
            left: 34,
            right: 34,
            bottom: 30,
            justifyContent: 'space-between',
          }}
        >
          <Button variant="sec" icon="left" onClick={props.onBack}>
            {JOIN_TEXT.BACK}
          </Button>
          <Button
            variant="pri"
            type="submit"
            iconAfter="right"
            disabled={!valid || busy}
          >
            {JOIN_TEXT.JOIN}
          </Button>
        </div>
      </form>
    </Stage>
  );
}
