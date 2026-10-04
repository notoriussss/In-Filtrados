# players

Datos persistentes en Rust (tonic + sqlx + lapin): cuentas, monedas, progreso y ranking en PostgreSQL #2. Consume `match.finished` de forma idempotente.
Solo: `cargo run` (necesita `players-db` y `rabbitmq` arriba). Pruebas: `cargo test`.
Tareas: `docs/tasks.md`.
