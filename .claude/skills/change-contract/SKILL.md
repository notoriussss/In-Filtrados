---
name: change-contract
description: Use when changing anything shared between services - proto/*.proto, messages/src/index.ts, shared/map.json, a RabbitMQ event or queue, a port or env var, or the /health format. Lists every place that must change together and who must approve.
---

# Cambiar un contrato compartido

Un contrato roto rompe a otra persona sin que su CI lo note. Cambia todo en **un solo PR**.

| Si cambias | También actualiza | Aprueban |
|---|---|---|
| `proto/match.proto` | `match/gen.sh` y el código generado en `match/gen/` (se sube al repo); el cliente en `gateway/src/clients/` | A y C |
| `proto/players.proto` | `players` (recompila con `build.rs`); el cliente en `gateway/src/clients/` | B y C |
| `messages/src/index.ts` | Los usos en `web/` y `gateway/`; el ejemplo de `docs/tasks.md` 0.5 | C y D |
| `shared/map.json` (formato) | La carga en `match` y en `web`; `docs/tasks.md` 0.3 | A y D |
| Un evento o cola de RabbitMQ | El publicador en `match/internal/events/` y los consumidores en `players` y `monitor`; la tabla de `docs/tasks.md` 0.7 | A, B y E |
| Un puerto o variable de entorno | `docker-compose.yml`, `.env.example`, `docs/tasks.md` 0.1 y `docs/deployment-lab.md` | E y el dueño del servicio |
| El formato de `/health` | Los 5 servicios y el monitor; `docs/tasks.md` 0.2 | Todos |

## Reglas

- **Agrega, no rompas:** en un `.proto` nunca reutilices ni cambies el número de un campo; marca los viejos como `reserved`. En eventos, agrega campos opcionales en vez de renombrar.
- Todo evento lleva `event_id` (UUID) y se publica persistente en el exchange `game.events`.
- Avisa en el chat del equipo antes de hacer merge: los demás tienen que hacer `git pull` y regenerar.
- Verifica que compilen los consumidores: `cd match && go build ./...`, `cd players && cargo build` y `npm run build -w gateway`.
