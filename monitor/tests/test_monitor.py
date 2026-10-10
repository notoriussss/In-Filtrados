from unittest.mock import AsyncMock

import httpx
import pytest

from app.health import HealthMonitor


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "http_code, payload, expected",
    [
        (
            200,
            {"service": "players", "status": "ok", "checks": {}},
            "ok",
        ),
        (
            503,
            {
                "service": "players",
                "status": "degraded",
                "checks": {"db": "fail"},
            },
            "degraded",
        ),
        (
            500,
            {"service": "players", "status": "error"},
            "down",
        ),
        (
            200,
            {"service": "other", "status": "ok"},
            "down",
        ),
    ],
)
async def test_http_states(http_code, payload, expected):
    monitor = HealthMonitor()

    def handler(request):
        return httpx.Response(http_code, json=payload)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    ) as client:
        result = await monitor.measure(
            "players",
            lambda: monitor.check_http(
                client, "players", "http://players/health"
            ),
        )

    name, state, _, latency = result
    assert name == "players"
    assert state == expected
    assert latency >= 0


@pytest.mark.asyncio
async def test_http_timeout():
    monitor = HealthMonitor()

    def handler(request):
        raise httpx.ReadTimeout("Simulated timeout", request=request)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler)
    ) as client:
        result = await monitor.measure(
            "players",
            lambda: monitor.check_http(
                client, "players", "http://players/health"
            ),
        )

    assert result[1] == "down"
    assert result[2] == "Check timed out"


@pytest.mark.asyncio
async def test_connection_error_hides_secrets():
    monitor = HealthMonitor()

    async def failing_check():
        raise ConnectionError("password=do-not-expose")

    result = await monitor.measure("match-db", failing_check)

    assert result[1] == "down"
    assert "do-not-expose" not in result[2]


@pytest.mark.asyncio
async def test_async_timeout():
    monitor = HealthMonitor()

    async def failing_check():
        raise TimeoutError()

    result = await monitor.measure("rabbitmq", failing_check)

    assert result[1] == "down"
    assert result[2] == "Check timed out"


def simulate_checks(monkeypatch, monitor):
    states = {}

    async def fake_http(client, name, url):
        return states.get(name, "ok"), "Simulated HTTP check"

    async def fake_connection(name, variable):
        return states.get(name, "ok"), "Simulated connection check"

    monkeypatch.setattr(monitor, "check_http", fake_http)
    monkeypatch.setattr(monitor, "check_connection", fake_connection)
    return states


@pytest.mark.asyncio
async def test_scan_returns_seven_services(monkeypatch):
    monitor = HealthMonitor()
    simulate_checks(monkeypatch, monitor)

    await monitor.scan(None)
    snapshot = monitor.snapshot()

    assert len(snapshot["services"]) == 7
    assert snapshot["last_scan_at"] is not None
    assert snapshot["incidents"] == []

    for service in snapshot["services"]:
        assert service["status"] == "ok"
        assert service["last_ok_at"] is not None
        assert len(service["history"]) == 1


@pytest.mark.asyncio
async def test_degraded_does_not_create_down_incident(monkeypatch):
    monitor = HealthMonitor()
    states = simulate_checks(monkeypatch, monitor)
    states["gateway"] = "degraded"

    await monitor.scan(None)

    assert monitor.services["gateway"]["status"] == "degraded"
    assert monitor.services["gateway"]["down_since"] is None
    assert monitor.snapshot()["incidents"] == []


@pytest.mark.asyncio
async def test_down_recovery_and_new_incident(monkeypatch):
    monitor = HealthMonitor()
    states = simulate_checks(monkeypatch, monitor)

    await monitor.scan(None)
    last_ok = monitor.services["players"]["last_ok_at"]

    states["players"] = "down"
    await monitor.scan(None)
    down_since = monitor.services["players"]["down_since"]

    assert down_since is not None
    assert monitor.services["players"]["last_ok_at"] == last_ok
    assert len(monitor.incidents) == 1

    # Otra consulta durante la misma caída no duplica el incidente.
    await monitor.scan(None)
    assert monitor.services["players"]["down_since"] == down_since
    assert len(monitor.incidents) == 1

    # Recuperación: elimina la caída activa, conserva el historial.
    states["players"] = "ok"
    await monitor.scan(None)
    assert monitor.services["players"]["down_since"] is None
    assert monitor.services["players"]["status"] == "ok"
    assert len(monitor.incidents) == 1

    # Una caída nueva genera otro incidente.
    states["players"] = "down"
    await monitor.scan(None)
    assert len(monitor.incidents) == 2


@pytest.mark.asyncio
async def test_history_keeps_latest_twenty_results(monkeypatch):
    monitor = HealthMonitor()
    simulate_checks(monkeypatch, monitor)

    for _ in range(25):
        await monitor.scan(None)

    for service in monitor.snapshot()["services"]:
        assert len(service["history"]) == 20


@pytest.mark.asyncio
async def test_database_connection_is_closed(monkeypatch):
    monitor = HealthMonitor()
    connection = AsyncMock()
    connection.fetchval.return_value = 1

    monkeypatch.setenv("MATCH_DB_URL", "postgresql://example")
    monkeypatch.setattr(
        "app.health.asyncpg.connect",
        AsyncMock(return_value=connection),
    )

    state, _ = await monitor.check_connection("match-db", "MATCH_DB_URL")

    assert state == "ok"
    connection.fetchval.assert_awaited_once_with("SELECT 1")
    connection.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_rabbitmq_connection_is_closed(monkeypatch):
    monitor = HealthMonitor()
    connection = AsyncMock()
    connection.is_closed = False

    monkeypatch.setenv("RABBITMQ_URL", "amqp://example")
    monkeypatch.setattr(
        "app.health.aio_pika.connect",
        AsyncMock(return_value=connection),
    )

    state, _ = await monitor.check_connection("rabbitmq", "RABBITMQ_URL")

    assert state == "ok"
    connection.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_configuration_reports_down(monkeypatch):
    monitor = HealthMonitor()
    monkeypatch.delenv("MATCH_DB_URL", raising=False)

    result = await monitor.measure(
        "match-db",
        lambda: monitor.check_connection("match-db", "MATCH_DB_URL"),
    )

    assert result[1] == "down"