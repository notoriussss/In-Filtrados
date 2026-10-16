# In-Filtrados: decisiones de arquitectura

Juego estilo Among Us sobre el agua y las 3R. Equipo de 5 personas.
Fundamento: clases CEN-02, CEN-03 y CEN-04 (Introducción a los Sistemas Distribuidos).
Fecha: 3 de octubre de 2026.

> Los números de lámina de CEN-02 se calcularon por página del PDF y pueden variar en una o dos.

> Convención: todo el código va en inglés (carpetas, archivos, tablas, eventos y contratos gRPC). La documentación y la conversación del equipo siguen en español.

---

## 1. Resumen

| Decisión | Elección | Referencia en clase |
|---|---|---|
| Estilo arquitectónico | Microservicios | CEN-03, lám. 27 |
| Organización física | Cliente-servidor multinivel | CEN-04, lám. 60 |
| Coordinación de eventos | Publicación-suscripción | CEN-03, lám. 30-37 |
| Middleware síncrono | RPC con gRPC | CEN-04, lám. 66-80 |
| Middleware asíncrono | Colas de mensajes con RabbitMQ | CEN-04, lám. 54 y 81-86 |
| Navegador ↔ gateway | WebSocket (flujo de mensajes) | CEN-04, lám. 56 |
| Despliegue | `docker compose` en una máquina; en la competencia, una máquina virtual en la nube | CEN-02, definición de nodo |

---

## 2. Componentes

```
 Navegador (web: React + canvas en TypeScript, servido por nginx)
        │  WebSocket
        ▼
 Gateway (NestJS / TypeScript)
        │  gRPC                         │  gRPC
        ▼                               ▼
 match (Go, goroutines)           players (Rust)
        │                               │
   PostgreSQL #1                   PostgreSQL #2
        │
        │  publica eventos
        ▼
   RabbitMQ  ──────────────►  Rust (guarda resultados)
        │
        └──────────────────►  Monitor (Python / FastAPI)
                               consulta /health de todos
```

| Componente | Lenguaje | Responsabilidad | Base de datos |
|---|---|---|---|
| **web** | TypeScript | Dibuja el mapa, lee el teclado y muestra lo que manda Go. No decide nada, para que nadie haga trampa desde el navegador. Se compila a archivos estáticos que sirve nginx. | — |
| **gateway** | TypeScript (NestJS) | Única puerta de entrada. Recibe el WebSocket, valida y reenvía a Go y Rust por gRPC. | — |
| **match** | Go | Árbitro de la partida en vivo: movimiento, contaminación de tanques, sabotajes, emergencias y votaciones. Usa una goroutine por partida. | PostgreSQL #1 |
| **players** | Rust | Datos persistentes: cuentas, cosecha, monedas, parcela personal, atuendos y estadísticas. | PostgreSQL #2 |
| **monitor** | Python (FastAPI) | Revisa la salud de todo, escucha los eventos y muestra un panel. | — |
| **broker** | RabbitMQ | Reparte los eventos entre servicios. | — |

---

## 3. Decisiones y por qué

### D1. Microservicios
La aplicación se divide en servicios pequeños y autónomos, y cada uno cumple una sola función de negocio con su propia base de datos. Se comunican por contratos de API (CEN-03, lám. 27).
También cumple el objetivo de sistema abierto y extensible: se puede reemplazar un componente sin tocar los demás (CEN-02, lám. 21-23).

### D2. Cliente-servidor multinivel
El gateway es servidor del navegador y a la vez cliente de Go y Rust. Es el caso de "un servidor que actúa como cliente" (CEN-04, lám. 60).
Además, da transparencia de ubicación y de acceso: el navegador no sabe dónde corre cada servicio (CEN-03, lám. 11; CEN-02, lám. 20).

### D3. gRPC como middleware RPC
- Los stubs se generan desde un IDL, que aquí son los archivos `.proto` (CEN-04, lám. 73 y 79).
- El marshalling y el unmarshalling son automáticos (CEN-04, lám. 50-51).
- Esto resuelve la heterogeneidad de tener cuatro lenguajes (CEN-03, lám. 5) y define interfaces publicadas, como pide un sistema abierto (CEN-02, lám. 21).
- Entre el gateway y Go se usa un **stream gRPC**: es comunicación por flujo, donde importa el orden de los mensajes (CEN-04, lám. 56).

