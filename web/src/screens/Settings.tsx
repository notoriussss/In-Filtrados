import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Icon, type IconName } from '../ui/Icon';
import { Chip, Kbd } from '../ui/kit';
import {
  type Settings as SettingsData,
  applySettings,
  defaultSettings,
  loadSettings,
  saveSettings,
} from '../settings';
import { SETTINGS_TEXT as T } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import '../styles/settings.css';

type TabId = 'video' | 'controls' | 'access';

const TABS: { id: TabId; icon: IconName; label: string }[] = [
  { id: 'video', icon: 'screen', label: T.TAB_VIDEO },
  { id: 'controls', icon: 'keyboard', label: T.TAB_CONTROLS },
  { id: 'access', icon: 'eye', label: T.TAB_ACCESS },
];

// Settings (maqueta 08-ajustes): rediseñado acorde al menú principal.
export function Settings(props: { onClose: () => void; overlay?: boolean }) {
  const [saved] = useState(loadSettings);
  const [draft, setDraft] = useState<SettingsData>(saved);
  const [tab, setTab] = useState<TabId>('video');
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const [fullscreenFailed, setFullscreenFailed] = useState(false);

  const change = (patch: Partial<SettingsData>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    applySettings(next);
  };

  const close = () => {
    applySettings(saved);
    props.onClose();
  };

  const apply = () => {
    saveSettings(draft);
    applySettings(draft);
    props.onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      applySettings(saved);
      props.onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [saved, props]);

  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const setScreenMode = (full: boolean) => {
    setFullscreenFailed(false);
    const job = full
      ? document.documentElement.requestFullscreen()
      : document.exitFullscreen();
    job.catch(() => setFullscreenFailed(true));
  };

  return (
    <Stage
      className="scr-settings"
      background={props.overlay ? undefined : BACKGROUNDS.hero}
    >
      <div className="settings-backdrop" />
      <section className="settings-modal" role="dialog" aria-modal="true">
        <header className="settings-head">
          <div className="settings-head-title">
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
            <h2>{T.TITLE}</h2>
          </div>
          <button
            type="button"
            className="settings-esc-btn"
            onClick={close}
            aria-label={T.BACK}
          >
            <span>{T.BACK}</span>
            <Kbd>Esc</Kbd>
          </button>
        </header>

        <div className="settings-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`settings-tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <Icon
                name={t.icon}
                palette={tab === t.id ? 'water' : 'light'}
                size={24}
              />
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-body" role="tabpanel">
          <div className="settings-pane">
            {tab === 'video' && (
              <Row title={T.SCREEN} sub={T.SCREEN_SUB} last>
                <Segmented
                  label={T.SCREEN}
                  value={fullscreen ? 'full' : 'window'}
                  options={[
                    ['window', T.WINDOW],
                    ['full', T.FULLSCREEN],
                  ]}
                  onChange={(v) => setScreenMode(v === 'full')}
                />
                {fullscreenFailed && (
                  <Chip tone="bad" icon="cross">
                    {T.FULLSCREEN_BLOCKED}
                  </Chip>
                )}
              </Row>
            )}

            {tab === 'controls' && (
              <>
                <Row title={T.MOVE}>
                  <div className="row">
                    {['W', 'A', 'S', 'D'].map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                    <span className="muted small">{T.OR_ARROWS}</span>
                  </div>
                </Row>
                <Row title={T.USE}>
                  <Kbd>E</Kbd>
                </Row>
                <Row title={T.SABOTAGE}>
                  <div className="row">
                    <Kbd>1</Kbd>
                    <Kbd>2</Kbd>
                  </div>
                </Row>
                <Row title={T.MENU} sub={T.CONTROLS_NOTE} last>
                  <div className="row">
                    <Kbd>Esc</Kbd>
                    <Chip tone="warn">{T.FIXED}</Chip>
                  </div>
                </Row>
              </>
            )}

            {tab === 'access' && (
              <>
                <Row title={T.HIGH_CONTRAST} sub={T.HIGH_CONTRAST_SUB}>
                  <Toggle
                    label={T.HIGH_CONTRAST}
                    on={draft.highContrast}
                    onChange={(v) => change({ highContrast: v })}
                  />
                </Row>
                <Row title={T.REDUCE_MOTION} sub={T.REDUCE_MOTION_SUB} last>
                  <Toggle
                    label={T.REDUCE_MOTION}
                    on={draft.reduceMotion}
                    onChange={(v) => change({ reduceMotion: v })}
                  />
                </Row>
              </>
            )}
          </div>
          <p className="note-text">{T.STORED_NOTE}</p>
        </div>

        <footer className="settings-foot">
          <button
            type="button"
            className="settings-btn sec"
            onClick={close}
          >
            <Icon name="left" palette="light" size={24} />
            {T.BACK}
          </button>
          <div className="settings-actions">
            <button
              type="button"
              className="settings-btn ghost"
              onClick={() => change(defaultSettings())}
            >
              {T.RESET}
            </button>
            <button
              type="button"
              className="settings-btn pri"
              onClick={apply}
            >
              <Icon name="check" palette="light" size={24} />
              {T.APPLY}
            </button>
          </div>
        </footer>
      </section>
    </Stage>
  );
}

function Row(props: {
  title: string;
  sub?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`settings-row ${props.last ? 'last' : ''}`}>
      <div className="settings-row-info">
        <b>{props.title}</b>
        {props.sub && <div className="d">{props.sub}</div>}
      </div>
      <div className="settings-row-ctrl">{props.children}</div>
    </div>
  );
}

function Toggle(props: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <>
      <span className="muted small">{props.on ? T.ON : T.OFF}</span>
      <button
        type="button"
        role="switch"
        aria-checked={props.on}
        aria-label={props.label}
        className={`tog ${props.on ? 'on' : ''}`}
        onClick={() => props.onChange(!props.on)}
      />
    </>
  );
}

function Segmented(props: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={props.label}>
      {props.options.map(([value, text]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={props.value === value}
          className={props.value === value ? 'on' : ''}
          onClick={() => props.onChange(value)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
