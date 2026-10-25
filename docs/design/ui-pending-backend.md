# Diseños sin soporte del servidor

Las maquetas de `docs/design/in-filtrados-ui-v3/` incluyen cuatro piezas
que el backend de hoy no soporta. La web ya trae lo que se puede hacer sin
servidor y deja el resto apagado, sin cambiar lo que ve el jugador.

## Qué está hecho

| Pieza | Estado |
| --- | --- |
| Ajustes (08-ajustes) | Hecho en la web: `screens/Settings.tsx`, `settings.ts`. Se abre desde el menú y desde la pausa; se guarda en `localStorage`. |
| Chat de la sala de espera | Componente listo y apagado: `screens/pending/RoomChat.tsx`. |
| Elegir color | Hecho: mensaje `pickColor` (`docs/tasks.md` 0.5) y `ChoiceGrid` en `Lobby.tsx` con `FEATURES.colorPicker` en `true`. |
| Elegir accesorio | Componente listo y apagado: `screens/pending/ChoiceGrid.tsx`. |
| Salas públicas | Componente listo y apagado: `screens/pending/PublicRooms.tsx`. |

Las banderas están en `web/src/features.ts` y valen `false`. Ponerlas en
`true` no activa nada por sí solo: falta el contrato de cada una.

## Ajustes: qué incluye y qué no

Incluye pantalla completa, alto contraste y reducir movimiento (la
preferencia del sistema es el valor inicial), más la lista de teclas en
solo lectura. Se dejó fuera lo que hoy no existe en el juego, para no
mostrar controles que no hacen nada: audio (no hay sistema de sonido),
escala de píxeles, FPS y ping, partículas, tamaño de texto, cambio de
teclas y subtítulos de sonidos. Cada uno vuelve a la pantalla cuando el
juego lo soporte.

## Contrato que falta por pieza

Todo cambio de contrato pasa por `messages/`, `proto/` y `shared/` con la
skill `change-contract`; el servidor sigue siendo la autoridad.

### Chat de la sala de espera
- Mensaje cliente → servidor `lobby_chat` con `clientMsgId` y `text`, solo
  en fase LOBBY. Mismos límites de largo y de frecuencia que el chat de
  reunión.
- Difusión servidor → clientes con `id`, `playerId`, `text` y la hora.
- Dónde se monta: `screens/Lobby.tsx`, columna central bajo la lista de
  jugadores, si `FEATURES.lobbyChat`.

### Elegir accesorio
- Mensaje `pick_accessory` y el campo `accessory` en la vista de cada
  jugador. Hoy `ui/Gota.tsx` lo deduce del color (`GOTA_ROSTER`); tendría
  que aceptar el accesorio como prop.
- Las 12 láminas están en `public/assets/characters/gota/accessories/`.
- Dónde se monta: `Lobby.tsx`, `ChoiceGrid` con `kind="accessory"`, si
  `FEATURES.accessoryPicker`.

### Salas públicas
- Al crear la sala, un campo `public`; un `GET /api/rooms/public` con
  código, anfitrión, jugadores, máximo y mapa de las salas abiertas en
  LOBBY.
- Dónde se monta: `screens/Join.tsx`, bajo el código, si
  `FEATURES.publicRooms`.
