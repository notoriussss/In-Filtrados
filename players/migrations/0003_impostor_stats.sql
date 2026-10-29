-- S2-07: estadísticas como impostor. Migración nueva: las viejas no se
-- editan nunca.
ALTER TABLE players
  ADD COLUMN times_impostor INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN wins_as_impostor INTEGER NOT NULL DEFAULT 0;