### D4. RabbitMQ para eventos (publicación-suscripción)
Go publica eventos como partida iniciada, partida terminada, sabotaje o expulsión. Rust y el monitor se suscriben.
- Resuelve el caso en que cliente y servidor no están activos al mismo tiempo (CEN-04, lám. 77): si Rust está caído, el resultado espera en la cola y no se pierde.
- Es comunicación persistente y asíncrona (CEN-04, lám. 54-55) y sigue el modelo de colas con broker (lám. 81-86).
- Desacopla referencialmente a los procesos: Go no necesita saber quién escucha (CEN-03, lám. 32-34).

### D5. Resultados idempotentes
Con reintentos, la entrega es "al menos una vez" y un mensaje puede llegar duplicado (CEN-04, lám. 47-48). Rust guarda cada resultado usando el **id de la partida como llave**, así un duplicado no suma dos veces.

### D6. Goroutines en Go
Go funciona como un servidor multihilo, con una goroutine por partida o por jugador, para atender muchas conexiones a la vez sin bloquear (CEN-03, lám. 56 y 58).

### D7. Frontend y gateway separados
Que ambos sean TypeScript no los hace el mismo componente. Son dos contenedores: **web** (archivos estáticos con nginx) y **gateway** (NestJS). Cada uno se despliega, falla y escala por su lado.
Se eligió NestJS sobre FastAPI para el gateway porque:
1. Los tipos de los mensajes del juego se definen una sola vez y los comparten el navegador y el gateway.
2. Así cada lenguaje tiene una responsabilidad de servidor clara, y Python no carga con el gateway y el monitor a la vez.

Si alguien del equipo domina más Python que NestJS, se puede cambiar el gateway a FastAPI y la arquitectura queda igual.

**Dentro de web: React para las pantallas, canvas para el mundo.** Los menús, el HUD, la reunión y el resultado son interfaz de documento (formularios, listas, botones, texto que cambia con el snapshot). Hacerlos a mano con `document.createElement` acumulaba estado repetido y código difícil de mantener, así que se escriben como componentes React en TSX. El mundo (mapa, personajes, tanques, efectos y visión) sigue en un solo `<canvas>` que dibuja `GameSession` a 60 fps; React nunca re-renderiza por cada cuadro. El puente es un store (`web/src/game/session.ts`) que expone el último snapshot con `subscribe`/`getState` y React lo lee con `useSyncExternalStore`. Las pantallas siguen las maquetas de `docs/design/in-filtrados-ui-v3` (dirección B-noche): se maquetan en un escenario de 1920 × 1080 y se escalan a la ventana. No hay router ni librería de estado: la navegación es un `switch` en `App.tsx`.

### D8. Python como monitor
El monitor es un microservicio con trabajo propio:
1. **Salud:** consulta cada pocos segundos el `/health` del gateway, Go, Rust, las dos bases de datos y RabbitMQ.
2. **Eventos:** escucha RabbitMQ y calcula jugadores en línea, partidas activas y litros de agua "ahorrados".
3. **Panel:** muestra todo lo anterior en una página, con alertas cuando un servicio se cae. Se puede proyectar junto al juego en la competencia.

Pendiente: confirmar con el profe si exige que cada lenguaje tenga un peso parecido. Si es así, también se le pasa a Python el ranking global.

### D9. Despliegue
- **Desarrollo:** cada persona levanta todo con `docker compose` en su laptop.
- **Competencia:** el mismo `docker compose` en una máquina virtual en la nube (capa gratuita de Azure for Students, AWS u Oracle). El jurado entra con un link o un QR.
- Aunque todo corra en una máquina, sigue siendo un sistema distribuido, porque un nodo puede ser un proceso de software (CEN-02, definición).
- Se usan timeouts y reintentos igual, porque "la latencia es cero" y "la red es confiable" son falacias de Deutsch (CEN-02, lám. 28).

