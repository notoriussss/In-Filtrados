package db

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/notoriussss/in-filtrados/match/internal/room"
)

const (
	// eventLogBuffer son las filas que esperan sin bloquear a la sala.
	eventLogBuffer = 1024
	// eventLogTimeout es el límite de cada INSERT (AGENTS.md, regla 7).
	eventLogTimeout = 2 * time.Second
)

// EventLogWriter guarda event_log en su propia goroutine: la sala solo
// deja la fila en un canal y sigue con su tick.
type EventLogWriter struct {
	queries *Queries
	entries chan room.LogEntry
}

func NewEventLogWriter(pool *pgxpool.Pool) *EventLogWriter {
	return &EventLogWriter{
		queries: New(pool),
		entries: make(chan room.LogEntry, eventLogBuffer),
	}
}

// Log nunca bloquea: si el buffer está lleno, la fila se descarta.
func (w *EventLogWriter) Log(entry room.LogEntry) {
	select {
	case w.entries <- entry:
	default:
		log.Printf("event_log: buffer lleno, se descarta %+v", entry)
	}
}

// Run escribe las filas hasta que ctx termine.
func (w *EventLogWriter) Run(ctx context.Context) {
	for {
		select {
		case entry := <-w.entries:
			if err := w.insert(ctx, entry); err != nil {
				log.Printf("event_log: %v", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (w *EventLogWriter) insert(
	ctx context.Context,
	entry room.LogEntry,
) error {
	matchID, err := parseUUID(entry.MatchID, "match_id")
	if err != nil {
		return err
	}
	playerID, err := parseUUID(entry.PlayerID, "player_id")
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, eventLogTimeout)
	defer cancel()
	return w.queries.InsertEvent(ctx, InsertEventParams{
		MatchID:  matchID,
		Tick:     entry.Tick,
		PlayerID: playerID,
		Kind:     entry.Kind,
		TankSlot: entry.TankSlot,
	})
}
