import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app import events
from app.events import (
    BINDING_KEY,
    EXCHANGE_NAME,
    QUEUE_NAME,
    RECENT_LIMIT,
    EventStats,
    consume_events,
    make_message_handler,
)
from app.messages import EVENT_MATCH_FINISHED, WINNER_LABELS


def started(event_id="e1", match_id="m1", players=3):
    return {
        "event_id": event_id,
        "match_id": match_id,
        "room_code": "ABCD",
        "started_at": "2026-10-10T12:00:00Z",
        "player_ids": [f"p{i}" for i in range(players)],
    }


def finished(event_id="e2", match_id="m1", winner="crew"):
    return {
        "event_id": event_id,
        "match_id": match_id,
        "finished_at": "2026-10-10T12:05:00Z",
        "winner": winner,
        "players": [],
    }


def test_started_counts_match_and_players():
    stats = EventStats()

    assert stats.handle("match.started", started())

    snapshot = stats.snapshot()
    assert snapshot["active_matches"] == 1
    assert snapshot["players_in_match"] == 3
    assert snapshot["finished_today"] == 0


def test_finished_resets_active_and_counts_today():
    stats = EventStats()
    stats.handle("match.started", started())
    stats.handle("match.finished", finished())

    snapshot = stats.snapshot()
    assert snapshot["active_matches"] == 0
    assert snapshot["players_in_match"] == 0
    assert snapshot["finished_today"] == 1
    assert snapshot["recent_events"][0]["description"] == (
        EVENT_MATCH_FINISHED.format(winner=WINNER_LABELS["crew"])
    )


def test_duplicate_event_id_is_ignored():
    stats = EventStats()
    stats.handle("match.started", started())
    stats.handle("match.finished", finished())

    assert not stats.handle("match.finished", finished())

    snapshot = stats.snapshot()
    assert snapshot["finished_today"] == 1
    assert len(snapshot["recent_events"]) == 2


def test_same_match_started_twice_is_counted_once():
    stats = EventStats()
    stats.handle("match.started", started(event_id="e1"))
    stats.handle("match.started", started(event_id="e9"))

    assert stats.snapshot()["active_matches"] == 1
    assert stats.snapshot()["players_in_match"] == 3


def test_finished_unknown_match_never_goes_negative():
    stats = EventStats()
    stats.handle("match.finished", finished(match_id="other"))

    snapshot = stats.snapshot()
    assert snapshot["active_matches"] == 0
    assert snapshot["players_in_match"] == 0
    assert snapshot["finished_today"] == 1


def test_recent_keeps_last_twenty_newest_first():
    stats = EventStats()
    for i in range(RECENT_LIMIT + 5):
        stats.handle(
            "task.completed",
            {"event_id": f"t{i}", "match_id": "m1", "liters_saved": i},
        )

    recent = stats.snapshot()["recent_events"]
    assert len(recent) == RECENT_LIMIT
    assert "24" in recent[0]["description"]
    assert recent[0]["received_at"] is not None


def test_new_day_resets_finished_today():
    now = [datetime(2026, 10, 10, 23, 59, tzinfo=UTC)]
    stats = EventStats(now=lambda: now[0])
    stats.handle("match.finished", finished())
    assert stats.snapshot()["finished_today"] == 1

    now[0] += timedelta(minutes=2)
    assert stats.snapshot()["finished_today"] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {"match_id": "m1"},
        {"event_id": "", "match_id": "m1"},
        ["not", "a", "dict"],
    ],
)
def test_invalid_payload_is_ignored(payload):
    stats = EventStats()

    assert not stats.handle("match.started", payload)
    assert stats.snapshot()["recent_events"] == []


class FakeMessage:
    def __init__(self, body, routing_key):
        self.body = body
        self.routing_key = routing_key
        self.processed = False
        self.rejected = False

    def process(self, requeue=False):
        message = self

        class Context:
            async def __aenter__(self):
                return message

            async def __aexit__(self, exc_type, exc, tb):
                message.processed = exc_type is None
                message.rejected = exc_type is not None
                return True

        return Context()


@pytest.mark.asyncio
async def test_handler_applies_event_before_ack():
    stats = EventStats()
    handler = make_message_handler(stats)
    message = FakeMessage(
        b'{"event_id": "e1", "match_id": "m1", "player_ids": ["a"]}',
        "match.started",
    )

    await handler(message)

    assert message.processed
    assert stats.snapshot()["active_matches"] == 1


