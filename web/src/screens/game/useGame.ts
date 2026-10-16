import { useSyncExternalStore } from 'react';
import type { GameSession, GameState } from '../../game/session';

// useGame lee el estado de la partida y vuelve a dibujar cuando cambia
// (cada snapshot, unas 20 veces por segundo).
export function useGame(game: GameSession): GameState {
  return useSyncExternalStore(game.subscribe, game.getState);
}

// useNow: un reloj que avanza cada `ms` (cuentas regresivas del HUD).
export { useNow } from './useNow';
