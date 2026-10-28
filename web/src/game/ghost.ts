import type { Snapshot } from '@in-filtrados/messages';

// ownTankEmptied: el tanque del jugador acaba de llegar a 0 y por eso
// pasó a fantasma. Solo lee lo que dice match: ser expulsado en una
// reunión también deja de estar vivo, pero ahí su tanque no está muerto.
export function ownTankEmptied(
  prev: Snapshot | null,
  next: Snapshot,
  meId: string,
): boolean {
  const before = prev?.players.find((p) => p.id === meId);
  const after = next.players.find((p) => p.id === meId);
  if (!before?.alive || !after || after.alive) return false;
  return next.tanks.some((t) => t.ownerId === meId && t.dead);
}
