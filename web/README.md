# web

Juego en el navegador, servido por su propio nginx en el puerto 8080. Solo dibuja lo que manda `match`; no decide nada.

- **Pantallas y HUD:** componentes React (TSX) en `src/screens/` con el kit B-noche de `src/ui/` y `src/styles/`, maquetados en 1920 × 1080 como `docs/design/in-filtrados-ui-v3` y escalados a la ventana.
- **Mundo:** un `<canvas>` que dibuja `src/game/session.ts` (`GameSession`) con el código de `src/game/render/`: mapa Manglar Verde, sprites de Jimena, tanques, efectos, visión y animaciones de cada actividad. React lee el estado con `useSyncExternalStore`, nunca por cuadro.
- **Assets:** `public/assets/` (mapa, personajes, íconos y fondos). El mapa lógico se lee de `shared/map.json`; nunca se copia dentro de `web/`.

Solo: `npm run dev -w web`. Con todo el sistema: `docker compose up --build web`. Tareas: `docs/tasks.md`.
