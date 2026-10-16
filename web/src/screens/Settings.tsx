import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { Icon, type IconName } from '../ui/Icon';
import { Button, Chip, Kbd, TitleBar } from '../ui/kit';
import {
  type Settings as SettingsData,
  applySettings,
  defaultSettings,
  loadSettings,
  saveSettings,
} from '../settings';
import { SETTINGS_TEXT as T } from '../texts';
import { BACKGROUNDS } from './backgrounds';

type TabId = 'video' | 'controls' | 'access';

const TABS: { id: TabId; icon: IconName; label: string }[] = [
  { id: 'video', icon: 'screen', label: T.TAB_VIDEO },
  { id: 'controls', icon: 'keyboard', label: T.TAB_CONTROLS },
  { id: 'access', icon: 'eye', label: T.TAB_ACCESS },
];

// Settings (maqueta 08-ajustes). Changes preview at once; "Aplicar" keeps
// them in this browser and "Volver" (or Esc) puts the saved ones back.
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
      background={props.overlay ? undefined : BACKGROUNDS.mapBlur}
    >
      <div className="shade dim" />
      <section
        className="panel"
        style={{ left: 260, top: 60, width: 1400, height: 960 }}
      >
        <div style={{ padding: '26px 40px' }}>
          <TitleBar icon="gear" title={T.TITLE}>
            <Kbd>Esc</Kbd>
          </TitleBar>
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tab ${tab === t.id ? 'on' : ''}`}
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
          <div className="well pane" role="tabpanel">
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
          <p className="small muted" style={{ marginTop: 10 }}>
            {T.STORED_NOTE}
          </p>
        </div>
        <div className="settings-foot">
          <Button variant="sec" icon="left" iconPalette="light" onClick={close}>
            {T.BACK}
          </Button>
          <div className="row">
            <Button variant="sec" onClick={() => change(defaultSettings())}>
              {T.RESET}
            </Button>
            <Button variant="pri" icon="check" onClick={apply}>
              {T.APPLY}
            </Button>
          </div>
        </div>
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
    <div className="sr" style={props.last ? { border: 0 } : undefined}>
      <div>
        <b>{props.title}</b>
        {props.sub && <div className="d">{props.sub}</div>}
      </div>
      <div className="ctl2">{props.children}</div>
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
