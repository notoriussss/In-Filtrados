// Ajustes de la partida que elige quien creó la sala. match valida los
// rangos (es la autoridad); aquí solo se dibujan los controles y se muestra
// lo elegido.
export const MATCH_MINUTES = {
  MIN: 4,
  MAX: 12,
  DEFAULT: 8,
} as const;

// Los minutos que ofrece el control, de menor a mayor.
export const MATCH_MINUTES_OPTIONS = [4, 6, 8, 10, 12] as const;

// Tope de infiltrados: la mitad de los jugadores menos uno, y al menos 1.
export function maxImpostors(players: number): number {
  return Math.max(1, Math.floor((players - 1) / 2));
}

// Las opciones de infiltrados para los jugadores que hay, de 1 al tope.
export function impostorOptions(players: number): number[] {
  return Array.from({ length: maxImpostors(players) }, (_, i) => i + 1);
}

// Lo que dice el snapshot; sin snapshot o con 0 (servidor viejo), 1.
export function shownImpostors(fromSnapshot: number | undefined): number {
  return fromSnapshot && fromSnapshot > 0 ? fromSnapshot : 1;
}

// Lo que dice el snapshot; sin snapshot o con 0, el valor por defecto.
export function shownMatchMinutes(fromSnapshot: number | undefined): number {
  return fromSnapshot && fromSnapshot > 0
    ? fromSnapshot
    : MATCH_MINUTES.DEFAULT;
}
