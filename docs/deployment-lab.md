# In-Filtrados: despliegue en la red del laboratorio

Complementa a `architecture.md`. Ese documento describe **qué** hace cada servicio; este describe **dónde** corre cada uno y **cómo** se conectan las máquinas en el laboratorio.
Fecha: 4 de octubre de 2026 (revisión 2).

> Convención: igual que en `architecture.md`, los nombres de archivos, variables y servicios van en inglés. La explicación va en español.

**Cambios de la revisión 2:**
- Los nodos servidor son **las 5 laptops del equipo con Docker**; los PCs del laboratorio solo son clientes. La ejecución nativa en los PCs del laboratorio pasa a ser el último recurso.
- La sala se **pausa cuando se desconecta cualquier jugador**, y el periodo de gracia deja de ser de 90 s fijos (sección 9).
- `web` conserva su propio nginx, como en `architecture.md` y `tasks.md`; el gateway no sirve archivos estáticos.

---

## 1. Resumen

| Decisión | Elección |
|---|---|
| Red | La red local (LAN) del laboratorio. No se necesita Internet durante la partida |
| Nodos servidor | Las 5 laptops del equipo (N1 a N5), una por integrante |
| Clientes | Los PCs del laboratorio, con navegador. No se instala nada en ellos |
| Ejecución | **Docker** en cada laptop, con un archivo `compose` por nodo (`deploy/compose/n1.yml` … `n5.yml`) |
| Configuración | Un solo archivo `deploy/lab.env` con las IP del día, copiado a las 5 laptops |
| Bases de datos | Cada PostgreSQL vive en el mismo nodo que su servicio y no publica su puerto |
| Contingencia | Agrupar nodos, red propia o un solo nodo (sección 8) |

Es un sistema distribuido de verdad: los procesos corren en máquinas físicas distintas y solo se comunican por mensajes en la red (CEN-02, definición de sistema distribuido; CEN-04, cliente-servidor multinivel, lám. 60).

**Por qué laptops y no los PCs del laboratorio:** en las laptops el equipo es administrador, ya tiene Docker para desarrollar y los datos no se borran al cerrar sesión. Así se evitan Node, Python y PostgreSQL portables, instalar Erlang sin permisos, las políticas que bloquean `.exe` y armar un zip por nodo en el CI. El `compose` que se usa para desarrollar es el mismo que se usa en la demo, solo que repartido.

---

## 2. Topología

```
                     LAN del laboratorio (o switch propio, ver plan C)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                                                                          │
 │  PCs del laboratorio (navegador) ── http://<N1>:8080/ ──┐                │
 │                                                         ▼                │
 │                                        ┌──────────────────────────────┐  │
 │                                        │ N1  edge (laptop)            │  │
 │                                        │  web (nginx) :8080           │  │
 │                                        │   └─ /api y /ws → gateway    │  │
 │                                        │  gateway (NestJS)            │  │
 │                                        └───────┬──────────────┬───────┘  │
 │                                     gRPC :50051│              │gRPC :50052│
 │                                                ▼              ▼          │
 │  ┌──────────────────────────────┐    ┌──────────────────────────────┐    │
 │  │ N2  match (laptop)           │    │ N3  players (laptop)         │    │
 │  │  match (Go)                  │    │  players (Rust)              │    │
 │  │  match-db (PostgreSQL #1)    │    │  players-db (PostgreSQL #2)  │    │
 │  └───────────────┬──────────────┘    └───────────────▲──────────────┘    │
 │        publica   │ AMQP :5672                consume │ AMQP :5672        │
 │                  ▼                                   │                   │
 │  ┌──────────────────────────────────────────────────┴───────────┐        │
 │  │ N4  broker (laptop): RabbitMQ :5672, consola :15672           │        │
 │  └──────────────────────────────────────────────┬───────────────┘        │
 │                                         consume │                        │
 │                                                 ▼                        │
 │  ┌──────────────────────────────────────────────────────────────┐        │
 │  │ N5  monitor (laptop) :8000, proyectado en la pantalla         │        │
 │  │  consulta /health de N1, N2, N3 y la consola de N4            │        │
 │  └──────────────────────────────────────────────────────────────┘        │
 └──────────────────────────────────────────────────────────────────────────┘
```

