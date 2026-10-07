# In-Filtrados

Juego multijugador tipo Among Us sobre las 3R (Reducir, Reutilizar, Reciclar) aplicadas al **agua**: una granja comunitaria en sequía donde uno de los jugadores, el Contaminador, ensucia el agua de los demás en secreto.
Proyecto de Computación en la Nube (equipo de 5). Entrega alrededor del 24 de octubre de 2026.

## Arquitectura en una línea por servicio

| Carpeta | Lenguaje | Qué hace |
|---|---|---|
| `web/` | TypeScript + canvas (Vite, nginx en 8080) | Dibuja el juego; no decide nada |
| `gateway/` | TypeScript (NestJS) | Única puerta de entrada: REST `/api`, WebSocket `/ws`, gRPC hacia atrás |
| `match/` | Go | Motor autoritativo de la partida, una goroutine por sala |
| `players/` | Rust | Cuentas, monedas y progreso |
| `monitor/` | Python (FastAPI) | `/health` de todos, eventos y panel |
| `proto/` | Protobuf | Contratos gRPC compartidos |
| `messages/` | TypeScript | Tipos de los mensajes WebSocket (`@in-filtrados/messages`) |
| `shared/` | JSON | `map.json`, usado por `match` y `web` |

Middleware: gRPC entre servicios y RabbitMQ para eventos. Dos PostgreSQL, uno por cada servicio con datos.

**Patrones nativos de la nube:** API Gateway, Database per Service, Publisher-Subscriber, Health Endpoint Monitoring y Circuit Breaker. Dónde vive cada uno: `docs/architecture.md`, sección 4.

## Requisitos

Docker con Compose, Node 20+, Go 1.22+, Rust estable y Python 3.12+. Para trabajar en un solo servicio basta con Docker y el lenguaje de esa carpeta.

## Levantarlo

```bash
npm install                 # workspaces: messages, web y gateway
cp .env.example .env
docker compose up --build   # http://localhost:8080
```

`docker-compose.yml` y `.env.example` llegan con la tarea S1-03. Los puertos están en `docs/tasks.md`, sección 0.1.

## Documentación

| Documento | Para qué |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Por qué el sistema es así: servicios, decisiones, patrones y resiliencia |
| [`docs/deployment-lab.md`](docs/deployment-lab.md) | Despliegue en el laboratorio: 5 laptops con Docker como nodos y los PCs como clientes |
| [`docs/implementation-phases.md`](docs/implementation-phases.md) | Fases y fechas, con el hito del viernes 9 de octubre |
| [`docs/team-plan.md`](docs/team-plan.md) | Cómo se organiza el equipo y cómo se revisa |
| [`docs/tasks.md`](docs/tasks.md) | El paso a paso de cada tarea y los acuerdos comunes (sección 0) |
| [`docs/design/game-plan.md`](docs/design/game-plan.md) | El diseño del juego |
| [`docs/design/storyboard.html`](docs/design/storyboard.html) | Storyboard de una partida (abrir en el navegador) |

## Cómo trabajamos

- Solo el código va en inglés. El título del juego, los textos de la interfaz, los mensajes al jugador y la documentación van en español.
- Ninguna carpeta tiene dueño: todos trabajan en todo.
- Una rama por tarea con su id: `feat/S1-08-room-loop`. Nada entra a `main` sin PR, revisión y CI en verde.
- Las reglas completas, también para asistentes de IA, están en [`AGENTS.md`](AGENTS.md).
