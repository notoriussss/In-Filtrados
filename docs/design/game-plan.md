# Bajo la Superficie — plan del proyecto

**Bajo la Superficie** es un juego multijugador tipo Among Us con farmeo, sobre las 3R (Reducir, Reutilizar, Reciclar) aplicadas al **agua**.
Proyecto de Computación en la Nube, equipo de 5 personas.

> Estado: ideas en discusión, todavía sin código. El juego recoge lo que el equipo ha ido eligiendo; la arquitectura, los lenguajes y el reparto son una **propuesta** que falta confirmar.

## 1. Requisitos del curso (de los apuntes)

- Backend en **Rust** y **Go** (con goroutines), comunicados por **gRPC**, corriendo en **1 máquina**.
- **2 servidores PostgreSQL**: uno para Rust y otro para Go.
- Interfaz con 2 de {Java, Python, TypeScript}: se propone **TypeScript + Python** (por confirmar).
- El juego debe tener **streaming, chat y actualizaciones en vivo**, sobre las **3R**, con el **agua** como recurso.
- El informe debe mostrar **mínimo 5 patrones nativos de la nube** presentes en el proyecto.
- **Swagger** para las APIs y **UML** para lo demás.
- Valor agregado: **CI/CD**.
- Un **monitor** que muestre que todo está bien: servicios vivos, usuarios conectados, BD corriendo.
- Criterio del equipo: que sea **divertido y destaque** (es una competencia), pero **simple**, no un alarde de tecnología.

## 2. El juego

### Idea general
De 4 a 8 jugadores trabajan en una **granja comunitaria en plena sequía**. El agua es el centro de todo: sin agua limpia no crece nada. Todos son tripulantes que cuidan el agua y riegan sus cultivos con tareas de las 3R, pero uno es **El Contaminador**, un impostor secreto que finge ayudar mientras contamina el agua de los demás. Los tripulantes tienen que descubrirlo y expulsarlo por votación antes de que arruine el embalse.

### El mapa
Seis zonas y una opcional. El huerto queda abajo y el agua arriba y a los lados, así que siempre hay que cruzar el mapa.

```
                    [ Embalse ]  (cascada)
 (molino)                         (torre de agua)
[ Techos con   ]   [  Plaza   ]   [ Planta de    ]
[ barriles     ]   [ central  ]   [ tratamiento  ]
~~~~ puente O ~~~~~ puente C ~~~~~ puente E ~~~~~   <- canal
[ Cuarto de    ]   [  Huerto  ]   [ Lavadero     ]
[ bombas       ]   [+invernad.]   [ (sábanas)    ]
     una acequia rodea todo el mapa como un anillo
```

| Zona | Ubicación | Qué pasa ahí | Emergencia |
|---|---|---|---|
| **Plaza central** | Centro | Todos aparecen aquí. Tiene el **pozo de reuniones** (botón de emergencia) y es donde se vota. Al lado está la **torre de agua**, que vigila el huerto. Es un cruce, así que la gente se ve | — |
| **Embalse comunitario** | Norte | La meta del equipo: aquí se deposita el agua limpia. Su nivel y su pureza se ven en vivo | Sequía: el nivel baja el doble |
| **Techos con barriles de lluvia** | Oeste | **Reutilizar:** llenar cubetas con agua de lluvia. Es la fuente más cercana al huerto, así que pasa mucha gente. Referencia: el **molino** | — |
| **Planta de tratamiento** | Este | **Reciclar:** minijuego del filtro (grava, arena, carbón). Está apartada: buena para coartadas o para ver llegar a alguien | Algas en la planta |
| **Lavadero / tanque de agua gris** | Sureste | **Reutilizar:** recoger agua gris de lavar. De aquí sale agua sucia que se lleva a la planta. Las **sábanas tendidas** tapan la vista | — |
| **Cuarto de bombas y tuberías** | Suroeste | **Reducir:** cerrar fugas y girar válvulas. Tiene el **panel de bombas** (cuántos hay en cada zona). Las tuberías recorren el mapa, así que también aparecen fugas sueltas en los pasillos | Tubería principal rota |
| **Huerto** | Sur | Las parcelas de todos en fila, cada una con su **tanque de riego**. Incluye el **invernadero**, un punto ciego. Es el blanco del impostor y donde aparecen las gotas de aceite | — |
| **Desagües** (opcional) | Entre zonas lejanas | Pasadizos que solo el impostor puede usar para moverse rápido, como las ventilas de Among Us | — |

