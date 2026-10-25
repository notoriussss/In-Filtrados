import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Gota, SERVER_COLORS } from '../ui/Gota';
import type { IconName } from '../ui/Icon';
import { Button, Chip, type ChipTone, HintBar, TitleBar } from '../ui/kit';
import { api } from '../api';
import { session } from '../session';
import {
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
  charCount,
  passwordMissing,
  usernameProblem,
} from '../accountRules';
import { ERROR_MESSAGES } from '../constants';
import { ACCESS_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';

type Mode = 'login' | 'register';

// Lo que dice la etiqueta de cada campo: la regla mientras no hay nada que
// reprochar y, al crear cuenta, qué le falta a lo que se escribió.
type Feedback = { tone: ChipTone; text: string; icon?: IconName };

function usernameFeedback(raw: string, registering: boolean): Feedback {
  const rule: Feedback = { tone: 'info', text: ACCESS_TEXT.USERNAME_RULE };
  const user = raw.trim();
  if (!registering || !user) return rule;
  const bad = (text: string): Feedback => ({
    tone: 'bad',
    text,
    icon: 'cross',
  });
  switch (usernameProblem(user)) {
    case 'BAD_CHARS':
      return bad(ACCESS_TEXT.USERNAME_BAD_CHARS);
    case 'TOO_SHORT':
      return bad(ACCESS_TEXT.usernameTooShort(USERNAME_MIN_LEN));
    case 'TOO_LONG':
      return bad(
        ACCESS_TEXT.usernameTooLong(USERNAME_MAX_LEN, charCount(user)),
      );
    default:
      return { tone: 'ok', text: ACCESS_TEXT.USERNAME_OK, icon: 'check' };
  }
}

function passwordFeedback(password: string, registering: boolean): Feedback {
  const rule: Feedback = { tone: 'info', text: ACCESS_TEXT.PASSWORD_RULE };
  if (!registering || !password) return rule;
  const missing = passwordMissing(password);
  if (missing > 0) {
    return {
      tone: 'bad',
      text: ACCESS_TEXT.passwordMissing(missing),
      icon: 'cross',
    };
  }
  return { tone: 'ok', text: ACCESS_TEXT.PASSWORD_OK, icon: 'check' };
}

// Access (maqueta 03-acceso): entrar o crear cuenta. La gota de la
// derecha va cambiando de color: el color real lo asigna la sala.
export function Access(props: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [color, setColor] = useState(0);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const registering = mode === 'register';
  const userNote = usernameFeedback(username, registering);
  const passNote = passwordFeedback(password, registering);

  useEffect(() => {
    const t = setInterval(
      () => setColor((c) => (c + 1) % SERVER_COLORS.length),
      2200,
    );
    return () => clearInterval(t);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    // Al crear cuenta no se molesta al servidor con lo que ya sabemos que
    // no sirve: el cursor vuelve al campo, cuya etiqueta roja dice qué falta.
    if (registering && (userNote.tone === 'bad' || passNote.tone === 'bad')) {
      const field = userNote.tone === 'bad' ? usernameInput : passwordInput;
      field.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.register(username.trim(), password);
        setInfo(ACCESS_TEXT.CREATED);
        setMode('login');
      } else {
        const res = await api.login(username.trim(), password);
        session.saveSession({
          token: res.token,
          playerId: res.playerId,
          username: res.username,
        });
        props.onDone();
      }
    } catch (err) {
      setError(accessError(err, mode));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stage className="scr-access" background={BACKGROUNDS.heroBlur}>
      <div className="shade dim" />
      <div className="shade v" />
      <form
        className="panel"
        style={{
          left: 300,
          top: 110,
          width: 1320,
          height: 860,
          padding: '34px 40px',
        }}
        onSubmit={submit}
      >
        <TitleBar icon="user" title={ACCESS_TEXT.TITLE} />
        <div className="row" style={{ alignItems: 'stretch', gap: 40 }}>
          <div className="col grow" style={{ gap: 22, marginTop: 6 }}>
            <div className="tabs access">
              <button
                type="button"
                className={`tab ${mode === 'login' ? 'on' : ''}`}
                onClick={() => setMode('login')}
              >
                {ACCESS_TEXT.LOGIN_TAB}
              </button>
              <button
                type="button"
                className={`tab ${mode === 'register' ? 'on' : ''}`}
                onClick={() => setMode('register')}
              >
                {ACCESS_TEXT.REGISTER_TAB}
              </button>
            </div>
            <div className="field">
              <label className="lab" htmlFor="username">
                {ACCESS_TEXT.USERNAME}
              </label>
              <input
                id="username"
                ref={usernameInput}
                value={username}
                autoComplete="username"
                autoFocus
                required
                aria-invalid={userNote.tone === 'bad'}
                aria-describedby="username-note"
                onChange={(e) => setUsername(e.target.value)}
              />
              <Chip
                id="username-note"
                tone={userNote.tone}
                icon={userNote.icon}
                className="justify-start"
              >
                {userNote.text}
              </Chip>
            </div>
            <div className="field">
              <label className="lab" htmlFor="password">
                {ACCESS_TEXT.PASSWORD}
              </label>
              <input
                id="password"
                ref={passwordInput}
                type="password"
                value={password}
                autoComplete={
                  mode === 'login' ? 'current-password' : 'new-password'
                }
                required
                aria-invalid={passNote.tone === 'bad'}
                aria-describedby="password-note"
                onChange={(e) => setPassword(e.target.value)}
              />
              <Chip
                id="password-note"
                tone={passNote.tone}
                icon={passNote.icon}
                className="justify-start"
              >
                {passNote.text}
              </Chip>
            </div>
            <div className="form-error">
              {error && (
                <Chip tone="bad" big icon="cross" role="alert">
                  {error}
                </Chip>
              )}
              {info && (
                <Chip tone="ok" big icon="check" role="status">
                  {info}
                </Chip>
              )}
            </div>
          </div>
          <div style={{ width: 430 }} className="col">
            <div className="lab ctr">{ACCESS_TEXT.YOUR_GOTA}</div>
            <div className="prev stand">
              <div className="plank" />
              <Gota color={SERVER_COLORS[color]} scale={7} animate />
            </div>
            <p className="small muted ctr">{ACCESS_TEXT.COLOR_NOTE}</p>
          </div>
        </div>
        <div
          className="row"
          style={{
            position: 'absolute',
            left: 40,
            right: 40,
            bottom: 30,
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="pri" type="submit" iconAfter="right" disabled={busy}>
            {busy
              ? ACCESS_TEXT.SENDING
              : mode === 'login'
                ? ACCESS_TEXT.LOGIN
                : ACCESS_TEXT.REGISTER}
          </Button>
        </div>
      </form>
      <HintBar
        hints={[
          ['Tab', ACCESS_TEXT.HINT_NEXT],
          ['Enter', ACCESS_TEXT.HINT_SEND],
        ]}
      />
    </Stage>
  );
}

// accessError traduce el error del gateway a un texto para el jugador.
function accessError(err: unknown, mode: Mode): string {
  const msg = err instanceof Error ? err.message : '';
  if (mode === 'login' && /401|unauthenticated|incorrect/i.test(msg)) {
    return ERROR_MESSAGES.INVALID_CREDENTIALS;
  }
  if (mode === 'register' && /409|already|existe|registrado/i.test(msg)) {
    return ERROR_MESSAGES.USER_ALREADY_EXISTS;
  }
  return msg || ERROR_MESSAGES.SERVICE_UNAVAILABLE;
}
