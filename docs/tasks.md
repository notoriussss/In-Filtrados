# In-Filtrados: tareas detalladas

Cada tarea dice **qué archivos tocar, qué construir paso a paso y cómo se verifica que está terminada**.
Complementa a `team-plan.md` (cómo se organiza el equipo y cuándo) y a `architecture.md` (por qué).
Fecha: 3 de octubre de 2026.

> Nadie es dueño de una carpeta: todos trabajan en todo y cada quien toma la siguiente tarea libre. Código en inglés; documentación en español.
> Cada tarea tiene un id (`S1-08`). Úsenlo en el nombre de la rama y del PR: `feat/S1-08-room-loop`.

---

## 0. Acuerdos comunes (léanlos antes de empezar)

Estos valores los usan varias tareas. Si alguien necesita cambiarlos, se cambia aquí primero y se avisa al equipo.

### 0.1 Puertos

| Servicio | Puerto interno | Puerto en tu máquina | Para qué |
|---|---|---|---|
| `web` (nginx) | 80 | **8080** | El juego. Hace proxy de `/api` y `/ws` al gateway |
| `gateway` | 3000 | 3000 | REST `/api/*` y WebSocket `/ws` |
| `match` | 50051 (gRPC), 8081 (HTTP) | 8081 | gRPC y `/health` |
| `players` | 50052 (gRPC), 8082 (HTTP) | 8082 | gRPC y `/health` |
| `monitor` | 8000 | 8000 | Panel y `/health` |
| `match-db` (PostgreSQL) | 5432 | 5433 | Base de datos de `match` |
| `players-db` (PostgreSQL) | 5432 | 5434 | Base de datos de `players` |
| `rabbitmq` | 5672, 15672 | 5672, 15672 | Broker y su consola web |

Como nginx reenvía `/api` y `/ws` al gateway, **el navegador solo conoce `http://localhost:8080`**: no hay problemas de CORS y se demuestra el patrón API Gateway.

### 0.2 Formato de `/health` (los 5 servicios)

`GET /health` responde **200** si todo está bien y **503** si falla alguna dependencia:

```json
{
  "status": "ok",
  "service": "match",
  "checks": { "db": "ok", "rabbitmq": "ok" }
}
```

Con una dependencia caída: `"status": "degraded"` y en `checks` el valor `"fail: <motivo corto>"`.

### 0.3 Mapa compartido

El mapa vive en **`shared/map.json`** (carpeta nueva en la raíz). Lo usan `match` para las colisiones y `web` para dibujar. Mundo de **1600 × 1200 unidades**, origen arriba a la izquierda.

```json
{
  "width": 1600,
  "height": 1200,
  "spawn": { "x": 800, "y": 600 },
  "walls": [ { "x": 0, "y": 560, "w": 700, "h": 40 } ],
  "zones": [ { "id": "plaza", "name": "Plaza central", "x": 650, "y": 450, "w": 300, "h": 300, "color": "#d9c27a" } ],
  "stations": [ { "id": "leak-1", "type": "reduce", "x": 200, "y": 900 } ],
  "tanks": [ { "slot": 0, "x": 620, "y": 1050 } ]
}
```

- `walls`: rectángulos que no se pueden atravesar. El canal es una pared con 3 huecos, que son los puentes.
- `stations`: dónde se hacen las tareas (`reduce`, `reuse`, `recycle`). Se usan desde la semana 2.
- `tanks`: los tanques de riego de cada jugador, por número de lugar (`slot`, de 0 a 9 para hasta 10 jugadores). Se usan desde la semana 2.

**Mapa v3: Estación Manglar Verde (S3-05).** Desde el paquete de diseño `docs/design/in-filtrados-ui-v3`, el mapa mide **2752 × 1824 unidades** (losas de 32) y suma campos sin romper los anteriores:

- `id`, `name`, `tile`, `playerRadius`: datos generales del mapa.
- `stations[].name`, `room` y `radius`: nombre visible, sala y alcance propio de cada estación (si falta `radius`, se usa el de `match`).
- `tanks[].draw`: esquina del sprite del tanque; `x, y` siguen siendo el punto de interacción.
- Un tanque por sala (10 salas, 10 tanques) y cada uno lleva su pared de 72×44 en `(x-36, y-24)` dentro de `walls`; si lo mueves, mueve también esa pared y la base de concreto de `ground.png`.
- `fixPoints`: `{ id, kind: 'pipe' | 'steam', room, x, y }`, los puntos donde se arreglan los sabotajes (2 extremos de tubería y 1 válvula de vapor).
- `zones[].kind/theme`, `doors` y `markers`: solo para dibujar y nombrar salas; `match` no los usa.
- Las imágenes del mapa (suelo, props, tanques, luz nocturna y minimapa) viven en `web/public/assets/map/manglar-verde/`; `walls` sigue siendo la única fuente de colisiones.

### 0.4 Reglas de movimiento

- Ticker a **20 Hz** (cada 50 ms).
- Velocidad: **200 unidades por segundo**, o sea 10 unidades por tick.
- El cliente solo manda la **dirección** (`dx`, `dy` entre -1 y 1). El servidor mueve, nunca el cliente.
- Radio del personaje: 16 unidades.

### 0.5 Mensajes WebSocket (`messages/src/index.ts`)

```ts
// Navegador → gateway
export type ClientMessage =
  | { type: 'join'; matchId: string; lastTick: number }   // primer mensaje al conectar
  | { type: 'move'; dx: -1 | 0 | 1; dy: -1 | 0 | 1 }
  | { type: 'start' };                                     // solo el creador; match lo valida

// Gateway → navegador
export type ServerMessage =
  | { type: 'snapshot'; tick: number; phase: Phase; players: PlayerView[] }
  | { type: 'error'; code: ErrorCode; message: string };

export type Phase = 'LOBBY' | 'PLAYING' | 'MEETING' | 'ENDED';
export type PlayerView = {
  id: string; name: string; color: string;
  x: number; y: number; connected: boolean; alive: boolean;
};
export type ErrorCode = 'UNAUTHORIZED' | 'MATCH_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'BAD_MESSAGE';
```

En la semana 2 se agregan mensajes; se agregan aquí, nunca se duplican en `web` o `gateway`.

**Contrato v1 (S2-01).** Se suman sin romper lo anterior; el archivo completo está en `messages/src/index.ts` y su espejo gRPC en `proto/match.proto`:

```ts
// Navegador → gateway (además de join, move y start)
  | { type: 'interact'; stationId: string; completed?: boolean } // tarea
  | { type: 'interact'; tankSlot: number }                        // ya no hace nada: los tanques no se limpian
  | { type: 'contaminate'; tankSlot: number }                     // solo el impostor
  | { type: 'report'; tankSlot: number }                          // tanque muerto
  | { type: 'vote'; targetPlayerId: string | null }               // null = saltar
  | { type: 'chat'; clientMsgId: string; text: string }           // solo en MEETING

// Gateway → navegador
  | { type: 'matchEnded'; winner: 'crew' | 'impostor'; impostorIds: string[] }

// Campos nuevos del snapshot
tanks: { slot, ownerId, contamination /* 0 a 100 */, dead }[];
reservoir: number;                 // 0 a 100
myRole: 'NO_ROLE' | 'CREW' | 'IMPOSTOR'; // solo el del destinatario
myTaskProgress: { completed, total };
meeting: { reporterId, tankSlot, votesCast[], endsAtTick, votingClosed, ejectedId, wasImpostor } | null;
chat: { id, playerId, text, tick }[]; // últimos 30
oilDrops: { x, y, color, expiresAtTick }[]; // S2-12: rastro del impostor
paused: boolean;                   // S3-02: el host está en su periodo de gracia
waitingFor: string[];              // S3-02: ids de quienes se esperan
myTasks: { stationId, done }[];    // S2-11: solo las del destinatario
myActiveTask: string | null;       // S2-11: tarea iniciada por el servidor
```

**Heartbeat (`deployment-lab.md`, 9.1).** Solo entre el navegador y el gateway; nunca llega a `match`:

```ts
// Navegador → gateway, cada 2 s
  | { type: 'ping' }
// Gateway → navegador, en cuanto llega el ping
  | { type: 'pong' }
```

- El navegador da la conexión por caída si pasan 5 s sin recibir nada (ni `pong` ni snapshots) y reconecta con la espera de siempre; también si el WebSocket no abre en 5 s.
- El gateway corta (`terminate`) el WebSocket que pasa 5 s sin mandar nada: así `match` se entera de que el jugador se fue aunque la conexión TCP quede abierta a medias.

- `myRole`, `myTasks` y `myActiveTask` viajan **solo en el snapshot de su dueño**: `match` arma un snapshot por jugador y el gateway nunca recibe el rol ni las tareas de otro.
- `votesCast` dice quién ya votó, nunca por quién.
- `impostorIds` es una lista porque con 7 o más jugadores hay 2 impostores.

**Contrato S3-05 (sabotajes).** También se suma sin romper lo anterior:

```ts
// Navegador → gateway
  | { type: 'sabotage'; kind: 'pipe' | 'steam' } // solo el impostor
  | { type: 'fix'; pointId: string }               // un fixPoint del mapa

// Campos nuevos del snapshot
emergency: { kind, endsAtTick, heldPoints[] } | null; // igual si fue sabotaje o aleatoria
mySabotage: { readyAtTick, pipesLeft } | null;        // solo en el snapshot del impostor
players[].activity: 'reduce' | 'reuse' | 'recycle' | 'tank' | 'fix' | null; // para animar
```

- `emergency` no dice si la provocó el impostor: una emergencia aleatoria se ve idéntica.
- `activity` solo se manda para jugadores vivos; con ella cada cliente anima lo que hacen los demás.

**Elegir color en la sala.** También se suma sin romper lo anterior (en gRPC, `PickColor pick_color = 11` dentro de `ClientAction`):

