import { Stage } from '../../ui/Stage';
import { session } from '../../session';
import { gameMap } from '../../map';
import { PAUSE_TEXT } from '../../texts';
import '../../styles/pause.css';

// PauseMenu: menú de pausa en partida minimalista, pulcro y ligero.
export function PauseMenu(props: {
  onResume: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onLeave: () => void;
}) {
  const code = session.loadSession()?.roomCode ?? '';

  return (
    <div className="overlay-stage">
      <Stage className="scr-pause">
        <section
          className="pause-modal"
          role="dialog"
          aria-label={PAUSE_TEXT.TITLE}
        >
          <header className="pause-header">
            <span className="pause-title">{PAUSE_TEXT.TITLE}</span>
            <div className="pause-meta-chips">
              <span className="pause-chip code">
                {PAUSE_TEXT.room(code)}
              </span>
              <span className="pause-chip">{gameMap.name}</span>
            </div>
          </header>

          <div className="pause-actions">
            <button
              type="button"
              className="pause-btn pri"
              onClick={props.onResume}
            >
              {PAUSE_TEXT.RESUME}
            </button>
            <button
              type="button"
              className="pause-btn sec"
              onClick={props.onHelp}
            >
              {PAUSE_TEXT.HELP}
            </button>
            <button
              type="button"
              className="pause-btn sec"
              onClick={props.onSettings}
            >
              {PAUSE_TEXT.SETTINGS}
            </button>
            <button
              type="button"
              className="pause-btn dan"
              onClick={props.onLeave}
            >
              {PAUSE_TEXT.LEAVE}
            </button>
          </div>

          <p className="pause-leave-note">{PAUSE_TEXT.LEAVE_NOTE}</p>
        </section>
      </Stage>
    </div>
  );
}
