# gateway

API Gateway en NestJS: REST `/api/*` y WebSocket `/ws`, reenvía a `match` y `players` por gRPC con Retry y Circuit Breaker. No tiene base de datos.
Solo: `npm run start:dev -w gateway`. Con todo el sistema: `docker compose up --build gateway`.
Tareas: `docs/tasks.md`.
