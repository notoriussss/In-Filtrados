# shared

Datos que usan varios servicios. `map.json` (formato en `docs/tasks.md`, sección 0.3) lo lee `match` para las colisiones y `web` para dibujar.
No se copia dentro de ningún servicio: `match` y `web` se construyen con la raíz del repo como contexto de Docker.
