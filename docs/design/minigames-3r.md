# In-Filtrados: recomendaciones de minijuegos

Revisión de la propuesta de 4 minijuegos y otras ideas para completar el mapa. Entrega: 28 de octubre.

## Cómo está hoy

El mapa *Manglar Verde* tiene 12 estaciones, 4 por cada R, pero solo hay 3 minijuegos y se eligen por tipo de estación. Por eso cada R repite el mismo juego en sus 4 estaciones:

| R | Minijuego actual | Estaciones que lo usan |
|---|---|---|
| Reducir | Girar la válvula (mantener presionado) | `valve-1`, `valve-2`, `leak-1`, `leak-2` |
| Reutilizar | Arrastrar 3 cubetas de agua gris al tanque | `rain-1`, `rain-2`, `greywater-1`, `greywater-2` |
| Reciclar | Hacer clic en 4 partículas de suciedad | `filter-1`, `filter-2`, `compost-1`, `sorter-1` |

Añadir minijuegos le da mucha variedad al juego y es barato: solo toca `web/`. No cambia el servidor, ni `shared/map.json`, ni los contratos.

## Las 4 propuestas

| Minijuego | Veredicto | Por qué |
|---|---|---|
| **Conectar las tuberías** (Tuberías del ecopunto; antes Clasificar residuos) | ✅ Añadir | Clasificar basura no trataba del agua, y la versión "tratar el agua sucia" tampoco se entendía a simple vista. Un rompecabezas de tuberías se explica solo: el agua corre por donde el tramo está bien puesto. |
| **Regular la presión** (Válvula de riego) | ✅ Añadir | Barato, se entiende al instante y es de habilidad. Ningún juego actual es de "clic en el momento justo". Que la zona verde no quede demasiado pequeña al tercer acierto. Es Reducir porque una presión mal regulada desperdicia agua: cada error revienta la junta de la tubería y deja un charco que crece. |
| **Llenar sin derramar** (Lavadero) | ✅ Añadir, **pero como Reducir** | Llenar justo lo necesario es *no desperdiciar agua*, o sea Reducir, no Reutilizar. Moverlo a `valve-2` (Válvula de la estación solar). En el lavadero la etiqueta diría "Reutilizar" y no cuadraría. |
| **Calibrar el pluviómetro** (Cosecha de lluvia) | 🔁 Cambiar | Es un Simon con gotas de colores: es divertido, pero no enseña nada de reutilizar agua. Para la cosecha de lluvia es mejor **Primera lluvia** (abajo). |

## Ideas extra

### Primera lluvia (Reutilizar), en lugar del pluviómetro
**Estaciones:** `rain-1` y `rain-2`.

1. Caen gotas desde una canaleta del techo.
2. Las primeras salen **marrones** (lavan el polvo del techo); después salen **azules**.
3. Hay una compuerta con dos salidas: **Desvío** y **Barril**. Un clic la cambia de lado.
4. Las marrones deben ir al desvío y las azules al barril. Si entra una gota sucia al barril, este se vacía un poco.

**Se completa al:** juntar 6 gotas limpias en el barril.

Enseña algo real: el *desvío de primer lavado* que se usa en los sistemas de cosecha de lluvia.

### ¿Sirve para regar? (Reutilizar)
**Estación:** `greywater-2` (Agua gris del laboratorio).

1. Aparece un recipiente con agua y un dibujo de su origen: agua de lavar verduras, de enjuagar ropa, con aceite de cocina, con cloro.
2. El jugador lo arrastra a **Regar** o a **Tratar**.
3. Si falla, vuelve al centro.

**Se completa al:** acertar 4 recipientes. Es el mismo esquema de arrastre que *Clasificar residuos*, así que se reutiliza casi todo el código.

### Sellar la fuga (Reducir)
**Estación:** `leak-2` (Fuga del ecotaller).

1. Una tubería tiene grietas que se abren al azar y empiezan a soltar un chorro.
2. El jugador hace clic en cada grieta para ponerle cinta.
3. Si una grieta queda abierta mucho tiempo, aparece otra.

**Se completa al:** sellar 5 grietas.

### Jarra filtrante (Reciclar)
**Estación:** `compost-1` (Purificador de agua, en la sala de Compostaje y lombricultura).

1. Hay un balde de agua turbia, una jarra con filtro y un vaso.
2. Se arrastra el balde a la jarra; el agua baja por el filtro y abajo queda clara (1,5 s).
3. Se hace clic en la llave para llenar el vaso. Soltar el balde fuera de la jarra lo devuelve a su lugar.