```ts
// Navegador → gateway
  | { type: 'pickColor'; color: string } // solo en LOBBY
```

- `match` sigue asignando un color al entrar. Acepta el cambio solo si es uno de los 8 colores y ningún otro jugador **conectado** lo tiene; si no, lo ignora. El color nuevo llega a todos en el siguiente snapshot.

**Tienda: personaje y accesorio.** También se suma sin romper lo anterior (en gRPC, `PickSkin pick_skin = 13` y `SetOwned set_owned = 14` dentro de `ClientAction`, `repeated string owned = 4` en `Join` y `string skin = 10` en `PlayerView`):

```ts
// Navegador → gateway
  | { type: 'pickSkin'; skin: string }   // 'jimena' o 'gota', solo en LOBBY
  | { type: 'pickAccessory'; accessory: string } // 'none' lo quita
  | { type: 'refreshShop' }              // tras comprar en otra pestaña

// Campo nuevo del snapshot
players[].skin: 'jimena' | 'gota';       // 'jimena' es el personaje de inicio
```

- Los personajes de **Jimena** son gratis y vienen de inicio. Las **gotas** (una por color, id `gota-<color sin #>`, como `gota-e6194b`) y los **accesorios** (id como `cap`) solo se usan si el jugador los compró en la tienda.
- `match` no se fía del navegador: el **gateway** le pregunta a `players` qué tiene comprado y se lo pasa en `Join.owned` (y en `SetOwned` tras un `refreshShop`). `match` acepta `pickSkin: 'gota'` solo si el jugador tiene la gota de su color actual, y `pickAccessory` solo si tiene ese accesorio. Si cambia a un color cuya gota no compró, vuelve a Jimena.
- Los accesorios sirven para **cualquier** personaje, el de Jimena o la gota. Los de Jimena no son una capa encima: `web/tools/gen_jimena_sprites.py` mide la rejilla de píxeles de cada cuadro (`web/tools/jimena_grid.json`), dibuja el accesorio en esa misma rejilla y deja al personaje completo en una hoja de 14 cuadros por color y accesorio, `web/public/assets/characters/jimena/baked/<Color>-<accesorio|none>.png` (con margen alrededor, porque lo puesto sobresale del cuadro). Si se cambia un accesorio o un cuadro de Jimena hay que volver a correr el script. Cada jugador lleva un accesorio a la vez.

### 0.6 REST del gateway

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/auth/register` | `{ username, password }` | `201 { playerId, username }` |
| `POST /api/auth/login` | `{ username, password }` | `200 { token, playerId, username }` |
| `GET /api/me` | — (header `Authorization: Bearer <token>`) | `200 { playerId, username, coins, matchesPlayed, wins, timesImpostor, winsAsImpostor }` (las dos últimas desde S2-07) |
| `GET /api/shop` | — | `200 { coins, items: [{ id, kind: 'character' \| 'accessory', price, owned }] }` (tienda: lo que se compra con monedas) |
| `POST /api/shop/buy` | `{ itemId }` | `200` igual que `GET /api/shop`, con la compra hecha. `404` si el artículo no existe, `409` si ya lo tiene o no le alcanzan las monedas |
| `GET /api/ranking` | — | `200 { entries: [{ playerId, username, matchesPlayed, wins, timesImpostor, winsAsImpostor, harvest, coinsEarned, litersSaved }] }`: todos los jugadores (hasta 100), de más a menos victorias; a igualdad, menos partidas y luego el nombre. `harvest` (puntos de cosecha), `coinsEarned` y `litersSaved` (litros que sus tareas sumaron al embalse) suman todas sus partidas; las partidas de antes de `litersSaved` cuentan 0 |
| `POST /api/rooms` | — | `201 { roomCode, matchId }` |
| `POST /api/rooms/:roomCode/join` | — | `200 { roomCode, matchId }` |

El WebSocket se abre en `/ws?token=<token>`.

### 0.7 Eventos en RabbitMQ

- Exchange **`game.events`**, tipo `topic`, **durable**.
- Mensajes **persistentes** (`delivery_mode = 2`) en JSON, con `event_id` (UUID) en todos.

| Routing key | Lo publica | Contenido |
|---|---|---|
| `match.started` | `match` | `{ event_id, match_id, room_code, started_at, player_ids[] }` |
| `match.finished` | `match` | `{ event_id, match_id, finished_at, winner: "crew" \| "impostor", players: [{ player_id, role, ejected, harvest, liters_saved }] }` (`liters_saved` es opcional: los eventos anteriores no lo traen y cuentan 0) |
| `task.completed` | `match` (semana 2) | `{ event_id, match_id, player_id, task_type, liters_saved }` |
| `player.ejected` | `match` (semana 2) | `{ event_id, match_id, player_id, was_impostor }` |
| `player.disconnected` | `match` (S3-04) | `{ event_id, match_id, player_id, display_name, grace_seconds, grace_ends_at, at }` |
| `player.reconnected` | `match` (S3-04) | `{ event_id, match_id, player_id, display_name, at }` |

`at` (RFC 3339 con nanosegundos) ordena la desconexión y la reconexión de un mismo jugador aunque lleguen al revés. El monitor los usa para mostrar quién está en periodo de gracia y su cuenta regresiva.

| Cola (durable) | Enlazada a | La consume |
|---|---|---|
| `players.match-finished` | `match.finished` | `players` |
| `monitor.all` | `#` (todo) | `monitor` |

### 0.8 Listo significa (vale para todas las tareas)

Una tarea solo está terminada cuando, además de su criterio de verificación:
1. Está en `main` por PR, revisado por alguien que no lo escribió, con el CI en verde.
2. Tiene al menos una prueba automática si tiene lógica (un `if`, un ciclo o un cálculo).
3. `docker compose up --build` desde cero sigue levantando todo.
4. Si cambió un acuerdo de esta sección, el documento se actualizó en el mismo PR.

---

## 1. Semana 1 (3 al 9 de octubre)

### Sábado y domingo: la base

#### S1-01 — Monorepo base

**Por qué:** todos necesitan clonar lo mismo el sábado en la tarde para empezar en paralelo.

**Pasos:**
1. Crear el repo `in-filtrados` en GitHub e invitar a los 5. Proteger `main`: PR obligatorio, 1 aprobación y CI en verde.
2. Crear todas las carpetas de `architecture.md` sección 7, más `shared/`. Cada carpeta de servicio lleva un `README.md` de 3 líneas: qué es y cómo correrlo solo. Ninguna carpeta tiene dueño.
3. `package.json` en la raíz con `"workspaces": ["web", "gateway", "messages"]` y el paquete `messages` llamado `@in-filtrados/messages`, con `src/index.ts` exportando los tipos de la sección 0.5.
4. `.gitignore` para Node, Go, Rust y Python (`node_modules/`, `target/`, `__pycache__/`, `.env`).
5. `.github/pull_request_template.md` con la lista de "Listo" de la sección 0.8.
6. `README.md` raíz con: requisitos (Docker, Node 20, Go 1.22, Rust estable, Python 3.12), `cp .env.example .env` y `docker compose up --build`.

**Criterio de verificación:** cualquier persona del equipo clona el repo en una máquina limpia, corre `npm install` en la raíz sin errores y puede importar `@in-filtrados/messages` desde `gateway/` y `web/`. Un push directo a `main` es rechazado por GitHub.

---

#### S1-02 — Contratos gRPC v0

**Por qué:** `match`, `players` y `gateway` no pueden hablarse sin el contrato, y es lo que más bloquea.

**Archivos:** `proto/match.proto`, `proto/players.proto`, `match/gen/` (generado), `players/build.rs`.

**Pasos:**
1. `proto/match.proto`:
   ```proto
   syntax = "proto3";
   package match.v1;
   option go_package = "github.com/<org>/in-filtrados/match/gen/matchv1";

   service Match {
     rpc CreateRoom(CreateRoomRequest) returns (Room);
     rpc JoinRoom(JoinRoomRequest) returns (Room);
     rpc Play(stream ClientAction) returns (stream ServerEvent);
   }

   message CreateRoomRequest { string player_id = 1; string display_name = 2; }
   message JoinRoomRequest  { string room_code = 1; string player_id = 2; string display_name = 3; }
   message Room { string room_code = 1; string match_id = 2; }

   message ClientAction {
     oneof action {
       Join join = 1;   // siempre el primer mensaje del stream
       Move move = 2;
     }
   }
   message Join { string match_id = 1; string player_id = 2; int64 last_tick = 3; }
   message Move { int32 dx = 1; int32 dy = 2; }

   message ServerEvent {
     oneof event {
       Snapshot snapshot = 1;
       Error error = 2;
     }
   }
   enum Phase { LOBBY = 0; PLAYING = 1; MEETING = 2; ENDED = 3; }
   message Snapshot { int64 tick = 1; Phase phase = 2; repeated PlayerView players = 3; }
   message PlayerView {
     string id = 1; string name = 2; string color = 3;
     float x = 4; float y = 5; bool connected = 6; bool alive = 7;
   }
   message Error { string code = 1; string message = 2; }
   ```
2. `proto/players.proto` con `Register`, `Login`, `ValidateToken` y `GetProfile`. `Login` devuelve `{ token, player_id, username }`; `ValidateToken` recibe `{ token }` y devuelve `{ player_id, username }` o el error gRPC `UNAUTHENTICATED`.
3. Go: script `match/gen.sh` que corre `protoc --go_out --go-grpc_out` hacia `match/gen/matchv1/`. El código generado **se sube al repo**, así el CI no necesita `protoc`.
4. Rust: `players/build.rs` con `tonic_build::compile_protos("../proto/players.proto")`.
5. NestJS no genera nada: carga los `.proto` con `@grpc/proto-loader` al arrancar.

