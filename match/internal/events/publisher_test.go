package events

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestMatchStartedPayloadUsesContractKeys(t *testing.T) {
	event := NewMatchStarted(
		"match-1",
		"ABCD",
		time.Unix(0, 0),
		[]string{"p1", "p2"},
	)
	if event.EventID == "" {
		t.Error("el evento debe llevar event_id")
	}

	raw, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{
		"event_id",
		"match_id",
		"room_code",
		"started_at",
		"player_ids",
	} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("falta la clave %q en match.started", key)
		}
	}
	if decoded["started_at"] != "1970-01-01T00:00:00Z" {
		t.Errorf("started_at inesperado: %v", decoded["started_at"])
	}
}

func TestMatchFinishedPayloadUsesContractKeys(t *testing.T) {
	event := NewMatchFinished(
		"match-1",
		time.Unix(0, 0),
		WinnerCrew,
		[]PlayerResult{{
			PlayerID: "p1",
			Role:     RoleCrew,
			Ejected:  false,
			Harvest:  0,
		}},
	)
	if event.EventID == "" {
		t.Error("el evento debe llevar event_id")
	}

	raw, err := json.Marshal(event)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, key := range []string{
		"event_id",
		"match_id",
		"finished_at",
		"winner",
		"players",
	} {
		if _, ok := decoded[key]; !ok {
			t.Errorf("falta la clave %q en match.finished", key)
		}
	}
	if decoded["finished_at"] != "1970-01-01T00:00:00Z" {
		t.Errorf("finished_at inesperado: %v", decoded["finished_at"])
	}

	players, ok := decoded["players"].([]any)
	if !ok || len(players) != 1 {
		t.Fatalf("players inesperado: %v", decoded["players"])
	}
	player, ok := players[0].(map[string]any)
	if !ok {
		t.Fatalf("jugador inesperado: %v", players[0])
	}
	for _, key := range []string{"player_id", "role", "ejected", "harvest"} {
		if _, ok := player[key]; !ok {
			t.Errorf("falta la clave %q en players[]", key)
		}
	}
}

// Sin RabbitMQ el publicador devuelve error al instante; el servicio sigue.
func TestPublishWithoutRabbitReturnsNotConnected(t *testing.T) {
	publisher := NewAMQPPublisher("amqp://guest:guest@127.0.0.1:1/")
	defer publisher.Close()

	err := publisher.Publish(
		context.Background(),
		RoutingKeyStarted,
		MatchStarted{EventID: "event-1"},
	)
	if !errors.Is(err, ErrNotConnected) {
		t.Fatalf("se esperaba ErrNotConnected, got %v", err)
	}
}
