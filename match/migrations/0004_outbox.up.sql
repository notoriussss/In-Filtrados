-- S3-03: eventos que RabbitMQ no confirmó. match los reintenta cada 5 s
-- en orden (id) y borra cada uno al recibir la confirmación.
CREATE TABLE outbox (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID NOT NULL UNIQUE,
  routing_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
