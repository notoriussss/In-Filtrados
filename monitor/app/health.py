import asyncio
import os
from collections import deque
from datetime import UTC, datetime
from time import perf_counter

import aio_pika
import httpx

from app.messages import (
    DETAIL_AMQP_CLOSED,
    DETAIL_AMQP_OK,
    DETAIL_DEGRADED,
    DETAIL_FAILED,
    DETAIL_NOT_CHECKED,
    DETAIL_OK,
    DETAIL_PARENT_DOWN,
    DETAIL_TIMEOUT,
    DETAIL_UNKNOWN,
    DETAIL_UNSPECIFIED_DEP,
    STATE_DEGRADED,
    STATE_DOWN,
    STATE_OK,
    STATE_UNKNOWN,
)

HTTP_SERVICES = ("web", "gateway", "match", "players")
DB_SERVICES = {
    "match-db": "match",
    "players-db": "players",
}
ALL_SERVICES = (
    "web",
    "gateway",
    "match",
    "players",
    "match-db",
    "players-db",
    "rabbitmq",
)


def get_http_targets():
    return {
        "web": os.environ["WEB_HEALTH_URL"],
        "gateway": os.environ["GATEWAY_HEALTH_URL"],
        "match": os.environ["MATCH_HEALTH_URL"],
        "players": os.environ["PLAYERS_HEALTH_URL"],
    }


def utc_now():
    return datetime.now(UTC).isoformat()


class HealthMonitor:
    def __init__(self):
        self.services = {
            name: {
                "name": name,
                "status": STATE_UNKNOWN,
                "latency_ms": None,
                "checked_at": None,
                "last_ok_at": None,
                "down_since": None,
                "detail": DETAIL_NOT_CHECKED,
                "history": deque(maxlen=20),
            }
            for name in ALL_SERVICES
        }
        # Límite propuesto para evitar crecimiento indefinido.
        self.incidents = deque(maxlen=100)
        self.last_scan_at = None

    async def check_http(self, client, name, url):
        response = await client.get(url)
        data = response.json()

        if data.get("service") != name:
            raise ValueError("Unexpected service in health response")

        checks = data.get("checks", {})

        if (
            response.status_code == 200
            and data.get("status") == STATE_OK
        ):
            return STATE_OK, DETAIL_OK, checks

        if (
            response.status_code == 503
            and data.get("status") == STATE_DEGRADED
        ):
            failed_checks = {
                key: value
                for key, value in checks.items()
                if value != "ok"
            }
            # Mostrar solo los nombres, no posibles secretos en errores.
            detail = (
                ", ".join(failed_checks)
                or DETAIL_UNSPECIFIED_DEP
            )
            return (
                STATE_DEGRADED,
                DETAIL_DEGRADED.format(detail=detail),
                checks,
            )

        raise ValueError("Unexpected health response")

    async def check_rabbitmq(self):
        url = os.environ["RABBITMQ_URL"]
        connection = await aio_pika.connect(url)
        try:
            if connection.is_closed:
                raise ConnectionError(DETAIL_AMQP_CLOSED)
            return STATE_OK, DETAIL_AMQP_OK, {}
        finally:
            await connection.close()

    async def measure(self, name, check):
        started = perf_counter()
        try:
            res = await asyncio.wait_for(check(), timeout=2)
            if len(res) == 3:
                state, detail, checks = res
            else:
                state, detail = res
                checks = {}
        except (TimeoutError, httpx.TimeoutException):
            state, detail, checks = STATE_DOWN, DETAIL_TIMEOUT, {}
        # Aislar fallos por servicio para mantener activo el monitoreo.
        except Exception as error:  # noqa: BLE001
            # No exponer mensajes que puedan contener credenciales.
            state, detail, checks = (
                STATE_DOWN,
                DETAIL_FAILED.format(error=type(error).__name__),
                {},
            )

        latency = round((perf_counter() - started) * 1000, 1)
        return name, state, detail, latency, checks

    def _update_service(
        self, name, state, detail, latency, checked_at
    ):
        service = self.services[name]
        previous = service["status"]

        if state == STATE_DOWN and previous != STATE_DOWN:
            service["down_since"] = checked_at
            self.incidents.append({
                "service": name,
                "started_at": checked_at,
                "detail": detail,
            })
        elif state != STATE_DOWN:
            service["down_since"] = None

        if state == STATE_OK:
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

    async def scan(self, client):
        targets = get_http_targets()
        checks = [
            self.measure(
                name,
                lambda name=name, url=url: self.check_http(
                    client, name, url
                ),
            )
            for name, url in targets.items()
        ]
        checks.append(
            self.measure(
                "rabbitmq",
                self.check_rabbitmq,
            )
        )

        results = await asyncio.gather(*checks)
        checked_at = utc_now()

        results_by_name = {}
        for name, state, detail, latency, checks_dict in results:
            results_by_name[name] = (
                state,
                detail,
                latency,
                checks_dict,
            )
            self._update_service(
                name, state, detail, latency, checked_at
            )

        for db_name, parent_name in DB_SERVICES.items():
            parent_result = results_by_name.get(parent_name)
            if (
                parent_result is None
                or parent_result[0] == STATE_DOWN
            ):
                db_state = STATE_UNKNOWN
                db_detail = DETAIL_PARENT_DOWN
            else:
                parent_checks = parent_result[3]
                db_check = parent_checks.get("db")
                if db_check == "ok":
                    db_state = STATE_OK
                    db_detail = DETAIL_OK
                elif db_check is not None:
                    db_state = STATE_DOWN
                    db_detail = db_check
                else:
                    db_state = STATE_UNKNOWN
                    db_detail = DETAIL_UNKNOWN

            self._update_service(
                db_name, db_state, db_detail, None, checked_at
            )

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
