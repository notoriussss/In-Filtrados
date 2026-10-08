# In-Filtrados: fases de implementación

Cómo se construye el proyecto de principio a fin, en 5 fases, desde hoy hasta la entrega.
Une en un solo lugar lo que está repartido en los otros documentos:

| Documento | Responde |
|---|---|
| `architecture.md` | Por qué el sistema es así: servicios, decisiones y patrones |
| `deployment-lab.md` | Dónde corre cada servicio en el laboratorio |
| `team-plan.md` | Qué entra, qué se corta y cómo se organiza el equipo |
| `tasks.md` | El paso a paso de cada tarea, con su id (`S1-08`) |
| **Este documento** | En qué orden se hace todo y cuándo se considera terminada cada fase |

Fecha: 4 de octubre de 2026. Nadie es dueño de una carpeta: todos trabajan en todo y cada quien toma la siguiente tarea libre (`team-plan.md`, sección 2).

---

## Resumen

| Fase | Fechas | Objetivo | Hito que la cierra |
|---|---|---|---|
| **0. Base** | Sáb 3 al lun 5 oct | Repo, contratos, `compose`, CI y validar el laboratorio | `docker compose up` levanta todo y la prueba del laboratorio está hecha |
| **1. Esqueleto** | Mar 6 al vie 9 oct | Un flujo de punta a punta | **Vie 9:** dos navegadores inician sesión, entran a la misma sala y se ven moverse |
| **2. Juego completo** | Sáb 10 al vie 16 oct | Una partida entera jugable y desplegada en varias máquinas | **Vie 16:** partida completa en 5 laptops en el laboratorio |
| **3. Resiliencia** | Sáb 17 al jue 22 oct | Pasar la prueba del profe | **Jue 22:** la tabla de pruebas de `deployment-lab.md`, sección 9, en verde |
| **4. Pulido y entrega** | Vie 23 al sáb 24 oct | Presentación y ensayo | **Vie 23:** dos ensayos generales completos |

**Regla de oro:** primero un juego completo y feo, después bonito. Si una fase se atrasa, se recorta lo de "si sobra tiempo", nunca la resiliencia ni los 5 patrones.

```
oct   3  4  5 | 6  7  8  9 | 10 ... 16 | 17 ... 22 | 23 24
      [ F0   ] | [  F1    ] | [  F2    ] | [  F3    ] | [F4 ]
            ▲ prueba lab  ▲ hito 1     ▲ ensayo lab ▲ pruebas  ▲ entrega
```

---

## Fase 0. Base (sábado 3 al lunes 5 de octubre)

**Objetivo:** que los 5 puedan trabajar en paralelo sin pisarse, y saber desde el primer día si el laboratorio sirve.

| Qué | Tarea |
|---|---|
| Monorepo con la estructura de `architecture.md` | S1-01 |
| Contratos gRPC v0 (`match.proto`, `players.proto`) | S1-02 |
| `docker-compose.yml` con todos los servicios, 2 PostgreSQL y RabbitMQ | S1-03 |
| Mapa en canvas | S1-04 |
| CI en GitHub Actions y `/health` en los 5 servicios | S1-05, S1-06 |
| **Prueba previa del laboratorio** con 2 laptops y 1 PC (va quien pueda) | `deployment-lab.md`, sección 7 |
| Preguntas al profe | `team-plan.md`, sección 7 |
| Rebanada vertical en llamada, con todos: navegador → gateway → `match` → navegador | S1-07 |

**Preguntas para el profe (lunes 5):**
1. ¿Las laptops del equipo cuentan como las máquinas separadas?
2. ¿Cada lenguaje debe tener un peso parecido?
3. ¿Fecha exacta de entrega, dónde es la competencia y cómo se evalúa?

**Decisión que sale de esta fase:** el plan de despliegue (A a E de `deployment-lab.md`, sección 8). Si el profe exige los PCs del laboratorio como servidores, se replanifica la fase 2 antes del martes.

**Terminada cuando:**
- [ ] Todos clonan el repo y `docker compose up` levanta los servicios, aunque solo digan "hola".
- [ ] El CI pasa en verde.
- [ ] La prueba del laboratorio está hecha y se sabe qué plan de despliegue se usa.
- [ ] Un punto se mueve con el teclado pasando por gateway y `match`.

---

## Fase 1. Esqueleto (martes 6 al viernes 9 de octubre)

**Objetivo:** que cada servicio haga su trabajo mínimo y que todos estén conectados. Todo corre en una sola máquina con `docker compose up`.

