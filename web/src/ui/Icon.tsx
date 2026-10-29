// Íconos pixel de 12 × 12 del kit B-noche (public/assets/ui/icons), en 9
// paletas. Se amplían sin suavizado (36 px en los títulos del diseño).
export type IconName =
  | 'book'
  | 'bucket'
  | 'chat'
  | 'check'
  | 'clock'
  | 'copy'
  | 'cross'
  | 'crown'
  | 'door'
  | 'drop'
  | 'eye'
  | 'filter'
  | 'gear'
  | 'globe'
  | 'keyboard'
  | 'left'
  | 'map'
  | 'oil'
  | 'play'
  | 'plot'
  | 'right'
  | 'screen'
  | 'speaker'
  | 'tap'
  | 'trophy'
  | 'user'
  | 'warning';

export type IconPalette =
  | 'water'
  | 'leaf'
  | 'amber'
  | 'coral'
  | 'light'
  | 'ink'
  | 'dark'
  | 'wood'
  | 'default';

export function iconUrl(name: IconName, palette: IconPalette): string {
  return `/assets/ui/icons/${palette}/${name}.png`;
}

export function Icon(props: {
  name: IconName;
  palette?: IconPalette;
  size?: number;
}) {
  const size = props.size ?? 36;
  return (
    <img
      className="px-icon"
      alt=""
      src={iconUrl(props.name, props.palette ?? 'ink')}
      width={size}
      height={size}
    />
  );
}

// Ícono y paleta de cada tipo de tarea 3R, como en el HUD del diseño.
export const TASK_ICONS = {
  reduce: { name: 'tap', palette: 'water' },
  reuse: { name: 'bucket', palette: 'amber' },
  recycle: { name: 'filter', palette: 'leaf' },
} as const satisfies Record<string, { name: IconName; palette: IconPalette }>;
