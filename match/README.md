# match

Motor autoritativo de la partida en Go: una goroutine por sala, ticker a 20 Hz, instantáneas en PostgreSQL #1 y eventos a RabbitMQ.
Solo: `go run ./cmd/match` (necesita `match-db` y `rabbitmq` arriba). Pruebas: `go test -race ./...`.
Tareas: `docs/tasks.md`.
