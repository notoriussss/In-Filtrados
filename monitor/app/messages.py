"""Constantes de mensajes y detalles del monitor (Reglas 1, 9 y 10)."""

DETAIL_OK = "Responde bien"
DETAIL_TIMEOUT = "No respondió en 2 s"
DETAIL_FAILED = "No responde ({error})"
DETAIL_NOT_CHECKED = "Aún no comprobado"
DETAIL_UNKNOWN = "Sin datos"
DETAIL_PARENT_DOWN = "Servicio padre no responde"
DETAIL_DB_DOWN = "La base no responde (según {parent})"
DETAIL_DEGRADED = "Dependencias con fallos: {detail}"
DETAIL_UNSPECIFIED_DEP = "Dependencia no especificada"
DETAIL_AMQP_OK = "Conexión AMQP establecida"
DETAIL_AMQP_CLOSED = "La conexión con RabbitMQ está cerrada"

# Estados de servicio
STATE_OK = "ok"
STATE_DEGRADED = "degraded"
STATE_DOWN = "down"
STATE_UNKNOWN = "unknown"

# Comprobaciones para GET /health del monitor
CHECK_POLLING_OK = "ok"
CHECK_POLLING_NOT_INITIALIZED = "fail: monitoring not initialized"
CHECK_POLLING_TASK_STOPPED = "fail: monitoring task stopped"
CHECK_POLLING_FIRST_SCAN = "fail: first scan not completed"
CHECK_POLLING_STALE = "fail: monitoring results are stale"
CHECK_POLLING_INVALID_TIMESTAMP = "fail: invalid scan timestamp"

# Mensajes de error para excepciones internas
ERROR_UNEXPECTED_SERVICE = "Unexpected service in health response"
ERROR_UNEXPECTED_HEALTH_RESPONSE = "Unexpected health response"

# Descripciones de eventos del juego para el panel (S1-22)
EVENT_MATCH_STARTED = "Empezó la partida {room} con {players} jugadores"
EVENT_MATCH_FINISHED = "Terminó una partida: ganó {winner}"
EVENT_TASK_COMPLETED = "Tarea de {kind} completada ({liters} L ahorrados)"
EVENT_PLAYER_EJECTED_IMPOSTOR = "Expulsaron a un jugador: era el impostor"
EVENT_PLAYER_EJECTED_CREW = "Expulsaron a un jugador: era de la tripulación"
EVENT_PLAYER_DISCONNECTED = (
    "{name} se desconectó: tiene {seconds} s para volver"
)
EVENT_PLAYER_RECONNECTED = "{name} volvió a la partida"
EVENT_UNKNOWN = "Evento {key}"
PLAYER_UNKNOWN = "Un jugador"
WINNER_LABELS = {
    "crew": "la tripulación",
    "impostor": "el impostor",
}
WINNER_UNKNOWN = "un bando desconocido"

# Tipos de tarea de las 3R (S2-13), en el orden del gráfico del panel
TASK_TYPE_LABELS = {
    "reduce": "Reducir",
    "reuse": "Reutilizar",
    "recycle": "Reciclar",
}
TASK_TYPE_UNKNOWN = "otro tipo"

# Mensajes de log del consumidor de eventos
LOG_EVENTS_CONNECT_FAILED = (
    "No se pudo conectar a RabbitMQ (%s); reintentando en %s s"
)
LOG_EVENTS_CONNECTED = "Consumiendo eventos de la cola %s"
LOG_EVENTS_DISCONNECTED = "Se perdió la conexión con RabbitMQ"
LOG_EVENTS_RECONNECTED = "Conexión con RabbitMQ restablecida"
LOG_EVENTS_BAD_MESSAGE = "Evento descartado (%s) con routing key %s"
