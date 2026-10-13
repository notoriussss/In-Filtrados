-- S3-02: una instantánea por partida, sobrescrita cada 2 s y en cada
-- cambio de fase. Al arrancar, match recrea las partidas sin terminar.
CREATE TABLE snapshots (
  match_id UUID PRIMARY KEY,
  tick BIGINT NOT NULL,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