### D10. Retomar donde estaba tras una desconexión
Es una prueba del profesor: desconectar el equipo de la red y, al reconectarlo, el juego debe seguir donde estaba. Es la transparencia frente a fallos y la recuperación frente a fallos (CEN-03, lám. 9 y 11). Se diseña en tres niveles, que se detallan en la sección 6:
1. **El jugador pierde la red:** Go guarda su lugar en la partida y el navegador se reconecta solo.
2. **El servidor pierde la red:** los procesos siguen vivos, el estado sigue en memoria y los navegadores se reconectan solos.
3. **Un servicio se cae o se reinicia:** Go guarda instantáneas de cada partida en su base de datos y las restaura al arrancar. Es el caso del "servidor que recuerda" y no sufre amnesia (CEN-04, lám. 46).

---

## 4. Patrones nativos de la nube que salen de esta arquitectura

**Los 5 que se presentan:**

| # | Patrón | Dónde aparece | Cómo se demuestra |
|---|---|---|---|
| 1 | API Gateway | Gateway NestJS | El navegador solo conoce una dirección; detrás hay Go y Rust |
| 2 | Database per Service | PostgreSQL #1 (Go) y #2 (Rust) | Ningún servicio lee la base de datos de otro |
| 3 | Publisher-Subscriber | Eventos en RabbitMQ | Go publica `match.finished`; Rust y el monitor la reciben sin que Go los conozca |
| 4 | Health Endpoint Monitoring | Monitor Python y los `/health` | Apagar un contenedor y ver la alerta en el panel |
| 5 | Circuit Breaker | Llamadas gRPC desde el gateway | Apagar Rust: el gateway deja de insistir y responde "servicio no disponible" en vez de colgarse |

**Respaldo, por si el profe no acepta alguno:**

| Patrón | Dónde aparece |
|---|---|
| Retry | Reintentos con espera creciente en el gateway, antes de que se abra el Circuit Breaker |
| Queue-Based Load Leveling | La cola absorbe picos de resultados hacia Rust |
| Gateway Offloading | Validación del token y límite de velocidad en el gateway |

---

## 5. Cómo es el backend por dentro

### 5.1 Servicio de partida (Go)

**Qué hace:** lleva la partida en vivo. El estado de la partida (posiciones, tanques, sabotajes) vive **en memoria**, no en la base de datos, porque cambia muchas veces por segundo. La base de datos solo guarda lo que debe sobrevivir.

**Contrato gRPC (`proto/match.proto`):**
```proto
service Match {
  rpc CreateRoom(CreateRoomRequest) returns (Room);
  rpc JoinRoom(JoinRoomRequest) returns (Room);
  // Stream bidireccional: el jugador manda acciones, Go devuelve el estado
  rpc Play(stream Action) returns (stream State);
}
// Action: moverse, hacer tarea, contaminar, sabotear, reportar, votar
// State: posiciones, nivel de cada tanque, embalse, sabotaje activo, fase
```

**Cómo usa las goroutines:**
- **Una goroutine por sala**, que es la única dueña del estado de esa partida. Nadie más lo toca, así que no hacen falta candados (mutex).
- Las acciones de los jugadores le llegan por un **canal** (`chan Action`).
- Un **ticker** de unas 20 veces por segundo avanza el juego: mueve jugadores, sube la contaminación y revisa emergencias y tiempos de espera de los sabotajes.
- Tras cada tick, manda el estado nuevo al stream de cada jugador. Cada stream tiene su propia goroutine para enviar, y así un jugador con mala conexión no frena a los demás.

```
Play() de cada jugador ──acciones──► [canal] ──► goroutine de la sala ──estado──► stream de cada jugador
                                                   (ticker 20/s)
```

**Carpetas:**
```
match/
  cmd/match/main.go     arranca el servidor gRPC y el /health
  internal/room/        lógica del juego: mapa, tanques, sabotajes, votación
  internal/grpc/        implementa match.proto
  internal/events/      publica en RabbitMQ
  internal/db/          consultas (pgx + sqlc)
```

