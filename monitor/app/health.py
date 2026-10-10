import asyncio
import os
from collections import deque
from datetime import UTC, datetime
from time import perf_counter

import aio_pika
import asyncpg
import httpx

HTTP_TARGETS = {
    "web": "http://web/health",
    "gateway": "http://gateway:3000/health",
    "match": "http://match:8081/health",
    "players": "http://players:8082/health",
}

CONNECTION_TARGETS = {
    "match-db": "MATCH_DB_URL",
    "players-db": "PLAYERS_DB_URL",
    "rabbitmq": "RABBITMQ_URL",
}


def utc_now():
    return datetime.now(UTC).isoformat()


class HealthMonitor:
    def __init__(self):
        names = list(HTTP_TARGETS) + list(CONNECTION_TARGETS)
        self.services = {
            name: {
                "name": name,
                "status": "unknown",
                "latency_ms": None,
                "checked_at": None,
                "last_ok_at": None,
                "down_since": None,
                "detail": "Not checked yet",
                "history": deque(maxlen=20),
            }
            for name in names
        }
        # Límite propuesto para evitar crecimiento indefinido.
        self.incidents = deque(maxlen=100)
        self.last_scan_at = None

    async def check_http(self, client, name, url):
        response = await client.get(url)
        data = response.json()

        if data.get("service") != name:
            raise ValueError("Unexpected service in health response")

        if response.status_code == 200 and data.get("status") == "ok":
            return "ok", "Health endpoint responded OK"

        if (
            response.status_code == 503
            and data.get("status") == "degraded"
        ):
            failed_checks = {
                key: value
                for key, value in data.get("checks", {}).items()
                if value != "ok"
            }
            # Mostrar solo los nombres, no posibles secretos en errores.
            detail = ", ".join(failed_checks) or "Unspecified dependency"
            return "degraded", f"Failed checks: {detail}"

        raise ValueError("Unexpected health response")

    async def check_connection(self, name, variable):
        url = os.getenv(variable)
        if not url:
            raise ValueError(f"Missing environment variable: {variable}")

        if name == "rabbitmq":
            connection = await aio_pika.connect(url)
            try:
                if connection.is_closed:
                    raise ConnectionError("RabbitMQ connection is closed")
                return "ok", "AMQP connection established"
            finally:
                await connection.close()

        connection = await asyncpg.connect(url)
        try:
            await connection.fetchval("SELECT 1")
            return "ok", "Database query succeeded"
        finally:
            await connection.close()

    async def measure(self, name, check):
        started = perf_counter()
        try:
            state, detail = await asyncio.wait_for(check(), timeout=2)
        except (TimeoutError, httpx.TimeoutException):
            state, detail = "down", "Check timed out"
        # Aislar fallos por servicio para mantener activo el monitoreo.
        except Exception as error:  # noqa: BLE001
            # No exponer mensajes que puedan contener credenciales.
            state, detail = "down", f"Check failed: {type(error).__name__}"

        latency = round((perf_counter() - started) * 1000, 1)
        return name, state, detail, latency

    async def scan(self, client):
        checks = [
            self.measure(
                name,
                lambda name=name, url=url: self.check_http(
                    client, name, url
                ),
            )
            for name, url in HTTP_TARGETS.items()
        ]
        checks.extend(
            self.measure(
                name,
                lambda name=name, variable=variable: self.check_connection(
                    name, variable
                ),
            )
            for name, variable in CONNECTION_TARGETS.items()
        )

        results = await asyncio.gather(*checks)
        checked_at = utc_now()

        # Actualizar juntos, sin await, después de las consultas paralelas.
        for name, state, detail, latency in results:
            service = self.services[name]
            previous = service["status"]

            if state == "down" and previous != "down":
                service["down_since"] = checked_at
                self.incidents.append({
                    "service": name,
                    "started_at": checked_at,
                    "detail": detail,
                })
            elif state != "down":
                service["down_since"] = None

            if state == "ok":
                service["last_ok_at"] = checked_at

            service.update({
                "status": state,
                "latency_ms": latency,
                "checked_at": checked_at,
                "detail": detail,
            })
            service["history"].append({
                "status": state,
                "latency_ms": latency,
                "checked_at": checked_at,
            })

        self.last_scan_at = checked_at

    def snapshot(self):
        return {
            "last_scan_at": self.last_scan_at,
            "services": [
                {
                    **service,
                    "history": list(service["history"]),
                }
                for service in self.services.values()
            ],
            "incidents": list(reversed(self.incidents)),
        }