**Por qué esta repartición:**
- **Un nodo por servicio:** cada servicio cae, se reinicia y se demuestra por separado. Desconectar N3 muestra el Circuit Breaker; desconectar N4 muestra que los eventos esperan sin perderse.
- **La base de datos va junto a su servicio:** `match-db` está en el `compose` de N2 y no publica el puerto 5432, así que solo `match` puede llegar a ella. Database per Service queda forzado por la red, no solo por convención.
- **El edge es el único nodo que ven los clientes:** los navegadores solo conocen la IP de N1 (API Gateway y transparencia de ubicación, CEN-03, lám. 11).

---

## 3. Nodos y lo que corre en cada uno

| Nodo | Rol | Contenedores (`deploy/compose/nX.yml`) | Quién lo lleva |
|---|---|---|---|
| **N1** | edge | `web` (nginx) y `gateway` | C |
| **N2** | match | `match` y `match-db` | A |
| **N3** | players | `players` y `players-db` | B |
| **N4** | broker | `rabbitmq` | E |
| **N5** | monitor | `monitor` | D |
| Clientes | jugar | Navegador en los PCs del laboratorio | — |

Cada integrante lleva el nodo de un servicio que **no** es el suyo cuando se puede, así el día de la demo todos saben levantar algo ajeno. La tabla es una sugerencia; lo único fijo es que las 5 laptops tengan Docker y las imágenes ya descargadas.

**Preparación de cada laptop (una vez):**
- Docker Desktop instalado y las imágenes descargadas desde antes (`docker compose -f deploy/compose/nX.yml pull`). En el laboratorio no se descarga nada.
- Suspensión y apagado de pantalla desactivados mientras está enchufada: una laptop que se duerme parece un corte de red.
- Regla de firewall de Windows para los puertos de su nodo (sección 4), en perfil **privado y público**, porque la red del laboratorio suele quedar como pública.
- De preferencia, **cable de red**. Si es wifi, comprobar en la prueba previa que las laptops se ven entre sí (sección 7, prueba 2).

---

## 4. Puertos y firewall

| Nodo | Puerto | Protocolo | Quién se conecta | Publicado fuera de la laptop |
|---|---|---|---|---|
| N1 | 8080 | HTTP + WebSocket (`/`, `/api`, `/ws`) | Navegadores | Sí |
| N1 | 3000 | HTTP `/health` del gateway | N5 | Sí |
| N2 | 50051 | gRPC | N1 | Sí |
| N2 | 8081 | HTTP `/health` | N5 | Sí |
| N2 | 5432 | PostgreSQL #1 | Solo `match` (red interna de Docker) | **No** |
| N3 | 50052 | gRPC | N1 | Sí |
| N3 | 8082 | HTTP `/health` | N5 | Sí |
| N3 | 5432 | PostgreSQL #2 | Solo `players` (red interna de Docker) | **No** |
| N4 | 5672 | AMQP | N2, N3 y N5 | Sí |
| N4 | 15672 | Consola de RabbitMQ | N5 y el equipo | Sí |
| N5 | 8000 | HTTP del panel | El proyector y el jurado | Sí |

**Notas:**
- Son los mismos puertos que `tasks.md`, 0.1, así que no cambia nada del código.
- Los `/health` de N2 y N3 informan también el estado de su base de datos (`SELECT 1`). Así el monitor sabe si una base cayó sin tener que llegar a ella.

---

## 5. Configuración: un solo archivo

Las 5 laptops leen el mismo `deploy/lab.env`. El día de la presentación solo se cambian las IP y se copia el archivo a las 5 (USB, chat del equipo o carpeta compartida).

