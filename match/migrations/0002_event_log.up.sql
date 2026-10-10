-- S2-03: contaminaciones, limpiezas y visitas a los tanques.
-- S2-05 la usa para saber quiénes pasaron cerca de un tanque muerto.
CREATE TABLE event_log (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id),
  tick BIGINT NOT NULL,
  player_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('contaminate', 'clean', 'visit')),
  tank_slot INT NOT NULL
);

CREATE INDEX event_log_tank_idx ON event_log (match_id, tank_slot, tick);
