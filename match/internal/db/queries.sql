-- Consultas de la semilla S1-11 (docs/tasks.md): guardar partidas y participantes.

-- name: CreateMatch :exec
INSERT INTO matches (id, room_code, started_at)
VALUES ($1, $2, now());

-- name: CreateParticipant :exec
INSERT INTO participants (match_id, player_id, display_name, role)
VALUES ($1, $2, $3, $4);

-- name: FinishMatch :exec
UPDATE matches
SET ended_at = now(), winner = $2
WHERE id = $1;

-- name: InsertEvent :exec
-- S2-03: una fila de event_log (contaminar, limpiar o visitar un tanque).
INSERT INTO event_log (match_id, tick, player_id, kind, tank_slot)
VALUES ($1, $2, $3, $4, $5);

-- name: UpdateParticipantEjected :exec
-- S2-06: guardar si el participante fue expulsado al terminar la partida.
UPDATE participants
SET ejected = $3
WHERE match_id = $1 AND player_id = $2;

