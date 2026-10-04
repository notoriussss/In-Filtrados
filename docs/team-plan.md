# Bajo la Superficie: plan del equipo (3 semanas)

Cómo se reparten el trabajo 5 personas que van a tocar todo el proyecto, con **3 semanas** para terminar.
Se apoya en `architecture.md`: los nombres de carpetas, eventos y contratos son los de ese documento.
Fecha: 3 de octubre de 2026.

> Las personas se llaman **A, B, C, D y E** hasta que el equipo ponga los nombres.
> Supuesto de fechas: semana 1 del sábado 3 al viernes 9 de octubre, semana 2 del 10 al 16, semana 3 del 17 al 23, y entrega alrededor del 24. Si la fecha real es otra, se corren los bloques.

---

## 1. Qué entra y qué no

Con 3 semanas, la regla es **primero un juego completo y feo, después bonito**. El viernes de la semana 2 tiene que poder jugarse una partida entera de principio a fin.

**Entra sí o sí (lo que evalúa el profe):**
- Partida en vivo: moverse, tareas de las 3R, contaminar tanques, reportar, reunión con chat y votación.
- Login y monedas por partida.
- Los 5 patrones: API Gateway, Database per Service, Publisher-Subscriber, Health Endpoint Monitoring y Circuit Breaker.
- Reconexión tras cortar la red (la prueba del profe).
- Monitor con panel.
- Desplegado en una máquina en la nube.

**Entra si sobra tiempo (semana 3):**
- Sabotajes: empezar con 2 (tubería rota y vapor) y agregar los otros 3 solo si sobra tiempo.
- Visión limitada, torre de agua y panel de bombas.
- Ranking.

**Se corta:**
- Tienda de mejoras y atuendos.
- Desagües del impostor.
- Gráficos finales: se usan figuras simples y colores hasta la semana 3.

---

## 2. Cómo se reparten sin perder tiempo

Con 3 semanas no da para cambiar de dueño cada semana: cada traspaso cuesta días. Así que:

1. **Dueño fijo por carpeta** las 3 semanas, para avanzar rápido.
2. **Revisor rotativo:** cada semana, cada persona revisa los PRs de **otra** carpeta y hace al menos una tarea pequeña ahí. Al final, cada uno habrá trabajado en 3 servicios distintos.
3. **Semana 3 en parejas cruzadas:** las tareas de resiliencia y pulido se hacen en parejas de distinta carpeta, así todos tocan el flujo completo antes de presentar.
4. **Reunión diaria de 10 minutos** (puede ser por chat): qué hice, qué haré y en qué estoy trabado. Si algo bloquea a otro, se resuelve ese mismo día.
5. **`proto/` es de todos:** cualquier cambio necesita la aprobación de quien lo implementa y de quien lo consume.
6. **Nada entra a `main` sin PR y sin CI en verde.** PRs pequeños, revisados el mismo día.
7. **Código en inglés; conversación y documentación en español.**

| Carpeta | Dueño | Revisor semana 1 | Revisor semana 2 | Revisor semana 3 |
|---|---|---|---|---|
| `match/` (Go) | A | B | C | D |
| `players/` (Rust) | B | C | D | E |
| `gateway/` (NestJS) | C | D | E | A |
| `web/` (TS + canvas) | D | E | A | B |
| `monitor/` (Python) + infra | E | A | B | C |

> `match/` y `web/` son las carpetas más pesadas. Si alguien termina antes, ayuda primero ahí.

---

## 3. Semana 1 (3 al 9 de octubre): base y esqueleto funcionando

**Meta del viernes 9:** dos personas en dos navegadores se registran, inician sesión, entran a la misma sala y se ven moverse por el mapa. El panel del monitor muestra todo en verde. Todo corre con `docker compose up`.

### Sábado 3 y domingo 4: la base (todos en paralelo)

| Persona | Tarea | Listo cuando |
|---|---|---|
| **A** | Crear el monorepo con la estructura de `architecture.md`, el `package.json` con workspaces y el `README.md` | Todos clonan y ven las carpetas |
| **B** | `match.proto` y `players.proto` v0 (`CreateRoom`, `JoinRoom`, `Play`, `Register`, `Login`, `ValidateToken`); Go y Rust generan su código | Compilan los dos servicios con los stubs |
| **C** | `docker-compose.yml` con los 5 servicios, 2 PostgreSQL y RabbitMQ, más `.env.example` | `docker compose up` levanta todo aunque cada servicio solo diga "hola" |
| **D** | Proyecto Vite + canvas que dibuja el mapa desde un archivo de datos (zonas, canal y puentes con rectángulos de colores) | Se ve el mapa en el navegador |
| **E** | CI en GitHub Actions con filtros por carpeta, y un `/health` en cada servicio | El CI pasa en verde y los 5 `/health` responden |

