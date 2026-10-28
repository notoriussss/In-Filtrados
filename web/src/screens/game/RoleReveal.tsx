import { skinOf } from '../../shop';
import { useEffect, useState } from 'react';
import type { Snapshot } from '@in-filtrados/messages';
import { Icon } from '../../ui/Icon';
import { Stage } from '../../ui/Stage';
import { Gota } from '../../ui/Gota';
import { Chip, Gauge } from '../../ui/kit';
import { ROLE_TEXT } from '../../texts';
import { BACKGROUNDS } from '../backgrounds';

export const REVEAL_MS = 3500;

// RoleReveal (maqueta 09-rol): al empezar la partida, durante 3,5 s, tu
// rol con tu gota y quiénes más están en la estación (nunca su rol).
export function RoleReveal(props: {
  snap: Snapshot;
  meId: string;
  onDone: () => void;
}) {
  const [left, setLeft] = useState(REVEAL_MS);
  useEffect(() => {
    const start = performance.now();
    const t = setInterval(() => {
      const l = REVEAL_MS - (performance.now() - start);
      setLeft(l);
      if (l <= 0) props.onDone();
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const impostor = props.snap.myRole === 'IMPOSTOR';
  const me = props.snap.players.find((p) => p.id === props.meId);
  const others = props.snap.players.filter((p) => p.id !== props.meId);
  return (
    <div className="overlay-stage solid">
      <Stage className="scr-role" background={BACKGROUNDS.mapBlur}>
        <div className={impostor ? 'shade bad' : 'shade dim'} />
        {!impostor && <div className="shade v" />}
        <div
          className="ctr"
          style={{ position: 'absolute', left: 0, right: 0, top: 70 }}
        >
          <Chip
            tone={impostor ? 'bad' : 'ok'}
            big
            icon={impostor ? 'warning' : 'drop'}
          >
            {ROLE_TEXT.BADGE}
          </Chip>
        </div>
        <div
          className={`big1 ${impostor ? 'bad' : ''}`}
          style={{ position: 'absolute', left: 0, right: 0, top: 140 }}
        >
          {impostor ? ROLE_TEXT.IMPOSTOR : ROLE_TEXT.CREW}
        </div>
        <div
          className="sub1"
          style={{ position: 'absolute', left: 360, right: 360, top: 290 }}
        >
          {impostor ? ROLE_TEXT.IMPOSTOR_SUB : ROLE_TEXT.CREW_SUB}
        </div>
        <div
          className={`glow ${impostor ? 'bad' : ''}`}
          style={{ left: 660, top: 300, width: 600, height: 600 }}
        />
        <div
          className="shadow"
          style={{ left: 790, top: 748, width: 340, height: 44 }}
        />
        {me && (
          <div className="chr">
            <Gota
              color={me.color}
              accessory={me.accessory}
              skin={skinOf(me.skin)}
              scale={8}
              animate
            />
          </div>
        )}
        <div
          className="well row"
          style={{
            position: 'absolute',
            left: 40,
            top: 930,
            width: 500,
            gap: 16,
            padding: '14px 18px',
          }}
        >
          <Icon name="map" palette="amber" size={40} />
          <span className="small">{ROLE_TEXT.MEETING_NOTE}</span>
        </div>
        <div className="mates">
          <div className="ctr">
            <div className="lab" style={{ color: '#f4fffb' }}>
              {ROLE_TEXT.MATES}
            </div>
            <div
              className="row"
              style={{
                gap: 20,
                alignItems: 'flex-end',
                justifyContent: 'center',
              }}
            >
              {others.map((p) => (
                <Gota
                  key={p.id}
                  color={p.color}
                  accessory={p.accessory}
                  skin={skinOf(p.skin)}
                  scale={2}
                  animate
                />
              ))}
            </div>
          </div>
        </div>
        <section
          className="panel"
          style={{
            left: 560,
            top: 985,
            width: 800,
            height: 70,
            padding: '10px 26px',
            display: 'flex',
            alignItems: 'center',
            gap: 22,
          }}
        >
          <span className="h3" style={{ whiteSpace: 'nowrap' }}>
            {ROLE_TEXT.startsIn(Math.max(0, Math.ceil(left / 1000)))}
          </span>
          <Gauge value={1 - left / REVEAL_MS} className="grow" />
        </section>
      </Stage>
    </div>
  );
}
