package events

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
)

// S3-03: ningún resultado se pierde. OutboxPublisher envuelve al
// publicador de RabbitMQ: si el broker no confirma un evento, lo guarda
// en la tabla outbox de PostgreSQL #1 y lo reintenta cada 5 s. Mientras
// quede algo en outbox, los eventos nuevos también van ahí, para que
// salgan en el mismo orden en que pasaron.

const (
	// OutboxRetryInterval es cada cuánto se reintenta lo pendiente.
	OutboxRetryInterval = 5 * time.Second
	// outboxBatch es cuántos eventos se reintentan por vuelta.
	outboxBatch = 100
	// outboxTimeout limita cada consulta y cada publicación.
	outboxTimeout = 2 * time.Second
)

// errNoEventID: todo evento lleva event_id (docs/tasks.md 0.7).
var errNoEventID = errors.New("outbox: el evento no tiene event_id")

// OutboxEvent es una fila de la tabla outbox.
type OutboxEvent struct {
	ID         int64
	EventID    string
	RoutingKey string
	Payload    []byte
}

// OutboxStore guarda y lee los eventos pendientes (PostgreSQL).
type OutboxStore interface {
	Add(
		ctx context.Context,
		eventID, routingKey string,
		payload []byte,
	) error
	Pending(ctx context.Context, limit int32) ([]OutboxEvent, error)
	Remove(ctx context.Context, id int64) error
}

type OutboxPublisher struct {
	inner Publisher
	store OutboxStore

	// mu ordena las publicaciones y los reintentos: un evento nuevo no
	// adelanta a uno que espera en outbox.
	mu       sync.Mutex
	pending  bool
	flushing bool
	added    uint64
}

// NewOutboxPublisher arranca suponiendo que puede haber pendientes de
// antes de un reinicio: hasta la primera vuelta de Run, todo va a outbox.
func NewOutboxPublisher(
	inner Publisher,
	store OutboxStore,
) *OutboxPublisher {
	return &OutboxPublisher{inner: inner, store: store, pending: true}
}

// Publish intenta publicar con confirmación; si no se puede, guarda el
// evento en outbox y devuelve nil, porque ya no se pierde.
func (o *OutboxPublisher) Publish(
	ctx context.Context,
	routingKey string,
	payload any,
) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("outbox: JSON inválido: %w", err)
	}
	eventID, err := eventIDOf(body)
	if err != nil {
		return err
	}

	o.mu.Lock()
	defer o.mu.Unlock()

	if !o.pending {
		pubErr := o.inner.Publish(ctx, routingKey, json.RawMessage(body))
		if pubErr == nil {
			return nil
		}
		log.Printf(
			"outbox: %s no se confirmó (%v); queda en outbox",
			routingKey,
			pubErr,
		)
	}

	// Contexto propio: el de la sala pudo vencer esperando al broker.
	saveCtx, cancel := context.WithTimeout(
		context.Background(),
		outboxTimeout,
	)
	defer cancel()
	if err := o.store.Add(saveCtx, eventID, routingKey, body); err != nil {
		// Sin base tampoco hay outbox: último intento directo.
		pubErr := o.inner.Publish(ctx, routingKey, json.RawMessage(body))
		if pubErr == nil {
			return nil
		}
		return fmt.Errorf(
			"outbox: %s no se publicó ni se guardó: %w",
			routingKey,
			errors.Join(pubErr, err),
		)
	}
	o.pending = true
	o.added++
	return nil
}

// Run reintenta lo pendiente al arrancar y luego cada 5 s.
func (o *OutboxPublisher) Run(ctx context.Context) {
	ticker := time.NewTicker(OutboxRetryInterval)
	defer ticker.Stop()
	for {
		o.Flush(ctx)
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return
		}
	}
}

// Flush publica en orden lo pendiente y borra cada fila confirmada. Se
// detiene en el primer fallo para no desordenar los eventos.
func (o *OutboxPublisher) Flush(ctx context.Context) {
	o.mu.Lock()
	if !o.pending || o.flushing {
		o.mu.Unlock()
		return
	}
	o.flushing = true
	o.mu.Unlock()

	defer func() {
		o.mu.Lock()
		o.flushing = false
		o.mu.Unlock()
	}()

	for {
		o.mu.Lock()
		before := o.added
		o.mu.Unlock()

		listCtx, cancel := context.WithTimeout(ctx, outboxTimeout)
		batch, err := o.store.Pending(listCtx, outboxBatch)
		cancel()
		if err != nil {
			log.Printf("outbox: no se pudo leer lo pendiente: %v", err)
			return
		}
		if len(batch) == 0 {
			o.mu.Lock()
			if o.added == before {
				o.pending = false
				o.mu.Unlock()
				return
			}
			o.mu.Unlock()
			continue
		}
		for _, ev := range batch {
			if !o.republish(ctx, ev) {
				return
			}
		}
	}
}

func (o *OutboxPublisher) republish(
	ctx context.Context,
	ev OutboxEvent,
) bool {
	pubCtx, cancel := context.WithTimeout(ctx, outboxTimeout)
	defer cancel()
	payload := json.RawMessage(ev.Payload)
	if err := o.inner.Publish(pubCtx, ev.RoutingKey, payload); err != nil {
		return false // el broker sigue sin confirmar: en 5 s otra vez
	}
	delCtx, cancelDel := context.WithTimeout(ctx, outboxTimeout)
	defer cancelDel()
	if err := o.store.Remove(delCtx, ev.ID); err != nil {
		// Ya salió: si se publica otra vez, los consumidores lo
		// descartan por event_id o (match_id, player_id).
		log.Printf("outbox: no se pudo borrar %s: %v", ev.EventID, err)
		return false
	}
	log.Printf("outbox: %s %s publicado", ev.RoutingKey, ev.EventID)
	return true
}

func eventIDOf(body []byte) (string, error) {
	var head struct {
		EventID string `json:"event_id"`
	}
	if err := json.Unmarshal(body, &head); err != nil || head.EventID == "" {
		return "", errNoEventID
	}
	return head.EventID, nil
}
