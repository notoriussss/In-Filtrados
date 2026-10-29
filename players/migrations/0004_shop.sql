-- Tienda: lo que cada jugador compró con sus monedas. Migración nueva:
-- las viejas no se editan nunca.
CREATE TABLE purchases (
  player_id UUID NOT NULL REFERENCES players(id),
  item_id TEXT NOT NULL,
  price INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, item_id)
);