```ini
# deploy/lab.env — IP del día (las asigna el DHCP del laboratorio)
EDGE_HOST=192.168.10.21
MATCH_HOST=192.168.10.22
PLAYERS_HOST=192.168.10.23
BROKER_HOST=192.168.10.24
MONITOR_HOST=192.168.10.25

# Direcciones que usa cada servicio
MATCH_ADDR=${MATCH_HOST}:50051
PLAYERS_ADDR=${PLAYERS_HOST}:50052
AMQP_URL=amqp://game:CHANGE_ME@${BROKER_HOST}:5672/

# Bases de datos: siempre en la red interna de su nodo
MATCH_DB_URL=postgres://match:CHANGE_ME@match-db:5432/match
PLAYERS_DB_URL=postgres://players:CHANGE_ME@players-db:5432/players

# JWT: players firma con la privada; gateway y match validan con la pública
JWT_PRIVATE_KEY_FILE=keys/jwt.key      # solo en N3
JWT_PUBLIC_KEY_FILE=keys/jwt.pub       # en N1 y N2

# Reconexión (sección 9)
RECONNECT_GRACE_SECONDS=600

# Health endpoints para el monitor (N5)
WEB_HEALTH_URL=http://${EDGE_HOST}:8080/health
GATEWAY_HEALTH_URL=http://${EDGE_HOST}:3000/health
MATCH_HEALTH_URL=http://${MATCH_HOST}:8081/health
PLAYERS_HEALTH_URL=http://${PLAYERS_HOST}:8082/health
```

**Reglas:**
- **Ningún servicio tiene una IP o `localhost` escrito en el código.** Todo sale de variables de entorno: en desarrollo de `.env` y en el laboratorio de `lab.env`.
- El navegador nunca recibe IPs internas: se conecta a la misma dirección desde la que cargó la página (`ws://${location.host}/ws`).
- `lab.env` con contraseñas reales **no se sube al repositorio**; se sube `lab.env.example`.

```
deploy/
├── lab.env.example
├── compose/
│   ├── n1.yml ... n5.yml     un compose por nodo, mismas imágenes que docker-compose.yml
└── scripts/
    ├── check-network.ps1     prueba ping y puertos hacia los otros nodos
    └── seed.ps1              crea cuentas de prueba para la demo
```

Cada laptop arranca su nodo con:

```bash
docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml up -d
```

---

## 6. Orden de arranque

```
1. N4 broker      → crea las colas durables
2. N2 match       → PostgreSQL #1, migraciones, restaura partidas sin terminar (instantáneas)
3. N3 players     → PostgreSQL #2, migraciones, empieza a consumir eventos
4. N1 edge        → gateway y web; abre los clientes gRPC hacia N2 y N3
5. N5 monitor     → todo debe verse en verde
6. Clientes       → abren http://<EDGE_HOST>:8080/
```

El orden es una recomendación, no una obligación. Cada servicio **reintenta con espera creciente** si el otro todavía no está (Retry), porque "la red es confiable" es una falacia de Deutsch (CEN-02, lám. 28). Si alguien arranca N1 antes que N2, el gateway espera y el monitor lo muestra en amarillo.

---

## 7. Prueba previa en el laboratorio (lunes 5 de octubre)

Se hace con 2 laptops y 1 PC del laboratorio, sin código del proyecto todavía. Cada "no" activa un plan de la sección 8.

| # | Prueba | Cómo | Si falla |
|---|---|---|---|
| 1 | Se pueden conectar laptops a la red del laboratorio (cable o wifi) | Preguntar al encargado y probarlo | Plan C (switch propio) |
| 2 | Las laptops se ven entre sí | `ping` de una laptop a otra | Aislamiento de clientes → plan C |
| 3 | Un PC del laboratorio llega a un puerto de una laptop | `python -m http.server 8080` en la laptop y abrir desde el PC | Revisar el firewall de la laptop; si sigue, plan C |
| 4 | Un contenedor publicado se ve desde otra máquina | `docker run -p 8080:80 nginx` y abrir desde el PC | Revisar la regla de firewall de Docker Desktop |
| 5 | WebSocket pasa entre dos máquinas | Página de prueba con `ws://` | Revisar proxy o antivirus del laboratorio |
| 6 | Cuántos PCs hay libres para clientes y si hay tomas de corriente para 5 laptops | Preguntar al encargado | Ajustar la cantidad de jugadores |

El script `deploy/scripts/check-network.ps1` automatiza las pruebas 2, 3 y 5 para no hacerlas a mano el día de la presentación.

---

## 8. Modos de despliegue y contingencia

