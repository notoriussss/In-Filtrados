-- Consultas de la semilla S1-11 (docs/tasks.md): guardar partidas y participantes.

-- name: CreateMatch :exec
INSERT INTO matches (id, room_code, started_at)
VALUES ($1, $2, now());

-- name: CreateParticipant :exec
INSERT INTO participants (match_id, player_id, display_name)
VALUES ($1, $2, $3);

-- name: FinishMatch :exec
UPDATE matches
SET ended_at = now(), winner = $2
WHERE id = $1;
