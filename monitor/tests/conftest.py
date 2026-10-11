"""Configuración global de pruebas para monitor."""

import os

os.environ.setdefault("WEB_HEALTH_URL", "http://web/health")
os.environ.setdefault("GATEWAY_HEALTH_URL", "http://gateway:3000/health")
os.environ.setdefault("MATCH_HEALTH_URL", "http://match:8081/health")
os.environ.setdefault("PLAYERS_HEALTH_URL", "http://players:8082/health")
os.environ.setdefault(
    "RABBITMQ_URL",
    "amqp://guest:guest@localhost:5672",
)