| Plan | Cuándo | Cómo queda |
|---|---|---|
| **A. Laptops en la LAN del laboratorio** | Pasan las pruebas 1 a 5 | N1 a N5 en las 5 laptops; PCs del laboratorio como clientes |
| **B. Menos laptops** | Falta alguna laptop el día de la demo | Se agrupan nodos (abajo) |
| **C. Red propia** | La red del laboratorio no deja conectar laptops o las aísla | Un switch o router propio; las laptops y los PCs cliente que se puedan conectar a él |
| **D. Un solo nodo** | Emergencia | `docker compose up` en una laptop; los clientes entran por su IP. Sigue siendo distribuido entre procesos (CEN-02), pero pierde la demo de "desconectar una máquina" |
| **E. PCs del laboratorio como servidores** | Solo si el profe exige usar los PCs del laboratorio | Ejecución nativa con runtimes portables. Es mucho trabajo extra; se planifica solo si llega a pedirse |

Agrupar nodos cuando no alcanzan las máquinas:
- 3 laptops: {N1 + N5}, {N2 + N4}, {N3}.
- 2 laptops: {N1 + N4 + N5}, {N2 + N3}.

Se combinan los `compose` (`-f n1.yml -f n5.yml`) y se cambian las IP en `lab.env`; el código es el mismo.

---

## 9. Resiliencia: qué pasa si se desconecta cada máquina

Es la prueba del profesor: quitar el cable de red y, al reconectarlo, el juego sigue donde estaba (`architecture.md`, D10 y sección 6). En el laboratorio se hace con máquinas reales, así que se diseña nodo por nodo.

**Requisitos que este despliegue agrega a `architecture.md`:**
1. **Heartbeat propio:** quitar el cable **no cierra** la conexión TCP; queda abierta a medias durante minutos. Por eso el navegador y el gateway se mandan un ping cada 2 s y dan la conexión por caída si pasan 5 s sin respuesta. Entre servicios se usa el keepalive de gRPC con los mismos tiempos.
2. **JWT validado localmente:** el gateway y `match` validan el token con la clave pública, sin llamar a `players`. Así, si N3 se cae, nadie pierde la partida ni la posibilidad de reconectarse.
3. **Outbox en `match`:** los eventos se guardan primero en una tabla `outbox` de PostgreSQL #1, en la misma transacción que el cambio, y un publicador los envía a RabbitMQ. Si N4 no está, los eventos esperan en N2 y salen al volver (patrón Transactional Outbox).
4. **Pausa por cualquier desconexión:** la sala se pausa en cuanto **un** jugador se desconecta, no solo cuando se van todos. Los relojes, la contaminación y los votos se congelan. Al volver el jugador, todo está exactamente igual. Es más simple que mantener la partida corriendo con un jugador quieto, y es lo que el profe espera ver.
5. **Gracia configurable:** mientras la sala está pausada, el jugador desconectado conserva su lugar durante `RECONNECT_GRACE_SECONDS` (10 minutos en el laboratorio). Solo al vencer pasa a fantasma y la sala sigue sin él, para que alguien que se fue de verdad no trabe la partida para siempre. Esto reemplaza los 90 s fijos de `architecture.md`, 6.1.

| Se desconecta | Qué ven los jugadores | Qué pasa por dentro | Al reconectar |
|---|---|---|---|
| **Un PC cliente** | Ese jugador ve "Reconectando…" en ≤5 s; los demás ven "Partida en pausa: esperando a X" | `match` lo marca `disconnected` y pausa la sala | Manda `Resume`, recibe la foto completa y la sala se reanuda |
| **N1 (edge)** | Todos ven "Reconectando…" | Los streams `Play` hacia N2 se cortan; `match` marca a todos como desconectados y pausa la sala | Los navegadores se reconectan a N1 y el gateway reabre `Play` con `Resume` |
| **N2 (match)** | Todos ven "Partida en pausa" | El gateway detecta que el stream cayó y reintenta con espera creciente; los WebSocket siguen abiertos | Si `match` siguió vivo, retoma con el estado en memoria; si se reinició, restaura la última instantánea (≤2 s perdidos) |
| **N3 (players)** | Nada en la partida; login y perfil dicen "servicio no disponible" | El Circuit Breaker del gateway se abre; `match.finished` espera en la cola de N4 | Rust consume lo pendiente y suma las monedas una sola vez (D5) |
| **N4 (broker)** | Nada | `match` acumula los eventos en `outbox`; el monitor marca el broker en rojo | Los eventos salen en orden; Rust y el monitor se ponen al día |
| **N5 (monitor)** | Nada; solo se apaga el panel | Ningún servicio depende del monitor | El panel reconstruye los contadores con los eventos nuevos y los `/health` |

