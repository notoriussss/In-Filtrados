package db

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/notoriussss/in-filtrados/match/internal/room"
)

// snapshotTimeout es el límite de cada escritura (AGENTS.md, regla 7).
const snapshotTimeout = 2 * time.Second

type pendingSnapshot struct {
	tick  int64
	state []byte
}

// SnapshotWriter escribe las instantáneas de las salas en su propia
// goroutine (S3-02), para que una base lenta no frene el ticker. Solo
// importa la última de cada partida: si llegan dos antes de escribir, la
// vieja se descarta.
type SnapshotWriter struct {
	queries *Queries

	mu      sync.Mutex
	pending map[string]pendingSnapshot
	wake    chan struct{}
}

func NewSnapshotWriter(pool *pgxpool.Pool) *SnapshotWriter {
	return &SnapshotWriter{
		queries: New(pool),
		pending: make(map[string]pendingSnapshot),
		wake:    make(chan struct{}, 1),
	}
}

// Save nunca bloquea: deja la instantánea y despierta al escritor.
func (w *SnapshotWriter) Save(matchID string, tick int64, state []byte) {
	w.mu.Lock()
	w.pending[matchID] = pendingSnapshot{tick: tick, state: state}
	w.mu.Unlock()
	select {
	case w.wake <- struct{}{}:
	default: // ya hay un aviso pendiente
	}
}

// Run escribe hasta que ctx termine.
func (w *SnapshotWriter) Run(ctx context.Context) {
	for {
		select {
		case <-w.wake:
			w.flush(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (w *SnapshotWriter) flush(ctx context.Context) {
	w.mu.Lock()
	batch := w.pending
	w.pending = make(map[string]pendingSnapshot)
	w.mu.Unlock()

	for matchID, snap := range batch {
		if err := w.upsert(ctx, matchID, snap); err != nil {
			log.Printf("snapshots: %v", err)
		}
	}
}

func (w *SnapshotWriter) upsert(
	ctx context.Context,
	matchID string,
	snap pendingSnapshot,
) error {
	id, err := parseUUID(matchID, "match_id")
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, snapshotTimeout)
	defer cancel()
	err = w.queries.UpsertSnapshot(ctx, UpsertSnapshotParams{
		MatchID: id,
		Tick:    snap.tick,
		State:   snap.state,
	})
	if err != nil {
		return fmt.Errorf("guardando la partida %s: %w", matchID, err)
	}
	return nil
}

// UnfinishedSnapshots devuelve la última instantánea de cada partida
// empezada y sin terminar, para recrear sus salas al arrancar.
func (s *Store) UnfinishedSnapshots(
	ctx context.Context,
) ([]room.SavedSnapshot, error) {
	rows, err := s.queries.ListUnfinishedSnapshots(ctx)
	if err != nil {
		return nil, fmt.Errorf("store: leyendo instantáneas: %w", err)
	}
	saved := make([]room.SavedSnapshot, 0, len(rows))
	for _, row := range rows {
		saved = append(saved, room.SavedSnapshot{
			MatchID: uuid.UUID(row.MatchID.Bytes).String(),
			State:   row.State,
		})
	}
	return saved, nil
}