**Criterio de verificación:** `cd match && go build ./...` y `cd players && cargo build` compilan usando los tipos generados. Al menos dos personas más aprobaron el PR del `.proto`.

---

#### S1-03 — `docker compose` de todo el sistema

**Por qué:** desde el lunes todos prueban contra el sistema completo, no contra su servicio solo.

**Archivos:** `docker-compose.yml`, `.env.example`, un `Dockerfile` inicial en cada servicio.

**Pasos:**
1. Servicios: `web`, `gateway`, `match`, `players`, `monitor`, `match-db`, `players-db` y `rabbitmq` (imagen `rabbitmq:3-management`), con los puertos de la sección 0.1.
2. **Todos** los servicios se construyen con `context: .` (la raíz) y `dockerfile: <servicio>/Dockerfile`, porque necesitan `proto/`, `messages/` o `shared/`. El CD de GitHub Actions construye las imágenes igual.
3. Cada base de datos con su propio volumen (`match-db-data`, `players-db-data`) y `healthcheck` con `pg_isready`.
4. `depends_on` con `condition: service_healthy` hacia la base de datos y RabbitMQ.
5. `.env.example` con todas las variables: `MATCH_DB_URL`, `PLAYERS_DB_URL`, `RABBITMQ_URL`, `MATCH_GRPC_ADDR=match:50051`, `PLAYERS_GRPC_ADDR=players:50052`, `MAP_PATH=/app/shared/map.json`, y usuarios y contraseñas de Postgres y RabbitMQ.
6. Dockerfiles multi-etapa: compilar en una imagen grande y correr en una pequeña (`gcr.io/distroless` o `alpine`).
7. Mientras los servicios no existan, cada `Dockerfile` puede levantar un "hola mundo" en su puerto.

**Criterio de verificación:** en una máquina limpia, `cp .env.example .env && docker compose up --build` deja los 8 contenedores en estado `running` o `healthy` (`docker compose ps`). La consola de RabbitMQ abre en `http://localhost:15672` y `docker compose down -v && docker compose up` vuelve a levantar sin errores.

---

#### S1-04 — Mapa en canvas

**Por qué:** es lo primero que se ve, y define el `map.json` que también usa Go.

**Archivos:** `shared/map.json`, `web/src/main.ts`, `web/src/canvas/renderMap.ts`, `web/src/canvas/camera.ts`, `web/vite.config.ts`, `web/nginx.conf`, `web/Dockerfile`.

**Pasos:**
1. Crear el proyecto con Vite (plantilla `vanilla-ts`), sin frameworks de juego.
2. Escribir `shared/map.json` con el formato de la sección 0.3: las 7 zonas del plan del juego, el canal con 3 puentes como paredes con huecos, el arroyo en anillo y los 10 lugares de tanques en el huerto (slots 0 a 9 para hasta 10 jugadores).
3. `renderMap(ctx, map, camera)`: zonas como rectángulos de color con su nombre, paredes en gris oscuro y estaciones y tanques como círculos.
4. `camera.ts`: la cámara sigue a un punto y convierte coordenadas del mundo a pantalla. Por ahora sigue al centro del mapa y se mueve con las flechas, solo para probar.
5. `nginx.conf`: servir `dist/` y reenviar `/api/` y `/ws` a `gateway:3000`, este último con los encabezados de WebSocket (`Upgrade` y `Connection`).
6. `Dockerfile`: `npm run build` en una etapa con Node y copia de `dist/` a `nginx:alpine`.

**Criterio de verificación:** con `docker compose up`, `http://localhost:8080` muestra el mapa completo con las 7 zonas rotuladas, el canal y sus 3 puentes visibles. Las flechas mueven la cámara sin parpadeo. El mismo `map.json` es el que leerá `match` (no hay una copia en `web/`).

---

#### S1-05 — CI en GitHub Actions

**Por qué:** sin CI, el `main` se rompe el primer día y nadie sabe quién fue.

**Archivo:** `.github/workflows/ci.yml`.

**Pasos:**
1. Un job por servicio, que solo corre si cambió su carpeta (con `dorny/paths-filter` o `on.push.paths`). Si cambia `proto/` o `shared/`, corren `match`, `players` y `gateway`.
2. `match`: `go vet ./...` y `go test ./...`.
3. `players`: `cargo fmt --check`, `cargo clippy -- -D warnings` y `cargo test`.
4. `gateway`, `web` y `messages`: `npm ci`, `npm run lint`, `npm test` y `npm run build`.
5. `monitor`: `pip install -e .[dev]`, `ruff check` y `pytest`.
6. Un job final `compose` que corre `docker compose build` para confirmar que las imágenes construyen.
7. Caché de dependencias (`actions/setup-go`, `Swatinem/rust-cache`, `actions/setup-node` y `pip`) para que no tarde 10 minutos.

**Criterio de verificación:** un PR que solo toca `monitor/` corre solo el job de `monitor` y `compose`. Un PR con un test fallando a propósito sale en rojo y GitHub no deja hacer merge. Un PR limpio sale en verde en menos de 6 minutos.

---

#### S1-06 — `/health` en los 5 servicios

**Por qué:** es la base del patrón Health Endpoint Monitoring y del panel.

**Archivos:** `match/internal/health/health.go`, `players/src/health.rs`, `gateway/src/health/health.controller.ts`, `monitor/app/main.py` y la ruta `/health` en `web/nginx.conf`.

**Pasos:**
1. En cada servicio, `GET /health` con el formato de la sección 0.2.
2. `match` y `players` revisan su base de datos con `SELECT 1` y su conexión a RabbitMQ. Usan un servidor HTTP aparte del gRPC (puertos 8081 y 8082); en Rust con `axum`.
3. `gateway` revisa que los clientes gRPC de `match` y `players` estén conectados.
4. `web`: `location = /health { return 200 '{"status":"ok","service":"web","checks":{}}'; }` en nginx.
5. Cada revisión con un timeout de 1 segundo, para que `/health` nunca se cuelgue.

**Criterio de verificación:** `curl -i localhost:8081/health` (y los otros 4) responde 200 con el JSON correcto. Tras `docker compose stop match-db`, el de `match` responde 503 con `"db": "fail: ..."` en menos de 2 segundos, y vuelve a 200 al levantar la base de datos.

---

### Lunes 5: la rebanada vertical

#### S1-07 — Conectar todo de punta a punta · todos, en una llamada

**Por qué:** es la forma más rápida de encontrar los errores de integración, y todos entienden el flujo completo.

**Pasos (versión mínima, sin login ni salas todavía):**
1. `match`: una sola sala fija `DEV`, con el `Play` aceptando cualquier `player_id` y moviendo con `Move`.
2. `gateway`: WebSocket en `/ws` sin token; reenvía `join` y `move` al stream `Play` y devuelve los `snapshot`.
3. `web`: al abrir la página, conecta al WebSocket, manda `join` con un id aleatorio, envía `move` con las flechas y dibuja los puntos de todos los `snapshot`.
4. Cada quien revisa los logs de su servicio mientras otro prueba.

**Criterio de verificación:** con `docker compose up`, dos pestañas en `localhost:8080` muestran dos puntos. Al mover uno con las flechas, la otra pestaña lo ve moverse con menos de 200 ms de retraso a simple vista. Todo está en `main` antes de que termine la llamada.

---

### Martes a viernes: cada uno su servicio

#### S1-08 — La sala como goroutine con ticker (`match/`)

**Por qué:** es el corazón del juego; todo lo de la semana 2 se monta encima.

**Archivos:** `match/internal/room/room.go`, `match/internal/room/state.go`, `match/internal/room/room_test.go`.

**Pasos:**
1. `type Room struct` con su estado (jugadores, fase y tick) y **sin mutex**. Solo lo toca su goroutine.
2. `func NewRoom(code string, matchID string, m *Map) *Room` y `func (r *Room) Run(ctx context.Context)`.
3. `Run` hace un `select` sobre:
   - `r.actions` (`chan PlayerAction`, con buffer de 256): aplica la acción. Por ahora guarda la última dirección de cada jugador.
   - `r.joins` y `r.leaves`: agrega o marca como desconectado a un jugador.
   - `ticker.C` (50 ms): mueve a cada jugador según su dirección (sección 0.4), suma 1 al tick y llama a `broadcast()`.
   - `ctx.Done()`: termina.
4. `broadcast()` arma un `Snapshot` y lo manda al canal de salida de cada jugador **sin bloquear** (`select` con `default`). Si el canal de un jugador está lleno, se descarta ese snapshot para él; el siguiente lo pone al día.
5. `type Registry struct` con un `map[string]*Room` y un mutex, solo para buscar salas por código. Es lo único con mutex.
6. Colores: los 8 colores fijos se asignan en orden de llegada.

**Criterio de verificación:** `go test ./internal/room/... -race` pasa con una prueba que crea una sala, mete 3 jugadores, les manda direcciones desde 3 goroutines a la vez durante 1 segundo y comprueba que (a) el detector de carreras no reporta nada, (b) cada jugador avanzó unas 200 unidades (±20) en su dirección, y (c) ningún `broadcast` bloqueó al ticker, porque se hicieron entre 18 y 22 ticks.

---

#### S1-09 — `CreateRoom`, `JoinRoom` y stream `Play` (`match/`)

**Archivos:** `match/internal/grpc/server.go`, `match/cmd/match/main.go`.

**Pasos:**
1. `CreateRoom`: genera un código de 4 letras sin ambigüedades (sin `O`, `0`, `I` ni `1`), crea el `match_id` (UUID), arranca la goroutine de la sala y devuelve `Room`.
2. `JoinRoom`: busca la sala; si no existe, error gRPC `NOT_FOUND`; si tiene 10 jugadores, `RESOURCE_EXHAUSTED`.
3. `Play`:
   - El primer mensaje **debe** ser `Join`. Si no lo es, responde `Error{code:"BAD_MESSAGE"}` y cierra.
   - Crea el canal de salida del jugador y lo registra en la sala.
   - Lanza **una goroutine de envío** que lee ese canal y hace `stream.Send`.
   - En el hilo principal, lee `stream.Recv()` en un ciclo y pasa cada `Move` al canal `actions` de la sala.
   - Si `Recv` devuelve error (el cliente se fue), avisa a la sala con `leaves` y termina.