**Tabla de pruebas en el laboratorio** (reemplaza a la de `architecture.md`, 6.4, el día de la demo):

| Prueba | Qué se espera |
|---|---|
| Quitar el cable de un PC cliente 2 minutos | "Reconectando…" en ≤5 s; los demás en pausa; vuelve a la misma posición sin recargar y la partida sigue igual |
| Recargar la página a mitad de partida | Vuelve a la partida sin iniciar sesión otra vez |
| Quitar el cable de N1 2 minutos | Todos en "Reconectando…", la partida no avanza y luego sigue igual |
| `docker compose restart match` en N2 | La partida vuelve desde la última instantánea |
| Quitar el cable de N3, terminar una partida y reconectar | La partida termina normal; las monedas se suman al volver, una sola vez |
| Quitar el cable de N4, terminar una partida y reconectar | Ningún evento se pierde; el panel se pone al día |
| Apagar N5 | El juego sigue sin cambios |

---

## 10. Streaming en la red: cuánto ancho de banda hace falta

`match` manda el estado unas 20 veces por segundo a cada jugador (ver `architecture.md`, 5.1).

| Dato | Valor estimado |
|---|---|
| Tamaño del estado por tick (10 jugadores, tanques, fase) | ~2 KB |
| Por jugador | 2 KB × 20/s = **40 KB/s** (~0,3 Mbps) |
| 10 jugadores | **~400 KB/s** (~3,2 Mbps) |
| Tramo N2 → N1 (gRPC) | El mismo total, ~3,2 Mbps |

Una LAN de 100 Mbps lo aguanta sobrado, y un wifi normal también. Lo que sí importa:
- **Latencia y fluidez:** el navegador interpola las posiciones entre ticks, y cada acción lleva un número de secuencia (`seq`) para que el servidor descarte las viejas o repetidas.
- **El chat no va en cada tick:** viaja en mensajes aparte, para que el estado siga siendo pequeño.
- **Un jugador lento no frena a los demás:** cada stream tiene su goroutine de envío en `match` (ver `architecture.md`, 5.1).

---

## 11. Cambios que esto implica en el resto del proyecto

Estos documentos **no se han editado todavía**; quien tome cada cambio lo hace en su PR.

| Documento | Cambio |
|---|---|
| `architecture.md`, D9 | Reemplazar "una VM en la nube" por este despliegue; la nube queda como opción si la competencia es fuera del laboratorio |
| `architecture.md`, sección 6 | Agregar heartbeat, JWT local, outbox, pausa por cualquier desconexión y gracia configurable |
| `architecture.md`, sección 4 | Sumar Transactional Outbox a los patrones de respaldo |
| `team-plan.md` y `tasks.md`, semana 1 | S1-23 cambia de "desplegar en la nube" a "un `compose` por nodo y `lab.env`"; prueba previa del laboratorio el lunes 5 |
| `team-plan.md` y `tasks.md`, semana 2 | Ensayo de despliegue en 5 laptops en el laboratorio el viernes 16 |
| `team-plan.md` y `tasks.md`, semana 3 | La tabla de pruebas de la sección 9 se corre en el laboratorio, no en la nube |

El detalle de en qué fase entra cada cosa está en `implementation-phases.md`.

---

## 12. Pendientes

- Preguntar al profe: **¿las laptops del equipo cuentan como las máquinas separadas?** Si la respuesta es no, se activa el plan E.
- Preguntar al encargado del laboratorio si se pueden conectar laptops por cable y si hay tomas de corriente.
- Confirmar si la competencia es en el laboratorio o en otro lugar (decide si hace falta la VM en la nube).
