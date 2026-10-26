# In-Filtrados: guía paso a paso para el laboratorio

Complementa a `deployment-lab.md` (el **porqué** de la repartición en nodos) y a
`deploy/README.md` (los comandos de cada nodo). Esta guía es la lista de pasos
para el día del laboratorio, con dos agregados:

- Las imágenes se construyen desde `develop` en las laptops, no se bajan de GHCR.
- El firewall se filtra **por IP de origen**: solo se abre cada puerto a la
  máquina que lo necesita.

Fecha: 26 de octubre de 2026.

---

## 1. Nodos y puertos

| Nodo | Contenedores | Puertos | Quién se conecta |
|---|---|---|---|
| N1 edge | `web` y `gateway` | 8080, 3000 | PCs del lab (8080), N5 (3000) |
| N2 match | `match` y `match-db` | 50051, 8081 | N1 (50051), N5 (8081) |
| N3 players | `players` y `players-db` | 50052, 8082 | N1 (50052), N5 (8082) |
| N4 broker | `rabbitmq` | 5672, 15672 | N2, N3 y N5 (5672), N5 (15672) |
| N5 monitor | `monitor` | 8000 | PCs del lab y proyector |

El 5432 de las bases **no se publica** en ningún nodo (Database per Service
forzado por la red).

---

## 2. Por qué no se puede "no exponer puertos"

En un sistema distribuido entre máquinas físicas, si N1 habla con N2, algún
puerto de N2 tiene que estar escuchando. Lo que sí se controla es **quién**
puede llegar a él. Se evaluaron tres opciones:

| Opción | Decisión |
|---|---|
| Firewall de Windows filtrado por IP de origen | **Elegida.** No cambia código ni `compose` |
| Docker Swarm con red overlay cifrada | Descartada: reescribir los `compose` y poco fiable en Docker Desktop para Windows |
| VPN (WireGuard o Tailscale) | Descartada: dependencia nueva fuera de `architecture.md`; Tailscale necesita Internet |

---

## 3. Imágenes desde `develop`

Los `compose` de nodo buscan
`${IMAGE_REGISTRY}/in-filtrados-<servicio>:${IMAGE_TAG}`. Con los valores por
defecto, eso es la imagen de GHCR publicada desde `main`, que puede ir
atrasada respecto a `develop`.

`docker compose build` en la raíz del repo nombra las imágenes
`in-filtrados-<servicio>:latest` (por `name: in-filtrados` en
`docker-compose.yml`). Se re-etiquetan para que los `compose` de nodo las
encuentren.

**En cada laptop, antes de ir al laboratorio:**

1. Actualizar el repo en `develop` y construir:

   ```powershell
   git checkout develop
   git pull
   docker compose build
   ```

   Alternativa sin Internet: construir en una laptop y pasar las imágenes por
   USB con `docker save -o in-filtrados.tar <imágenes>` y
   `docker load -i in-filtrados.tar`.

2. Re-etiquetar con la etiqueta `develop`:

   ```powershell
   foreach ($s in "web", "gateway", "match", "players", "monitor") {
     docker tag "in-filtrados-${s}:latest" `
       "ghcr.io/notoriussss/in-filtrados-${s}:develop"
   }
   ```

3. Comprobar que existen también `postgres:16-alpine` (N2 y N3) y
   `rabbitmq:3-management` (N4): `docker image ls`.
4. Desactivar la suspensión y el apagado de pantalla mientras esté enchufada.

**Reglas:**
- En `deploy/lab.env` se pone `IMAGE_TAG=develop`. Una etiqueta propia evita
  que un `pull` accidental pise las imágenes con las de `main`.
- **No** usar `docker compose ... pull` ni `deploy/scripts/update.ps1`: los dos
  traen las imágenes de `main`. Basta con `up -d`; si la imagen existe en la
  laptop, Docker no descarga nada.

---

## 4. En el laboratorio, paso a paso

1. **Conectar las 5 laptops por cable** y en cada una correr `ipconfig`.
   Anotar la IPv4 del adaptador Ethernet.
2. **Armar `deploy/lab.env`** (una sola persona): copiar
   `deploy/lab.env.example`, poner las 5 IP (`EDGE_HOST`, `MATCH_HOST`,
   `PLAYERS_HOST`, `BROKER_HOST`, `MONITOR_HOST`), `IMAGE_TAG=develop` y
   cambiar los `CHANGE_ME` (solo letras y números). Pasar **el mismo archivo**
   a las 5 laptops.
3. **Firewall** en cada laptop (sección 5).
4. **Probar la red**: `ping` entre laptops y
   `powershell -ExecutionPolicy Bypass -File deploy/scripts/check-network.ps1`
   (ver sección 6 sobre los fallos esperados).
5. **Arrancar en orden**, cada nodo en su laptop: N4, N2, N3, N1 y N5.

   ```powershell
   docker compose --env-file deploy/lab.env -f deploy/compose/n4.yml up -d
   ```

   (cambiando `n4.yml` por el nodo de cada laptop).
6. **Verificar** (sección 6).
7. **Demostrar la resiliencia** con la tabla de `deployment-lab.md`, sección 9.

---

## 5. Reglas de firewall por puerto

Se corre en **PowerShell como administrador**, en cada laptop: primero el
bloque común y luego el bloque de su nodo.

### 5.1 Bloque común (las 5 laptops)

Cambiar las IP por las del día (las mismas de `lab.env`):

```powershell
$N1 = "192.168.10.21"   # edge
$N2 = "192.168.10.22"   # match
$N3 = "192.168.10.23"   # players
$N4 = "192.168.10.24"   # broker
$N5 = "192.168.10.25"   # monitor

