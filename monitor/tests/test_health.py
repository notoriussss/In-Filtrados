import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app import main
from app.health import HealthMonitor
from app.main import app
from app.messages import (
    CHECK_POLLING_FIRST_SCAN,
    CHECK_POLLING_OK,
    CHECK_POLLING_STALE,
    STATE_DEGRADED,
    STATE_OK,
)


class FakeTask:
    def __init__(self, stopped=False):
        self.stopped = stopped

    def done(self):
        return self.stopped


@pytest.fixture
def client(monkeypatch):
    # Evitar conexiones reales durante las pruebas de las rutas.
    async def fake_scan(self, http_client):
        now = datetime.now(UTC).isoformat()
        self.last_scan_at = now

        for service in self.services.values():
            service.update({
                "status": STATE_OK,
                "latency_ms": 1.0,
                "checked_at": now,
                "last_ok_at": now,
                "detail": "Simulated check",
            })

    async def fake_consume(stats):
        await asyncio.Event().wait()

    monkeypatch.setattr(HealthMonitor, "scan", fake_scan)
    monkeypatch.setattr(main, "consume_events", fake_consume)

    # El bloque with ejecuta el lifespan de FastAPI.
    with TestClient(app) as test_client:
        # Detener el ciclo simulado para controlar los estados sin carreras.
        async def prepare_state():
            task = app.state.polling_task
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

            await app.state.monitor.scan(None)
            app.state.polling_task = FakeTask()

        test_client.portal.call(prepare_state)
        yield test_client


def test_get_health(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": STATE_OK,
        "service": "monitor",
        "checks": {"polling": CHECK_POLLING_OK},
    }


def test_health_when_polling_stops(client):
    app.state.polling_task = FakeTask(stopped=True)

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["status"] == STATE_DEGRADED
    assert response.json()["checks"]["polling"].startswith("fail:")


def test_health_when_results_are_stale(client):
    old = datetime.now(UTC) - timedelta(seconds=30)
    app.state.monitor.last_scan_at = old.isoformat()

    response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["checks"]["polling"] == CHECK_POLLING_STALE


def test_health_when_first_scan_never_finishes(client):
    app.state.monitor.last_scan_at = None
    app.state.started_at = (
        datetime.now(UTC) - timedelta(seconds=30)
    )

    response = client.get("/health")

    assert response.status_code == 503
    assert (
        response.json()["checks"]["polling"]
        == CHECK_POLLING_FIRST_SCAN
    )


def test_external_failure_does_not_make_monitor_unhealthy(client):
    app.state.monitor.services["players"]["status"] = "down"

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == STATE_OK


def test_get_status(client):
    response = client.get("/api/status")

    assert response.status_code == 200
    data = response.json()
    assert len(data["services"]) == 7
    assert data["last_scan_at"] is not None
    assert isinstance(data["incidents"], list)

    for service in data["services"]:
        assert isinstance(service["history"], list)


def test_get_dashboard(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "In-Filtrados" in response.text