4. `main.go` arranca el servidor gRPC en `:50051` y el `/health` en `:8081`, y se apaga limpio con `SIGTERM`.

**Criterio de verificación:** con `grpcurl` (o un test de integración en Go), crear una sala, unirse con dos jugadores y abrir dos `Play`: los dos reciben unos 20 `Snapshot` por segundo con ambos jugadores. Cerrar uno de los streams no tumba la sala ni el otro stream, y el jugador cerrado aparece con `connected: false`.

---

#### S1-10 — Colisiones con el mapa (`match/`)

**Archivos:** `match/internal/room/mapdata.go`, `match/internal/room/collision.go` y su test.

**Pasos:**
1. Cargar `shared/map.json` desde `MAP_PATH` al arrancar. Si el archivo no existe o está mal formado, el servicio **no arranca** y lo dice en el log.
2. `func (m *Map) Move(x, y, dx, dy float64) (nx, ny float64)`: mueve primero en X y luego en Y, y en cada eje revierte el paso si el círculo del jugador (radio 16) toca una pared o sale del mundo. Así el jugador se desliza pegado a la pared en lugar de quedarse trabado.
3. Los jugadores nuevos aparecen alrededor de `spawn`, separados 40 unidades entre sí.

**Criterio de verificación:** tests de tabla que comprueban: (a) caminar contra una pared no la atraviesa, (b) caminar en diagonal contra una pared desliza por el otro eje, (c) se puede cruzar el canal solo por los 3 puentes, y (d) nadie sale del rectángulo 1600 × 1200. En el navegador, nadie atraviesa el canal fuera de los puentes.

---

#### S1-11 — Guardar partidas y publicar eventos (`match/`)

**Archivos:** `match/migrations/0001_init.sql`, `match/internal/db/queries.sql` (sqlc), `match/internal/events/publisher.go`.

**Pasos:**
1. Migración:
   ```sql
   CREATE TABLE matches (
     id UUID PRIMARY KEY,
     room_code TEXT NOT NULL,
     started_at TIMESTAMPTZ,
     ended_at TIMESTAMPTZ,
     winner TEXT CHECK (winner IN ('crew', 'impostor'))
   );
   CREATE TABLE participants (
     match_id UUID REFERENCES matches(id),
     player_id UUID NOT NULL,
     display_name TEXT NOT NULL,
     role TEXT NOT NULL DEFAULT 'crew',
     ejected BOOLEAN NOT NULL DEFAULT false,
     PRIMARY KEY (match_id, player_id)
   );
   ```
   Se aplica al arrancar con `golang-migrate`.
2. `publisher.go`: conexión a RabbitMQ con `amqp091-go`, declara el exchange `game.events` (sección 0.7) y expone `Publish(ctx, routingKey string, payload any) error`, con mensajes persistentes y **publisher confirms**. Si RabbitMQ no está, reintenta conectar cada 2 segundos sin tumbar el servicio.
3. La sala pasa de `LOBBY` a `PLAYING` cuando el creador manda una acción `Start` (agregarla al proto) con al menos 2 jugadores. En ese momento inserta en `matches` y `participants` y publica `match.started`.
4. **Regla temporal de la semana 1:** la partida termina sola a los 3 minutos con `winner: "crew"` y `harvest: 0`. Se guarda `ended_at` y se publica `match.finished`. Es solo para que `players` y `monitor` tengan eventos reales; en la semana 2 se reemplaza.

**Criterio de verificación:** jugar una partida de 3 minutos con 2 jugadores. Al terminar, `SELECT * FROM matches` en `match-db` muestra la fila con `ended_at` y `winner`, y en la consola de RabbitMQ la cola `monitor.all` recibió exactamente 1 `match.started` y 1 `match.finished` con el formato de la sección 0.7. Con RabbitMQ apagado, el servicio sigue funcionando y el `/health` dice `"rabbitmq": "fail: ..."`.

---

#### S1-12 — Cuentas: registro, login y tokens (`players/`)

**Archivos:** `players/migrations/0001_init.sql`, `players/src/accounts.rs`, `players/src/grpc.rs`, `players/src/main.rs`.

**Pasos:**
1. Migración (se aplica al arrancar con `sqlx::migrate!`):
   ```sql
   CREATE TABLE players (
     id UUID PRIMARY KEY,
     username TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     coins INTEGER NOT NULL DEFAULT 0,
     matches_played INTEGER NOT NULL DEFAULT 0,
     wins INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   CREATE TABLE sessions (
     token TEXT PRIMARY KEY,
     player_id UUID NOT NULL REFERENCES players(id),
     expires_at TIMESTAMPTZ NOT NULL
   );
   ```
2. `Register`: valida usuario (3 a 20 caracteres: letras, números y `_`) y contraseña (mínimo 8). Guarda el hash con `argon2` (parámetros por defecto del crate). Si el usuario existe, error `ALREADY_EXISTS`.
3. `Login`: compara con `argon2::verify`. Si falla, `UNAUTHENTICATED` con el mismo mensaje sea el usuario o la contraseña lo incorrecto (no revelar cuál). Si funciona, crea un token aleatorio de 32 bytes en hexadecimal, con vigencia de 24 horas, en `sessions`.
4. `ValidateToken`: busca el token no vencido; devuelve `player_id` y `username`, o `UNAUTHENTICATED`.
5. Nunca registrar contraseñas ni tokens completos en los logs.

**Criterio de verificación:** tests de integración con una base de datos de prueba que comprueban: registrar, iniciar sesión, validar el token, rechazar contraseña incorrecta, rechazar usuario repetido y rechazar un token vencido (insertándolo con `expires_at` en el pasado). En la base de datos, `password_hash` empieza con `$argon2`.

---

#### S1-13 — Perfil del jugador (`players/`)

**Archivos:** `players/src/progress.rs` y `proto/players.proto` (agregar `GetProfile` si no quedó en S1-02).

**Pasos:**
1. `GetProfile(player_id)` devuelve `username`, `coins`, `matches_played` y `wins`.
2. Si el jugador no existe, `NOT_FOUND`.

**Criterio de verificación:** test que registra un jugador y comprueba que el perfil nuevo tiene 0 monedas, 0 partidas y 0 victorias. Desde el navegador, `GET /api/me` (hecho en S1-15) muestra esos datos.

---

#### S1-14 — Consumidor idempotente de `match.finished` (`players/`)

**Por qué:** demuestra Publisher-Subscriber y la entrega "al menos una vez" sin duplicados (D5).

**Archivos:** `players/migrations/0002_results.sql`, `players/src/consumer.rs`.

**Pasos:**
1. Migración:
   ```sql
   CREATE TABLE results (
     match_id UUID NOT NULL,
     player_id UUID NOT NULL REFERENCES players(id),
     role TEXT NOT NULL,
     won BOOLEAN NOT NULL,
     harvest INTEGER NOT NULL,
     coins_earned INTEGER NOT NULL,
     PRIMARY KEY (match_id, player_id)
   );
   ```
2. Con `lapin`, declarar la cola durable `players.match-finished`, enlazada a `game.events` con `match.finished`, y consumir con `prefetch = 10`.
3. Por cada mensaje, en **una sola transacción** y para cada jugador del evento:
   - `INSERT INTO results ... ON CONFLICT (match_id, player_id) DO NOTHING`.
   - Solo si se insertó la fila: `UPDATE players SET coins = coins + $1, matches_played = matches_played + 1, wins = wins + $2`.
   - Monedas: `harvest + (20 si su equipo ganó, 0 si no)`.
4. `ack` **después** del `COMMIT`. Si el JSON está mal formado, `nack` sin reencolar y log de error. Si falla la base de datos, `nack` con reencolar.
5. Un `player_id` que no existe en `players` se ignora con un log de advertencia, sin tumbar el consumidor.

**Criterio de verificación:** test de integración que publica **el mismo** `match.finished` dos veces y comprueba que el jugador tiene 1 partida y las monedas sumadas una sola vez. Prueba manual: `docker compose stop players`, terminar una partida, `docker compose start players` y ver que las monedas aparecen en `GET /api/me`.

---

#### S1-15 — REST de autenticación y salas (`gateway/`)

**Archivos:** `gateway/src/auth/auth.controller.ts`, `gateway/src/auth/auth.guard.ts`, `gateway/src/game/rooms.controller.ts`, `gateway/src/clients/players.client.ts`, `gateway/src/clients/match.client.ts`.

**Pasos:**
1. Clientes gRPC con `@grpc/grpc-js` y `@grpc/proto-loader`, leyendo `../proto/*.proto`, envueltos en servicios de NestJS que devuelven promesas.
2. Rutas de la sección 0.6. Validar los cuerpos con `class-validator`; un cuerpo inválido responde 400.
3. `AuthGuard`: lee `Authorization: Bearer <token>`, llama a `ValidateToken` y deja `playerId` y `username` en la petición. Sin token o token inválido: 401.
4. Traducir errores gRPC a HTTP: `UNAUTHENTICATED` → 401, `ALREADY_EXISTS` → 409, `NOT_FOUND` → 404, `UNAVAILABLE` → 503.

**Criterio de verificación:** con `docker compose up`, esta secuencia funciona con `curl`: registrar (201), registrar el mismo usuario (409), login (200 con token), `GET /api/me` con token (200), sin token (401), `POST /api/rooms` (201 con un código de 4 letras) y unirse con otro usuario (200, mismo `matchId`).