**Se completa al:** llenar 2 vasos. Reemplaza al biofiltro de capas (grava, arena y carbón), que no se entendía sin explicación.

### Conectar las tuberías (Reciclar)
**Estación:** `sorter-1` (Tuberías del ecopunto).

1. Una cuadrícula de 4 × 3 casillas lleva tramos de tubería desordenados, de la fuente (izquierda) al tanque (derecha).
2. Cada clic gira un tramo un cuarto de vuelta. El agua avanza por los tramos que ya están bien y se queda goteando en el primero que no.
3. El recorrido sale al azar en cada partida y nunca empieza resuelto.

**Se completa al:** conectar la fuente con el tanque.

### Limpiar el arroyo (Reciclar)
**Estación:** `filter-2` (Arroyo del ecopunto; antes repetía Partículas de suciedad).

1. La basura (botella, bolsa, lata, bota) baja flotando por un canal hacia la reja de la toma de agua.
2. Se saca con un clic. La más cercana a la reja se marca en rojo; la que se cuela ensucia el agua, pero no resta.
3. La basura sigue llegando hasta juntar la cantidad pedida.

**Se completa al:** sacar 6 basuras.

## Cómo quedaría el mapa

| Estación | Minijuego | R |
|---|---|---|
| `leak-1` Fuga en la tubería | Girar la válvula (actual) | Reducir |
| `leak-2` Fuga del ecotaller | Sellar la fuga *(extra)* | Reducir |
| `valve-1` Válvula de riego | Regular la presión | Reducir |
| `valve-2` Válvula de la estación solar | Llenar sin derramar | Reducir |
| `rain-1` Colector de lluvia | Primera lluvia *(extra)* | Reutilizar |
| `rain-2` Cosecha de lluvia | Primera lluvia *(extra)* | Reutilizar |
| `greywater-1` Lavadero comunitario | Cubetas de agua gris (actual) | Reutilizar |
| `greywater-2` Agua gris del laboratorio | ¿Sirve para regar? *(extra)* | Reutilizar |
| `filter-1` Filtro de carrizo | Partículas de suciedad (actual) | Reciclar |
| `filter-2` Arroyo del ecopunto | Limpiar el arroyo *(extra)* | Reciclar |
| `compost-1` Purificador de agua | Jarra filtrante *(extra)* | Reciclar |
| `sorter-1` Tuberías del ecopunto | Conectar las tuberías | Reciclar |

Así cada R tiene 3 juegos distintos y ninguno se repite más de dos veces.

## Orden sugerido

1. Conectar las tuberías
2. Regular la presión
3. Llenar sin derramar
4. Primera lluvia
5. ¿Sirve para regar? (sale casi gratis después de Clasificar residuos)
6. Sellar la fuga
7. Jarra filtrante y limpiar el arroyo

Los 4 primeros son la meta; el resto, si sobra tiempo.

## Notas técnicas

- **Dónde va el código:** lógica en `web/src/game/tasks/minigames.ts` (cada juego implementa la interfaz `Minigame`), dibujo en `minigameDraw.ts` y el panel en `web/src/screens/game/Minigame.tsx`. El tablero mide 360 × 260 (`BOARD`).
- **Elegir por estación, no por tipo:** hoy `createMinigame(type)` recibe solo el tipo. Hay que pasarle también el id de la estación desde `Minigame.tsx` y elegir el juego por id, dejando el juego actual de cada tipo como respaldo.
- **Mínimo de 3 segundos:** el servidor rechaza una tarea completada en menos de 3 s (`taskMinTicks` en `match/internal/room/state.go`). Ningún juego nuevo debe poder ganarse más rápido, ni siquiera por alguien muy hábil; si no, la tarea queda sin contar sin que el jugador sepa por qué.
- **Duración:** entre 3 y 8 segundos. Más largo deja al jugador expuesto al Contaminador demasiado tiempo.
- **Sin instrucciones escritas:** los juegos actuales usan una mano animada (👆) que señala qué hacer. Seguir ese estilo.
- **Controles:** la tecla E solo abre la tarea; dentro del minijuego todo es con el mouse (clic o arrastrar), igual que los actuales.
- **Reglas del repo:** cualquier texto que vea el jugador va como constante (en `web/src/constants.ts`, junto a `TASK_TEXT`), líneas de máximo ~80 caracteres y al menos una prueba por juego en `minigames.test.ts`.