**Tablas en PostgreSQL #1:**
| Tabla | Para qué |
|---|---|
| `matches` | id, sala, inicio, fin, ganador (tripulantes o impostor) |
| `participants` | quién jugó cada partida, su rol y si fue expulsado |
| `event_log` | eventos importantes (contaminó, reportó, votó). Sirve para mostrar en la reunión los últimos 3 que pasaron por un tanque |

**Eventos que publica en RabbitMQ:** `match.started`, `match.finished` (con id de partida, jugadores, cosecha y resultado), `sabotage` y `ejection`.

### 5.2 Servicio de jugadores (Rust)

**Qué hace:** todo lo que debe durar entre partidas: cuentas, monedas, parcela personal, atuendos y estadísticas.

**Contrato gRPC (`proto/players.proto`):**
```proto
service Players {
  rpc Register(RegisterRequest) returns (Player);
  rpc Login(LoginRequest) returns (Token);
  rpc ValidateToken(Token) returns (Player);   // lo usa el gateway en cada conexión
  rpc GetProfile(PlayerId) returns (Profile);
  rpc BuyUpgrade(BuyUpgradeRequest) returns (Profile); // riego por goteo, barriles, atuendos
  rpc GetRanking(RankingRequest) returns (RankingList);
}
```

**Librerías (crates):**
- `tokio` como runtime asíncrono.
- `tonic` para el servidor gRPC.
- `sqlx` para PostgreSQL; revisa las consultas al compilar.
- `lapin` para consumir de RabbitMQ.
- `argon2` para guardar las contraseñas con hash.

**Carpetas:**
```
players/
  src/main.rs          arranca gRPC, el consumidor de RabbitMQ y el /health
  src/grpc.rs          implementa players.proto
  src/accounts.rs      registro, login y tokens
  src/progress.rs      monedas, mejoras y ranking
  src/consumer.rs      escucha match.finished
  migrations/          tablas (sqlx migrate)
```

**Tablas en PostgreSQL #2:**
| Tabla | Para qué |
|---|---|
| `players` | id, nombre, hash de la contraseña, monedas |
| `upgrades` | qué mejoras y atuendos compró cada jugador |
| `results` | llave `(match_id, player_id)`: cosecha y monedas ganadas en cada partida |

**Cómo guarda un resultado sin duplicarlo (D5):** al recibir `match.finished`, en una sola transacción hace `INSERT INTO results ... ON CONFLICT DO NOTHING` y solo si se insertó la fila suma las monedas. Después confirma el mensaje a RabbitMQ (ack). Si el mensaje llega dos veces, la segunda no hace nada.

### 5.3 Un recorrido completo

1. El jugador inicia sesión. El gateway llama a `Login` en Rust y recibe un token.
2. El jugador crea o se une a una sala. El gateway valida el token con Rust y llama a `CreateRoom` o `JoinRoom` en Go.
3. Durante la partida, el navegador manda acciones por WebSocket y el gateway las pasa al stream `Play` de Go, que devuelve el estado unas 20 veces por segundo.
4. Al terminar, Go guarda la partida en su base de datos y publica `match.finished`.
5. Rust consume el evento y suma las monedas. El monitor lo cuenta en su panel.

---

## 6. Resiliencia: retomar la partida tras desconectar la red

La regla base es que **el servidor manda**. El navegador nunca guarda el estado real de la partida, solo lo dibuja. Por eso, al reconectarse, basta con pedirle a Go la foto actual del juego.

### 6.1 El jugador pierde la red

**En el navegador:**
- Al iniciar sesión guarda en `localStorage` el token, el id de la partida y su id de jugador.
- Si el WebSocket se cae, muestra "Reconectando…" y reintenta solo, con espera creciente: 0,5 s, 1 s, 2 s, 4 s, hasta un máximo de 10 s. Sigue intentando mientras dure el periodo de gracia.
- Al reconectar manda `Resume { token, match_id, last_tick }`.
- Los mensajes de chat escritos sin conexión se guardan en una cola local, cada uno con un id único, y se envían al volver. El servidor descarta los ids repetidos (entrega "a lo más una vez" con identificadores de sesión, CEN-04, lám. 49).
- Si se recarga la página o se cierra el navegador, al volver a abrirlo lee `localStorage` y vuelve a la partida.

