package room

import "context"

// PlayerInfo es un jugador en el momento de empezar la partida.
type PlayerInfo struct {
	PlayerID    string
	DisplayName string
}

// MatchStore guarda el inicio y el fin de las partidas (PostgreSQL).
type MatchStore interface {
	StartMatch(
		ctx context.Context,
		matchID string,
		roomCode string,
		players []PlayerInfo,
	) error
	FinishMatch(ctx context.Context, matchID string, winner string) error
}