| Servicio | Qué queda listo | Tareas |
|---|---|---|
| `match/` (Go) | Goroutine por sala a 20 Hz, `CreateRoom`, `JoinRoom`, stream `Play`, colisiones, publicar `match.started` y `match.finished` | S1-08 a S1-11 |
| `players/` (Rust) | Registro y login con `argon2`, tokens JWT, perfil con monedas, consumidor idempotente | S1-12 a S1-14 |
| `gateway/` (NestJS) | REST de auth y salas, puente WebSocket ↔ `Play`, Retry y Circuit Breaker | S1-15 a S1-17 |
| `web/` (TS + canvas) | Login, sala de espera, partida, moverse y ver a los demás, reconexión básica | S1-18 a S1-20 |
| `monitor/` (Python) | Panel de salud y contadores con eventos | S1-21, S1-22 |
| Infra | `deploy/compose/n1.yml` … `n5.yml` y `lab.env.example` (reemplaza a S1-23 "desplegar en la nube") | S1-23 |

**Patrones que ya quedan funcionando:** API Gateway, Database per Service, Publisher-Subscriber y Health Endpoint Monitoring. El Circuit Breaker queda programado; se demuestra en la fase 3.

**Hito del viernes 9:**
- [ ] Dos personas en dos navegadores se registran, inician sesión, entran a la misma sala y se ven moverse.
- [ ] El panel del monitor muestra todo en verde.
- [ ] Todo corre con `docker compose up` en una máquina.

**Si se atrasa:** el despliegue en varias máquinas espera a la fase 2; el hito del viernes es en una sola máquina a propósito.

---

## Fase 2. Juego completo (sábado 10 al viernes 16 de octubre)

**Objetivo:** jugar una partida entera de principio a fin, y correrla por primera vez repartida en las 5 laptops.

| Servicio | Qué queda listo | Tareas |
|---|---|---|
| Contratos | `proto/` y `messages/` v1 del juego | S2-01 |
| `match/` | Roles e impostor, tanques y contaminación, tareas de las 3R, reportar, reunión, votación, fin de partida | S2-02 a S2-06 |
| `players/` | Monedas según resultado, estadísticas | S2-07 |
| `gateway/` | Mensajes nuevos, chat de reunión, límite de velocidad; **heartbeat** de 2 s / 5 s con el navegador y keepalive gRPC | S2-08 |
| `web/` | Barras de tanques, contaminar, reunión y votación, minijuegos de las 3R, gotas de aceite; **heartbeat** del lado del navegador | S2-09 a S2-12 |
| `monitor/` + infra | Litros ahorrados, expulsiones; `check-network.ps1` y `seed.ps1` | S2-13 |

> El heartbeat se adelanta a esta fase porque es pequeño y sin él ninguna prueba de desconexión en el laboratorio funciona.

**Ensayo de despliegue (viernes 16, en el laboratorio):**
1. Cada uno trae su laptop con las imágenes ya descargadas.
2. Se copia `lab.env` con las IP del día y se corre `check-network.ps1`.
3. Se levantan los 5 nodos en el orden de `deployment-lab.md`, sección 6.
4. Se juega una partida completa desde los PCs del laboratorio.
5. Se anota todo lo que falló para arreglarlo en la fase 3.

**Hito del viernes 16:**
- [ ] Una partida completa con tareas, contaminación, reunión, votación y monedas al final.
- [ ] Corre repartida en 5 laptops y se juega desde los PCs del laboratorio.

**Si se atrasa:** se recortan minijuegos (dejar uno por tipo de tarea) y gotas de aceite. No se recorta el ensayo en el laboratorio.

---

## Fase 3. Resiliencia (sábado 17 al jueves 22 de octubre)

**Objetivo:** pasar la prueba del profe: desconectar cualquier máquina y que, al reconectarla, todo siga exactamente donde estaba.

En parejas, como en `team-plan.md`, sección 5:

| Qué queda listo | Tarea |
|---|---|
| `Resume` con la foto completa, volver tras recargar la página, **pausar la sala cuando se desconecta cualquier jugador** y gracia configurable (`RECONNECT_GRACE_SECONDS`) | S3-01 |
| Instantáneas cada 2 s en `snapshots` y restaurarlas al arrancar; JWT validado con la clave pública en gateway y `match` | S3-02 |
| **Outbox en `match`** (tabla `outbox` + publicador), ack solo después de guardar en Rust | S3-03 |
| Cola de chat sin conexión con ids únicos; jugadores desconectados en el panel | S3-04 |
| Sabotajes y visión limitada, **solo si lo anterior está listo** | S3-05 |

