import { skinOf } from '../../shop';
import type { Snapshot } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { Chip } from '../../ui/kit';
import { EJECT_TEXT } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';

// Ejection (maqueta 13-expulsion): los 5 s de resultado de la reunión.
// match dice a quién expulsaron y si era el infiltrado.
export function Ejection(props: { snap: Snapshot }) {
  const m = props.snap.meeting!;
  const ejected = m.ejectedId
    ? props.snap.players.find((p) => p.id === m.ejectedId)
    : undefined;
  return (
    <div className="overlay-stage solid">
      <Stage className="scr-eject" background={BACKGROUNDS.mapBlur}>
        <div className="shade dim" />
        <div className="shade v" />
        <div
          className={`glow ${ejected && !m.wasImpostor ? 'bad' : ''}`}
          style={{ left: 610, top: 90, width: 700, height: 700 }}
        />
        {ejected ? (
          <>
            <div className="float bob">
              <Gota
                color={ejected.color}
                accessory={ejected.accessory}
                skin={skinOf(ejected.skin)}
                scale={9}
              />
            </div>
            <div
              className="big1 sm"
              style={{ position: 'absolute', left: 0, right: 0, top: 700 }}
            >
              {EJECT_TEXT.ejected(ejected.name)}
            </div>
            <div
              className="sub1"
              style={{ position: 'absolute', left: 0, right: 0, top: 830 }}
            >
              {ejected.name}{' '}
              <b style={{ color: m.wasImpostor ? '#ff9d94' : '#9be39a' }}>
                {m.wasImpostor ? EJECT_TEXT.WAS : EJECT_TEXT.WAS_NOT}
              </b>
              .
            </div>
            <div
              className="ctr"
              style={{ position: 'absolute', left: 0, right: 0, top: 920 }}
            >
              {m.wasImpostor ? (
                <Chip tone="ok" big icon="check">
                  {EJECT_TEXT.CAUGHT}
                </Chip>
              ) : (
                <Chip tone="bad" big icon="warning">
                  {EJECT_TEXT.STILL}
                </Chip>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className="big1 sm"
              style={{ position: 'absolute', left: 0, right: 0, top: 420 }}
            >
              {EJECT_TEXT.NOBODY}
            </div>
            <div
              className="sub1"
              style={{ position: 'absolute', left: 0, right: 0, top: 560 }}
            >
              {EJECT_TEXT.NOBODY_SUB}
            </div>
          </>
        )}
      </Stage>
    </div>
  );
}
