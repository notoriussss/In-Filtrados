"""Constantes de mensajes y detalles del monitor (Reglas 1, 9 y 10)."""

DETAIL_OK = "Responde bien"
DETAIL_TIMEOUT = "No respondió en 2 s"
DETAIL_FAILED = "No responde ({error})"
DETAIL_NOT_CHECKED = "Aún no comprobado"
DETAIL_UNKNOWN = "Sin datos"
DETAIL_PARENT_DOWN = "Servicio padre no responde"
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
