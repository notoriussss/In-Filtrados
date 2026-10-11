# monitor

Monitor en Python (FastAPI): consulta los `/health` de todos, escucha todos los eventos de RabbitMQ y muestra el panel.
Solo: `uvicorn app.main:app --reload --port 8000`. Pruebas: `pytest`.
Endpoints: `GET /` (panel), `GET /api/status` (salud), `GET /api/stats` (partidas activas, jugadores, partidas hoy y últimos 20 eventos de la cola `monitor.all`).
Tareas: `docs/tasks.md`.
