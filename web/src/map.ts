// Types for shared/map.json (docs/tasks.md, section 0.3). The JSON itself is imported
// from shared/, never copied into web/, so match and web always read the same map.
import mapData from '../../shared/map.json';

export type Rect = { x: number; y: number; w: number; h: number };
export type Zone = Rect & { id: string; name: string; color: string };
// Algunas salas son varias zonas: "cisternas", "cisternas#2"…
export const zoneRoom = (z: Zone) => z.id.split('#')[0];
export type StationType = 'reduce' | 'reuse' | 'recycle';
export type Station = {
  id: string;
  type: StationType;
  x: number;
  y: number;
  name?: string; // "Fuga en la tubería"
  room?: string; // id de la sala (zona) donde está
  radius?: number; // alcance para interactuar; si falta, 40
};
export type Tank = { slot: number; x: number; y: number };
// S3-05: donde se arreglan las emergencias (tubería y vapor).
export type FixPoint = {
  id: string;
  kind: 'pipe' | 'steam';
  x: number;
  y: number;
};

export type GameMap = {
  id?: string;
  name?: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  walls: Rect[];
  zones: Zone[];
  stations: Station[];
  tanks: Tank[];
  fixPoints: FixPoint[];
};

export const gameMap = mapData as GameMap;
