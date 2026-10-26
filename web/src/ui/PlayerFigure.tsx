import { useEffect, useState } from 'react';

// Personajes oficiales del juego (arte de Jimena en /assets/characters/jimena).
export type PlayerColor =
  | 'Red'
  | 'Green'
  | 'Yellow'
  | 'Blue'
  | 'Orange'
  | 'Purple'
  | 'Cyan'
  | 'Magenta';

export type PlayerPose = 'front' | 'back' | 'left' | 'right';

export function PlayerFigure(props: {
  color: PlayerColor;
  pose?: PlayerPose;
  scale?: number;
  walk?: boolean;
  flip?: boolean;
  breathe?: boolean;
  className?: string;
}) {
  const {
    color,
    pose = 'front',
    scale = 1.2,
    walk = false,
    flip = false,
    breathe = true,
  } = props;
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!walk) return;
    const interval = window.setInterval(() => {
      setStep((s) => (s === 1 ? 2 : 1));
    }, 280);
    return () => window.clearInterval(interval);
  }, [walk]);

  const frame = walk
    ? `${pose}-walking${step}`
    : pose === 'front'
      ? 'front'
      : pose === 'back'
        ? 'back'
        : `${pose}-walking1`;

  const src = `/assets/characters/jimena/${color}_Player-${frame}.png`;
  const width = Math.round(88 * scale);
  const height = Math.round(125 * scale);

  return (
    <div
      className={`player-figure ${breathe && !walk ? 'breathe' : ''} ${
        props.className ?? ''
      }`}
      style={{
        width,
        height,
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
    >
      <img
        src={src}
        alt={`${color} player`}
        width={width}
        height={height}
        className="player-figure-img"
        draggable={false}
      />
    </div>
  );
}
