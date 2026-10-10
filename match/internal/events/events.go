// Package events define los eventos que `match` publica en RabbitMQ y el
// publicador con publisher confirms (docs/tasks.md 0.7).
package events

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// Exchange y routing keys del contrato (docs/tasks.md 0.7).
const (
	ExchangeName       = "game.events"
	RoutingKeyStarted  = "match.started"
	RoutingKeyFinished = "match.finished"
)

// Roles y ganadores de match.finished (docs/tasks.md 0.7).
const (
	RoleCrew     = "crew"
	RoleImpostor = "impostor"
	WinnerCrew   = "crew"
)

// Publisher publica un evento en el exchange `game.events`.
type Publisher interface {
	Publish(ctx context.Context, routingKey string, payload any) error
}

// MatchStarted es el evento `match.started` de docs/tasks.md 0.7.
type MatchStarted struct {
	EventID   string   `json:"event_id"`
	MatchID   string   `json:"match_id"`
	RoomCode  string   `json:"room_code"`
	StartedAt string   `json:"started_at"`
	PlayerIDs []string `json:"player_ids"`
}

// MatchFinished es el evento `match.finished` de docs/tasks.md 0.7.
type MatchFinished struct {
	EventID    string         `json:"event_id"`
	MatchID    string         `json:"match_id"`
	FinishedAt string         `json:"finished_at"`
	Winner     string         `json:"winner"`
	Players    []PlayerResult `json:"players"`
}

// PlayerResult es el resultado de un jugador dentro de `match.finished`.
type PlayerResult struct {
	PlayerID string `json:"player_id"`
	Role     string `json:"role"`
	Ejected  bool   `json:"ejected"`
	Harvest  int    `json:"harvest"`
}

// NewMatchStarted arma el evento con un `event_id` nuevo.
func NewMatchStarted(
	matchID string,
	roomCode string,
	startedAt time.Time,
	playerIDs []string,
) MatchStarted {
	return MatchStarted{
		EventID:   uuid.New().String(),
		MatchID:   matchID,
		RoomCode:  roomCode,
		StartedAt: formatTime(startedAt),
		PlayerIDs: playerIDs,
	}
}

// NewMatchFinished arma el evento con un `event_id` nuevo.
func NewMatchFinished(
	matchID string,
	finishedAt time.Time,
	winner string,
	players []PlayerResult,
) MatchFinished {
	return MatchFinished{
		EventID:    uuid.New().String(),
		MatchID:    matchID,
		FinishedAt: formatTime(finishedAt),
		Winner:     winner,
		Players:    players,
	}
}

// formatTime usa RFC 3339 en UTC para que el JSON sea estable.
func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