### Cómo se recorre el mapa (para que sea divertido, como el de Among Us)
1. **Un canal con solo 3 puentes.** El canal parte el mapa en dos: el agua arriba y el huerto abajo. Todos tienen que cruzar por los puentes, así que ahí se ven y nacen las coartadas ("te vi en el puente norte"). Sabotaje: el impostor puede **cerrar una compuerta** y bloquear un puente durante un rato.
2. **Pasillos en anillo, sin callejones sin salida.** Una acequia rodea el mapa y une todas las zonas en círculo, con un atajo por la plaza. Siempre hay dos caminos: se puede escapar, perseguir o dar la vuelta para no ser visto.
3. **Visión limitada.** Cada jugador solo ve un círculo a su alrededor. Sabotaje: **"¡vapor en la planta!"**, que reduce la visión de todos hasta que alguien lo arregla.
4. **Salas que dan información.**
   - **Torre de agua** (junto a la plaza): desde arriba se ve el huerto en vivo, como las cámaras de Among Us.
   - **Panel de bombas** (en el cuarto de bombas): muestra cuántas personas hay en cada zona, sin decir quiénes, como la mesa de Admin.
5. **Escondites y puntos ciegos.** El **invernadero** del huerto, con plantas altas que tapan la vista, y las **sábanas tendidas** del lavadero.
6. **Tareas en dos partes.** Por ejemplo: "abre la válvula en el cuarto de bombas y luego confirma el flujo en el embalse". Obligan a cruzar el mapa y los puentes.
7. **Un punto de referencia por zona:** el molino junto a los barriles, la torre de agua, el puente de madera y la cascada del embalse. Sirven para ubicarse y para hablar en la reunión ("estaba en el molino").

Si falta tiempo, las tres que más aportan con menos código son **el canal con puentes, la visión limitada y la torre de agua**.

### Farmeo con las 3R (durante la partida)
Los cultivos solo crecen si les llevas **agua limpia en cubetas**. Para conseguirla hay tareas cortas:

| R | Tarea | Dónde |
|---|---|---|
| **Reducir** | Cerrar fugas, arreglar grifos que gotean, cambiar a riego por goteo | Tuberías y grifos del mapa |
| **Reutilizar** | Recoger agua gris de lavar y agua de lluvia para regar | Tanque de agua gris / barriles de lluvia |
| **Reciclar** | Llevar agua sucia a la planta de tratamiento para que vuelva limpia | Planta de tratamiento |

Cada riego hace crecer la cosecha, y el agua limpia que sobra se aporta al **embalse comunitario**.

### Qué obliga a moverse (para que nadie se quede en su parcela)
1. **El agua está lejos.** En la parcela solo se riega; el agua limpia hay que ir a buscarla y traerla en cubetas. Quedarse protege el tanque, pero no hace crecer nada.
2. **Emergencias de agua.** De vez en cuando el servidor lanza "¡se rompió la tubería principal!", "¡algas en la planta de tratamiento!" o "¡sequía: el embalse baja el doble!". Si no se atiende en 30 segundos, todos los tanques suben un 20 % de contaminación. Es también el mejor momento para que el impostor ataque.
3. **El agua cuenta solo en el embalse** (opcional). Quien nunca aporta nada se vuelve sospechoso.

### El impostor
- Finge hacer tareas, pero **echa aceite o químicos en los tanques de riego** de los demás y sabotea tuberías.
- Contaminar toma unos **3 segundos junto al tanque**, con una animación visible.
- Su propio tanque también se contamina un poco solo, para que no lo delate verlo siempre limpio.

### Sabotajes del impostor (eventos para distraer)
Además de los eventos aleatorios, el impostor puede disparar sabotajes desde un menú. **Se ven idénticos a los eventos aleatorios**, así nadie sabe si fue mala suerte o fue él.

| Sabotaje | Qué pasa | Cómo se arregla |
|---|---|---|
| **Romper la tubería principal** (crítico) | Si no se arregla en 30 s, todos los tanques suben 20 % de contaminación | Dos jugadores a la vez, uno en cada extremo de la tubería |
| **Vapor en la planta** | La visión de todos se reduce | Un jugador apaga la válvula de vapor en la planta |
| **Cerrar una compuerta** | Uno de los 3 puentes queda bloqueado 20 s | Se reabre solo, o antes desde el cuarto de bombas |
| **Apagón de bombas** | La torre de agua y el panel de bombas dejan de funcionar | Un jugador reinicia el generador en el cuarto de bombas |
| **Fuga falsa** (opcional) | Aparece una fuga en la zona más lejana y el embalse pierde agua | Cerrarla, como cualquier fuga |

