# deploy: un nodo por laptop en el laboratorio

Cómo levantar In-Filtrados repartido en las 5 laptops del equipo.
El porqué está en `docs/deployment-lab.md` (secciones 3 a 9).

```
deploy/
├── lab.env.example        copia a lab.env y pon las IP del día (lab.env no se sube)
├── compose/
│   ├── n1.yml             N1 edge: web (nginx :8080) y gateway (:3000)
│   ├── n2.yml             N2 match (:50051, :8081) y match-db (sin puerto publicado)
│   ├── n3.yml             N3 players (:50052, :8082) y players-db (sin puerto publicado)
│   ├── n4.yml             N4 broker: RabbitMQ (:5672, consola :15672)
│   └── n5.yml             N5 monitor (:8000)
└── scripts/
    └── check-network.ps1  ping, puertos y WebSocket hacia los otros nodos
```

Los `compose` usan las mismas imágenes que `docker-compose.yml`, ya construidas
por el CD (`ghcr.io/notoriussss/in-filtrados-<servicio>:latest`). En el
laboratorio no se compila ni se descarga nada.

## 1. Preparar cada laptop (en casa, una vez)

1. Instalar Docker Desktop y comprobar `docker compose version`.
2. Iniciar sesión en GitHub Container Registry (los paquetes de GHCR son
   privados por defecto):

   ```bash
   echo $CR_PAT | docker login ghcr.io -u <GITHUB_USER> --password-stdin
   ```

   *Nota:* el CD publica desde `main`. Al mezclar `develop` a `main`, hacer
   `pull` de nuevo para tener las imágenes finales con S2-10 y S3.

3. Clonar el repo y descargar las imágenes de **todos** los nodos (por si hay
   que agrupar o cambiar de laptop el día de la demo):

   ```bash
   docker compose --env-file deploy/lab.env.example \
     -f deploy/compose/n1.yml -f deploy/compose/n2.yml \
     -f deploy/compose/n3.yml -f deploy/compose/n4.yml \
     -f deploy/compose/n5.yml pull
   ```

4. Desactivar la suspensión y el apagado de pantalla mientras esté enchufada.
5. Abrir en el firewall de Windows los puertos de su nodo, en perfil
   **privado y público** (PowerShell como administrador):

   | Nodo | Puertos |
   |---|---|
   | N1 | 8080, 3000 |
   | N2 | 50051, 8081 |
   | N3 | 50052, 8082 |
   | N4 | 5672, 15672 |
   | N5 | 8000 |

   ```powershell
   New-NetFirewallRule -DisplayName "In-Filtrados N2" -Direction Inbound `
     -Protocol TCP -LocalPort 50051,8081 -Action Allow -Profile Private,Public
   ```

   Permitir también el ping (ICMP echo) para que `check-network.ps1` lo detecte:

   ```powershell
   New-NetFirewallRule -DisplayName "In-Filtrados ICMP Echo" -Direction Inbound `
     -Protocol ICMPv4 -IcmpType 8 -Action Allow -Profile Private,Public
   ```

   El 5432 **no** se abre: las bases solo se ven dentro de la red de Docker de
   su nodo (Database per Service forzado por la red).

## 2. El día de la demo

1. Anotar la IP de cada laptop (`ipconfig`) y escribirlas en `deploy/lab.env`
   (copia de `lab.env.example`). Cambiar también las contraseñas `CHANGE_ME`
   (solo letras y números: van dentro de las URL de conexión).
2. Copiar el mismo `deploy/lab.env` a las 5 laptops (USB o chat del equipo).
3. Arrancar cada nodo en este orden (es una recomendación: cada servicio
   reintenta solo si el otro todavía no está):

   ```bash
   # N4, N2, N3, N1 y N5, cada uno en su laptop
   docker compose --env-file deploy/lab.env -f deploy/compose/n4.yml up -d
   docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml up -d
   docker compose --env-file deploy/lab.env -f deploy/compose/n3.yml up -d
   docker compose --env-file deploy/lab.env -f deploy/compose/n1.yml up -d
   docker compose --env-file deploy/lab.env -f deploy/compose/n5.yml up -d
   ```

4. Revisar la red desde cualquier laptop:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy/scripts/check-network.ps1
   ```

   Todo debe salir en `[OK]`, incluido "puerto 5432 cerrado desde fuera".
5. Abrir el panel en `http://<MONITOR_HOST>:8000` (todo en verde) y jugar en
   `http://<EDGE_HOST>:8080` desde los PCs del laboratorio.

## 3. Menos laptops: agrupar nodos

Se combinan los `compose` con varios `-f` y en `lab.env` se pone la misma IP
para los nodos agrupados (`docs/deployment-lab.md`, sección 8):

```bash
# 2 laptops: {N1 + N4 + N5} y {N2 + N3}
docker compose --env-file deploy/lab.env \
  -f deploy/compose/n1.yml -f deploy/compose/n4.yml -f deploy/compose/n5.yml up -d
docker compose --env-file deploy/lab.env \
  -f deploy/compose/n2.yml -f deploy/compose/n3.yml up -d
```

Para revisar solo algunos nodos: `check-network.ps1 -Nodes N1,N2`.

## 4. Operación

| Para | Comando |
|---|---|
| Ver el estado | `docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml ps` |
| Ver los logs | `docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml logs -f match` |
| Actualizar imágenes | `... pull` y luego `... up -d` |
| Apagar el nodo | `... down` (sin `-v`, para no borrar la base ni las colas) |

Todos los contenedores tienen `restart: unless-stopped`: si un proceso se cae,
Docker lo vuelve a levantar solo. En cambio, `docker compose kill`, `stop` y
`down` son paradas **manuales** y Docker no los relanza (se vuelven a levantar
con `start` o `up -d`). Para simular una caída real del proceso:

```bash
docker compose --env-file deploy/lab.env -f deploy/compose/n2.yml exec match sh -c 'kill -9 1'
```

A los pocos segundos `ps` lo muestra otra vez `Up` y el panel vuelve a verde.
