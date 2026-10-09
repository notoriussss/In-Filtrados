# players

Datos persistentes en Rust (tonic + sqlx + lapin): cuentas, monedas, progreso y ranking en PostgreSQL #2. Consume `match.finished` de forma idempotente.
Solo: `cargo run` (necesita `players-db` y `rabbitmq` arriba). Pruebas: `cargo test`.

## Tests de integración

El CI no levanta PostgreSQL, así que los tests que tocan la base se omiten si no existe `TEST_DATABASE_URL`. Para correrlos con la base de prueba:

```bash
docker compose exec players-db createdb -U players_user players_test
TEST_DATABASE_URL=postgres://players_user:players_dev_password@localhost:5434/players_test \
  cargo test
```

La base `players_test` se crea una sola vez; los tests le aplican la migración solos.
Sin `TEST_DATABASE_URL` solo corren los tests unitarios de validación.

Tareas: `docs/tasks.md`.