---

#### S1-16 — WebSocket ↔ stream `Play` (`gateway/`)

**Archivos:** `gateway/src/game/game.gateway.ts`, `gateway/src/main.ts`.

**Pasos:**
1. Usar `@nestjs/platform-ws` (WebSocket puro, sin Socket.IO, para que el navegador use la API nativa).
2. Al conectar a `/ws?token=...`: validar el token con `players`. Si no es válido, mandar `{type:'error', code:'UNAUTHORIZED'}` y cerrar con el código 4001. Si el mismo `playerId` abre una segunda conexión, cerrar la anterior con 4002 (sesión reemplazada). Si supera el límite de mensajes de S2-08, cerrar con 4008 (demasiados mensajes).
3. Al recibir `join`: abrir un stream `Play` con `match`, mandarle `Join` con el `playerId` **del token**, nunca uno que mande el navegador.
4. Reenviar cada `move` como `Move`, validando que `dx` y `dy` estén en {-1, 0, 1}. Si un mensaje no se puede parsear, `error BAD_MESSAGE` sin cerrar la conexión.
5. Reenviar cada `Snapshot` al navegador convertido a `ServerMessage`.
6. Si el WebSocket se cierra, cerrar el stream. Si el stream se cae, mandar `error SERVICE_UNAVAILABLE` y cerrar el WebSocket con el código 1011, para que el navegador se reconecte.
7. Un jugador = un stream. Si el mismo `playerId` abre un segundo WebSocket, se cierra el anterior con el código 4002.

**Criterio de verificación:** dos usuarios distintos, en dos navegadores, entran a la misma sala y se ven moverse. Modificar a mano en la consola del navegador el `playerId` no permite mover a otro jugador. Un WebSocket sin token recibe `UNAUTHORIZED` y se cierra.

---

#### S1-17 — Retry y Circuit Breaker en los clientes gRPC (`gateway/`)

**Por qué:** es el patrón 5, y es el que se demuestra en vivo apagando `players`.

**Archivos:** `gateway/src/clients/resilience.ts` y los dos clientes de S1-15.

**Pasos:**
1. Cada llamada unaria (`Login`, `ValidateToken`, `CreateRoom`, etc.) lleva un **deadline de 2 segundos**.
2. **Retry:** hasta 3 intentos con espera de 200 ms, 400 ms y 800 ms, solo para errores `UNAVAILABLE` y `DEADLINE_EXCEEDED`. Nunca reintentar `Register`, porque no es idempotente.
3. **Circuit Breaker** con `opossum`, uno por servicio de destino: se abre con 50 % de errores en una ventana de 10 llamadas, prueba de nuevo a los 10 segundos (`resetTimeout`) y, abierto, falla de inmediato con `SERVICE_UNAVAILABLE`.
4. Registrar en el log cada cambio de estado del breaker (`open`, `halfOpen` y `close`) y exponer el estado en el `/health` del gateway: `"checks": { "players": "ok" | "circuit-open" }`.

**Criterio de verificación:** con `docker compose stop players`: el primer `POST /api/auth/login` tarda unos 2 a 3 segundos en fallar (reintentos), y desde que se abre el breaker, cada intento responde 503 en menos de 50 ms. El `/health` del gateway muestra `"players": "circuit-open"`. Con `docker compose start players`, a los 10 a 20 segundos el login vuelve a funcionar sin reiniciar el gateway.

---

#### S1-18 — Pantallas de login, sala de espera y partida (`web/`)

**Archivos:** `web/src/screens/login.ts`, `web/src/screens/lobby.ts`, `web/src/screens/game.ts`, `web/src/api.ts`, `web/src/session.ts`.

**Pasos:**
1. `api.ts`: funciones para cada ruta de la sección 0.6, que lanzan un error con el mensaje del servidor si la respuesta no es 2xx.
2. `session.ts`: guardar y leer `{ token, playerId, username, matchId? }` en `localStorage`, envuelto en `try/catch`.
3. **Login:** formulario con usuario y contraseña, y botones "Entrar" y "Crear cuenta". Errores visibles bajo el formulario ("Usuario o contraseña incorrectos", "Ese usuario ya existe").
4. **Sala de espera:** botón "Crear sala" que muestra el código en grande, campo para "Unirse con código", lista de jugadores conectados (desde los `snapshot` en fase `LOBBY`) y botón "Empezar", visible solo para quien creó la sala y activo con 2 o más jugadores.
5. **Partida:** el canvas a pantalla completa.
6. Navegación simple sin router: una función `show(screen)` que cambia lo que se ve.

**Criterio de verificación:** un usuario nuevo crea su cuenta, crea una sala y ve su código. Otro usuario, en otra máquina, se une con ese código, y los dos aparecen en la lista. El creador pulsa "Empezar" y ambos pasan a la partida. Recargar la página en la sala de espera no pide login de nuevo.

---

#### S1-19 — Moverse y ver a los demás (`web/`)

**Archivos:** `web/src/net/socket.ts`, `web/src/input.ts`, `web/src/canvas/renderPlayers.ts`, `web/src/screens/game.ts`.

**Pasos:**
1. `input.ts`: leer WASD y flechas, y calcular `dx` y `dy`. Mandar `move` **solo cuando cambia la dirección**, no en cada cuadro.
2. Guardar los dos últimos `snapshot` e **interpolar** entre ellos con un retraso de 100 ms, para que el movimiento se vea fluido a 60 cuadros por segundo aunque lleguen 20 snapshots por segundo.
3. Dibujar a cada jugador como un círculo de su color con el nombre encima; los desconectados semitransparentes.
4. La cámara sigue al jugador propio.

**Criterio de verificación:** con dos navegadores en la misma partida, el movimiento propio y el del otro se ve fluido, sin saltos, y nadie atraviesa paredes. En la pestaña Red de las herramientas del navegador, mantener una flecha presionada 3 segundos manda 1 solo mensaje `move`, no 180.

---

#### S1-20 — Reconexión básica del WebSocket (`web/`)

**Archivos:** `web/src/net/socket.ts`.

**Pasos:**
1. Clase `GameSocket` con `connect()`, `send()` y `onMessage()`.
2. Si la conexión se cierra con un código distinto de 1000 (cierre normal), 4001 (token inválido) o 4002 (sesión reemplazada), reintentar con espera creciente: 0,5 s, 1 s, 2 s, 4 s, 8 s y luego cada 10 s, indefinidamente. El 4008 (demasiados mensajes, S2-08) es un corte normal: también reintenta.
3. Mientras reconecta, mostrar sobre el canvas el aviso "Reconectando…" con el número de intento.
4. Al reconectar, mandar de nuevo `join` con el `matchId` guardado en `session.ts` y el último `tick` recibido.
5. Si el cierre es 4001, borrar la sesión y volver al login. Con 4002 (reemplazada), no reintentar y mantener la sesión.

**Criterio de verificación:** en plena partida, `docker compose restart gateway`: el navegador muestra "Reconectando…" y en menos de 10 segundos vuelve a la misma partida sin recargar la página. Lo mismo al desactivar el wifi 20 segundos y reactivarlo (en la semana 1 el personaje puede reaparecer en otra posición; mantener el lugar es la tarea S3-01).

---

#### S1-21 — Panel de salud del monitor (`monitor/`)

**Archivos:** `monitor/app/main.py`, `monitor/app/health.py`, `monitor/app/dashboard/index.html`, `monitor/pyproject.toml`.

**Pasos:**
1. FastAPI con una tarea en segundo plano (`asyncio`, arrancada en el
   `lifespan`) que cada 5 segundos consulta en paralelo, con
   `httpx.AsyncClient` y un timeout de 2 segundos, el `/health` de `web`,
   `gateway`, `match` y `players`, comprueba RabbitMQ con una conexión
   directa y supervisa las bases de datos de forma indirecta a través de los
   `checks.db` reportados por `match` y `players`.
2. Guardar en memoria el último resultado de cada uno: estado, latencia en ms, hora de la última respuesta correcta y los últimos 20 resultados.
3. `GET /api/status` devuelve todo eso en JSON.
4. `GET /` sirve `index.html`: una tarjeta por servicio en verde, amarillo (`degraded`) o rojo (sin respuesta), con la latencia y "caído desde hace X s". Se actualiza sola cada 2 segundos con `fetch`.
5. Alerta: cuando un servicio pasa a rojo, la tarjeta parpadea y aparece arriba en una lista de "incidentes" con la hora.
6. Su propio `/health` según la sección 0.2.

**Criterio de verificación:** con todo arriba, `http://localhost:8000` muestra 7 tarjetas en verde. Tras `docker compose stop players`, su tarjeta se pone en rojo en menos de 10 segundos y aparece un incidente con la hora. Al levantarlo vuelve a verde solo, sin recargar la página.

---

#### S1-22 — Eventos en el panel (`monitor/`)

**Archivos:** `monitor/app/events.py`, `monitor/app/dashboard/index.html`.

**Pasos:**
1. Con `aio-pika`, declarar la cola durable `monitor.all` enlazada a `game.events` con `#`, y consumir.
2. Mantener en memoria: partidas activas (`match.started` suma, `match.finished` resta), jugadores en partida, partidas terminadas hoy y los últimos 20 eventos con su hora.
3. Exponerlos en `GET /api/stats` y mostrarlos en el panel: tres números grandes y una lista de eventos recientes.
4. Si RabbitMQ se cae, reintentar la conexión cada 2 segundos sin tumbar el monitor (`connect_robust`).

**Criterio de verificación:** al empezar una partida con 3 jugadores, el panel muestra "1 partida activa, 3 jugadores" en menos de 3 segundos. Al terminar, vuelve a 0 y suma 1 a "partidas hoy". Con `docker compose restart rabbitmq`, el monitor se reconecta solo y sigue contando las siguientes partidas.

