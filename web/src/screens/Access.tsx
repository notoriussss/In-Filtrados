import { type FormEvent, useRef, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Icon, type IconName } from '../ui/Icon';
import { Chip, type ChipTone, HintBar } from '../ui/kit';
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
import '../styles/access.css';

type Mode = 'login' | 'register';

// Lo que dice la etiqueta de cada campo: la regla mientras no hay nada que
// reprochar y, al crear cuenta, qué le falta a lo que se escribió.
type Feedback = { tone: ChipTone; text: string; icon?: IconName };

function usernameFeedback(raw: string, registering: boolean): Feedback {
  const rule: Feedback = { tone: 'info', text: ACCESS_TEXT.USERNAME_RULE };
  if (!registering || !raw) return rule;
  const bad = (text: string): Feedback => ({
    tone: 'bad',
    text,
    icon: 'cross',
  });
  switch (usernameProblem(raw)) {
    case 'BAD_CHARS':
      return bad(ACCESS_TEXT.USERNAME_BAD_CHARS);
    case 'TOO_SHORT':
      return bad(ACCESS_TEXT.usernameTooShort(USERNAME_MIN_LEN));
    case 'TOO_LONG':
      return bad(
        ACCESS_TEXT.usernameTooLong(USERNAME_MAX_LEN, charCount(raw)),
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

// Access (maqueta 03-acceso): entrar o crear cuenta con diseño místico.
export function Access(props: { onDone: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const registering = mode === 'register';
  const userNote = usernameFeedback(username, registering);
  const passNote = passwordFeedback(password, registering);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
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
      <div className="access-vignette" />
      <form
        className="access-card"
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
      >
        <header className="access-head">
          <h2>{ACCESS_TEXT.TITLE}</h2>
        </header>

        <div className="access-body">
          <div className="access-form-col">
            <div key={mode} className="access-mode-anim">
              <div className="access-field">
                <label htmlFor="username">{ACCESS_TEXT.USERNAME}</label>
                <div className="access-input-wrap">
                  <input
                    id="username"
                    ref={usernameInput}
                    className={`access-input ${
                      userNote.tone === 'bad' ? 'has-error' : ''
                    }`}
                    value={username}
                    autoComplete="username"
                    autoFocus
                    required
                    aria-invalid={userNote.tone === 'bad'}
                    aria-describedby="username-note"
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div
                  id="username-note"
                  className={`access-note ${userNote.tone}`}
                >
                  {userNote.icon && (
                    <Icon
                      name={userNote.icon}
                      palette={userNote.tone === 'bad' ? 'coral' : 'leaf'}
                      size={18}
                    />
                  )}
                  <span>{userNote.text}</span>
                </div>
              </div>

              <div className="access-field">
                <label htmlFor="password">{ACCESS_TEXT.PASSWORD}</label>
                <div className="access-input-wrap">
                  <input
                    id="password"
                    ref={passwordInput}
                    type={showPassword ? 'text' : 'password'}
                    className={`access-input ${
                      passNote.tone === 'bad' ? 'has-error' : ''
                    }`}
                    value={password}
                    autoComplete={
                      mode === 'login' ? 'current-password' : 'new-password'
                    }
                    required
                    aria-invalid={passNote.tone === 'bad'}
                    aria-describedby="password-note"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="access-toggle-pw"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Ocultar' : 'Ver'}
                    title={showPassword ? 'Ocultar' : 'Ver'}
                  >
                    <Icon
                      name="eye"
                      palette={showPassword ? 'water' : 'light'}
                      size={28}
                    />
                  </button>
                </div>
                <div
                  id="password-note"
                  className={`access-note ${passNote.tone}`}
                >
                  {passNote.icon && (
                    <Icon
                      name={passNote.icon}
                      palette={passNote.tone === 'bad' ? 'coral' : 'leaf'}
                      size={18}
                    />
                  )}
                  <span>{passNote.text}</span>
                </div>
              </div>

              <div className="access-alert">
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

              <button
                type="submit"
                className="access-submit-btn"
                disabled={busy}
              >
                <span key={mode} className="access-submit-label">
                  {busy
                    ? ACCESS_TEXT.SENDING
                    : mode === 'login'
                      ? ACCESS_TEXT.LOGIN
                      : ACCESS_TEXT.REGISTER}
                </span>
                <Icon name="right" palette="light" size={24} />
              </button>

              <div
                key={mode}
                className="access-switch-mode access-mode-crossfade"
              >
                <span className="access-switch-prompt">
                  {mode === 'login'
                    ? ACCESS_TEXT.NO_ACCOUNT
                    : ACCESS_TEXT.HAVE_ACCOUNT}
                </span>
                <button
                  type="button"
                  className="access-switch-btn"
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError('');
                    setInfo('');
                  }}
                >
                  {mode === 'login'
                    ? ACCESS_TEXT.CREATE_ONE
                    : ACCESS_TEXT.LOGIN_ACTION}
                </button>
              </div>
            </div>
          </div>

          <div className="access-water-col">
            <div className="water-drop-showcase">
              <div className="water-drop-wrapper">
                <svg
                  className="water-drop-svg"
                  viewBox="0 0 160 220"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient
                      id="waterDropGrad"
                      x1="80"
                      y1="14"
                      x2="80"
                      y2="206"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#a7f3d0" />
                      <stop offset="25%" stopColor="#38bdf8" />
                      <stop offset="70%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#082f49" />
                    </linearGradient>
                    <linearGradient
                      id="waterDropShine"
                      x1="45"
                      y1="40"
                      x2="70"
                      y2="130"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
                    </linearGradient>
                    <radialGradient
                      id="waterDropCore"
                      cx="80"
                      cy="145"
                      r="48"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Silueta principal de la gota */}
                  <path
                    d="M80 14 C80 14 24 105 24 148 C24 184 49 206 80 206 C111 206 136 184 136 148 C136 105 80 14 80 14 Z"
                    fill="url(#waterDropGrad)"
                    stroke="#0284c7"
                    strokeWidth="2"
                  />

                  {/* Resplandor interior */}
                  <circle cx="80" cy="145" r="48" fill="url(#waterDropCore)" />

                  {/* Reflejo curvo superior izquierdo */}
                  <path
                    d="M74 38 C54 75 42 110 42 144 C42 165 48 180 56 186 C46 176 40 162 40 144 C40 112 52 80 72 40 C73 38 74 38 74 38 Z"
                    fill="url(#waterDropShine)"
                  />

                  {/* Destello de luz en la punta */}
                  <circle cx="78" cy="30" r="3.5" fill="#ffffff" opacity="0.95" />

                  {/* Reflejo secundario inferior */}
                  <ellipse
                    cx="106"
                    cy="168"
                    rx="8"
                    ry="14"
                    transform="rotate(-30 106 168)"
                    fill="#ffffff"
                    opacity="0.25"
                  />
                </svg>
              </div>
              <div className="water-drop-shadow" />
            </div>

            <div className="water-message-box">
              <div className="water-message-header">
                <span className="water-gem">◆</span>
                <span className="water-tagline">CADA GOTA CUENTA</span>
                <span className="water-gem">◆</span>
              </div>
              <p className="water-awareness-text">
                Cuida cada gota. Protege la estación.
              </p>
            </div>
          </div>
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
