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
	ExchangeName            = "game.events"
	RoutingKeyStarted       = "match.started"
	RoutingKeyFinished      = "match.finished"
	RoutingKeyTaskCompleted = "task.completed"
	RoutingKeyPlayerEjected = "player.ejected"
	// S3-04: un jugador entra o sale de su periodo de gracia.
	RoutingKeyPlayerDisconnected = "player.disconnected"
	RoutingKeyPlayerReconnected  = "player.reconnected"
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

// TaskCompleted es el evento `task.completed` de docs/tasks.md 0.7.
type TaskCompleted struct {
	EventID     string `json:"event_id"`
	MatchID     string `json:"match_id"`
	PlayerID    string `json:"player_id"`
	TaskType    string `json:"task_type"`
	LitersSaved int32  `json:"liters_saved"`
}

// PlayerEjected es el evento `player.ejected` de docs/tasks.md 0.7.
type PlayerEjected struct {
	EventID     string `json:"event_id"`
	MatchID     string `json:"match_id"`
	PlayerID    string `json:"player_id"`
	WasImpostor bool   `json:"was_impostor"`
}

// PlayerDisconnected es el evento `player.disconnected` (S3-04): el
// jugador se desconectó en plena partida y tiene hasta GraceEndsAt para
// volver. At ordena este evento y `player.reconnected` del mismo jugador.
type PlayerDisconnected struct {
	EventID      string `json:"event_id"`
	MatchID      string `json:"match_id"`
	PlayerID     string `json:"player_id"`
	DisplayName  string `json:"display_name"`
	GraceSeconds int    `json:"grace_seconds"`
	GraceEndsAt  string `json:"grace_ends_at"`
	At           string `json:"at"`
}

// PlayerReconnected es el evento `player.reconnected` (S3-04).
type PlayerReconnected struct {
	EventID     string `json:"event_id"`
	MatchID     string `json:"match_id"`
	PlayerID    string `json:"player_id"`
	DisplayName string `json:"display_name"`
	At          string `json:"at"`
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

// NewTaskCompleted arma el evento con un `event_id` nuevo.
func NewTaskCompleted(
	matchID string,
	playerID string,
	taskType string,
	litersSaved int32,
) TaskCompleted {
	return TaskCompleted{
		EventID:     uuid.New().String(),
		MatchID:     matchID,
		PlayerID:    playerID,
		TaskType:    taskType,
		LitersSaved: litersSaved,
	}
}

// NewPlayerEjected arma el evento con un `event_id` nuevo.
func NewPlayerEjected(
	matchID string,
	playerID string,
	wasImpostor bool,
) PlayerEjected {
	return PlayerEjected{
		EventID:     uuid.New().String(),
		MatchID:     matchID,
		PlayerID:    playerID,
		WasImpostor: wasImpostor,
	}
}

// NewPlayerDisconnected arma el evento con un `event_id` nuevo.
func NewPlayerDisconnected(
	matchID string,
	playerID string,
	displayName string,
	grace time.Duration,
	at time.Time,
) PlayerDisconnected {
	return PlayerDisconnected{
		EventID:      uuid.New().String(),
		MatchID:      matchID,
		PlayerID:     playerID,
		DisplayName:  displayName,
		GraceSeconds: int(grace / time.Second),
		GraceEndsAt:  formatTime(at.Add(grace)),
		At:           formatPreciseTime(at),
	}
}

// NewPlayerReconnected arma el evento con un `event_id` nuevo.
func NewPlayerReconnected(
	matchID string,
	playerID string,
	displayName string,
	at time.Time,
) PlayerReconnected {
	return PlayerReconnected{
		EventID:     uuid.New().String(),
		MatchID:     matchID,
		PlayerID:    playerID,
		DisplayName: displayName,
		At:          formatPreciseTime(at),
	}
}

// formatPreciseTime conserva los nanosegundos: dos eventos del mismo
// jugador en el mismo segundo se pueden ordenar.
func formatPreciseTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}

// formatTime usa RFC 3339 en UTC para que el JSON sea estable.
func formatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339)
}
