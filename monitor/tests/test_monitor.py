from unittest.mock import AsyncMock

import httpx
import pytest

from app.health import HealthMonitor
from app.messages import (
    DETAIL_AMQP_OK,
    DETAIL_DB_DOWN,
    DETAIL_OK,
    DETAIL_PARENT_DOWN,
    DETAIL_TIMEOUT,
    STATE_DEGRADED,
    STATE_DOWN,
    STATE_OK,
    STATE_UNKNOWN,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "http_code, payload, expected",
    [
        (
            200,
            {"service": "players", "status": "ok", "checks": {}},
            STATE_OK,
        ),
        (
            503,
            {
                "service": "players",
                "status": "degraded",
                "checks": {"db": "fail"},
            },
            STATE_DEGRADED,
        ),
        (
            500,
            {"service": "players", "status": "error"},
            STATE_DOWN,
        ),
        (
            200,
            {"service": "other", "status": "ok"},
            STATE_DOWN,
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

    name, state, _, latency, *_ = result
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

    assert result[1] == STATE_DOWN
    assert result[2] == DETAIL_TIMEOUT


@pytest.mark.asyncio
async def test_connection_error_hides_secrets():
    monitor = HealthMonitor()

    async def failing_check():
        raise ConnectionError("password=do-not-expose")

    result = await monitor.measure("match", failing_check)

    assert result[1] == STATE_DOWN
    assert "do-not-expose" not in result[2]


@pytest.mark.asyncio
async def test_async_timeout():
    monitor = HealthMonitor()

    async def failing_check():
        raise TimeoutError()

    result = await monitor.measure("rabbitmq", failing_check)

    assert result[1] == STATE_DOWN
    assert result[2] == DETAIL_TIMEOUT


def simulate_checks(monkeypatch, monitor):
    states = {}
    checks_by_service = {
        "match": {"db": "ok"},
        "players": {"db": "ok"},
    }

    async def fake_http(client, name, url):
        return (
            states.get(name, STATE_OK),
            DETAIL_OK,
            checks_by_service.get(name, {}),
        )

    async def fake_rabbitmq():
        return states.get("rabbitmq", STATE_OK), DETAIL_AMQP_OK, {}

    monkeypatch.setattr(monitor, "check_http", fake_http)
    monkeypatch.setattr(monitor, "check_rabbitmq", fake_rabbitmq)
    return states, checks_by_service


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
        assert service["status"] == STATE_OK
        assert service["last_ok_at"] is not None
        assert len(service["history"]) == 1


@pytest.mark.asyncio
async def test_degraded_does_not_create_down_incident(monkeypatch):
    monitor = HealthMonitor()
    states, _ = simulate_checks(monkeypatch, monitor)
    states["gateway"] = STATE_DEGRADED

    await monitor.scan(None)

    assert monitor.services["gateway"]["status"] == STATE_DEGRADED
    assert monitor.services["gateway"]["down_since"] is None
    assert monitor.snapshot()["incidents"] == []


@pytest.mark.asyncio
async def test_down_recovery_and_new_incident(monkeypatch):
    monitor = HealthMonitor()
    states, _ = simulate_checks(monkeypatch, monitor)

    await monitor.scan(None)
    last_ok = monitor.services["players"]["last_ok_at"]

    states["players"] = STATE_DOWN
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
    states["players"] = STATE_OK
    await monitor.scan(None)
    assert monitor.services["players"]["down_since"] is None
    assert monitor.services["players"]["status"] == STATE_OK
    assert len(monitor.incidents) == 1

    # Una caída nueva genera otro incidente.
    states["players"] = STATE_DOWN
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
async def test_rabbitmq_connection_is_closed(monkeypatch):
    monitor = HealthMonitor()
    connection = AsyncMock()
    connection.is_closed = False

    monkeypatch.setenv("RABBITMQ_URL", "amqp://example")
    monkeypatch.setattr(
        "app.health.aio_pika.connect",
        AsyncMock(return_value=connection),
    )

    state, _, _ = await monitor.check_rabbitmq()

    assert state == STATE_OK
    connection.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_missing_configuration_reports_down(monkeypatch):
    monitor = HealthMonitor()
    monkeypatch.delenv("RABBITMQ_URL", raising=False)

    result = await monitor.measure(
        "rabbitmq",
        monitor.check_rabbitmq,
    )

    assert result[1] == STATE_DOWN


@pytest.mark.asyncio
async def test_db_ok_when_parent_reports_ok(monkeypatch):
    monitor = HealthMonitor()
    _, checks = simulate_checks(monkeypatch, monitor)
    checks["match"]["db"] = "ok"

    await monitor.scan(None)

    assert monitor.services["match-db"]["status"] == STATE_OK
    assert monitor.services["match-db"]["detail"] == DETAIL_OK
    assert monitor.services["match-db"]["latency_ms"] is None


@pytest.mark.asyncio
async def test_db_down_and_incident_when_parent_reports_fail(monkeypatch):
    monitor = HealthMonitor()
    _, checks = simulate_checks(monkeypatch, monitor)
    raw_error = (
        "fail: failed to connect to `user=postgres database=postgres`: "
        "127.0.0.1:55433 (localhost): dial error: connection refused"
    )
    checks["match"]["db"] = raw_error

    await monitor.scan(None)

    assert monitor.services["match-db"]["status"] == STATE_DOWN
    expected_detail = DETAIL_DB_DOWN.format(parent="match")
    assert monitor.services["match-db"]["detail"] == expected_detail
    # Comprobar que no se exponen credenciales ni IPs en el detalle
    assert raw_error not in monitor.services["match-db"]["detail"]
    assert "user=postgres" not in monitor.services["match-db"]["detail"]
    assert "127.0.0.1" not in monitor.services["match-db"]["detail"]

    assert len(monitor.incidents) == 1
    assert monitor.incidents[0]["service"] == "match-db"
    assert monitor.incidents[0]["detail"] == expected_detail


@pytest.mark.asyncio
async def test_db_unknown_without_incident_when_parent_down(monkeypatch):
    monitor = HealthMonitor()
    states, _ = simulate_checks(monkeypatch, monitor)
    states["match"] = STATE_DOWN

    await monitor.scan(None)

    assert monitor.services["match-db"]["status"] == STATE_UNKNOWN
    assert (
        monitor.services["match-db"]["detail"]
        == DETAIL_PARENT_DOWN
    )
    # Solo el servicio padre match registra incidente por caída, no match-db
    assert len(monitor.incidents) == 1
    assert monitor.incidents[0]["service"] == "match"
