# In-Filtrados · menús y pantallas (v3)

Maquetas estáticas 1920×1080 en HTML autocontenido (sin dependencias), en dos direcciones:
- **A-dia**: «Cuarto de bombas» (Impeccable), esmalte claro y madera.
- **B-noche**: «Consola de riego» (UI/UX Pro Max), panel oscuro con acentos aqua.

Usan los mapas v3 (Estación Manglar Verde, Planta Cuenca Clara), los personajes gota nuevos y el HUD v3. Reemplazan las pantallas antiguas de `ui-mockups`.

| N.º | Pantalla | Variantes (parámetro en la URL) |
|---|---|---|
| 01 | Carga | |
| 02 | Menú principal | |
| 03 | Acceso (nombre y servidor) | |
| 04 | Unirse con código | |
| 05 | Crear sala | |
| 06 | Sala de espera (personaje, jugadores, mapa, chat) | |
| 07 | Cómo jugar | |
| 08 | Ajustes | `?tab=audio|video|controles|acceso` |
| 09 | Revelación de rol | `?r=trip|inf` |
| 10 | Menú de pausa | |
| 11 | Estados de conexión (4 mensajes) | |
| 12 | Fin de partida | `?r=win|lose` |
| 13 | Expulsión | `?r=inf|no` |
| 14 | Reunión y votación | `?f=voto|res` |
| 15 | Monitor de servicios (datos de ejemplo) | |
| 16–17 | HUD de partida, ambos mapas | |

`png/` trae una captura de cada pantalla y variante; `index.html` las compara lado a lado.
