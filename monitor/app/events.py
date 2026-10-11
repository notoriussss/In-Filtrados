"""Consumidor de eventos del juego y contadores del panel (S1-22)."""

import asyncio
import json
import logging
import os
from collections import deque
from datetime import UTC, datetime

import aio_pika

from app.messages import (
    EVENT_MATCH_FINISHED,
    EVENT_MATCH_STARTED,
    EVENT_PLAYER_DISCONNECTED,
    EVENT_PLAYER_EJECTED_CREW,
    EVENT_PLAYER_EJECTED_IMPOSTOR,
    EVENT_PLAYER_RECONNECTED,
    EVENT_TASK_COMPLETED,
    EVENT_UNKNOWN,
    LOG_EVENTS_BAD_MESSAGE,
    LOG_EVENTS_CONNECT_FAILED,
    LOG_EVENTS_CONNECTED,
    LOG_EVENTS_DISCONNECTED,
    LOG_EVENTS_RECONNECTED,
    PLAYER_UNKNOWN,
    WINNER_LABELS,
    WINNER_UNKNOWN,
)

EXCHANGE_NAME = "game.events"
QUEUE_NAME = "monitor.all"
BINDING_KEY = "#"
RECONNECT_SECONDS = 2
RECENT_LIMIT = 20
SEEN_LIMIT = 1000
PREFETCH = 10

KEY_MATCH_STARTED = "match.started"
KEY_MATCH_FINISHED = "match.finished"
KEY_TASK_COMPLETED = "task.completed"
KEY_PLAYER_EJECTED = "player.ejected"
KEY_PLAYER_DISCONNECTED = "player.disconnected"
KEY_PLAYER_RECONNECTED = "player.reconnected"

logger = logging.getLogger(__name__)


def _utc_now():
    return datetime.now(UTC)


def _parse_time(value):
    """RFC 3339 a datetime con zona; None si no se puede leer."""
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed


class EventStats:
    def __init__(self, now=_utc_now):
        self._now = now
        # match_id -> ids de jugadores; evita negativos y duplicados.
        self.active_matches = {}
        self.finished_today = 0
        self.today = now().date()
        self.recent = deque(maxlen=RECENT_LIMIT)
        self._seen_order = deque()
        self._seen = set()
        self.connected = False
        # S3-04: (match_id, player_id) -> jugador en periodo de gracia.
        self.in_grace = {}
        # Último "at" visto por jugador: ordena desconexión y reconexión
        # aunque lleguen al revés.
        self._grace_at = {}

    def _remember(self, event_id):
        if len(self._seen_order) >= SEEN_LIMIT:
            self._seen.discard(self._seen_order.popleft())
        self._seen_order.append(event_id)
        self._seen.add(event_id)

    def _roll_day(self, now):
        if now.date() != self.today:
            self.today = now.date()
            self.finished_today = 0

    def handle(self, routing_key, payload):
        """Aplica un evento. Devuelve False si se ignoró."""
        if not isinstance(payload, dict):
            return False

        event_id = payload.get("event_id")
        if not isinstance(event_id, str) or not event_id:
            return False
        if event_id in self._seen:
            return False

        now = self._now()
        self._roll_day(now)

        match_id = payload.get("match_id")
        if routing_key == KEY_MATCH_STARTED:
            description = self._on_started(match_id, payload)
        elif routing_key == KEY_MATCH_FINISHED:
            description = self._on_finished(match_id, payload)
        elif routing_key == KEY_TASK_COMPLETED:
            description = EVENT_TASK_COMPLETED.format(
                liters=payload.get("liters_saved", 0),
            )
        elif routing_key == KEY_PLAYER_DISCONNECTED:
            description = self._on_disconnected(match_id, payload)
        elif routing_key == KEY_PLAYER_RECONNECTED:
            description = self._on_reconnected(match_id, payload)
        elif routing_key == KEY_PLAYER_EJECTED:
            description = (
                EVENT_PLAYER_EJECTED_IMPOSTOR
                if payload.get("was_impostor")
                else EVENT_PLAYER_EJECTED_CREW
            )
        else:
            description = EVENT_UNKNOWN.format(key=routing_key)

        self._remember(event_id)
        self.recent.append({
            "received_at": now.isoformat(),
            "routing_key": routing_key,
            "match_id": match_id,
            "description": description,
        })
        return True

    def _on_started(self, match_id, payload):
        player_ids = payload.get("player_ids") or []
        if match_id and match_id not in self.active_matches:
            self.active_matches[match_id] = set(player_ids)

        return EVENT_MATCH_STARTED.format(
            room=payload.get("room_code", ""),
            players=len(player_ids),
        )

    def _newer(self, key, payload):
        """True si el evento es más nuevo que el último del jugador."""
        at = _parse_time(payload.get("at"))
        last = self._grace_at.get(key)
        if at is not None and last is not None and at < last:
            return False
        if at is not None:
            self._grace_at[key] = at
        return True

    def _on_disconnected(self, match_id, payload):
        name = payload.get("display_name") or PLAYER_UNKNOWN
        seconds = payload.get("grace_seconds", 0)
        key = (match_id, payload.get("player_id"))
        ends_at = _parse_time(payload.get("grace_ends_at"))
        if self._newer(key, payload) and ends_at is not None:
            self.in_grace[key] = {
                "match_id": match_id,
                "player_id": payload.get("player_id"),
                "name": name,
                "grace_ends_at": ends_at,
            }
        return EVENT_PLAYER_DISCONNECTED.format(name=name, seconds=seconds)

    def _on_reconnected(self, match_id, payload):
        name = payload.get("display_name") or PLAYER_UNKNOWN
        key = (match_id, payload.get("player_id"))
        if self._newer(key, payload):
            self.in_grace.pop(key, None)
        return EVENT_PLAYER_RECONNECTED.format(name=name)

    def _grace_snapshot(self, now):
        """Jugadores todavía en gracia, con su cuenta regresiva."""
        expired = [
            key for key, player in self.in_grace.items()
            if player["grace_ends_at"] <= now
        ]
        for key in expired:
            self.in_grace.pop(key)
        players = sorted(
            self.in_grace.values(),
            key=lambda player: player["grace_ends_at"],
        )
        return [
            {
                "match_id": player["match_id"],
                "player_id": player["player_id"],
                "name": player["name"],
                "grace_ends_at": player["grace_ends_at"].isoformat(),
                "seconds_left": round(
                    (player["grace_ends_at"] - now).total_seconds()
                ),
            }
            for player in players
        ]

    def _on_finished(self, match_id, payload):
        # Una partida que no vimos empezar también terminó hoy.
        self.active_matches.pop(match_id, None)
        # Ya nadie espera volver a una partida terminada.
        for key in [k for k in self.in_grace if k[0] == match_id]:
            self.in_grace.pop(key)
        for key in [k for k in self._grace_at if k[0] == match_id]:
            self._grace_at.pop(key)
        self.finished_today += 1

        winner = WINNER_LABELS.get(
            payload.get("winner"),
            WINNER_UNKNOWN,
        )
        return EVENT_MATCH_FINISHED.format(winner=winner)

    def snapshot(self):
        now = self._now()
        self._roll_day(now)
        grace = self._grace_snapshot(now)
        return {
            "players_in_grace": len(grace),
            "grace": grace,
            "connected": self.connected,
            "active_matches": len(self.active_matches),
            "players_in_match": sum(
                len(players)
                for players in self.active_matches.values()
            ),
            "finished_today": self.finished_today,
            "recent_events": list(reversed(self.recent)),
        }