**En Go:**
- Cuando el stream de un jugador se corta, **no lo saca de la partida**. Lo marca como `disconnected` y su personaje se queda quieto en el mapa.
- Le da un **periodo de gracia de 90 segundos**. Si vuelve dentro de ese tiempo, recupera su lugar. Si no, pasa a fantasma, igual que un eliminado, para que la partida no se trabe.
- Al recibir `Resume`, valida el token con Rust, le manda la **foto completa** del estado (posiciones, tanques, embalse, sabotaje activo, fase, chat reciente) y después sigue con los envíos normales.
- Durante una votación, el voto de un jugador desconectado cuenta como "saltar" si no vuelve antes de que se acabe el tiempo.

**En el gateway:**
- Si se cae el WebSocket, cierra el stream `Play` hacia Go y lo vuelve a abrir cuando el jugador se reconecta con `Resume`. El gateway no guarda nada de la partida, así que se puede reiniciar sin perder nada.

### 6.2 El servidor pierde la red

Si al equipo del servidor se le quita la red pero no se apaga, Go, Rust y las bases de datos siguen corriendo y el estado sigue en memoria. Desde el punto de vista de Go, es como si **todos** los jugadores se hubieran desconectado a la vez: todos entran en periodo de gracia.

- Los relojes de la partida se **pausan** cuando no queda ningún jugador conectado. Así no sube la contaminación ni se acaba el tiempo mientras no hay nadie.
- Al volver la red, cada navegador se reconecta solo con 6.1 y la partida sigue donde estaba.

### 6.3 Un servicio se cae o se reinicia

**Go (instantáneas):**
- Cada 2 segundos, y en cada cambio de fase (inicio, reunión, votación, fin), la goroutine de la sala guarda una **instantánea** del estado en PostgreSQL #1, en la tabla `snapshots (match_id, tick, state JSONB)`. Se sobrescribe la anterior, así que solo hay una fila por partida.
- Al arrancar, Go busca las partidas sin terminar, crea de nuevo su goroutine con la última instantánea y la deja **pausada** hasta que los jugadores se reconecten.
- Se pierden como máximo 2 segundos de movimiento, no la partida.

> Nota: se guarda la instantánea completa cada 2 s porque es lo más simple. Si las partidas crecen mucho, se puede guardar solo lo que cambió.

**Rust y la comunicación entre servicios:**
- Las colas de RabbitMQ y sus mensajes se declaran **durables**, así que sobreviven a un reinicio del broker.
- Rust confirma (ack) cada mensaje solo después de guardarlo. Si se cae a mitad, RabbitMQ se lo vuelve a entregar, y la llave `(match_id, player_id)` evita sumar doble (D5).
- El gateway reintenta las llamadas gRPC con espera creciente (Retry) y, si un servicio sigue sin responder, abre el Circuit Breaker.

### 6.4 Cómo probarlo antes de la presentación

| Prueba | Qué se espera |
|---|---|
| Desactivar el wifi de un jugador 30 s y reactivarlo | Vuelve a la misma partida, en la misma posición, sin recargar |
| Recargar la página a mitad de partida | Vuelve a la partida sin iniciar sesión otra vez |
| Desconectar la red del servidor 60 s | Todos ven "Reconectando…", la partida no avanza y luego sigue igual |
| `docker compose restart match` | La partida vuelve desde la última instantánea |
| `docker compose stop players`, terminar una partida, `start players` | Las monedas se suman al volver Rust, una sola vez |

---

## 7. Estructura del monorepo

Un solo repositorio con una carpeta por servicio. Cada carpeta es independiente: tiene su propio `Dockerfile`, sus dependencias y sus pruebas, así que sigue siendo microservicios aunque viva en un repo.

