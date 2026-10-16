# In-Filtrados · paquete de assets v3

Todo lo necesario para implementar el juego: mapas, personajes, HUD, kit de interfaz, iconos, logo, fondos, fuentes, tokens y las 17 pantallas de referencia. El estilo de interfaz tiene dos direcciones intercambiables: **A · día** («Cuarto de bombas»: madera, esmalte y vidrio) y **B · noche** («Consola de riego»: paneles oscuros con acentos aqua). Elige una; las carpetas `A-dia` y `B-noche` son paralelas y los nombres de archivo coinciden.

## Estructura

| Carpeta | Contenido |
|---|---|
| `mapas/ecologico-manglar-verde/` y `mapas/planta-cuenca-clara/` | Por mapa: `mapa-completo.png` (+ noche), `capas/` (suelo, objetos, luz de noche), `props/` (sprites, atlas y `props.json`), `tanques/` (11 niveles + atlas), `map.json` (contrato del servidor), `mapa.tmj` (Tiled), miniaturas y capturas de depuración. Detalle en `mapas/LEEME-mapas.md`. |
| `personajes/` | `hojas/` (cuerpos por color, accesorios, jugadores de ejemplo, sombra, `indice.json`), `retratos/`, `catalogo/`, `recetas/`, `codigo/in-filtrados-personajes.js` (+ `README-uso.md`) y `editor/editor-personajes.html`. |
| `hud/piezas/` | PNG transparentes del HUD por estilo y mapa: tareas, alerta de emergencia, laguna (nivel y pureza), minimapa, rol y cubeta, barra de acciones y sus tres botones (Usar, Reportar, Chat), etiquetas de jugador, tecla. `manifest.json` trae tamaño y posición (x, y) de cada pieza en el lienzo de 1920×1080. |
| `hud/cuadros-de-camara/` | Mapa con los jugadores sin HUD (1920×1080) y minimapas; `hud/referencia/` tiene la composición final en PNG y HTML. |
| `ui/componentes/` | 78 componentes por estilo, PNG transparentes: botones (pri, def, sec, dan, amber × normal, hover, active, disabled; versión pequeña), paneles (claro, oscuro, madera), pozos, chips, medidores (agua, hoja, ámbar, alerta × 0, 50, 100 %), campo de texto (normal y foco), interruptor, deslizador, selector, pestañas, opciones, tarjetas, ranuras de jugador, muestras de color, accesorio, tecla, código de sala, píldora, tablón, marco de imagen. |
| `ui/iconos/` | 27 iconos de 12×12 px en 9 paletas (water, leaf, amber, coral, light, ink, dark, wood, predeterminada): `x1/<paleta>/`, `x4/<paleta>/` y `atlas-iconos.png/json` (una fila por icono, una columna por paleta). |
| `ui/logo/` | Logo «In-Filtrados» con y sin los lemas Reducir, Reutilizar, Reciclar, a 1× y 2×. |
| `ui/fondos/` | Fondo del menú (`hero-*`), vistas de cada mapa con jugadores (`eco-*`, `planta-*`), versiones desenfocadas para fondos de pantalla, mapas a 1024 px y miniaturas, de día y de noche. |
| `ui/fuentes/` | Pixelify Sans (A), Silkscreen, Press Start 2P y VT323 (B) en `woff2`, `fonts.css` y licencias OFL. |
| `ui/css/` | `in-filtrados-ui-A.css` y `-B.css` (todos los componentes en CSS), `tokens-A.css`, `tokens-B.css` y `tokens.json` (colores, tamaños, tipografía, colores de servidor). |
| `ui/js/` | `in-filtrados-ui-runtime.js`: dibuja iconos y personajes en `<canvas>` (`data-icon`, `data-gc`, `data-pt`). |
| `ui/ejemplo-css.html` | Página mínima que usa el CSS, las fuentes y el runtime (`?skin=A` o `?skin=B`). |
| `pantallas/` | Las 17 pantallas en HTML y las 48 capturas (`png/`, con variantes de ajustes, rol, resultado, expulsión y reunión); `index.html` compara A y B. |

## Cómo usarlo

**Interfaz web (recomendado).** Enlaza `ui/fuentes/fonts.css` y `ui/css/in-filtrados-ui-A.css` (o B); las clases (`btn pri`, `panel`, `chip ok`, `gauge leaf`, `slot`, `tog`, `sld`, `seg`…) son las mismas que usan las pantallas de `pantallas/`. El diseño está pensado para un lienzo de 1920×1080 que se escala con `transform` a la ventana. Los iconos y personajes se dibujan con el runtime.

**Motor de juego con sprites.** Los PNG de `ui/componentes/` y `hud/piezas/` tienen 18 px de margen transparente alrededor de cada pieza (sombras y contornos caen dentro). Para 9-slice, usa el valor `nueve_cortes_px` de `ui/componentes/manifest.json` (margen + 10 px) medido desde el borde del PNG; los botones, paneles, pozos, campos, tarjetas, ranuras y medidores estiran bien. Los componentes se exportan sin texto: compón la etiqueta encima con la fuente del estilo.

**Pixel art.** Escala siempre con vecino más cercano (`image-rendering: pixelated`, sin suavizado). Los iconos son de 12×12 y se usan a ×3 o ×4; los personajes, a ×2 en el mapa (cámara de 960×540 unidades) y a ×3 o más en menús.

**Orden de profundidad.** Jugadores y props se ordenan por `baseY = y + 6`. El ancla del personaje es (20, 46) dentro de su celda de 40×56; los pies quedan en la fila 52. En menús, apoya la sombra (`hojas/sombra.png`) bajo los pies.

**Mapas.** `map.json` mantiene las claves del servidor (`width, height, spawn, walls, zones, stations, tanks`) más extras (`doors, markers, ductos`). Los 12 puestos de tareas 3R (4 Reducir, 4 Reutilizar, 4 Reciclar) y los 10 tanques ya están ubicados.

## Notas

- Los textos de los PNG del HUD son de ejemplo («Laguna», «Día 2», «Tanque 8»…); para producción, reconstruye esos paneles con el CSS o compón el texto sobre el panel vacío del kit.
- Los datos del monitor de servicios son de ejemplo.
- Fuentes bajo SIL Open Font License 1.1.
