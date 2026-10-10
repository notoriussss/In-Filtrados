CREATE TABLE matches (
  id UUID PRIMARY KEY,
  room_code TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  winner TEXT CHECK (winner IN ('crew', 'impostor'))
);

CREATE TABLE participants (
  match_id UUID REFERENCES matches(id),
  player_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'crew',
  ejected BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, player_id)
);