---

#### S1-23 — Un `compose` por nodo y `lab.env` para el laboratorio (infraestructura)

**Cambio (7 de octubre):** reemplaza a "desplegar en la nube". Las 5 laptops del equipo son los nodos servidor y cada una corre su nodo con Docker (`docs/deployment-lab.md`, secciones 3 a 6).

**Archivos:** `deploy/compose/n1.yml` a `n5.yml`, `deploy/lab.env.example`, `deploy/scripts/check-network.ps1` y `deploy/README.md`.

**Pasos:**
1. Un `compose` por nodo con las imágenes del CD: N1 edge (`web` y `gateway`), N2 (`match` y `match-db`), N3 (`players` y `players-db`), N4 (`rabbitmq`) y N5 (`monitor`).
2. `match-db` y `players-db` sin publicar el 5432; `restart: unless-stopped` en todos.
3. `lab.env.example` con las IP de cada nodo, las direcciones derivadas, las URL de las bases, un usuario propio de RabbitMQ y `RECONNECT_GRACE_SECONDS=600`. El `lab.env` real no se sube.
4. `check-network.ps1`: ping, puertos publicados, 5432 cerrado y WebSocket hacia los otros nodos.
5. `deploy/README.md`: preparar cada laptop, arrancar cada nodo y agrupar nodos.

**Criterio de verificación:** con 2 laptops (`-f n1.yml -f n2.yml` en una y `-f n3.yml -f n4.yml -f n5.yml` en otra) y `lab.env` con sus IP, un navegador en una tercera máquina abre `http://<EDGE_HOST>:8080` y el panel del monitor está en verde. Desde otra máquina, conectar al 5432 de N2 o N3 falla. Tras una caída del proceso (`docker compose exec match sh -c 'kill -9 1'`), Docker lo relanza solo y el panel vuelve a verde. `check-network.ps1` reporta todo en verde.

---

## 2. Semana 2 (10 al 16 de octubre): el juego completo

> Los mensajes nuevos de WebSocket se agregan en `messages/src/index.ts` y los de gRPC en `proto/match.proto`, en **un solo PR al inicio de la semana** (S2-01), para que nadie se bloquee esperando el contrato.

#### S2-01 — Contrato v1 del juego (`proto/` y `messages/`)

**Pasos:**
1. Nuevas acciones en `ClientAction` y `ClientMessage`: `Start`, `Interact { station_id }` (hacer tarea; sobre un tanque ya no hace nada), `Contaminate { tank_slot }`, `Report { tank_slot }`, `Vote { target_player_id | skip }` y `Chat { client_msg_id, text }`.
2. Nuevos campos en `Snapshot`: `tanks[] { slot, owner_id, contamination (0 a 100), dead }`, `reservoir` (0 a 100), `my_role` (solo el del destinatario), `my_task_progress`, `meeting { reporter_id, tank_slot, votes_cast, ends_at_tick }` y `chat[]` (últimos 30 mensajes).
3. Nuevo evento `MatchEnded { winner, impostor_id }`.
4. Ver el rol del impostor **solo en su propio snapshot**: el gateway jamás debe recibir el rol de otros.

**Criterio de verificación:** el PR lo aprueban al menos dos personas. `match`, `players`, `gateway` y `web` compilan con el contrato nuevo antes del lunes 12 al mediodía.

---

#### S2-02 — Roles e impostor (`match/`)

**Pasos:**
1. Al pasar a `PLAYING`, elegir 1 impostor al azar (`crypto/rand`). Con 7 o más jugadores, 2 impostores.
2. Guardar el rol en `participants.role`.
3. Cada `Snapshot` lleva `my_role` solo para su destinatario.
4. Asignar a cada jugador un tanque del huerto (`slot`) en orden de llegada.

**Criterio de verificación:** test que corre 1000 asignaciones con 5 jugadores y comprueba que siempre hay exactamente 1 impostor y que cada jugador fue impostor entre 150 y 250 veces. En el juego, abrir las herramientas del navegador de un tripulante no muestra en ningún mensaje quién es el impostor.

---

#### S2-03 — Tanques y contaminación (`match/`)

**Pasos:**
1. Cada tanque tiene `contamination` de 0 a 100.
2. `Contaminate`: solo el impostor, a 40 unidades o menos del tanque. Requiere quedarse quieto **3 segundos** (60 ticks); si se mueve, se cancela. Al terminar, suma 50 puntos de contaminación: dos contaminaciones matan un tanque. Tiempo de espera de 20 s entre contaminaciones.
3. El tanque del impostor sube solo 1 punto cada 5 segundos, para que no se vea siempre limpio. Nunca pasa de 99 (ni por esa subida ni por la tubería): el impostor no puede quedar fuera por su propio tanque.
4. **Nadie limpia tanques, ni los tripulantes ni el impostor:** la contaminación nunca baja, el daño es permanente. Un `Interact` sobre un tanque (lo que mandaban los clientes viejos para limpiar) se ignora; el campo `tank_slot` sigue en el contrato para no romper a nadie.
5. Si un tanque llega a 100: `dead = true`, su dueño queda `alive = false` (fantasma: sigue moviéndose y haciendo tareas, pero no vota ni habla en la reunión).
6. Cada contaminación o paso a 40 unidades de un tanque se anota en `event_log (match_id, tick, player_id, kind, tank_slot)`.

**Criterio de verificación:** tests que comprueban: (a) un tripulante no puede contaminar, (b) moverse a mitad de los 3 segundos cancela, (c) el tiempo de espera de 20 s se respeta, (d) 2 contaminaciones matan el tanque, y (e) la contaminación nunca baja y convierten al dueño en fantasma. En el juego, el impostor contamina un tanque y todos ven subir la barra.

---

#### S2-04 — Tareas de las 3R y embalse (`match/`)

**Pasos:**
1. Las estaciones de `map.json` tienen tipo `reduce` (cerrar fuga), `reuse` (recoger agua gris o de lluvia) o `recycle` (filtrar en la planta).
2. `Interact` sobre una estación a 40 unidades o menos inicia la tarea: el servidor registra que empezó y el navegador muestra el minijuego (S2-11). Al terminar, el navegador manda `Interact` otra vez con `completed: true`, y el servidor la acepta solo si pasaron al menos 3 segundos desde el inicio y el jugador sigue cerca.
3. Cada tarea completa suma al embalse: `reduce` +3, `reuse` +4, `recycle` +5. Cada jugador tiene 4 tareas asignadas al azar por partida.
4. Publicar `task.completed` con `liters_saved` (100 por cada punto de embalse).
5. El impostor puede "fingir" una tarea: se le muestra el minijuego, pero no suma nada.

**Criterio de verificación:** tests de que una tarea completada en menos de 3 segundos se rechaza y de que el impostor no suma al embalse. En el juego, completar una tarea sube el embalse para todos y el panel del monitor suma litros.

---

#### S2-05 — Reportar, reunión y votación (`match/`)

**Pasos:**
1. `Report { tank_slot }`: solo sobre un tanque `dead`, a 60 unidades o menos, y por un jugador vivo. Pasa a fase `MEETING` y teletransporta a todos a la plaza.
2. ~~`meeting.last_visitors`~~ (quitado: la reunión ya no dice quiénes pasaron por el tanque; el campo 3 de `Meeting` quedó `reserved` en `proto/match.proto`).
3. La reunión dura 50 segundos: 45 para discutir por chat y votar (se cierra antes si todos los vivos ya votaron), y 5 de pantalla de resultado.
4. **Chat (C):** `Chat` solo en `MEETING` y de jugadores vivos, máximo 200 caracteres, máximo 1 mensaje por segundo por jugador. Se guarda en el estado de la sala y va en los snapshots.
5. Resultado: el más votado es expulsado (`ejected = true`, `alive = false`). Empate o mayoría de `skip`: nadie sale. Publicar `player.ejected`.
6. Tras la reunión, 5 segundos de pantalla de resultado ("Morado era el impostor" o "Morado no era el impostor") y vuelta a `PLAYING`.

**Criterio de verificación:** tests de tabla para el conteo: mayoría simple, empate, todos `skip` y un fantasma que intenta votar (se ignora). En el juego, con 4 personas: reportar un tanque muerto muestra la reunión con quién reportó y de quién es el tanque, el chat funciona y la expulsión se aplica.

---

#### S2-06 — Fin de partida real (`match/`)

**Pasos:**
1. Ganan los tripulantes si el embalse llega a 100 **o** todos los impostores
   fueron expulsados/desconectados (`aliveImp == 0`).
2. Gana el impostor si quedan tantos impostores vivos como tripulantes vivos
   habiendo muerto al menos un tripulante (`deadCrew > 0`, para evitar fin
   inmediato al iniciar salas de prueba de 2 jugadores con 1 impostor) **o**
   pasan 8 minutos sin que el embalse llegue a 100.
3. `harvest` por jugador = tareas completadas × 5 + (10 si su tanque vivo).
4. Quitar la regla temporal de 3 minutos de S1-11; contar duración en ticks.
5. Fase `ENDED`: snapshot con `MatchEnded { winner, impostor_ids }`, guardar
   en `matches` y `participants`, publicar `match.finished` asíncrono y
   liberar la sala a los 30 s (cerrando streams gRPC con canal `done`).

**Criterio de verificación:** tests de cada una de las 4 condiciones de fin. Una partida real termina sola, muestra quién era el impostor y las monedas aparecen en el perfil según la fórmula.

---

#### S2-07 — Monedas y estadísticas (`players/`)

**Pasos:**
1. Ajustar el consumidor a la fórmula definitiva: `coins_earned = harvest + 20 si ganó su equipo`.
2. Agregar `times_impostor` y `wins_as_impostor` a `players` (migración nueva, nunca editar una vieja).
3. `GetProfile` devuelve también esas dos estadísticas.
4. Tests de integración de `match` con `players`.