**Reglas para que sea justo:**
- Tiempo de espera compartido de unos **40 s** entre sabotajes.
- **Un solo sabotaje activo** a la vez; ninguno en los primeros 30 s ni durante una reunión.
- El crítico (la tubería) **máximo 2 veces por partida**.
- Cuando el impostor sabotea, los eventos aleatorios se pausan un rato para que no se acumulen.

La jugada clásica es **sabotear y contaminar a la vez**: mientras todos corren a la tubería, el impostor va al tanque de alguien. Eso da material para la reunión ("¿por qué no estabas en la tubería?").

### Eliminación
- **Por contaminación:** cada tanque de riego tiene una barra del 0 al 100 %. Si llega a 100 %, los cultivos de ese jugador mueren y queda eliminado. El dueño o un compañero pueden limpiarlo con agua tratada si llegan a tiempo.
- **Por votación:** en una reunión se discute por el chat y se vota para expulsar a alguien.
- **Los eliminados quedan como fantasmas** y siguen haciendo tareas, así nadie se aburre.

### Pistas para descubrir al impostor
1. **Cercanía visible:** contaminar toma tiempo y se ve. Pero los tripulantes también visitan tanques ajenos para limpiarlos, así que estar cerca no prueba nada por sí solo.
2. **Gotas de aceite:** después de contaminar, el impostor deja gotas de aceite del color de su personaje durante unos 15 segundos.
3. **Tanque arruinado y reporte:** quien encuentra un tanque contaminado al 100 % lo reporta y se abre la reunión. En ella se muestran los **últimos 3 jugadores** que pasaron por ese tanque, sin decir quién lo contaminó.
4. **Alerta al dueño** (opcional): "¡tu tanque está siendo contaminado!", sin decir por quién.

### Cómo se gana
- **Tripulantes:** llenan el embalse con agua limpia **o** expulsan al impostor.
- **Impostor:** contamina el embalse (pureza total en 0 %) **o** quedan tantos impostores como tripulantes.

### Progreso entre partidas (el farmeo que engancha)
La cosecha se guarda en el perfil como **semillas y monedas**. Con eso cada jugador mejora su **parcela personal** (riego por goteo, barriles de lluvia, filtros) y desbloquea **atuendos**. Eso da ganas de jugar "una más".

### Alcance mínimo (para no morir en el intento)
Un solo mapa (con canal, 3 puentes, visión limitada y torre de agua), una tarea por cada R, el aceite en el tanque, la tubería principal como emergencia y sabotaje, reunión con votación y chat. Todo lo demás es extra.

## 3. Arquitectura propuesta

> Propuesta para discutir con el equipo, no una decisión tomada.

```
Navegador (TypeScript: el juego en canvas o Phaser)
      │  REST (login, perfil, tienda)      WebSocket (partida en vivo, chat)
      ▼
Gateway (TypeScript, NestJS)  ── Swagger /docs
      │  gRPC                               │ gRPC (streaming)
      ▼                                     ▼
Jugadores (Rust)  ◄────── gRPC ──────  Motor de partida (Go)
cuentas, login, cosechas,              una goroutine por sala: mapa,
monedas, parcela personal,             tareas, agua, contaminación, emergencias,
atuendos, ranking                      gotas de aceite, reuniones, votación, chat
      │                                     │
PostgreSQL #2 (jugadores)            PostgreSQL #1 (partidas)

Monitor (Python, FastAPI) ── Swagger /docs
revisa /health de todos, usuarios en línea, salas activas, estado de ambas BD
```