Set-NetFirewallProfile -All -Enabled True
Disable-NetFirewallRule -DisplayName "Docker Desktop Backend"

function Add-Rule($Name, $Port, $From) {
  New-NetFirewallRule -DisplayName "In-Filtrados $Name" `
    -Direction Inbound -Protocol TCP -LocalPort $Port `
    -RemoteAddress $From -Action Allow -Profile Any | Out-Null
  Write-Host "OK  $Name  puerto $Port  desde $($From -join ', ')"
}

New-NetFirewallRule -DisplayName "In-Filtrados ping" -Direction Inbound `
  -Protocol ICMPv4 -IcmpType 8 -RemoteAddress $N1, $N2, $N3, $N4, $N5 `
  -Action Allow -Profile Any | Out-Null
```

**Sobre la regla "Docker Desktop Backend":** en la primera prueba se usó
`Set-NetFirewallRule -DisplayName "Docker Desktop Backend" -Action Allow`.
Esa regla deja entrar **desde cualquier IP a cualquier puerto** publicado por
Docker y anula el filtro. No se pone en `Block`, porque en Windows un `Block`
gana a todos los `Allow` y cortaría también los puertos del juego: se
**desactiva** y mandan las reglas por puerto.

### 5.2 Bloque de cada nodo

**N1 (edge)**

```powershell
Add-Rule "N1 web"     8080 "LocalSubnet"
Add-Rule "N1 gateway" 3000 $N5
```

**N2 (match)**

```powershell
Add-Rule "N2 gRPC"   50051 $N1
Add-Rule "N2 health" 8081  $N5
```

**N3 (players)**

```powershell
Add-Rule "N3 gRPC"   50052 $N1
Add-Rule "N3 health" 8082  $N5
```

**N4 (broker)**

```powershell
Add-Rule "N4 AMQP"    5672  @($N2, $N3, $N5)
Add-Rule "N4 consola" 15672 $N5
```

**N5 (monitor)**

```powershell
Add-Rule "N5 panel" 8000 "LocalSubnet"
```

`LocalSubnet` es cualquier máquina de la misma subred: así entran los PCs del
laboratorio sin anotar sus IP.

### 5.3 Revisar, rehacer y deshacer

| Para | Comando |
|---|---|
| Ver las reglas creadas | `Get-NetFirewallRule -DisplayName "In-Filtrados*" \| Get-NetFirewallAddressFilter \| Select InstanceID, RemoteAddress` |
| Ver la regla de Docker | `Get-NetFirewallRule -DisplayName "Docker Desktop Backend" \| Select Enabled, Action` |
| Borrar todas (si cambian las IP, y luego volver a crearlas) | `Remove-NetFirewallRule -DisplayName "In-Filtrados*"` |
| Dejar Docker como antes, al terminar | `Enable-NetFirewallRule -DisplayName "Docker Desktop Backend"` |

**Cuidados:**
- Si Docker Desktop pregunta si permite el acceso a la red, **cancelar**:
  aceptar recrea la regla que deja entrar todo.
- Si un nodo sale en rojo en el monitor, revisar que ninguna instancia de
  "Docker Desktop Backend" esté en `Block`.

---

## 6. Verificación

| Prueba | Desde | Resultado esperado |
|---|---|---|
| Panel `http://<MONITOR_HOST>:8000` | Cualquier PC | Todo en verde |
| Consola `http://<BROKER_HOST>:15672` | N5 | Abre y muestra las colas |
| Jugar en `http://<EDGE_HOST>:8080` | PCs del lab | Partida completa con al menos 3 clientes |
| `Test-NetConnection <MATCH_HOST> -Port 50051` | N1 | `TcpTestSucceeded : True` |
| `Test-NetConnection <MATCH_HOST> -Port 50051` | Un PC del lab | `False` (el filtro funciona) |
| `Test-NetConnection <MATCH_HOST> -Port 8081` | Un PC del lab | `False` |
| `Test-NetConnection <EDGE_HOST> -Port 8080` | Un PC del lab | `True` |

`check-network.ps1` prueba los puertos desde la laptop donde se corre. Con el
filtro por IP, cada laptop solo llega a lo que le toca según la tabla de la
sección 1, así que fallos como "N5 hacia 50051" son **esperados**. Lo que no
puede fallar es lo que la tabla permite, ni el "puerto 5432 cerrado".

---

## 7. Problemas típicos

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Un nodo en rojo en el monitor | Firewall de esa laptop o IP mal en `lab.env` | Revisar la sección 5.3 y `docker compose ... logs -f <servicio>` |
| Cambió una IP (DHCP) | El laboratorio reasignó direcciones | Editar `lab.env` en las 5, rehacer las reglas y `up -d` otra vez |
| `up -d` intenta descargar una imagen | Falta la etiqueta `develop` | Repetir el paso 2 de la sección 3 |
| Faltan laptops | Alguien no vino | Agrupar nodos (`deploy/README.md`, sección 3) y ajustar `-RemoteAddress` |
| Apagar al terminar | — | `down` **sin** `-v`, para no borrar bases ni colas |
