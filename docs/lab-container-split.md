# In-Filtrados: cómo separar los contenedores en 5 computadoras

Guía práctica para pasar del `docker-compose.yml` de desarrollo (todo en una
máquina) a un sistema distribuido en **5 laptops** de la red del laboratorio.
Fecha: 25 de octubre de 2026.

> Este documento explica **cómo se hace la separación** paso a paso. Las
> decisiones de fondo (por qué esta topología, contingencias, resiliencia y
> ancho de banda) están en `docs/deployment-lab.md`, y los comandos de
> operación diaria en `deploy/README.md`. Si algo no coincide, mandan esos
> dos archivos.

---

## 1. La idea en una frase

Cada laptop corre **solo los contenedores de su nodo** con su propio archivo
`compose`, y los servicios dejan de encontrarse por nombre de contenedor
(`match:50051`) para encontrarse por **IP de la laptop y puerto publicado**
(`192.168.10.22:50051`). Las IP salen de un único archivo, `deploy/lab.env`,
igual en las 5 máquinas.

---

## 2. Qué va en cada computadora

| Nodo | Laptop | Contenedores | Puertos que abre a la red | Archivo |
|---|---|---|---|---|
| **N1 edge** | 1 | `web` (nginx) + `gateway` | 8080, 3000 | `deploy/compose/n1.yml` |
| **N2 match** | 2 | `match` + `match-db` | 50051, 8081 | `deploy/compose/n2.yml` |
| **N3 players** | 3 | `players` + `players-db` | 50052, 8082 | `deploy/compose/n3.yml` |
| **N4 broker** | 4 | `rabbitmq` | 5672, 15672 | `deploy/compose/n4.yml` |
| **N5 monitor** | 5 | `monitor` | 8000 | `deploy/compose/n5.yml` |
| Clientes | PCs del laboratorio | Ninguno: solo el navegador | — | — |

```
  Navegadores (PCs del lab)
          │  http://<EDGE_HOST>:8080
          ▼
   ┌─────────────┐   gRPC :50051    ┌─────────────┐
   │ N1 edge     │ ───────────────▶ │ N2 match    │──┐
   │ web+gateway │                  │ + match-db  │  │ AMQP :5672
   └─────┬───────┘   gRPC :50052    └─────────────┘  ▼
         └─────────────────────────▶┌─────────────┐ ┌─────────────┐
                                    │ N3 players  │◀│ N4 rabbitmq │
                                    │ + players-db│ └──────┬──────┘
                                    └─────────────┘        │ AMQP
                                    ┌─────────────┐        │
                                    │ N5 monitor  │◀───────┘
                                    │ consulta los /health de N1, N2, N3
                                    └─────────────┘
```

**Regla de corte:** cada base de datos se queda en la **misma** laptop que su
servicio y **no publica** el 5432. Así Database per Service (regla 3 de
`AGENTS.md`) queda forzado por la red: desde otra máquina es imposible llegar
a `match-db` o `players-db`.

---

## 3. Qué cambia al separar el compose

Comparando `docker-compose.yml` (desarrollo) con `deploy/compose/nX.yml`
(laboratorio):

| En desarrollo | En el laboratorio | Por qué |
|---|---|---|
| `build: context: .` | `image: ${IMAGE_REGISTRY}/in-filtrados-<servicio>:${IMAGE_TAG}` | En el laboratorio no se compila: se usan las imágenes que publica el CD en GHCR |
| `MATCH_GRPC_ADDR=match:50051` | `MATCH_GRPC_ADDR=${MATCH_HOST}:50051` | El DNS de Docker solo resuelve nombres **dentro** de una máquina |
| `RABBITMQ_URL=...@rabbitmq:5672` | `RABBITMQ_URL=...@${BROKER_HOST}:5672` | RabbitMQ vive en otra laptop |
| `MATCH_HEALTH_URL=http://match:8081/health` | `http://${MATCH_HOST}:8081/health` | El monitor consulta por IP |
| gRPC (50051/50052) sin publicar | `ports: "50051:50051"` y `"50052:50052"` | Si no se publica, N1 no puede llegar a N2 ni a N3 |
| `match-db` publica `5433:5432` | Sin `ports` | Solo `match` la ve, por la red interna de Docker de N2 |
| `depends_on: rabbitmq` en `match` y `players` | Se quita | `depends_on` no funciona entre máquinas; cada servicio **reintenta** solo (regla 7) |
| Contraseñas de `.env` | `CHANGE_ME` en `deploy/lab.env` | `lab.env` no se sube al repo (regla 8) |
| Sin `restart` en las bases | `restart: unless-stopped` en todo | Si un proceso cae, Docker lo levanta solo |