**Criterio de verificación:** después de una partida como impostor ganada, el perfil muestra `times_impostor: 1`, `wins_as_impostor: 1` y las monedas correctas. Repetir el evento no cambia nada.

---

#### S2-08 — Mensajes nuevos y límite de velocidad en el gateway (`gateway/`)

**Pasos:**
1. Reenviar todas las acciones nuevas de S2-01 al stream `Play`, validando cada una (tipos, rangos y largo del chat).
2. **Rate limiting por jugador** (patrón Gateway Offloading): máximo 30 mensajes por segundo por WebSocket con un token bucket en memoria. Si se pasa, descartar y, tras 3 avisos, cerrar con el código 4008.
3. Límite en REST: 10 intentos de login por minuto por usuario
   (`@nestjs/throttler`). Se cuenta por usuario normalizado (`username`)
   en vez de IP porque en despliegues con Docker Desktop la IP real de los
   clientes en la LAN no siempre se conserva (lo que provocaría que todos
   los jugadores compartan el cupo o se evada falseando `X-Forwarded-For`).

**Criterio de verificación:** test unitario del token bucket. Un script que
manda 100 `move` en 1 segundo recibe avisos y termina desconectado, mientras
el otro jugador de la sala no nota nada. El undécimo login seguido en un minuto
para el mismo usuario responde 429.

---

#### S2-09 — Barras de tanques y acción de contaminar (`web/`)

**Pasos:**
1. Dibujar cada tanque del huerto con una barra de contaminación (verde a café según el valor) y el nombre del dueño. Muerto: gris con una planta marchita.
2. Indicador del embalse arriba de la pantalla, de 0 a 100 %.
3. Botón de acción contextual (tecla `E`) que cambia según lo que haya cerca: "Hacer tarea", "Reportar" o, si eres impostor, "Contaminar".
4. Barra de progreso circular durante las acciones que requieren quedarse quieto.
5. Aviso al dueño: "¡Tu tanque se está contaminando!" cuando su tanque sube, sin decir quién.

**Criterio de verificación:** en una partida de 3, el impostor ve "Contaminar" junto a un tanque ajeno y los tripulantes no. Al contaminar, el dueño recibe el aviso y todos ven la barra subir.

---

#### S2-10 — Pantalla de reunión y votación (`web/`)

**Pasos:**
1. Al entrar en `MEETING`: superponer un panel con el tanque reportado, quién reportó, la lista de jugadores con su color, el chat y una cuenta regresiva.
2. Votar: tocar un jugador o "Saltar". Mostrar quién ya votó (no a quién).
3. Los fantasmas ven el chat pero no pueden escribir ni votar.
4. Pantalla de resultado de 5 segundos y, en `ENDED`, pantalla final con ganador, impostor, monedas ganadas y botón "Volver a la sala".

**Criterio de verificación:** con 4 personas, una reunión completa se puede jugar sin explicar nada: todos entienden quién reportó, chatean, votan y ven el resultado. Los fantasmas no pueden votar aunque lo intenten desde las herramientas del navegador (lo rechaza el servidor).

---

#### S2-11 — Minijuegos de las 3R (`web/`, con un cambio chico de contrato en `proto/`, `match/`, `gateway/` y `messages/`)

**Estado al 11 de octubre:** `match` ya asigna 4 estaciones al azar a cada jugador y valida `Interact` (S2-04, `match/internal/room/tasks.go`), y el gateway ya traduce `interact` a gRPC (`gateway/src/game/client-messages.ts`). Pero el jugador no puede ver ni hacer sus misiones:
- El snapshot solo trae `myTaskProgress { completed, total }`: no dice **cuáles** estaciones le tocan.
- `web/` dibuja todas las estaciones iguales (`web/src/canvas/renderMap.ts`), no muestra `myTaskProgress` y nunca manda `interact`.

Sin esta tarea tampoco se puede verificar S2-13 jugando (completar 3 tareas y ver subir los litros).

**Pasos:**

*A. Contrato (un solo PR, con la skill `change-contract`; agrega campos, no rompe nada):*
1. `proto/match.proto`: en `Snapshot`, `repeated MyTask my_tasks = 13;` con `message MyTask { string station_id = 1; bool done = 2; }`, y `string my_active_task = 14;` (estación cuya tarea el servidor dio por iniciada; vacío si ninguna). Solo viajan en el snapshot de su dueño, igual que `my_role`.
2. Regenerar `match/gen/` con `match/gen.sh`.
3. `messages/src/index.ts`: `myTasks: { stationId: string; done: boolean }[]` y `myActiveTask: string | null` en `Snapshot`. Actualizar el ejemplo de la sección 0.5 de este documento.
4. `gateway/src/game/server-events.ts`: mapear los dos campos (`[]` y `null` si no vienen) y su prueba en `server-events.test.ts`.

*B. `match/`:*
5. Hoy `completeTask` borra la estación de `assignedTasks`, así que se pierde cuál se hizo. Guardar también `completedTasks []string` en `player` y en la instantánea (`persist.go`: campo nuevo `completed_tasks`, opcional al restaurar para no romper instantáneas viejas).
6. En `room.go`, al armar el snapshot de cada jugador: `my_tasks` = pendientes + hechas, en orden estable (por id de estación), y `my_active_task` = `p.taskStation`.
7. Cancelar la tarea en curso (`taskStation = ""`) si el jugador se aleja más de 40 unidades de la estación, para que el navegador cierre el minijuego al ver `myActiveTask` vacío.
8. Pruebas: el snapshot trae las 4 tareas y marca `done` la completada; alejarse cancela; restaurar una instantánea conserva las hechas.

*C. `web/` (cada minijuego dura de 3 a 6 segundos):*
9. **Lista de misiones** en la esquina superior izquierda, sobre el canvas: "Misiones (2/4)" y una fila por tarea con su tipo (Reducir, Reutilizar, Reciclar) y la zona donde está, por ejemplo "Reducir · Cuarto de bombas". La zona se calcula en el navegador con `shared/map.json`: la zona más pequeña que contiene la estación (así se ignora "Arroyo", que cubre todo el mapa). Las hechas aparecen tachadas. Se oculta en `LOBBY` y durante la reunión.
10. **En el mapa:** resaltar solo las estaciones pendientes del jugador (anillo pulsante o signo "!"); las demás y las hechas se dibujan atenuadas.
11. **Iniciar:** junto a una estación propia pendiente a 40 unidades o menos, el botón contextual de S2-09 (tecla `E`) dice "Hacer tarea" y manda `interact { stationId }`. El minijuego se abre cuando el snapshot trae `myActiveTask === stationId` (lo confirma el servidor, no el navegador).
12. **Minijuegos**, en un panel encima del canvas; mientras está abierto no se manda `move`. Se eligen **por estación** (`createMinigame(type, stationId)` en `web/src/game/tasks/minigames.ts`): cada estación tiene el suyo y el juego de su tipo queda de respaldo. El detalle y el porqué están en `docs/design/minigames-3r.md`:
    1. **Reducir (cerrar fuga, `leak-1`):** girar una válvula manteniendo presionado el clic hasta llenar una barra.
    2. **Reutilizar (agua gris, `greywater-1`):** arrastrar 3 cubetas al tanque.
    3. **Reciclar (filtrar, `filter-1` y `filter-2`):** hacer clic en 4 partículas de suciedad que flotan en el agua.
    4. **Reducir (regular la presión, `valve-1`):** presionar el botón cuando la aguja pasa por la franja verde; 3 aciertos y la franja se encoge.
    5. **Reducir (llenar sin derramar, `valve-2`):** sostener el grifo y soltar cuando el agua pase la marca; cruzar el borde derrama y el vaso vuelve a empezar. 3 vasos.
    6. **Reutilizar (primera lluvia, `rain-1` y `rain-2`):** las gotas sucias de la primera lluvia (de 1 a 3, al azar por semilla) van al desvío y las limpias al barril; un clic cambia la compuerta de lado. 6 gotas limpias.
    7. **Reciclar (clasificar residuos, `sorter-1`):** arrastrar 4 residuos al cajón de su color.
    8. **Reutilizar (¿sirve para regar?, `greywater-2`):** arrastrar 4 recipientes a Regar o a Tratar según su origen.
    9. **Reducir (sellar la fuga, `leak-2`):** clic en las grietas que se abren solas para ponerles cinta; se sellan 5.
    10. **Reciclar (capas del compost, `compost-1`):** arrastrar los sacos en orden (seco, húmedo, tierra), dos rondas.
    Todos los juegos nuevos respetan un mínimo de 3 s (`MIN_GAME_MS`): match rechaza tareas más rápidas (`taskMinTicks`).
13. **Terminar:** al completar el minijuego, mandar `interact { stationId, completed: true }`. Si se completó antes de 3 s desde el inicio, esperar a que pasen antes de mandarlo (el servidor rechaza los menores de 3 s). Se cierra con `Esc`, al empezar una reunión o si `myActiveTask` deja de ser esa estación (el jugador se alejó).
14. El impostor ve sus tareas y los minijuegos igual que un tripulante (las "finge"; `match` no suma nada).
15. Textos que ve el jugador como constantes en `web/src/constants.ts` (regla 9). Pruebas con `vitest` del cálculo de zona, del armado de la lista y de la lógica de cada minijuego (sin canvas).

**Depende de:** S2-04 (hecha) y del botón contextual de S2-09; si S2-09 todavía no está en `develop`, la tecla `E` se agrega aquí y luego se unen.

**Criterio de verificación:** cada minijuego se completa en el tiempo indicado sin instrucciones escritas, y la tarea aparece tachada en la lista. Tres compañeros que no lo programaron completan los 3 al primer intento. Desde las herramientas del navegador de un tripulante no se ven las tareas de otro jugador. Completar 3 tareas sube el embalse para todos y el contador de litros del monitor (S2-13) en menos de 3 segundos.

