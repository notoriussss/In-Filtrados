# AGENTS.md

Guía para cualquier persona o asistente de IA (Claude Code, Codex, Copilot, Cursor) que trabaje en este repo. Léela antes de tocar código.

## El proyecto

**Bajo la Superficie**: juego multijugador tipo Among Us sobre las 3R aplicadas al agua, para la materia Computación en la Nube. Equipo de 5, entrega alrededor del 24 de octubre de 2026.
El *porqué* de todo está en `docs/architecture.md`; el *cómo* de cada tarea, en `docs/tasks.md`. Si este archivo y los docs no coinciden, mandan los docs y se corrige este archivo.

## Reglas que no se rompen

1. **Idioma:** solo el código va en inglés (carpetas, archivos, variables, tablas, eventos, mensajes gRPC, códigos de error, commits). La excepción es el nombre del proyecto, que va en español: `bajo-la-superficie`. **Todo lo que ve el jugador va en español:** el título del juego (*Bajo la Superficie*), los textos de la interfaz, los avisos y los mensajes de error que se muestran. La documentación y los comentarios para el equipo también van en español, con los nombres de código tal cual.
2. **El servidor manda.** `match` es la única autoridad del estado de la partida. `web` solo manda intenciones (dirección, acción) y dibuja lo que recibe. Nunca muevas lógica del juego al navegador.
3. **Database per Service.** `match` solo habla con `match-db` y `players` solo con `players-db`. Ningún servicio lee la base de otro: los datos se piden por gRPC o se escuchan como eventos.
4. **Contratos en un solo lugar.** gRPC en `proto/`, mensajes WebSocket en `messages/src/index.ts`, mapa en `shared/map.json`, eventos en `docs/tasks.md` 0.7. Nunca copies estos tipos dentro de un servicio. Para cambiarlos, usa la skill `change-contract`.
5. **Idempotencia.** Los consumidores de RabbitMQ toleran mensajes duplicados (llave por `event_id` o `(match_id, player_id)`) y hacen ack solo después de guardar.
6. **Todo servicio expone `GET /health`** con el formato de `docs/tasks.md` 0.2: 200 o 503, `checks` por dependencia y timeout de 1 s por revisión.
7. **Timeouts y reintentos** en toda llamada por red. El gateway envuelve sus clientes gRPC con Retry y Circuit Breaker.
8. **Configuración por variables de entorno**, nunca IPs ni contraseñas en el código. Los valores de ejemplo van en `.env.example`; `.env` y `lab.env` no se suben.

## Mapa del repo

| Carpeta | Stack |
|---|---|
| `web/` | TypeScript, canvas, Vite, nginx |
| `gateway/` | NestJS, `@grpc/proto-loader`, sin base de datos |
| `match/` | Go, gRPC, pgx + sqlc, una goroutine por sala sin mutex |
| `players/` | Rust: tokio, tonic, sqlx, lapin, argon2 y axum para `/health` |
| `monitor/` | Python, FastAPI |
| `proto/`, `messages/`, `shared/` | Contratos compartidos |
| `docs/` | Planes vigentes |

Puertos: `docs/tasks.md` 0.1. Despliegue en 5 laptops: `docs/deployment-lab.md`.

## Comandos por servicio

| Carpeta | Verificar antes del PR |
|---|---|
| `match/` | `go vet ./... && go test -race ./...` |
| `players/` | `cargo fmt --check && cargo clippy -- -D warnings && cargo test` |
| `gateway/`, `web/`, `messages/` | `npm run lint && npm test && npm run build` (desde la carpeta) |
| `monitor/` | `ruff check && pytest` |
| Todo | `docker compose up --build` desde cero levanta los contenedores sanos |

## CI/CD

- **CI** (`.github/workflows/ci.yml`): en cada PR y en cada push a `develop` y a `main`, corre los comandos de la tabla anterior solo para lo que cambió. Un cambio en `proto/`, `shared/` o en el propio `ci.yml` corre `match`, `players` y el job de Node. Un servicio que todavía no tiene proyecto (`go.mod`, `Cargo.toml` o `pyproject.toml`) se salta.
- **CD** (`.github/workflows/cd.yml`): apagado mientras Docker está pospuesto (pedido del profesor). Solo se puede lanzar a mano y no publica nada. Cuando vuelva Docker, se recupera la publicación de imágenes desde el commit f6b3ed1.

## Flujo de trabajo

- Rama por tarea con su id: `feat/S1-08-room-loop`, `fix/S2-03-vote-timeout`. Commits pequeños en inglés.
- **Ninguna carpeta tiene dueño:** todos trabajan en todo. Cualquiera puede tomar cualquier tarea y revisar cualquier PR.
- PR hacia `develop` (la rama de trabajo) con la plantilla, revisado por al menos otra persona del equipo y con CI en verde.
- "Listo" significa lo de `docs/tasks.md` 0.8: en `develop` por PR, al menos una prueba si hay lógica, `docker compose up --build` sigue funcionando y docs actualizados si cambió un acuerdo.
- No agregues dependencias, servicios ni patrones que no estén en `docs/architecture.md` sin hablarlo con el equipo.

## Skills del repo

Están en `.claude/skills/`. Cualquier asistente puede leerlas como instrucciones en Markdown.

| Skill | Cuándo |
|---|---|
| `start-task` | Empezar o cerrar una tarea de `docs/tasks.md`: rama, contexto, criterio de verificación y PR |
| `change-contract` | Cambiar `proto/`, `messages/`, `shared/map.json`, un evento de RabbitMQ, un puerto o `/health` |
| `review-pr` | Revisar el PR de un compañero |
