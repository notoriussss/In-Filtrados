# web

Juego en el navegador (TypeScript + canvas con Vite), servido por su propio nginx en el puerto 8080. Solo dibuja lo que manda `match`; no decide nada.
Solo: `npm run dev -w web` (por ahora las flechas mueven la cámara). Con todo el sistema: `docker compose up --build web`.
El mapa se lee de `shared/map.json`; nunca se copia dentro de `web/`. Tareas: `docs/tasks.md`.
