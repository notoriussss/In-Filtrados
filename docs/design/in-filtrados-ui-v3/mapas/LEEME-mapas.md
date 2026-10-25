# In-Filtrados — mapas alternativos compactos (v3)

Dos propuestas nuevas, pensadas para que la partida sea más llevadera (referencia: el mapa de Among Us). Los personajes son los mismos de la v2 (carpeta `personajes/` de `assets-in-filtrados-v2`); aquí solo cambian los mapas. Idioma de la UI: español.

| Mapa | Carpeta | Tamaño (u = px) | Tiles | Área vs. v2 (4096×3072) |
|---|---|---|---|---|
| **Estación Manglar Verde** (nuevo, ecológico) | `mapa-ecologico/` | 2752 × 1824 | 86 × 57 | −60 % |
| **Planta Cuenca Clara compacta** (v2 rehecha) | `planta-compacta/` | 3008 × 2048 | 94 × 64 | −51 % |

Recorrido más corto: el mapa eco es ~33 % más angosto y ~41 % más bajo que la v2; la planta compacta, ~27 % y ~33 %.

## 1. Estación Manglar Verde (ecológico)
Bioestación sobre una laguna. El **malecón** de madera rodea la laguna y es el pasillo principal; en el centro hay un **mirador** (isla con la mesa de reuniones) conectado por dos puentes, que funcionan como cuellos de botella. Alrededor, diez salas con forma irregular: Vivero, Laboratorio de biodiversidad, Estación solar, Patio de cisternas, Casa de bombeo solar (rueda hidráulica), Ecotaller, Humedal, Compostaje y lombricultura, Ecopunto y Apiario.
Suspenso: dos **túneles de raíces** (oscuros, 2 tiles de ancho) como atajos — Ecotaller ⇄ Humedal y Estación solar ⇄ Cisternas — más los puentes del mirador, los bordes de la laguna y los patios con maleza entre salas.

| Tipo | Estaciones |
|---|---|
| Reducir | `leak-1` Casa de bombeo · `leak-2` Ecotaller · `valve-1` Apiario (riego) · `valve-2` Estación solar |
| Reutilizar | `rain-1` Cisternas · `rain-2` Vivero · `greywater-1` Ecotaller (lavadero) · `greywater-2` Laboratorio |
| Reciclar | `filter-1` Humedal · `filter-2` y `sorter-1` Ecopunto · `compost-1` Compostaje |

Marcadores: `reunion` (mesa del mirador), `monitor` (consola del laboratorio). Spawn: mirador. Tanques: uno por sala (10 salas, 10 tanques) para que no se sepa quién los daña de un vistazo; el orden de los lugares (`slot`) reparte a los primeros jugadores lejos entre sí. En `ground.png` solo queda la base de concreto de los tanques que existen.

## 2. Planta Cuenca Clara compacta
Misma identidad que la v2 pero con silueta orgánica (esquinas cortadas, patios interiores con pasto, bordes redondeados) y un plano de anillos y pasillos en vez de una cuadrícula: cafetería central octogonal, pasillos de 3 tiles en lazo, laboratorio, sala de control, cloración, casa de máquinas, bombas, cisterna, filtros, reciclaje, sala de tanques (2 columnas × 5) e invernadero.
Suspenso: **ducto oeste** (Bombas ⇄ Máquinas) y **ducto este** (Control ⇄ Invernadero, 24 tiles de largo), pasillos con columnas y puntos ciegos.

| Tipo | Estaciones |
|---|---|
| Reducir | `leak-1` Bombas · `leak-2` y `valve-2` Máquinas · `valve-1` Cloración |
| Reutilizar | `rain-1` Cisterna · `rain-2` Invernadero · `greywater-1` Cafetería · `greywater-2` Laboratorio |
| Reciclar | `filter-1` Filtros · `filter-2` y `sorter-1` Reciclaje · `compost-1` Invernadero |

Marcadores: `reunion` (mesa de la cafetería), `monitor` (sala de control).

## Contenido de cada carpeta (`<mapa>/mapa/`)
- `mapa-completo.png`, `mapa-completo-noche.png`, `vista-previa-1024.png`, miniaturas, `mapa-debug-contrato.png` (colisiones, zonas, puertas, estaciones y tanques sobre el arte).
- `capas/suelo.png` (piso, paredes, decoración mural, tapetes), `capas/objetos.png`, `capas/luz-noche.png` (multiplicar sobre el mapa).
- `props/` sprites sueltos + `atlas-props.png/json` + `props.json` (posición y `baseY` para ordenar por profundidad con los jugadores: `y + 6`).
- `tanques/` 11 niveles (0–100 %) + atlas.
- `map.json` (contrato v3), `mapa.tmj` (Tiled), `mapa-demo-*.png` (jugadores sobre el mapa, de día y de noche).

## Contrato `map.json` (v3)
Mantiene las claves del servidor: `width, height, spawn, walls, zones, stations, tanks`. Extras: `tile, tiles, markers, doors, ductos, verificacion, playerRadius`. `walls` incluye paredes **y** la laguna/exterior (el borde irregular ya está recortado como rectángulos) más muebles y maquinaria (`kind: wall | prop`). Hay 12 estaciones (4 reducir / 4 reutilizar / 4 reciclar) y 10 slots de tanque con `draw` (esquina del sprite).
Verificación automática (celdas de 16 px, jugador de radio 15): todas las estaciones, tanques y puertas son alcanzables desde el spawn; 0 avisos de plano y 0 de props.

## Pendiente de tu lado
- Cambiar `shared/map.json` y los colores/slots en el cliente (el contrato es compatible; solo cambian dimensiones y coordenadas).
- Las pantallas de UI de las entregas anteriores siguen usando el mapa v1; si eliges una de estas dos propuestas, se pueden regenerar.
