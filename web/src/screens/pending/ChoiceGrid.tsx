import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon';

export type Choice = {
  id: string;
  label: string;
  taken?: boolean; // someone else has it: shown dimmed and not pickable
  swatch?: string; // CSS color, for color choices
  preview?: ReactNode; // drawing, for accessory choices
};

// ChoiceGrid (maqueta 06-lobby): one grid for colors and accessories.
// Colors pass `swatch`; accessories pass `preview`.
export function ChoiceGrid(props: {
  label: string;
  choices: Choice[];
  value: string;
  onPick: (id: string) => void;
  kind: 'color' | 'accessory';
}) {
  const color = props.kind === 'color';
  return (
    <div
      className={color ? 'swatches' : 'acg'}
      role="radiogroup"
      aria-label={props.label}
    >
      {props.choices.map((c) => {
        const picked = c.id === props.value;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={picked}
            aria-label={c.label}
            title={c.label}
            disabled={c.taken && !picked}
            className={[
              color ? 'sw' : 'ac',
              c.taken && !picked ? 'taken' : '',
              picked ? 'me' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={color ? { background: c.swatch } : undefined}
            onClick={() => props.onPick(c.id)}
          >
            {color ? (
              picked && <Icon name="check" palette="ink" size={24} />
            ) : (
              c.preview
            )}
          </button>
        );
      })}
    </div>
  );
}
