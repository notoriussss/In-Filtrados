import { useEffect } from 'react';
import { Stage } from '../ui/Stage';
import { Gota, SERVER_COLORS } from '../ui/Gota';
import { Icon, type IconName, type IconPalette } from '../ui/Icon';
import { Button, Chip, type ChipTone, Kbd, TitleBar } from '../ui/kit';
import { APP_TEXT, HELP_TEXT } from '../texts';
import { BACKGROUNDS } from './backgrounds';

type R = {
  icon: IconName;
  palette: IconPalette;
  title: string;
  sub: string;
  lines: string[];
  tone: ChipTone;
};

const RS: R[] = [
  {
    icon: 'tap',
    palette: 'water',
    title: APP_TEXT.REDUCE,
    sub: HELP_TEXT.REDUCE_SUB,
    lines: [HELP_TEXT.REDUCE_1, HELP_TEXT.REDUCE_2],
    tone: 'info',
  },
  {
    icon: 'bucket',
    palette: 'amber',
    title: APP_TEXT.REUSE,
    sub: HELP_TEXT.REUSE_SUB,
    lines: [HELP_TEXT.REUSE_1, HELP_TEXT.REUSE_2],
    tone: 'warn',
  },
  {
    icon: 'filter',
    palette: 'leaf',
    title: APP_TEXT.RECYCLE,
    sub: HELP_TEXT.RECYCLE_SUB,
    lines: [HELP_TEXT.RECYCLE_1, HELP_TEXT.RECYCLE_2],
    tone: 'ok',
  },
];

// Help (maqueta 07-ayuda): las 3R, los roles y los controles. Se cierra
// con Esc o con el botón.
export function Help(props: { onClose: () => void; overlay?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') props.onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <Stage
      className="scr-help"
      background={props.overlay ? undefined : BACKGROUNDS.mapBlur}
    >
      <div className="shade dim" />
      <section
        className="panel"
        style={{
          left: 60,
          top: 28,
          width: 1800,
          height: 1024,
          padding: '26px 36px',
        }}
      >
        <TitleBar icon="book" title={HELP_TEXT.TITLE}>
          <Chip tone="info" big>
            {HELP_TEXT.DURATION}
          </Chip>
          <Button variant="sec" small onClick={props.onClose}>
            {HELP_TEXT.CLOSE} <Kbd>Esc</Kbd>
          </Button>
        </TitleBar>
        <div className="lab">{HELP_TEXT.TASKS}</div>
        <div className="r3">
          {RS.map((r) => (
            <div className="card" key={r.title}>
              <div className="row">
                <Icon name={r.icon} palette={r.palette} size={56} />
                <div>
                  <b style={{ fontSize: 36 }}>{r.title}</b>
                  <div className="small muted">{r.sub}</div>
                </div>
              </div>
              {r.lines.map((l) => (
                <div className="bl" key={l}>
                  <i />
                  <span>{l}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="lab" style={{ marginTop: 16 }}>
          {HELP_TEXT.ROLES}
        </div>
        <div className="roles">
          <div className="card on">
            <Gota color={SERVER_COLORS[1]} scale={4} animate />
            <div>
              <b style={{ fontSize: 36 }}>{HELP_TEXT.CREW}</b>
              <p style={{ marginTop: 6 }}>{HELP_TEXT.CREW_TEXT}</p>
              <Chip tone="ok" icon="check">
                {HELP_TEXT.CREW_WIN}
              </Chip>
            </div>
          </div>
          <div className="card">
            <Gota color={SERVER_COLORS[4]} scale={4} animate />
            <div>
              <b style={{ fontSize: 36 }}>{HELP_TEXT.IMPOSTOR}</b>
              <p style={{ marginTop: 6 }}>{HELP_TEXT.IMPOSTOR_TEXT}</p>
              <Chip tone="bad" icon="warning">
                {HELP_TEXT.IMPOSTOR_WIN}
              </Chip>
            </div>
          </div>
        </div>
        <div className="well row" style={{ marginTop: 16, gap: 14 }}>
          <Icon name="map" palette="amber" size={32} />
          <p>
            <b>{HELP_TEXT.MEETING_POINT}.</b> {HELP_TEXT.MEETING_POINT_TEXT}
          </p>
        </div>
        <div className="lab" style={{ marginTop: 16 }}>
          {HELP_TEXT.CONTROLS}
        </div>
        <div className="well">
          <div className="ctl">
            <div>
              <Kbd>W</Kbd>
              <Kbd>A</Kbd>
              <Kbd>S</Kbd>
              <Kbd>D</Kbd>
              <span>{HELP_TEXT.MOVE}</span>
            </div>
            <div>
              <Kbd>E</Kbd>
              <span>{HELP_TEXT.USE}</span>
            </div>
            <div>
              <Kbd>1</Kbd>
              <Kbd>2</Kbd>
              <span>{HELP_TEXT.SABOTAGE}</span>
            </div>
            <div>
              <Kbd>Esc</Kbd>
              <span>{HELP_TEXT.MENU}</span>
            </div>
          </div>
        </div>
      </section>
    </Stage>
  );
}