### Lunes 5: la rebanada vertical (sesión en grupo, 2 a 3 horas)
Conectar navegador → gateway → `match` → de vuelta, para que un punto se mueva con el teclado. Háganlo juntos en una llamada: es donde todos entienden el flujo completo y salen los errores de integración temprano.

### Martes 6 al viernes 9: cada uno su servicio

**A — `match/`**
- [ ] Goroutine por sala con canal de acciones y ticker a 20 Hz
- [ ] `CreateRoom`, `JoinRoom` y stream `Play` con movimiento
- [ ] Colisiones con paredes y puentes
- [ ] Tablas `matches` y `participants`
- [ ] Publicar `match.started` y `match.finished`

**B — `players/`**
- [ ] Migraciones de `players` y `results`
- [ ] `Register` y `Login` con `argon2`; tokens y `ValidateToken`
- [ ] `GetProfile` con monedas
- [ ] Consumidor de `match.finished` idempotente (`ON CONFLICT DO NOTHING`), con una prueba que mande el evento dos veces

**C — `gateway/`**
- [ ] WebSocket con tipos de `messages/`
- [ ] Login vía `players` y validación del token al conectar
- [ ] Puente WebSocket ↔ stream `Play`
- [ ] Retry y Circuit Breaker en los clientes gRPC

**D — `web/`**
- [ ] Pantallas de login, sala de espera y partida
- [ ] Mover al personaje y dibujar a los demás con lo que manda `match`
- [ ] Reconexión automática del WebSocket con "Reconectando…" (sin `Resume` todavía)

**E — `monitor/` + infra**
- [ ] Consultar los `/health` cada 5 s y panel con el estado de cada servicio
- [ ] Consumir `match.started` y `match.finished`: jugadores en línea y partidas activas
- [ ] Colas durables en RabbitMQ
- [ ] Crear la máquina virtual en la nube y desplegar ahí lo que haya el viernes

---

## 4. Semana 2 (10 al 16 de octubre): el juego completo

**Meta del viernes 16:** una partida entera de principio a fin con tareas, contaminación, reportar, reunión, votación y fin con monedas. Desplegada en la nube.

| Carpeta | Tareas |
|---|---|
| `match/` (A) | Asignar impostor; tanques de riego con contaminación de 0 a 100 %; 3 tareas de las 3R (cerrar fuga, recoger agua gris, filtrar en la planta); contaminar toma 3 s; reportar tanque arruinado; reunión con los últimos 3 que pasaron (`event_log`); votación y expulsión; condiciones de victoria |
| `players/` (B) | Monedas según la cosecha y el resultado; estadísticas básicas (partidas y victorias); ayudar a A con las pruebas de `match/` |
| `gateway/` (C) | Mensajes de tareas, contaminación, reunión y voto; chat de la reunión; límite de velocidad por jugador |
| `web/` (D) | Minijuegos simples de las 3 tareas; barra de contaminación de cada tanque; pantalla de reunión con chat y votación; gotas de aceite |
| `monitor/` + infra (E) | Sabotajes, expulsiones y litros "ahorrados" en el panel; despliegue automático a la nube desde `main`; ayudar a D con la pantalla de reunión |

---

## 5. Semana 3 (17 al 23 de octubre): resiliencia, pulido y ensayo

**Lunes a miércoles: resiliencia y extras, en parejas cruzadas**

| Pareja | Tarea |
|---|---|
| A + D | Periodo de gracia de 90 s, `Resume` con foto completa, volver tras recargar la página |
| A + C | Instantáneas cada 2 s en `snapshots` y restaurarlas al arrancar; pausar la partida si no queda nadie |
| B + E | Ack solo después de guardar; probar `docker compose stop players` en plena partida |
| C + E | Cola de chat sin conexión con ids únicos; jugadores desconectados en el panel |
| D + B | Sabotajes (tubería rota y vapor) y visión limitada, si el resto está listo |

**Jueves: todos corren la tabla de pruebas** de la sección 6.4 de `architecture.md` en la máquina de la nube, incluido desconectar la red del servidor.

**Viernes: ensayo general**, dos veces, con la presentación, el QR para el jurado y el panel proyectado.

---

## 6. Tareas que no son de una carpeta

| Tarea | Quién | Cuándo |
|---|---|---|
| Preguntas al profe (sección 7) | A | Lunes 5 |
| Diagramas UML: componentes y secuencia del login | E | Semana 1 |
| Diagramas UML: secuencia de una partida y despliegue | B | Semana 2 |
| Mantener `architecture.md` al día | Quien cambie una decisión, en el mismo PR | Siempre |
| Presentación y guion de la demo | C y D | Semana 3 |

---

## 7. Preguntas para el profe (esta semana)

- ¿Los servicios deben correr en máquinas separadas?
- ¿Cada lenguaje debe tener un peso parecido? (afecta qué tanto hace `monitor/`)
- ¿Cuál es la fecha exacta de entrega y cómo será la evaluación?