Lo que **no** cambia: el código de los servicios, los puertos de
`docs/tasks.md` 0.1 y `web/nginx.conf`. Como `web` y `gateway` siguen juntos en
N1, nginx sigue encontrando a `gateway:3000` por el DNS interno de Docker, y el
navegador se conecta a `ws://${location.host}/ws` sin conocer ninguna IP
interna.

> Si alguien agrega una variable nueva a un servicio, debe agregarla también
> en `.env.example`, `deploy/lab.env.example` y el `nX.yml` del nodo (skill
> `change-contract`).

---

## 4. Paso a paso

### 4.1 En casa, una vez por laptop

1. **Docker Desktop** instalado; comprobar con `docker compose version`.
2. **Sesión en GHCR** con un token de GitHub *classic* que tenga solo
   `read:packages` (las imágenes del repo son privadas):

   ```powershell
   $env:CR_PAT | docker login ghcr.io -u <GITHUB_USER> --password-stdin
   ```

3. **Clonar el repo** en la rama `main` y descargar las imágenes de **los 5
   nodos** (por si el día de la demo hay que cambiar de laptop o agrupar):

   ```bash
   docker compose --env-file deploy/lab.env.example -f deploy/compose/n1.yml -f deploy/compose/n2.yml -f deploy/compose/n3.yml -f deploy/compose/n4.yml -f deploy/compose/n5.yml pull
   ```

4. **Firewall de Windows** (PowerShell como administrador), en perfil
   privado **y** público, con los puertos de la tabla de la sección 2. Ejemplo
   para N2:

   ```powershell
   New-NetFirewallRule -DisplayName "In-Filtrados N2" -Direction Inbound -Protocol TCP -LocalPort 50051,8081 -Action Allow -Profile Private,Public
   ```

   Y el ping, para que `check-network.ps1` pueda probar la red:

   ```powershell
   New-NetFirewallRule -DisplayName "In-Filtrados ICMP Echo" -Direction Inbound -Protocol ICMPv4 -IcmpType 8 -Action Allow -Profile Private,Public
   ```

   El 5432 **no** se abre.
5. **Energía:** desactivar suspensión y apagado de pantalla con el cargador
   puesto. Una laptop dormida parece un corte de red.

### 4.2 En el laboratorio, el día de la demo

1. **Conectar las 5 laptops** a la misma red, de preferencia por cable.
2. **Anotar la IP** de cada una con `ipconfig` (adaptador Ethernet o Wi-Fi,
   no el `vEthernet (WSL)`).
3. **Armar `deploy/lab.env`** copiando `deploy/lab.env.example`:
   - Poner las 5 IP en `EDGE_HOST`, `MATCH_HOST`, `PLAYERS_HOST`,
     `BROKER_HOST` y `MONITOR_HOST`.
   - Cambiar cada `CHANGE_ME` por una contraseña de **solo letras y números**
     (van dentro de URL de conexión y un `@` o `/` las rompe).
   - Las demás variables se derivan solas de esas IP: no se tocan.
4. **Copiar el mismo `lab.env`** a las 5 laptops (USB o chat del equipo). Si
   una laptop tiene un `lab.env` distinto, sus servicios apuntan a IP
   equivocadas.
5. **Arrancar cada nodo en su laptop**, en este orden recomendado (no es
   obligatorio: todos reintentan con espera creciente):

   ```bash
   # Laptop 4: broker
   docker compose --env-file deploy/lab.env -f deploy/compose/n4.yml up -d
   ```

   ```bash
   # Laptop 2: match
   docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml up -d
   ```

   ```bash
   # Laptop 3: players
   docker compose --env-file deploy/lab.env -f deploy/compose/n3.yml up -d
   ```

   ```bash
   # Laptop 1: edge
   docker compose --env-file deploy/lab.env -f deploy/compose/n1.yml up -d
   ```

   ```bash
   # Laptop 5: monitor
   docker compose --env-file deploy/lab.env -f deploy/compose/n5.yml up -d
   ```

