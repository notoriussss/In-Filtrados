import type { Snapshot } from '@in-filtrados/messages';

// ownTankRose devuelve true si la contaminación del tanque del jugador
// aumentó entre dos snapshots consecutivos (S2-09 paso 5).
export function ownTankRose(
  prev: Snapshot | null,
  next: Snapshot,
  meId: string,
): boolean {
  const before = prev?.tanks.find((t) => t.ownerId === meId);
  const after = next.tanks.find((t) => t.ownerId === meId);
  if (!before || !after) return false;
  return after.contamination > before.contamination;
}