def make_message_handler(stats):
    async def on_message(message):
        # Ack solo después de aplicar el evento (regla 5).
        async with message.process(requeue=False):
            try:
                payload = json.loads(message.body)
            except (ValueError, UnicodeDecodeError) as error:
                logger.warning(
                    LOG_EVENTS_BAD_MESSAGE,
                    type(error).__name__,
                    message.routing_key,
                )
                raise
            stats.handle(message.routing_key, payload)

    return on_message


async def _connect(url, stats):
    """Reintenta cada 2 s hasta lograr la primera conexión."""
    while True:
        try:
            return await aio_pika.connect_robust(
                url,
                reconnect_interval=RECONNECT_SECONDS,
                timeout=RECONNECT_SECONDS,
            )
        except asyncio.CancelledError:
            raise
        # Nunca tumbar el monitor por RabbitMQ caído.
        except Exception as error:  # noqa: BLE001
            stats.connected = False
            logger.warning(
                LOG_EVENTS_CONNECT_FAILED,
                type(error).__name__,
                RECONNECT_SECONDS,
            )
            await asyncio.sleep(RECONNECT_SECONDS)


async def _consume_once(url, stats):
    connection = await _connect(url, stats)

    def on_close(*_args):
        stats.connected = False
        logger.warning(LOG_EVENTS_DISCONNECTED)

    def on_reconnect(*_args):
        stats.connected = True
        logger.info(LOG_EVENTS_RECONNECTED)

    connection.close_callbacks.add(on_close)
    connection.reconnect_callbacks.add(on_reconnect)

    try:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=PREFETCH)
        exchange = await channel.declare_exchange(
            EXCHANGE_NAME,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        queue = await channel.declare_queue(QUEUE_NAME, durable=True)
        await queue.bind(exchange, routing_key=BINDING_KEY)
        await queue.consume(make_message_handler(stats))

        stats.connected = True
        logger.info(LOG_EVENTS_CONNECTED, QUEUE_NAME)

        # connect_robust restaura canal, cola y consumidor solo.
        await asyncio.Future()
    finally:
        stats.connected = False
        await connection.close()


async def consume_events(stats):
    url = os.environ["RABBITMQ_URL"]
    while True:
        try:
            await _consume_once(url, stats)
        except asyncio.CancelledError:
            raise
        # Si falla la declaración de la cola, empezar de nuevo.
        except Exception as error:  # noqa: BLE001
            logger.warning(
                LOG_EVENTS_CONNECT_FAILED,
                type(error).__name__,
                RECONNECT_SECONDS,
            )
            await asyncio.sleep(RECONNECT_SECONDS)
