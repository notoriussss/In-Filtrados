import { skinOf } from '../../shop';
import { useEffect, useState } from 'react';
import type { Snapshot } from '@in-filtrados/messages';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { ROLE_TEXT } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';
import '../../styles/roleReveal.css';

export const REVEAL_MS = 3500;

// RoleReveal: pantalla de inicio y revelación de rol al comenzar la partida.
export function RoleReveal(props: {
  snap: Snapshot;
  meId: string;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(REVEAL_MS);

  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => {
      const remaining = REVEAL_MS - (performance.now() - start);
      setLeft(remaining);
      if (remaining <= 0) {
        props.onDone();
      }
    }, 50);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const impostor = props.snap.myRole === 'IMPOSTOR';
  const roleTheme = impostor ? 'impostor' : 'crew';
  const me = props.snap.players.find((p) => p.id === props.meId);
  const others = props.snap.players.filter((p) => p.id !== props.meId);
  const secondsLeft = Math.max(0, Math.ceil(left / 1000));
  const progressPct = Math.min(
    100,
    Math.max(0, ((REVEAL_MS - left) / REVEAL_MS) * 100),
  );

  return (
    <div className="overlay-stage solid">
      <Stage className="scr-role" background={BACKGROUNDS.mapBlur}>
        <div className={`role-vignette ${roleTheme}`} />

        <div className="role-content">
          <header className="role-header">
            <span className={`role-tag ${roleTheme}`}>
              {ROLE_TEXT.BADGE}
            </span>
            <h1 className={`role-title ${roleTheme}`}>
              {impostor ? ROLE_TEXT.IMPOSTOR : ROLE_TEXT.CREW}
            </h1>
            <p className="role-desc">
              {impostor ? ROLE_TEXT.IMPOSTOR_SUB : ROLE_TEXT.CREW_SUB}
            </p>
          </header>

          <div className="role-hero-stage">
            <div className={`role-halo ${roleTheme}`} />
            {me && (
              <div className="role-character">
                <Gota
                  color={me.color}
                  accessory={me.accessory}
                  skin={skinOf(me.skin)}
                  scale={7}
                  animate
                />
              </div>
            )}
            <div className="role-pedestal" />
            {me && <span className="role-my-name">{me.name}</span>}
          </div>

          {others.length > 0 && (
            <div className="role-mates-card">
              <span className="role-mates-title">{ROLE_TEXT.MATES}</span>
              <div className="role-mates-list">
                {others.map((p) => (
                  <div key={p.id} className="role-mate-item">
                    <Gota
                      color={p.color}
                      accessory={p.accessory}
                      skin={skinOf(p.skin)}
                      scale={2.2}
                      animate
                    />
                    <span className="role-mate-name">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="role-bottom-card">
            <div className="role-bottom-header">
              <span className="role-starts-in">
                {ROLE_TEXT.startsIn(secondsLeft)}
              </span>
              <span className={`role-starts-sec ${roleTheme}`}>
                {secondsLeft}s
              </span>
            </div>
            <div className="role-bar-track">
              <div
                className={`role-bar-fill ${roleTheme}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <p className="role-note">{ROLE_TEXT.MEETING_NOTE}</p>
        </div>
      </Stage>
    </div>
  );
}
