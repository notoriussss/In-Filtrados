import { useEffect, useState } from 'react';
import { Stage } from '../ui/Stage';
import { HintBar, Kbd } from '../ui/kit';
import { APP_TEXT, HELP_TEXT, MENU_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';
import '../styles/help.css';

type TabId = 'r3' | 'roles' | 'controls';

const TABS: { id: TabId; label: string }[] = [
  { id: 'r3', label: HELP_TEXT.TAB_3R },
  { id: 'roles', label: HELP_TEXT.TAB_ROLES },
  { id: 'controls', label: HELP_TEXT.TAB_CONTROLS },
];

const RS = [
  {
    title: APP_TEXT.REDUCE,
    sub: HELP_TEXT.REDUCE_SUB,
    lines: [HELP_TEXT.REDUCE_1, HELP_TEXT.REDUCE_2],
  },
  {
    title: APP_TEXT.REUSE,
    sub: HELP_TEXT.REUSE_SUB,
    lines: [HELP_TEXT.REUSE_1, HELP_TEXT.REUSE_2],
  },
  {
    title: APP_TEXT.RECYCLE,
    sub: HELP_TEXT.RECYCLE_SUB,
    lines: [HELP_TEXT.RECYCLE_1, HELP_TEXT.RECYCLE_2],
  },
];

// Help: las 3R, los roles y los controles en pestañas. Se cierra con
// Esc, con la equis o con el botón Volver.
export function Help(props: { onClose: () => void; overlay?: boolean }) {
  const [tab, setTab] = useState<TabId>('r3');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        props.onClose();
        return;
      }
      const dir = e.code === 'ArrowRight' ? 1 : e.code === 'ArrowLeft' ? -1 : 0;
      if (!dir) return;
      setTab((cur) => {
        const i = TABS.findIndex((t) => t.id === cur);
        return TABS[(i + dir + TABS.length) % TABS.length].id;
      });
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <Stage
      className="scr-help"
      background={props.overlay ? undefined : BACKGROUNDS.hero}
    >
      <div className="help-backdrop" />
      <section className="help-modal" role="dialog" aria-modal="true">
        <header className="help-head">
          <div>
            <h2>{HELP_TEXT.TITLE}</h2>
            <p className="help-sub">{HELP_TEXT.DURATION}</p>
          </div>
          <button
            type="button"
            className="help-close-btn"
            onClick={props.onClose}
            aria-label={HELP_TEXT.CLOSE}
            title={`${HELP_TEXT.CLOSE} (Esc)`}
          >
            ✕
          </button>
        </header>

        <nav className="help-tabs" role="tablist" aria-label={HELP_TEXT.TITLE}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`help-tab-${t.id}`}
              aria-controls={`help-panel-${t.id}`}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className={`help-tab ${tab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div
          className="help-body"
          role="tabpanel"
          id={`help-panel-${tab}`}
          aria-labelledby={`help-tab-${tab}`}
        >
          {tab === 'r3' && (
            <div className="help-cols three">
              {RS.map((r) => (
                <div className="help-card" key={r.title}>
                  <h3>{r.title}</h3>
                  <p className="lead">{r.sub}</p>
                  {r.lines.map((l) => (
                    <div className="help-bullet" key={l}>
                      <i />
                      <span>{l}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {tab === 'roles' && (
            <div className="help-roles-wrap">
              <div className="help-cols two">
                <div className="help-card crew">
                  <h3>{HELP_TEXT.CREW}</h3>
                  <p className="lead">{HELP_TEXT.CREW_TEXT}</p>
                  <div className="help-win">{HELP_TEXT.CREW_WIN}</div>
                </div>
                <div className="help-card impostor">
                  <h3>{HELP_TEXT.IMPOSTOR}</h3>
                  <p className="lead">{HELP_TEXT.IMPOSTOR_TEXT}</p>
                  <div className="help-win">{HELP_TEXT.IMPOSTOR_WIN}</div>
                </div>
              </div>
              <div className="help-meeting-note">
                <b>{HELP_TEXT.MEETING_POINT}:</b> {HELP_TEXT.MEETING_POINT_TEXT}
              </div>
            </div>
          )}

          {tab === 'controls' && (
            <div className="help-list">
              <div className="help-row">
                <b>{HELP_TEXT.MOVE}</b>
                <div className="help-keys">
                  <Kbd>W</Kbd>
                  <Kbd>A</Kbd>
                  <Kbd>S</Kbd>
                  <Kbd>D</Kbd>
                </div>
              </div>
              <div className="help-row">
                <b>{HELP_TEXT.USE}</b>
                <div className="help-keys">
                  <Kbd>E</Kbd>
                </div>
              </div>
              <div className="help-row">
                <b>{HELP_TEXT.SABOTAGE}</b>
                <div className="help-keys">
                  <Kbd>1</Kbd>
                  <Kbd>2</Kbd>
                </div>
              </div>
              <div className="help-row">
                <b>{HELP_TEXT.MENU}</b>
                <div className="help-keys">
                  <Kbd>Esc</Kbd>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="help-foot">
          <button
            type="button"
            className="help-btn"
            onClick={props.onClose}
          >
            {HELP_TEXT.BACK}
          </button>
        </footer>
      </section>

      {!props.overlay && (
        <HintBar
          hints={[
            ['←→', MENU_TEXT.HINT_CHOOSE],
            ['Esc', HELP_TEXT.BACK],
          ]}
        />
      )}
    </Stage>
  );
}
