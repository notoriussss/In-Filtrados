// El reloj de la partida. match decide cuándo termina (matchEndsAtTick);
// aquí solo se convierte lo que falta en segundos, texto y aspecto.
import type { Snapshot } from '@in-filtrados/messages';
import { GAME_RULES } from '../constants';

export const CLOCK_LOW_SECONDS = 60;
export const CLOCK_CRITICAL_SECONDS = 10;

export type ClockLevel = 'normal' | 'low' | 'critical';

// matchSecondsLeft: segundos que faltan, redondeados hacia arriba para
// que 0:00 solo se vea cuando el tiempo ya se acabó. null si match no
// mandó fin (LOBBY, ENDED) o no hay snapshot.
export function matchSecondsLeft(snap: Snapshot | null): number | null {
  if (!snap || snap.matchEndsAtTick <= 0) return null;
  const ticks = Math.max(snap.matchEndsAtTick - snap.tick, 0);
  return Math.ceil(ticks / GAME_RULES.TICKS_PER_SECOND);
}

// formatClock: mm:ss.
export function formatClock(seconds: number): string {
  const s = Math.max(Math.floor(seconds), 0);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function clockLevel(seconds: number): ClockLevel {
  if (seconds <= CLOCK_CRITICAL_SECONDS) return 'critical';
  if (seconds <= CLOCK_LOW_SECONDS) return 'low';
  return 'normal';
}
