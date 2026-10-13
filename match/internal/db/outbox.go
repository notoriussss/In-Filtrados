package db

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// OutboxStore guarda en PostgreSQL #1 los eventos que RabbitMQ no
// confirmó (S3-03). Implementa events.OutboxStore.
type OutboxStore struct {
	queries *Queries
}

func NewOutboxStore(pool *pgxpool.Pool) *OutboxStore {
	return &OutboxStore{queries: New(pool)}
}

func (s *OutboxStore) Add(
	ctx context.Context,
	eventID string,
	routingKey string,
	payload []byte,
) error {
	id, err := parseUUID(eventID, "event_id")
	if err != nil {
		return err
	}
	err = s.queries.InsertOutbox(ctx, InsertOutboxParams{
		EventID:    id,
		RoutingKey: routingKey,
		Payload:    payload,
	})
	if err != nil {
		return fmt.Errorf("outbox: guardando %s: %w", eventID, err)
	}
	return nil
}

func (s *OutboxStore) Pending(
	ctx context.Context,
	limit int32,
) ([]events.OutboxEvent, error) {
	rows, err := s.queries.ListOutbox(ctx, limit)
	if err != nil {
		return nil, fmt.Errorf("outbox: leyendo pendientes: %w", err)
	}
	pending := make([]events.OutboxEvent, 0, len(rows))
	for _, row := range rows {
		pending = append(pending, events.OutboxEvent{
			ID:         row.ID,
			EventID:    uuid.UUID(row.EventID.Bytes).String(),
			RoutingKey: row.RoutingKey,
			Payload:    row.Payload,
		})
	}
	return pending, nil
}

func (s *OutboxStore) Remove(ctx context.Context, id int64) error {
	if err := s.queries.DeleteOutbox(ctx, id); err != nil {
		return fmt.Errorf("outbox: borrando %d: %w", id, err)
	}
	return nil
}
