import { type FormEvent, useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { HintBar } from '../ui/kit';
import { api } from '../api';
import { session } from '../session';
import { ERROR_MESSAGES } from '../constants';
import { JOIN_TEXT, MENU_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import '../styles/join.css';

// Los códigos de sala de match: 4 caracteres sin O, 0, I ni 1 (S1-09).
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

export function normalizeCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
}

// Join: pantalla para unirse con código siguiendo el estándar de diseño del juego.
export function Join(props: {
  onJoined: (matchId: string, roomCode: string, isCreator: boolean) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = ROOM_CODE_RE.test(code);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') props.onBack();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props]);

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
      if (/404|not.?found|no existe/i.test(msg)) {
        setError(JOIN_TEXT.NOT_FOUND);
      } else if (/llena|full|exhausted/i.test(msg)) {
        setError(JOIN_TEXT.FULL);
      } else {
        setError(msg || ERROR_MESSAGES.SERVICE_UNAVAILABLE);
      }
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      const normalized = normalizeCode(clip);
      setCode(normalized);
      setError('');
    } catch {
      // Sin permiso para leer el portapapeles: se escribe manualmente.
    }
  };

  return (
    <Stage className="scr-join" background={BACKGROUNDS.hero}>
      <div className="join-vignette" />

      <section className="join-modal" role="dialog" aria-modal="true">
        <header className="join-head">
          <h2>{JOIN_TEXT.TITLE}</h2>
          <button
            type="button"
            className="join-close-btn"
            onClick={props.onBack}
            aria-label={JOIN_TEXT.BACK}
            title={`${JOIN_TEXT.BACK} (Esc)`}
          >
            ✕
          </button>
        </header>

        <form className="join-form" onSubmit={submit}>
          <div className="join-body">
            <label className="join-label" htmlFor="room-code">
              {JOIN_TEXT.CODE}
            </label>

            <div className="join-input-wrap">
              <input
                id="room-code"
                className={`join-input ${error ? 'has-error' : ''}`}
                value={code}
                autoFocus
                autoComplete="off"
                maxLength={4}
                placeholder="••••"
                onChange={(e) => {
                  setError('');
                  setCode(normalizeCode(e.target.value));
                }}
              />
            </div>

            <div className="join-meta-row">
              <button
                type="button"
                className="join-paste-btn"
                onClick={paste}
              >
                {JOIN_TEXT.PASTE}
              </button>

              {valid && !error && (
                <div className="join-feedback ok">{JOIN_TEXT.VALID}</div>
              )}

              {error && (
                <div className="join-feedback error">{error}</div>
              )}
            </div>

            <p className="join-rule">{JOIN_TEXT.RULE}</p>
          </div>

          <footer className="join-foot">
            <button
              type="button"
              className="join-btn sec"
              onClick={props.onBack}
            >
              {JOIN_TEXT.BACK}
            </button>

            <button
              type="submit"
              className="join-btn pri"
              disabled={!valid || busy}
            >
              {busy ? JOIN_TEXT.CONNECTING : JOIN_TEXT.JOIN}
            </button>
          </footer>
        </form>
      </section>

      <HintBar
        hints={[
          ['Tab', MENU_TEXT.HINT_CHOOSE],
          ['Enter', MENU_TEXT.HINT_ACCEPT],
          ['Esc', JOIN_TEXT.BACK],
        ]}
      />
    </Stage>
  );
}