**Jueves 22: batería de pruebas en el laboratorio (S3-06).** Se corre completa la tabla de `deployment-lab.md`, sección 9, con las 5 laptops:

| Prueba | Patrón que se ve |
|---|---|
| Quitar el cable de un PC cliente 2 minutos | Reconexión y pausa |
| Recargar la página a mitad de partida | Reconexión |
| Quitar el cable de N1 2 minutos | API Gateway como único punto de entrada |
| `docker compose restart match` en N2 | Instantáneas |
| Quitar el cable de N3 y terminar una partida | **Circuit Breaker** y Pub-Sub con cola durable |
| Quitar el cable de N4 y terminar una partida | Outbox y Pub-Sub |
| Apagar N5 | El monitor no es dependencia de nadie |
| Mirar el panel durante todas las anteriores | **Health Endpoint Monitoring** |

**Hito del jueves 22:**
- [ ] Las 7 pruebas pasan en el laboratorio.
- [ ] Lo que falle se arregla ese mismo día o se saca de la demo con una explicación preparada.

**Si se atrasa:** se cortan sabotajes y visión limitada (S3-05) primero, y el chat sin conexión (S3-04) después.

---

## Fase 4. Pulido y entrega (viernes 23 y sábado 24 de octubre)

**Objetivo:** que la presentación salga igual que en los ensayos.

- Presentación y guion de la demo.
- Diagramas UML al día (componentes, secuencias, despliegue con las 5 laptops).
- `architecture.md` al día con los cambios de `deployment-lab.md`, sección 11.
- Datos de prueba con `seed.ps1` y QR para el jurado.
- Ensayo general, dos veces, con la demo de desconexión incluida (S3-07).

**Guion sugerido de la demo (10 minutos):**
1. Arquitectura en una lámina: 5 servicios, 4 lenguajes, 5 laptops.
2. Jugar una partida corta desde los PCs del laboratorio, con el panel proyectado.
3. El profe (o el equipo) desconecta una máquina; se muestra la pausa y la reanudación.
4. Desconectar N3: el login dice "no disponible" pero la partida sigue (Circuit Breaker), y las monedas llegan al reconectar.
5. Cerrar con la tabla de los 5 patrones y dónde se vio cada uno.

**Hito final (vie 23):**
- [ ] Dos ensayos completos sin fallos.
- [ ] Cada integrante sabe levantar cualquier nodo y explicar cualquier patrón.

---

## Los 5 patrones a lo largo de las fases

| Patrón | Se construye | Se demuestra |
|---|---|---|
| API Gateway | Fase 1 (S1-15, S1-16) | Fase 3: los navegadores solo conocen N1 |
| Database per Service | Fase 0-1 (S1-03, S1-11, S1-12) | Fase 2: cada base solo es accesible desde su nodo |
| Publisher-Subscriber | Fase 1 (S1-11, S1-14, S1-22) | Fase 3: desconectar N3 o N4 sin perder eventos |
| Health Endpoint Monitoring | Fase 0-1 (S1-06, S1-21) | Todas: el panel proyectado |
| Circuit Breaker | Fase 1 (S1-17) | Fase 3: desconectar N3 durante la partida |

**De respaldo**, si el profe no acepta alguno: Retry (fase 1), Gateway Offloading (fase 2), Queue-Based Load Leveling (fase 1) y Transactional Outbox (fase 3), como en `architecture.md`, sección 4.

---

## Riesgos y qué se hace si pasan

| Riesgo | Señal temprana | Qué se hace |
|---|---|---|
| El laboratorio no deja conectar laptops | Prueba del lunes 5 | Switch propio (plan C) |
| El profe exige los PCs del laboratorio como servidores | Respuesta a la pregunta 1 | Plan E de `deployment-lab.md`; se recortan extras de la fase 2 para hacer espacio |
| `match/` se atrasa (es la carpeta más pesada) | El hito del viernes 9 no se cumple | Quien termine antes ayuda en `match/`; se recortan tareas de las 3R a una por tipo |
| Una laptop falla el día de la demo | — | Agrupar nodos (`deployment-lab.md`, sección 8) |
| La desconexión deja conexiones "a medias" | Ensayo del viernes 16 | Revisar el heartbeat y el keepalive de gRPC antes de la fase 3 |
