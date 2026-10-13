package db

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/notoriussss/in-filtrados/match/internal/room"
)

// Store guarda partidas y participantes en PostgreSQL #1.
type Store struct {
	pool    *pgxpool.Pool
	queries *Queries
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool, queries: New(pool)}
}

// StartMatch inserta la partida y sus participantes en una transacción.
func (s *Store) StartMatch(
	ctx context.Context,
	matchID string,
	roomCode string,
	players []room.PlayerInfo,
) error {
	id, err := parseUUID(matchID, "match_id")
	if err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("store: abriendo transacción: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	queries := s.queries.WithTx(tx)
	err = queries.CreateMatch(ctx, CreateMatchParams{
		ID:       id,
		RoomCode: roomCode,
	})
	if err != nil {
		return fmt.Errorf("store: insertando partida: %w", err)
	}

	for _, player := range players {
		playerID, err := uuid.Parse(player.PlayerID)
		if err != nil {
			log.Printf(
				"store: player_id inválido %q, se ignora",
				player.PlayerID,
			)
			continue
		}
		err = queries.CreateParticipant(ctx, CreateParticipantParams{
			MatchID:     id,
			PlayerID:    toPgUUID(playerID),
			DisplayName: player.DisplayName,
			Role:        player.Role,
		})
		if err != nil {
			return fmt.Errorf("store: insertando participante: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("store: confirmando transacción: %w", err)
	}
	return nil
}

// FinishMatch marca el final, el ganador y actualiza participants (S2-06).
func (s *Store) FinishMatch(
	ctx context.Context,
	matchID string,
	winner string,
	participants []room.ParticipantResult,
) error {
	id, err := parseUUID(matchID, "match_id")
	if err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("store: abriendo transacción de fin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	queries := s.queries.WithTx(tx)
	err = queries.FinishMatch(ctx, FinishMatchParams{
		ID:     id,
		Winner: pgtype.Text{String: winner, Valid: true},
	})
	if err != nil {
		return fmt.Errorf("store: terminando partida: %w", err)
	}

	for _, p := range participants {
		playerID, err := uuid.Parse(p.PlayerID)
		if err != nil {
			log.Printf(
				"store: player_id inválido %q en fin, se ignora",
				p.PlayerID,
			)
			continue
		}
		err = queries.UpdateParticipantEjected(
			ctx,
			UpdateParticipantEjectedParams{
				MatchID:  id,
				PlayerID: toPgUUID(playerID),
				Ejected:  p.Ejected,
			},
		)
		if err != nil {
			return fmt.Errorf(
				"store: actualizando participante %s: %w",
				p.PlayerID,
				err,
			)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("store: confirmando fin de partida: %w", err)
	}
	return nil
}

func parseUUID(raw, field string) (pgtype.UUID, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return pgtype.UUID{}, fmt.Errorf(
			"store: %s inválido %q: %w",
			field,
			raw,
			err,
		)
	}
	return toPgUUID(id), nil
}

func toPgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}
