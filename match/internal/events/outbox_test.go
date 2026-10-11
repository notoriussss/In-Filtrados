package events

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
)

// flakyPublisher falla mientras down sea true y anota lo publicado.
type flakyPublisher struct {
	mu   sync.Mutex
	down bool
	sent []string // routing keys en el orden en que salieron
}

func (f *flakyPublisher) Publish(
	_ context.Context,
	routingKey string,
	_ any,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.down {
		return ErrNotConnected
	}
	f.sent = append(f.sent, routingKey)
	return nil
}

// memStore es la tabla outbox en memoria.
type memStore struct {
	rows   []OutboxEvent
	nextID int64
	fail   bool
}

func (m *memStore) Add(
	_ context.Context,
	eventID, routingKey string,
	payload []byte,
) error {
	if m.fail {
		return errors.New("base caída")
	}
	for _, r := range m.rows {
		if r.EventID == eventID {
			return nil // ON CONFLICT DO NOTHING
		}
	}
	m.nextID++
	m.rows = append(m.rows, OutboxEvent{
		ID:         m.nextID,
		EventID:    eventID,
		RoutingKey: routingKey,
		Payload:    payload,
	})
	return nil
}

func (m *memStore) Pending(
	_ context.Context,
	limit int32,
) ([]OutboxEvent, error) {
	if int(limit) < len(m.rows) {
		return append([]OutboxEvent(nil), m.rows[:limit]...), nil
	}
	return append([]OutboxEvent(nil), m.rows...), nil
}

func (m *memStore) Remove(_ context.Context, id int64) error {
	for i, r := range m.rows {
		if r.ID == id {
			m.rows = append(m.rows[:i], m.rows[i+1:]...)
			return nil
		}
	}
	return nil
}

func event(id string) map[string]string {
	return map[string]string{"event_id": id}
}

// ready deja el outbox vacío y en marcha, como tras la primera vuelta.
func ready(pub *flakyPublisher, store *memStore) *OutboxPublisher {
	o := NewOutboxPublisher(pub, store)
	o.Flush(context.Background())
	return o
}

func TestPublishesDirectlyWhenTheBrokerConfirms(t *testing.T) {
	pub, store := &flakyPublisher{}, &memStore{}
	o := ready(pub, store)
	err := o.Publish(context.Background(), RoutingKeyStarted, event("e1"))
	if err != nil || len(pub.sent) != 1 || len(store.rows) != 0 {
		t.Fatalf("err=%v sent=%v outbox=%v", err, pub.sent, store.rows)
	}
}

func TestUnconfirmedEventsWaitInTheOutboxAndKeepOrder(t *testing.T) {
	pub, store := &flakyPublisher{}, &memStore{}
	o := ready(pub, store)
	pub.down = true

	ctx := context.Background()
	err := o.Publish(ctx, RoutingKeyTaskCompleted, event("e1"))
	if err != nil {
		t.Fatalf("guardado en outbox no es un error: %v", err)
	}
	pub.down = false
	// El broker volvió, pero e1 sigue pendiente: e2 no lo adelanta.
	if err := o.Publish(ctx, RoutingKeyFinished, event("e2")); err != nil {
		t.Fatal(err)
	}
	if len(pub.sent) != 0 || len(store.rows) != 2 {
		t.Fatalf("e2 debía esperar detrás de e1: %v", pub.sent)
	}

	o.Flush(ctx)
	want := []string{RoutingKeyTaskCompleted, RoutingKeyFinished}
	if len(pub.sent) != 2 ||
		pub.sent[0] != want[0] ||
		pub.sent[1] != want[1] {
		t.Errorf("orden equivocado: %v", pub.sent)
	}
	if len(store.rows) != 0 {
		t.Error("lo confirmado se borra del outbox")
	}

	// Vacío otra vez: lo siguiente sale directo.
	_ = o.Publish(ctx, RoutingKeyStarted, event("e3"))
	if len(pub.sent) != 3 || len(store.rows) != 0 {
		t.Error("con el outbox vacío se publica directo")
	}
}

func TestFlushStopsAtTheFirstFailure(t *testing.T) {
	pub, store := &flakyPublisher{down: true}, &memStore{}
	o := ready(pub, store)
	ctx := context.Background()
	_ = o.Publish(ctx, RoutingKeyStarted, event("e1"))
	_ = o.Publish(ctx, RoutingKeyFinished, event("e2"))

	o.Flush(ctx) // sigue caído
	if len(store.rows) != 2 || len(pub.sent) != 0 {
		t.Fatal("nada sale mientras el broker no confirma")
	}
}

func TestPendingEventsFromBeforeARestartGoFirst(t *testing.T) {
	pub := &flakyPublisher{}
	body, _ := json.Marshal(event("viejo"))
	store := &memStore{
		rows: []OutboxEvent{{
			ID:         1,
			EventID:    "viejo",
			RoutingKey: "match.finished",
			Payload:    body,
		}},
		nextID: 1,
	}
	o := NewOutboxPublisher(pub, store)
	_ = o.Publish(context.Background(), RoutingKeyStarted, event("nuevo"))
	o.Flush(context.Background())
	if len(pub.sent) != 2 || pub.sent[0] != "match.finished" {
		t.Errorf("lo de antes del reinicio sale primero: %v", pub.sent)
	}
}

func TestWithoutDatabaseItStillTriesTheBroker(t *testing.T) {
	pub, store := &flakyPublisher{}, &memStore{fail: true}
	o := NewOutboxPublisher(pub, store) // pending: todavía no corrió Run
	err := o.Publish(context.Background(), RoutingKeyStarted, event("e1"))
	if err != nil || len(pub.sent) != 1 {
		t.Errorf("sin base, el evento igual sale directo: %v", err)
	}
	pub.down = true
	err = o.Publish(context.Background(), RoutingKeyStarted, event("e2"))
	if err == nil {
		t.Error("sin base ni broker se informa el error")
	}
}

func TestEventsWithoutIDAreRejected(t *testing.T) {
	o := ready(&flakyPublisher{}, &memStore{})
	err := o.Publish(context.Background(), "x", map[string]int{"a": 1})
	if !errors.Is(err, errNoEventID) {
		t.Errorf("esperaba errNoEventID, fue %v", err)
	}
}
