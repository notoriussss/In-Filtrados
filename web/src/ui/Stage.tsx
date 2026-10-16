import { type ReactNode, useEffect, useState } from 'react';
import { STAGE_H, STAGE_W, stageScale } from './stage';

function useScale(): number {
  const [scale, setScale] = useState(() => stageScale(innerWidth, innerHeight));
  useEffect(() => {
    const fit = () => setScale(stageScale(innerWidth, innerHeight));
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
  return scale;
}

// Stage: pantalla de menú maquetada en 1920 × 1080, centrada y escalada.
export function Stage(props: {
  className?: string;
  background?: string;
  children: ReactNode;
}) {
  const scale = useScale();
  return (
    <div
      className={`stage ${props.className ?? ''}`}
      style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
    >
      {props.background && <img className="bg" src={props.background} alt="" />}
      {props.children}
    </div>
  );
}

// HudLayer: capa que cubre toda la ventana con la escala del diseño; las
// piezas se ubican en píxeles de 1920 × 1080 pegadas a los bordes.
export function HudLayer(props: { className?: string; children: ReactNode }) {
  const scale = useScale();
  return (
    <div
      className={`hud-layer ${props.className ?? ''}`}
      style={{
        width: innerWidth / scale,
        height: innerHeight / scale,
        transform: `scale(${scale})`,
      }}
    >
      {props.children}
    </div>
  );
}

export { STAGE_W, STAGE_H };
