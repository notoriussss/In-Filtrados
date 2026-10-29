// Cuántas tareas hace cada jugador. match valida el rango (es la
// autoridad); aquí solo se dibuja el control y se muestra lo elegido.
export const TASK_COUNT = {
  MIN: 4,
  MAX: 8,
  DEFAULT: 6,
} as const;

// Las opciones del control, de menor a mayor.
export function taskCountOptions(): number[] {
  return Array.from(
    { length: TASK_COUNT.MAX - TASK_COUNT.MIN + 1 },
    (_, i) => TASK_COUNT.MIN + i,
  );
}

// Lo que dice el snapshot; sin snapshot o con 0 (servidor viejo), el
// valor por defecto.
export function shownTaskCount(fromSnapshot: number | undefined): number {
  return fromSnapshot && fromSnapshot > 0
    ? fromSnapshot
    : TASK_COUNT.DEFAULT;
}
