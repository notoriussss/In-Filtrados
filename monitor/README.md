# monitor

Monitor en Python (FastAPI): consulta los `/health` de todos, escucha todos los eventos de RabbitMQ y muestra el panel.
Solo: `uvicorn app.main:app --reload --port 8000`. Pruebas: `pytest`.

Endpoints:
- `GET /`: el panel.
- `GET /api/status`: la salud de cada servicio.
- `GET /api/stats`: partidas activas, jugadores, partidas de hoy y los
  últimos 20 eventos de la cola `monitor.all`. Desde S2-13 también los
  litros ahorrados (total y por partida activa), las tareas por tipo
  (Reducir, Reutilizar, Reciclar) y las expulsiones acertadas y fallidas.

Tareas: `docs/tasks.md`.
