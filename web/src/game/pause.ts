import type { Snapshot } from '@in-filtrados/messages';
import { CONNECTION_MESSAGES } from '../constants';

// S3-02: aviso de pausa. null si la partida sigue normal.
// matchDown: el gateway avisó que match no responde y todavía no llega
// un snapshot nuevo.
export function pauseMessage(
  snap: Snapshot | null,
  matchDown: boolean,
): string | null {
  if (matchDown) return CONNECTION_MESSAGES.MATCH_DOWN;
  if (!snap?.paused) return null;
  const names = snap.waitingFor
    .map((id) => snap.players.find((p) => p.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return CONNECTION_MESSAGES.PAUSED;
  return CONNECTION_MESSAGES.pausedFor(names.join(', '));
}