```
in-filtrados/
├── proto/                      contratos gRPC, la única fuente de verdad
│   ├── match.proto
│   └── players.proto
│
├── messages/                   tipos TypeScript de los mensajes WebSocket
│   └── src/index.ts            (los usan web y gateway)
│
├── web/                        juego en el navegador (React + canvas, Vite)
│   ├── src/
│   │   ├── main.tsx, App.tsx   arranque y navegación entre pantallas
│   │   ├── game/               GameSession, acciones, minijuegos y render/
│   │   │   └── render/         dibujo del mapa, personajes, efectos y visión
│   │   ├── net/                WebSocket con reconexión automática
│   │   ├── screens/            pantallas React (acceso, menú, sala, partida)
│   │   ├── ui/                 kit B-noche: panel, botón, chip, íconos, gota
│   │   └── styles/             CSS del kit y de las pantallas
│   ├── public/assets/          mapa, sprites, íconos y fondos
│   ├── nginx.conf
│   └── Dockerfile              compila con Vite y sirve con nginx
│
├── gateway/                    NestJS
│   ├── src/
│   │   ├── main.ts
│   │   ├── auth/               valida el token con Rust
│   │   ├── game/                WebSocket ↔ stream gRPC con Go
│   │   ├── clients/             clientes gRPC + Retry + Circuit Breaker
│   │   └── health/
│   └── Dockerfile
│
├── match/                      Go
│   ├── cmd/match/main.go
│   ├── internal/
│   │   ├── room/               lógica del juego, una goroutine por sala
│   │   ├── grpc/
│   │   ├── events/             publica en RabbitMQ
│   │   ├── snapshots/          guarda y restaura partidas (sección 6.3)
│   │   └── db/                 consultas sqlc
│   ├── gen/                    código generado desde proto/
│   ├── migrations/
│   ├── go.mod
│   └── Dockerfile
│
├── players/                    Rust
│   ├── src/
│   │   ├── main.rs
│   │   ├── grpc.rs
│   │   ├── accounts.rs
│   │   ├── progress.rs
│   │   └── consumer.rs
│   ├── build.rs                genera el código gRPC desde ../proto al compilar
│   ├── migrations/
│   ├── Cargo.toml
│   └── Dockerfile
│
├── monitor/                    Python (FastAPI)
│   ├── app/
│   │   ├── main.py
│   │   ├── health.py           consulta los /health
│   │   ├── events.py           escucha RabbitMQ
│   │   └── dashboard/          página del panel
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
│
├── docs/
│   ├── architecture.md         este documento
│   └── uml/                    diagramas
│
├── .github/
│   ├── workflows/ci.yml        compila y prueba solo lo que cambió
│   └── pull_request_template.md
│
├── docker-compose.yml          levanta todo: 5 servicios, 2 PostgreSQL y RabbitMQ
├── .env.example                contraseñas y puertos de ejemplo
├── package.json                workspaces de npm: web, gateway y mensajes
└── README.md                   cómo levantarlo en un comando
```

**Detalles que conviene saber:**
- **Los `.proto` viven en un solo lugar.** Go genera su código con `protoc` hacia `match/gen/`. Rust lo genera al compilar con `build.rs`. NestJS lee los `.proto` al arrancar, así que no genera nada. Python no usa gRPC.
- **Docker:** como Go y Rust necesitan la carpeta `proto/`, en el `docker-compose.yml` su contexto de construcción es la raíz del repo y se indica el `Dockerfile` de cada carpeta.
- **npm workspaces:** `web`, `gateway` y `messages` comparten un solo `npm install`, y el gateway y la web importan los tipos de `messages` sin copiarlos.
- **CI:** el workflow usa filtros por carpeta (`paths`), así que un cambio en `monitor/` no recompila Rust.
- **Reparto del equipo:** ninguna carpeta tiene dueño; los 5 trabajan en todas. Los cambios a `proto/` los revisan al menos dos personas, porque es el contrato compartido.

---

## 8. Pendientes

- Confirmar con el profe si los servicios deben estar en máquinas separadas.
- Confirmar si cada lenguaje debe tener un peso parecido (afecta a D8).
