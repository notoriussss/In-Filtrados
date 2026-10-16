import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName, type IconPalette } from './Icon';

// Componentes del kit B-noche (styles/ui-kit.css). Son envoltorios finos
// de las clases del diseño (panel, btn, chip, gauge, title-bar, kbd) para
// que cada pantalla quede igual a su maqueta de
// docs/design/in-filtrados-ui-v3/pantallas/B-noche.

type Box = { left: number; top: number; width: number; height?: number };

// Panel con borde de píxel, ubicado en píxeles del escenario.
export function Panel(props: {
  box?: Box;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      className={`panel ${props.className ?? ''}`}
      style={{ ...props.box, ...props.style }}
    >
      {props.children}
    </section>
  );
}

// Encabezado de panel: ícono, título y lo que vaya a la derecha.
export function TitleBar(props: {
  icon: IconName;
  palette?: IconPalette;
  title: ReactNode;
  children?: ReactNode;
  size?: number;
}) {
  return (
    <header className="title-bar">
      <Icon name={props.icon} palette={props.palette ?? 'ink'} />
      <h2
        className="h2 grow"
        style={props.size ? { fontSize: props.size } : undefined}
      >
        {props.title}
      </h2>
      {props.children}
    </header>
  );
}

export type ButtonVariant = 'pri' | 'sec' | 'amber' | 'dan' | '';

export function Button(props: {
  variant?: ButtonVariant;
  small?: boolean;
  block?: boolean;
  icon?: IconName;
  iconPalette?: IconPalette;
  iconAfter?: IconName;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const cls = [
    'btn',
    props.variant,
    props.small && 'small',
    props.block && 'blk',
    props.className,
  ]
    .filter(Boolean)
    .join(' ');
  const palette =
    props.iconPalette ?? (props.variant === 'pri' ? 'dark' : 'ink');
  return (
    <button
      type={props.type ?? 'button'}
      className={cls}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.icon && <Icon name={props.icon} palette={palette} size={28} />}
      {props.children}
      {props.iconAfter && (
        <Icon name={props.iconAfter} palette={palette} size={28} />
      )}
    </button>
  );
}

export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | '';

const CHIP_ICON_PALETTE: Record<string, IconPalette> = {
  ok: 'leaf',
  warn: 'amber',
  bad: 'coral',
  info: 'water',
  '': 'ink',
};

export function Chip(props: {
  tone?: ChipTone;
  big?: boolean;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  const tone = props.tone ?? '';
  return (
    <span
      className={[
        'chip',
        tone,
        props.big ? 'big' : '',
        props.className ?? '',
      ].join(' ')}
    >
      {props.icon && (
        <Icon name={props.icon} palette={CHIP_ICON_PALETTE[tone]} size={20} />
      )}
      {props.children}
    </span>
  );
}

// Medidor en bloques; value de 0 a 1.
export function Gauge(props: {
  value: number;
  tone?: 'leaf' | 'amber' | 'bad' | '';
  height?: number;
  label?: string;
  className?: string;
}) {
  const pct = Math.round(Math.min(Math.max(props.value, 0), 1) * 100);
  return (
    <div
      className={`gauge ${props.tone ?? ''} ${props.className ?? ''}`}
      style={props.height ? { height: props.height } : undefined}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={props.label}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd(props: { children: ReactNode }) {
  return <i className="kbd">{props.children}</i>;
}

// Barra de ayuda de teclas al pie de la pantalla.
export function HintBar(props: { hints: [string, string][] }) {
  return (
    <div className="hint">
      {props.hints.map(([key, text]) => (
        <span key={key}>
          <Kbd>{key}</Kbd>
          {text}
        </span>
      ))}
    </div>
  );
}

export function Pill(props: {
  icon?: IconName;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="pill" style={props.style}>
      {props.icon && <Icon name={props.icon} palette="ink" size={24} />}
      {props.children}
    </div>
  );
}
