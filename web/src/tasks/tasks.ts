import type { MyTask } from '@in-filtrados/messages';
import {
  type GameMap,
  type Station,
  type StationType,
  type Zone,
  zoneRoom,
} from '../map';

// Tareas de las 3R del lado del navegador (S2-11). match decide si una
// tarea empezó o se completó; aquí solo se arma la lista y se elige la
// estación cercana.

export const TASK_RANGE = 40; // taskRadius en match si la estación no trae radio

// stationRange: alcance de la estación (su radius de map.json).
export function stationRange(s: Station): number {
  return s.radius ?? TASK_RANGE;
}
export const MIN_TASK_MS = 3000; // taskMinTicks en match: 3 s
export const SEND_MARGIN_MS = 200; // margen para no llegar antes de 3 s

export type TaskRow = {
  stationId: string;
  type: StationType;
  zoneName: string | null;
  done: boolean;
};

// zoneOf devuelve la zona más pequeña que contiene el punto.
export function zoneOf(
  point: { x: number; y: number },
  zones: Zone[],
): Zone | null {
  let best: Zone | null = null;
  for (const z of zones) {
    const inside =
      point.x >= z.x &&
      point.x <= z.x + z.w &&
      point.y >= z.y &&
      point.y <= z.y + z.h;
    if (inside && (!best || z.w * z.h < best.w * best.h)) best = z;
  }
  return best;
}

// buildTaskList arma las filas de la lista: tipo y zona de cada tarea.
// Las estaciones que no están en el mapa se descartan.
export function buildTaskList(
  myTasks: MyTask[],
  map: GameMap,
): TaskRow[] {
  const rows: TaskRow[] = [];
  for (const task of myTasks) {
    const station = map.stations.find((s) => s.id === task.stationId);
    if (!station) continue;
    rows.push({
      stationId: station.id,
      type: station.type,
      zoneName: roomName(station, map.zones),
      done: task.done,
    });
  }
  return rows;
}

// roomName: nombre de la sala de la estación (su room o, si no trae,
// la zona más pequeña que la contiene).
export function roomName(station: Station, zones: Zone[]): string | null {
  if (station.room) {
    const z = zones.find((zone) => zoneRoom(zone) === station.room);
    if (z) return z.name;
  }
  return zoneOf(station, zones)?.name ?? null;
}

// pickStation elige la estación propia y pendiente más cercana a
// su alcance o menos; null si no hay ninguna.
export function pickStation(
  me: { x: number; y: number },
  myTasks: MyTask[],
  stations: Station[],
): Station | null {
  let best: Station | null = null;
  let bestDist = Infinity;
  for (const task of myTasks) {
    if (task.done) continue;
    const s = stations.find((st) => st.id === task.stationId);
    if (!s) continue;
    const d = Math.hypot(s.x - me.x, s.y - me.y);
    if (d <= stationRange(s) && d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

// completionDelay: cuánto esperar antes de mandar completed, porque
// match rechaza las tareas de menos de 3 s.
export function completionDelay(startedAt: number, now: number): number {
  return Math.max(0, startedAt + MIN_TASK_MS + SEND_MARGIN_MS - now);
}