---

#### S2-12 — Gotas de aceite (`web/` y `match/`)

**Pasos:**
1. **`match`:** durante 5 segundos después de contaminar, el impostor deja una gota cada 1 segundo en su posición; cada gota dura 5 segundos. Las gotas van en el snapshot (`oil_drops[] { x, y, color, expires_at_tick }`).
2. **`web`:** dibujar las gotas con el color del impostor, desvaneciéndose a medida que se acercan a su vencimiento.

**Criterio de verificación:** tras contaminar, todos ven un rastro de gotas del color del impostor que desaparece en pocos segundos (cada gota dura 5).

---

#### S2-13 — Litros, expulsiones y despliegue automático (`monitor/` e infra)

**Pasos:**
1. Consumir `task.completed` y `player.ejected`: litros ahorrados (total y por partida activa), tareas por tipo (Reducir, Reutilizar, Reciclar) y expulsiones acertadas contra fallidas.
2. Mostrar en el panel un contador grande de **litros ahorrados** (el número más vistoso para el jurado) y un gráfico de barras simple de tareas por tipo.
3. Despliegue automático con Docker: el CD ya publica una imagen por servicio en GHCR cuando el CI de `main` sale en verde. `deploy/scripts/update.ps1` en cada nodo hace `docker compose --env-file deploy/lab.env -f deploy/compose/nX.yml pull` y `up -d`, así que no se compila nada en las laptops. El script detecta el nodo comparando las IP de la laptop con las de `lab.env` (o se le pasa `-Nodes N2`).

**Criterio de verificación:** completar 3 tareas en una partida sube el contador de litros en el panel en menos de 3 segundos. Un merge a `main` queda corriendo en cada laptop con un solo comando por nodo (`.\deploy\scripts\update.ps1`).

---

## 3. Semana 3 (17 al 23 de octubre): resiliencia, pulido y ensayo

#### S3-01 — Periodo de gracia y `Resume` · en pareja

**Pasos:**
1. **`match`:** cuando el stream de un jugador se corta, marcarlo `connected: false` y conservar su lugar durante `RECONNECT_GRACE_SECONDS` (90 por defecto en `.env.example`; 600 en el laboratorio, `deploy/lab.env.example`). Si vuelve, recupera todo. Si no, pasa a fantasma.
2. **`match`:** si un desconectado no vota antes de que termine la reunión, su voto cuenta como `skip`.
3. **`match`:** al recibir `Join` de alguien que ya está en la sala, reemplazar su canal de salida y mandarle de inmediato un snapshot completo (con chat y estado de la reunión).
4. **`web`:** al cargar la página, si `session.ts` tiene `matchId`, ir directo a la partida en lugar de al lobby.

**Criterio de verificación:** prueba manual de la tabla 6.4 de `architecture.md`: desactivar el wifi de un jugador 30 segundos y al volver está en la misma posición, con su rol y sus tareas. Recargar la página a mitad de una reunión vuelve a la reunión con el chat completo.

---

#### S3-02 — Instantáneas y pausa · en pareja

**Pasos:**
1. Tabla `snapshots (match_id UUID PRIMARY KEY, tick BIGINT, state JSONB, updated_at TIMESTAMPTZ)`.
2. Cada 2 segundos y en cada cambio de fase, la goroutine de la sala serializa su estado y hace `INSERT ... ON CONFLICT (match_id) DO UPDATE`. La escritura va en **otra goroutine**, para que la base de datos lenta no frene el ticker.
3. Al arrancar `match`: buscar partidas con `ended_at IS NULL` y snapshot, recrear su sala en pausa y esperar a que los jugadores se reconecten.
4. Si no queda ningún jugador conectado, la sala se pausa: el ticker sigue, pero no suma contaminación ni tiempo. **Implementado como en `deployment-lab.md`, sección 9:** la sala se pausa solo mientras el **host** (el creador) esté en su periodo de gracia; si se va otro jugador la partida sigue y él conserva su lugar. El snapshot lleva `paused` y `waitingFor` (todos los que están en gracia) y, en pausa, el navegador muestra "Partida en pausa: esperando a X". Un corte de menos de 1 s (la página cambia el socket de la sala de espera por el de la partida, o recarga) no abre el periodo de gracia ni pausa.
5. **`gateway`:** el gateway, al reconectar un jugador, reabre el stream `Play` y reintenta con espera creciente si `match` todavía está arrancando. Si el stream se cae, el WebSocket sigue abierto: el navegador recibe `SERVICE_UNAVAILABLE` y el gateway reabre `Play` (0,5 s, 1 s, 2 s, 4 s, 8 s y luego cada 10 s).

**Criterio de verificación:** en plena partida, `docker compose restart match`: en menos de 15 segundos todos los navegadores vuelven a la misma partida, con a lo sumo 2 segundos de movimiento perdidos, y el tiempo restante de la partida no avanzó mientras `match` estaba caído.

---

#### S3-03 — Ningún resultado se pierde · en pareja

**Pasos:**
1. Revisar que exchange, colas y mensajes sean durables y persistentes (sección 0.7), y que `players` haga `ack` solo después del `COMMIT`.
2. `match` usa publisher confirms; si RabbitMQ no confirma, guarda el evento en una tabla `outbox` y lo reintenta cada 5 segundos. Mientras quede algo en `outbox`, los eventos nuevos también esperan ahí, para que salgan en orden (`match/internal/events/outbox.go`).
3. Probar: matar `players` con `docker compose kill players` **en medio** de procesar un mensaje (con un `sleep` temporal de prueba) y comprobar que al volver se procesa una sola vez.

**Criterio de verificación:** las tres pruebas pasan: (a) `players` apagado durante el fin de partida, (b) RabbitMQ reiniciado durante el fin de partida y (c) `players` muerto a mitad de un mensaje. En las tres, las monedas se suman exactamente una vez.

---

#### S3-04 — Chat sin conexión y panel de desconectados · en pareja

**Pasos:**
1. **`web`:** los mensajes de chat escritos sin conexión se guardan en una cola en memoria con `client_msg_id` (UUID) y se envían al reconectar.
2. **`match` y `gateway`:** descartar un `Chat` con un `client_msg_id` ya visto en esa partida.
3. **`monitor`:** mostrar en el panel cuántos jugadores están en periodo de gracia y su cuenta regresiva.

**Criterio de verificación:** escribir 2 mensajes sin wifi, reactivarlo, y los 2 aparecen una sola vez para todos. El panel muestra al jugador desconectado y desaparece cuando vuelve.

---

#### S3-05 — Sabotajes y visión limitada (si el resto está listo) · en pareja

**Solo se empieza si S3-01 a S3-04 están en `main`.**

**Pasos:**
1. **Tubería rota:** el impostor la activa; 30 segundos para que 2 jugadores la arreglen en dos puntos a la vez, o todos los tanques suben 20 puntos.
2. **Vapor:** reduce la visión de todos a la mitad hasta que alguien lo arregla en la planta.
3. Tiempo de espera compartido de 40 segundos, uno activo a la vez, y ninguno en los primeros 30 segundos ni durante reuniones.
4. **Visión limitada (D):** dibujar el canvas con una máscara oscura y un círculo de visión de 300 unidades alrededor del jugador; los demás jugadores fuera del círculo no se dibujan.

**Criterio de verificación:** cada sabotaje se puede activar, se ve igual que un evento aleatorio y se puede arreglar. Tras un sabotaje, el siguiente no se puede activar antes de 40 segundos.

**Cómo quedó implementado:**
- `match/internal/room/sabotage.go`: la tubería se arregla cuando dos jugadores vivos sostienen a la vez sus dos `fixPoints` (moverse suelta el punto); el vapor, con 2 s quietos en la válvula. La tubería se rompe como máximo 2 veces por partida y una reunión la cancela.
- Emergencias aleatorias cada 60 a 120 s (no antes de 60 s tras un sabotaje), con el mismo aspecto que un sabotaje.
- Visión: radio de **220 unidades** en lugar de 300, porque la cámara del mapa v3 muestra 960 × 540 unidades y con 300 casi no se notaba. El vapor la reduce a la mitad.
- `web`: botones de sabotaje del impostor (teclas 1 y 2), aviso de emergencia, flechas hacia los puntos de arreglo y animaciones de cada actividad.

---

#### S3-06 — Batería de pruebas de resiliencia · todos (jueves 22)

**Pasos:**
1. En la máquina de la nube, correr las 5 pruebas de la tabla 6.4 de `architecture.md`, más desconectar de la red la laptop de un jugador y, si el proveedor lo permite, la red de la máquina virtual.
2. Anotar cada resultado en `docs/resiliencia.md`: prueba, resultado esperado, resultado real y captura de pantalla.
3. Cualquier prueba que falle se corrige el mismo día; es lo que el profe va a probar.

**Criterio de verificación:** `docs/resiliencia.md` tiene las 7 pruebas en verde, con capturas.

---

#### S3-07 — Ensayo general · todos (viernes 23)

**Pasos:**
1. Guion de 10 minutos: el juego (3 min), la arquitectura con el diagrama (3 min), los 5 patrones demostrados en vivo (3 min) y preguntas.
2. Demostraciones en vivo: el jurado escanea el QR y juega; apagar `players` y mostrar el Circuit Breaker y el panel; cortar el wifi de un jugador y mostrar que vuelve.
3. Plan B: video de 2 minutos grabado el jueves por si falla la red de la sala.
4. Dos ensayos completos cronometrados.

**Criterio de verificación:** los dos ensayos terminan en 10 minutos o menos, todas las demostraciones en vivo funcionaron al menos una vez, y cualquiera de los 5 puede explicar cualquier parte de la arquitectura (por eso todos trabajaron en todo).
