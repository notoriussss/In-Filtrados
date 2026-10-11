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

-- name: UpsertSnapshot :exec
-- S3-02: guarda la última instantánea de la partida (una fila por partida).
INSERT INTO snapshots (match_id, tick, state, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (match_id) DO UPDATE
SET tick = EXCLUDED.tick, state = EXCLUDED.state, updated_at = now();

-- name: ListUnfinishedSnapshots :many
-- S3-02: partidas empezadas y sin terminar, para recrearlas al arrancar.
SELECT s.match_id, s.state
FROM snapshots s
JOIN matches m ON m.id = s.match_id
WHERE m.ended_at IS NULL;

-- name: InsertOutbox :exec
-- S3-03: un evento que RabbitMQ no confirmó.
INSERT INTO outbox (event_id, routing_key, payload)
VALUES ($1, $2, $3)
ON CONFLICT (event_id) DO NOTHING;

-- name: ListOutbox :many
-- S3-03: los pendientes más viejos primero.
SELECT id, event_id, routing_key, payload
FROM outbox
ORDER BY id
LIMIT $1;

-- name: DeleteOutbox :exec
DELETE FROM outbox WHERE id = $1;
