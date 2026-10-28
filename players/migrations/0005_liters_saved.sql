-- Litros que cada jugador sumó al embalse en cada partida, para el ranking.
-- Migración nueva: las viejas no se editan nunca. Las partidas anteriores
-- quedan en 0, porque entonces match no mandaba ese dato.
ALTER TABLE results ADD COLUMN liters_saved INTEGER NOT NULL DEFAULT 0;