| Servicio | Lenguaje | Qué hace | BD |
|---|---|---|---|
| Frontend | TypeScript | Pantalla del juego, movimiento, tareas, reuniones, chat, tienda | — |
| Gateway | TypeScript (NestJS) | Único punto de entrada del navegador. Expone los endpoints REST, valida el login (JWT), limita el chat y reenvía la partida en vivo por WebSocket hacia Go. Habla con Go y Rust por gRPC | — |
| Motor de partida | Go | Salas y partidas en vivo. Una goroutine por sala con un "tick" que hace crecer cultivos, sube la contaminación de los tanques, mueve el nivel del embalse, lanza emergencias (aleatorias o sabotajes del impostor, con su tiempo de espera) y borra las gotas de aceite. Canales para repartir el estado a los jugadores. Guarda historial de partidas y chat | PostgreSQL #1 |
| Jugadores | Rust | Todo lo que persiste: cuentas, login, cosechas, monedas, parcela personal, atuendos, ranking. Al terminar una partida, Go le envía los resultados por gRPC | PostgreSQL #2 |
| Monitor | Python (FastAPI) | Panel de salud: servicios arriba o abajo, usuarios conectados, salas activas, BD respondiendo | No tiene BD propia |

Los archivos `.proto` van en una carpeta compartida del repositorio y son el contrato entre los servicios.

## 4. Patrones nativos de la nube

| # | Patrón | Dónde está en el proyecto |
|---|---|---|
| 1 | **API Gateway** | El gateway NestJS es la única entrada del navegador y enruta hacia Go y Rust |
| 2 | **Database per Service** | Go y Rust tienen cada uno su PostgreSQL; ninguno lee la BD del otro, solo se hablan por gRPC |
| 3 | **Publish/Subscribe** | Dentro de Go, cada sala publica su estado (nivel del embalse, contaminación de tanques, gotas de aceite, emergencias, votos, chat) por canales y cada jugador conectado está suscrito |
| 4 | **Health Endpoint Monitoring** | Cada servicio expone `/health` (o el Health Check de gRPC); el monitor Python los consulta junto con ambas BD |
| 5 | **Circuit Breaker + Retry** | El gateway protege sus llamadas gRPC (por ejemplo con la librería opossum). Si Rust cae, la partida sigue y la tienda muestra "no disponible" |
| 6 | **Gateway Offloading** (extra) | El login JWT se valida en el gateway, no en cada servicio |
| 7 | **Rate Limiting** (extra) | Máximo de mensajes de chat y acciones por segundo por jugador, en el gateway |

Con los 5 primeros se cumple el mínimo; el 6 y el 7 salen casi gratis.

## 5. Infraestructura, CI/CD y documentación

- **Una máquina** con `docker compose`: frontend, gateway, Go, Rust, monitor y los 2 PostgreSQL. Nada de Kubernetes, Redis ni Grafana.
- **CI/CD:** un workflow de GitHub Actions que, en cada push, compila y corre las pruebas de cada servicio (`cargo test`, `go test`, `npm test`, `pytest`) y construye las imágenes Docker. Si da tiempo: despliegue automático a la máquina al hacer merge a `main`.
- **Swagger:** gateway (NestJS) y monitor (FastAPI) lo generan solos. Go y Rust se documentan con sus `.proto`.
- **UML:**
  - Componentes (el diagrama de la sección 3)
  - Despliegue (la máquina y sus contenedores)
  - Secuencia: unirse a una sala, contaminar un tanque, reportar y votar, fin de partida y guardado de la cosecha
  - Clases o modelo de datos de cada servicio

## 6. Reparto propuesto para 5 personas

| Persona | Responsable de | Además |
|---|---|---|
| 1 | Motor de partida en Go (salas, tick, agua y contaminación, emergencias, votación, chat) | UML de secuencia de la partida, BD #1 |
| 2 | Servicio de jugadores en Rust (login, cosechas, monedas, parcela personal, ranking) | Esquema de BD #2 |
| 3 | Frontend TypeScript (mapa, movimiento, tareas, reuniones, tienda) | Arte y sonido |
| 4 | Gateway NestJS (REST, WebSocket, JWT, circuit breaker, rate limit, Swagger) | Dueño de los `.proto` |
| 5 | Monitor Python + DevOps (docker compose, CI/CD) | UML de despliegue |

Cada persona escribe en el informe el patrón que vive en su parte.

## 7. Orden sugerido

1. Acordar los `.proto`, el esquema de las dos BD y el mapa en papel.
2. Versión mínima jugable: sala, movimiento, una tarea por cada R, una parcela con su tanque por jugador, contaminación y votación con chat.
3. Añadir gotas de aceite, reporte de tanque arruinado, emergencias y el guardado de la cosecha en Rust.
4. Monitor, circuit breaker y CI/CD.
5. Tienda de atuendos, pulido visual, Swagger, UML e informe.
