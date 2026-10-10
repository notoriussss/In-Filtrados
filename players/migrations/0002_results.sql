CREATE TABLE results (
  match_id UUID NOT NULL,
  player_id UUID NOT NULL REFERENCES players(id),
  role TEXT NOT NULL,
  won BOOLEAN NOT NULL,
  harvest INTEGER NOT NULL,
  coins_earned INTEGER NOT NULL,
  PRIMARY KEY (match_id, player_id)
);
