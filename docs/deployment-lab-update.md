# In-Filtrados: actualizar los servicios de cada nodo

Cómo meter un cambio de código en un nodo que **ya está desplegado** en el
laboratorio sin perder datos ni tumbar los otros nodos.
Fecha: 27 de octubre de 2026.

> Complementa a `deployment-lab-runbook.md` (despliegue del día con imágenes
> de `develop`) y a `deploy/README.md` (operación y `update.ps1` con imágenes
> de `main`). Si algo no coincide, mandan esos dos archivos.

---

## 1. Antes de empezar

**Qué se conserva y qué no:**

| Se conserva | Dónde |
|---|---|
| Partidas e instantáneas de `match` | Volumen `match-db-data` (N2) |
| Usuarios y monedas de `players` | Volumen `players-db-data` (N3) |
| Colas durables y mensajes pendientes | Volumen `rabbitmq-data` (N4) |
| Eventos que no llegaron al broker | Tabla `outbox` en `match-db` (N2) |

`docker compose ... up -d` solo recrea los contenedores cuya imagen o
configuración cambió; los volúmenes no se tocan. **Nunca uses `down -v`**: es
lo único que borra las bases y las colas.

**Elegir el camino según de dónde salen las imágenes** (mira `IMAGE_TAG` en
`deploy/lab.env`):

| `IMAGE_TAG` | Las imágenes vienen de | Cómo se actualiza |
|---|---|---|
| `develop` | Se construyen en la laptop (runbook) | Sección 2: `build` + `tag` + `up -d` |
| `latest` o vacío | GHCR, publicadas por el CD desde `main` | Sección 3: `update.ps1` |

Con `IMAGE_TAG=develop` **no** uses `docker compose pull` ni `update.ps1`:
traen las imágenes de `main` y pisan las tuyas.

**Qué servicios hay que reconstruir según lo que cambió:**

| Cambió | Reconstruir | Nodo |
|---|---|---|
| `web/` | `web` | N1 |
| `gateway/` | `gateway` | N1 |
| `match/` | `match` | N2 |
| `players/` | `players` | N3 |
| `monitor/` | `monitor` | N5 |
| `messages/` | `web` y `gateway` | N1 |
| `shared/` (por ejemplo `map.json`) | `match` y `web` | N2 y N1 |
| `proto/` | `gateway`, `players` y `match` | N1, N3 y N2 |
| `deploy/compose/nX.yml` o `lab.env` | Nada; solo `up -d` del nodo | El que cambió |

Los cambios de contrato (`messages/`, `shared/`, `proto/`) tocan varios nodos:
actualízalos todos antes de seguir jugando, o un servicio hablará un formato
que el otro no entiende.

---

## 2. Con imágenes de `develop` (construidas en la laptop)

Todos los comandos se corren **desde la raíz del repo**, en la laptop del nodo.

### 2.1 Pasos comunes

1. Traer el código:

   ```powershell
   git checkout develop
   git pull
   ```

   Para probar una rama antes del PR, haz `git checkout` de esa rama en su
   lugar; vuelve a `develop` después de la prueba.

2. Construir **solo** los servicios que cambiaron (tabla de la sección 1):

   ```powershell
   docker compose build <servicio> [<servicio> ...]
   ```

3. Re-etiquetarlos con `develop` para que el `compose` del nodo los encuentre:

   ```powershell
   foreach ($s in "<servicio>", "<servicio>") {
     docker tag "in-filtrados-${s}:latest" `
       "ghcr.io/notoriussss/in-filtrados-${s}:develop"
   }
   ```

   Ejemplo: si cambiaste `web/` y `gateway/` (los dos de N1), el paso 2 fue
   `docker compose build web gateway` y aquí queda:

   ```powershell
   foreach ($s in "web", "gateway") {
     docker tag "in-filtrados-${s}:latest" `
       "ghcr.io/notoriussss/in-filtrados-${s}:develop"
   }
   ```

   Equivale a estos dos comandos:

   ```powershell
   docker tag in-filtrados-web:latest `
     ghcr.io/notoriussss/in-filtrados-web:develop
   docker tag in-filtrados-gateway:latest `
     ghcr.io/notoriussss/in-filtrados-gateway:develop
   ```

   Con un solo servicio no hace falta el `foreach`:

   ```powershell
   docker tag in-filtrados-match:latest `
     ghcr.io/notoriussss/in-filtrados-match:develop
   ```

   Para comprobar que quedó la etiqueta:

   ```powershell
   docker image ls --filter "reference=ghcr.io/notoriussss/in-filtrados-*"
   ```

4. Recrear el nodo:

   ```powershell
   docker compose --env-file deploy/lab.env `
     -f deploy/compose/nX.yml up -d
   ```

5. Comprobar: `... ps` debe mostrar `Up (healthy)` y el panel de N5 debe
   volver a verde.

Si el servicio corre en la laptop de otra persona y esa laptop no tiene
Internet o no tiene el repo al día, se pasa la imagen por USB:

```powershell
# En la laptop que construyó
docker save -o match.tar ghcr.io/notoriussss/in-filtrados-match:develop

# En la laptop del nodo
docker load -i match.tar
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n2.yml up -d
```

### 2.2 N1 edge: `web` y `gateway`

```powershell
docker compose build web gateway
foreach ($s in "web", "gateway") {
  docker tag "in-filtrados-${s}:latest" `
    "ghcr.io/notoriussss/in-filtrados-${s}:develop"
}
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n1.yml up -d
```

- Si solo cambió uno, construye y etiqueta solo ese.
- Mientras se recrea `gateway`, los jugadores ven "Reconectando…" y la sala
  se pausa; al volver, los navegadores reabren el WebSocket solos.
- Si solo cambió `web`, los jugadores deben **recargar la página** para
  bajar el código nuevo; la sesión se conserva.

### 2.3 N2 match: `match` (y `match-db`)

```powershell
docker compose build match
docker tag "in-filtrados-match:latest" `
  "ghcr.io/notoriussss/in-filtrados-match:develop"
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n2.yml up -d
```