6. **Verificar la red** desde cualquier laptop:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy/scripts/check-network.ps1
   ```

   Todo debe salir `[OK]`, incluido "puerto 5432 cerrado desde fuera".
7. **Abrir el panel** en `http://<MONITOR_HOST>:8000` (todo en verde) y
   **jugar** desde los PCs del laboratorio en `http://<EDGE_HOST>:8080`.

---

## 5. Cómo comprobar que de verdad está distribuido

| Prueba | Desde | Qué se espera |
|---|---|---|
| `curl http://<MATCH_HOST>:8081/health` | Cualquier laptop | `200` con `checks.db` y `checks.rabbitmq` en `ok` |
| `curl http://<PLAYERS_HOST>:8082/health` | Cualquier laptop | `200` con `checks.db` y `checks.rabbitmq` en `ok` |
| `Test-NetConnection <MATCH_HOST> -Port 5432` | Otra laptop | `TcpTestSucceeded : False` (la base no se ve) |
| `http://<BROKER_HOST>:15672` | Navegador | Consola de RabbitMQ con conexiones desde N2, N3 y N5 |
| `docker ps` en cada laptop | Cada laptop | Solo aparecen los contenedores de su nodo |
| Quitar el cable de N3 y terminar una partida | — | La partida sigue; las monedas se suman al reconectar (`deployment-lab.md`, sección 9) |

La tabla completa de pruebas de desconexión está en `docs/deployment-lab.md`,
sección 9.

---

## 6. Si faltan computadoras

Se combinan varios `compose` en una sola laptop con varios `-f`, y en
`lab.env` se pone **la misma IP** para los nodos agrupados:

| Laptops | Reparto |
|---|---|
| 4 | {N1 + N5}, {N2}, {N3}, {N4} |
| 3 | {N1 + N5}, {N2 + N4}, {N3} |
| 2 | {N1 + N4 + N5}, {N2 + N3} |
| 1 | `docker compose up` con el `docker-compose.yml` de la raíz (plan D) |

```bash
docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml -f deploy/compose/n4.yml up -d
```

Todos los `nX.yml` comparten `name: in-filtrados-lab`, así que al combinarlos
quedan en la misma red de Docker sin conflictos.

---

## 7. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `falta MATCH_GRPC_ADDR en lab.env` al hacer `up` | Falta `--env-file deploy/lab.env` o la variable está vacía | Revisar el comando y el archivo |
| El monitor marca un nodo en rojo pero `docker ps` lo muestra `Up` | Firewall de esa laptop o IP equivocada en `lab.env` | Repetir 4.1 paso 4 y comprobar con `Test-NetConnection <IP> -Port <puerto>` |
| Ninguna laptop hace ping a otra | La red aísla a los clientes (wifi de invitados) | Plan C: switch o router propio (`deployment-lab.md`, sección 8) |
| `match` o `players` se reinician en bucle | RabbitMQ todavía no arrancó o la contraseña no coincide | Esperar a que N4 esté sano; revisar que `RABBITMQ_PASSWORD` sea igual en las 5 laptops |
| `pull` falla con `denied` | Falta la sesión en GHCR | Repetir 4.1 paso 2 |
| Cambió la IP de una laptop a mitad del día | DHCP del laboratorio | Corregir `lab.env`, copiarlo a las 5 y repetir `up -d` en los nodos que apuntan a esa IP (todos menos el afectado) |
| Los datos desaparecieron | Se usó `down -v` | Usar `down` **sin** `-v`: `-v` borra las bases y las colas |

Para simular una caída real de un proceso (Docker lo relanza solo):

```bash
docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml exec match sh -c 'kill -9 1'
```

`docker compose stop` o `kill` cuentan como paradas manuales y **no** se
relanzan.

---

## 8. Resumen para el día de la demo

1. Cada laptop: Docker, sesión en GHCR, imágenes descargadas, firewall abierto.
2. Anotar las 5 IP → escribir `deploy/lab.env` → copiarlo a las 5.
3. `up -d` de N4, N2, N3, N1 y N5, cada uno en su laptop.
4. `check-network.ps1` todo en `[OK]` y el monitor en verde.
5. Los PCs del laboratorio abren `http://<EDGE_HOST>:8080` y juegan.