@pytest.mark.asyncio
async def test_handler_rejects_invalid_json():
    stats = EventStats()
    message = FakeMessage(b"{not json", "match.started")

    await make_message_handler(stats)(message)

    assert message.rejected
    assert stats.snapshot()["recent_events"] == []


@pytest.mark.asyncio
async def test_consumer_retries_until_rabbitmq_is_up(monkeypatch):
    stats = EventStats()
    queue = AsyncMock()
    exchange = object()
    channel = AsyncMock()
    channel.declare_exchange.return_value = exchange
    channel.declare_queue.return_value = queue
    connection = MagicMock()
    connection.channel = AsyncMock(return_value=channel)
    connection.close = AsyncMock()

    connect = AsyncMock(side_effect=[ConnectionError("down"), connection])
    sleep = AsyncMock()
    real_sleep = asyncio.sleep
    monkeypatch.setattr(events.aio_pika, "connect_robust", connect)
    monkeypatch.setattr(events.asyncio, "sleep", sleep)

    task = asyncio.create_task(consume_events(stats))
    for _ in range(20):
        if stats.connected:
            break
        await real_sleep(0)

    assert stats.connected
    assert connect.await_count == 2
    sleep.assert_awaited_once_with(events.RECONNECT_SECONDS)
    assert channel.declare_exchange.await_args.args[0] == EXCHANGE_NAME
    assert channel.declare_exchange.await_args.kwargs["durable"]
    channel.declare_queue.assert_awaited_once_with(
        QUEUE_NAME,
        durable=True,
    )
    queue.bind.assert_awaited_once_with(
        exchange,
        routing_key=BINDING_KEY,
    )
    queue.consume.assert_awaited_once()

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not stats.connected
    connection.close.assert_awaited_once()


# S3-04: jugadores en periodo de gracia.

NOW = datetime(2026, 10, 10, 12, 0, 0, tzinfo=UTC)


def disconnected(event_id="d1", match_id="m1", player_id="p1",
                 seconds=600, at=NOW):
    return {
        "event_id": event_id,
        "match_id": match_id,
        "player_id": player_id,
        "display_name": "Ana",
        "grace_seconds": seconds,
        "grace_ends_at": (at + timedelta(seconds=seconds)).isoformat(),
        "at": at.isoformat(),
    }


def reconnected(event_id="r1", match_id="m1", player_id="p1", at=NOW):
    return {
        "event_id": event_id,
        "match_id": match_id,
        "player_id": player_id,
        "display_name": "Ana",
        "at": at.isoformat(),
    }


class Clock:
    def __init__(self, now):
        self.value = now

    def __call__(self):
        return self.value


def test_disconnected_player_shows_with_countdown():
    clock = Clock(NOW + timedelta(seconds=30))
    stats = EventStats(now=clock)

    assert stats.handle("player.disconnected", disconnected())

    snapshot = stats.snapshot()
    assert snapshot["players_in_grace"] == 1
    player = snapshot["grace"][0]
    assert player["name"] == "Ana"
    assert player["seconds_left"] == 570
    assert snapshot["recent_events"][0]["description"] == (
        "Ana se desconectó: tiene 600 s para volver"
    )


def test_reconnected_player_disappears():
    stats = EventStats(now=Clock(NOW))
    stats.handle("player.disconnected", disconnected())
    stats.handle(
        "player.reconnected",
        reconnected(at=NOW + timedelta(seconds=5)),
    )

    assert stats.snapshot()["players_in_grace"] == 0


def test_out_of_order_reconnect_does_not_hide_a_new_disconnect():
    stats = EventStats(now=Clock(NOW))
    later = NOW + timedelta(seconds=10)
    stats.handle("player.disconnected", disconnected(at=later))
    # Llega tarde la reconexión de un corte anterior.
    stats.handle("player.reconnected", reconnected(at=NOW))

    assert stats.snapshot()["players_in_grace"] == 1


def test_grace_over_or_match_finished_removes_the_player():
    clock = Clock(NOW)
    stats = EventStats(now=clock)
    stats.handle("player.disconnected", disconnected(seconds=60))
    stats.handle(
        "player.disconnected",
        disconnected(event_id="d2", match_id="m2", player_id="p2"),
    )

    clock.value = NOW + timedelta(seconds=61)
    snapshot = stats.snapshot()
    assert [p["player_id"] for p in snapshot["grace"]] == ["p2"]

    stats.handle("match.finished", finished(event_id="f2", match_id="m2"))
    assert stats.snapshot()["players_in_grace"] == 0