- `match-db` no se reconstruye: es la imagen oficial `postgres:16-alpine` y
  sigue corriendo con su volumen.
- Las migraciones nuevas de `match/migrations/` se aplican al arrancar.
- Si hay partidas en curso, la sala se pausa y al volver `match` restaura la
  última instantánea (se pierden ≤2 s). Mejor actualizar entre partidas.
- Los eventos que `match` no alcanzó a publicar quedan en `outbox` y salen
  cuando vuelve.

### 2.4 N3 players: `players` (y `players-db`)

```powershell
docker compose build players
docker tag "in-filtrados-players:latest" `
  "ghcr.io/notoriussss/in-filtrados-players:develop"
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n3.yml up -d
```

- La compilación de Rust tarda varios minutos: hazla antes de ir al
  laboratorio o en otra laptop y pásala por USB (sección 2.1).
- Mientras `players` está abajo, la partida sigue; login y perfil dicen
  "servicio no disponible" (Circuit Breaker del gateway). Los
  `match.finished` esperan en la cola de N4 y las monedas se suman una sola
  vez al volver.

### 2.5 N4 broker: `rabbitmq`

No hay código propio: es la imagen oficial `rabbitmq:3-management`. Solo se
"actualiza" cuando cambia `deploy/compose/n4.yml` o `lab.env`:

```powershell
git pull
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n4.yml up -d
```

- Las colas durables y sus mensajes viven en `rabbitmq-data` y sobreviven.
- Mientras el broker se reinicia, `match` guarda los eventos en `outbox` y el
  monitor lo marca en rojo; todo se pone al día al volver.

### 2.6 N5 monitor: `monitor`

```powershell
docker compose build monitor
docker tag "in-filtrados-monitor:latest" `
  "ghcr.io/notoriussss/in-filtrados-monitor:develop"
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n5.yml up -d
```

- Ningún servicio depende del monitor: se puede actualizar en cualquier
  momento. El panel reconstruye sus contadores con los eventos nuevos y los
  `/health`.

---

## 3. Con imágenes de `main` (CD y GHCR)

1. El cambio entra a `develop` por PR y después a `main`.
2. Cuando el CI de `main` sale en verde, el CD publica las imágenes en
   `ghcr.io/notoriussss/in-filtrados-<servicio>` (`latest` y el SHA).
3. En cada laptop, con el repo en `main` y desde la raíz:

   ```powershell
   .\deploy\scripts\update.ps1
   ```

   El script detecta el nodo por la IP, hace `git pull`, `pull` de las
   imágenes y `up -d`. Para indicar el nodo a mano:
   `.\deploy\scripts\update.ps1 -Nodes N2`. Detalle en `deploy/README.md`,
   sección 5.

Esto sirve igual para los cinco nodos; en N4 el `pull` solo trae
`rabbitmq:3-management` si cambió su etiqueta.

---

## 4. Nodos agrupados (plan B)

Si una laptop lleva varios nodos (`deployment-lab.md`, sección 8), se pasan
todos los `compose` en el mismo comando:

```powershell
docker compose --env-file deploy/lab.env `
  -f deploy/compose/n1.yml `
  -f deploy/compose/n4.yml `
  -f deploy/compose/n5.yml up -d
```

No uses `--remove-orphans`: todos los nodos comparten el proyecto
`in-filtrados-lab` y borraría los contenedores de los otros nodos de esa
laptop.

---

## 5. Problemas comunes

| Síntoma | Causa | Solución |
|---|---|---|
| `up -d` no cambia nada | No se re-etiquetó la imagen con `develop` | Repetir el `docker tag` de la sección 2.1 |
| `up -d` intenta descargar una imagen | Falta la etiqueta `develop` en esa laptop | `build` + `tag`, o `docker load` del USB |
| Volvieron las imágenes viejas | Se corrió `pull` o `update.ps1` con `IMAGE_TAG=develop` | Repetir `build` + `tag` + `up -d` |
| Cambié la contraseña en `lab.env` y la base no la acepta | PostgreSQL y RabbitMQ solo leen el usuario y la contraseña la primera vez, con el volumen vacío | Volver a la contraseña anterior en `lab.env` (borrar el volumen pierde los datos) |
| El navegador sigue mostrando la versión vieja | Caché del navegador | Recargar con `Ctrl+F5` |
| Un servicio queda en `Restarting` | Error al arrancar | `... logs -f <servicio>` en ese nodo |
