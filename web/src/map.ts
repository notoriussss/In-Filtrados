// Types for shared/map.json (docs/tasks.md, section 0.3). The JSON itself is imported
// from shared/, never copied into web/, so match and web always read the same map.
import mapData from '../../shared/map.json';

export type Rect = { x: number; y: number; w: number; h: number };
export type Zone = Rect & { id: string; name: string; color: string };
export type StationType = 'reduce' | 'reuse' | 'recycle';
export type Station = { id: string; type: StationType; x: number; y: number };
export type Tank = { slot: number; x: number; y: number };

export type GameMap = {
  width: number;
  height: number;
  spawn: { x: number; y: number };
  walls: Rect[];
  zones: Zone[];
  stations: Station[];
  tanks: Tank[];
};

export const gameMap = mapData as GameMap;
