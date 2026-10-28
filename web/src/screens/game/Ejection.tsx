import { skinOf } from '../../shop';
import type { Snapshot } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { EJECT_TEXT } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';
import '../../styles/ejection.css';

// Ejection: pantalla de resolución y expulsión tras la votación de la reunión.
export function Ejection(props: { snap: Snapshot }) {
  const m = props.snap.meeting!;
  const ejected = m.ejectedId
    ? props.snap.players.find((p) => p.id === m.ejectedId)
    : undefined;

  const wasImpostor = m.wasImpostor;

  return (
    <div className="overlay-stage solid">
      <Stage className="scr-eject" background={BACKGROUNDS.mapBlur}>
        <div className="eject-vignette" />

        <div className="eject-content">
          {ejected ? (
            <>
              <div className="eject-avatar-stage">
                <div
                  className={`eject-halo ${
                    wasImpostor ? 'caught' : 'innocent'
                  }`}
                />
                <div className="eject-floating-character">
                  <Gota
                    color={ejected.color}
                    accessory={ejected.accessory}
                    skin={skinOf(ejected.skin)}
                    scale={8}
                    animate
                  />
                </div>
              </div>

              <div className="eject-card">
                <h1 className="eject-title">
                  {EJECT_TEXT.ejected(ejected.name)}
                </h1>
                <p className="eject-subtitle">
                  {ejected.name}{' '}
                  <b className={wasImpostor ? 'caught' : 'innocent'}>
                    {wasImpostor ? EJECT_TEXT.WAS : EJECT_TEXT.WAS_NOT}
                  </b>
                  .
                </p>

                <div
                  className={`eject-pill ${wasImpostor ? 'ok' : 'bad'}`}
                >
                  {wasImpostor ? EJECT_TEXT.CAUGHT : EJECT_TEXT.STILL}
                </div>
              </div>
            </>
          ) : (
            <div className="eject-card">
              <h1 className="eject-title">{EJECT_TEXT.NOBODY}</h1>
              <p className="eject-subtitle">{EJECT_TEXT.NOBODY_SUB}</p>
            </div>
          )}
        </div>
      </Stage>
    </div>
  );
}
