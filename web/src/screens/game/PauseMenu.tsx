import { Stage } from '../../ui/Stage';
import { Icon } from '../../ui/Icon';
import { Button, Chip, Kbd, TitleBar } from '../../ui/kit';
import { session } from '../../session';
import { gameMap } from '../../map';
import { PAUSE_TEXT } from '../../texts';

// PauseMenu (maqueta 10-pausa): la partida sigue para los demás.
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
        <div className="shade dim" />
        <section
          className="panel"
          style={{
            left: 580,
            top: 200,
            width: 760,
            padding: '30px 40px',
          }}
        >
          <TitleBar icon="gear" title={PAUSE_TEXT.TITLE}>
            <Kbd>Esc</Kbd>
          </TitleBar>
          <div
            className="row"
            style={{ gap: 12, flexWrap: 'wrap', marginBottom: 22 }}
          >
            <Chip tone="info">{PAUSE_TEXT.room(code)}</Chip>
            <Chip>{gameMap.name}</Chip>
          </div>
          <div className="well" style={{ marginBottom: 26 }}>
            <div className="row" style={{ gap: 14 }}>
              <Icon name="warning" palette="amber" size={34} />
              <span className="small">{PAUSE_TEXT.NOTE}</span>
            </div>
          </div>
          <div className="col" style={{ gap: 20 }}>
            <Button variant="pri" block icon="play" onClick={props.onResume}>
              {PAUSE_TEXT.RESUME}
            </Button>
            <Button variant="sec" block icon="book" onClick={props.onHelp}>
              {PAUSE_TEXT.HELP}
            </Button>
            <Button
              variant="sec"
              block
              icon="gear"
              onClick={props.onSettings}
            >
              {PAUSE_TEXT.SETTINGS}
            </Button>
            <Button variant="dan" block icon="door" onClick={props.onLeave}>
              {PAUSE_TEXT.LEAVE}
            </Button>
          </div>
          <p className="small muted ctr" style={{ marginTop: 22 }}>
            {PAUSE_TEXT.LEAVE_NOTE}
          </p>
        </section>
      </Stage>
    </div>
  );
}
