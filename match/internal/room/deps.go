package room

import "context"

// PlayerInfo es un jugador en el momento de empezar la partida.
type PlayerInfo struct {
	PlayerID    string
	DisplayName string
	Role        string // events.RoleCrew o events.RoleImpostor
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

// SnapshotSaver guarda la instantánea de una sala (S3-02). Save no debe
// bloquear: la llama la goroutine de la sala en medio de su tick.
type SnapshotSaver interface {
	Save(matchID string, tick int64, state []byte)
}

// SavedSnapshot es una instantánea leída de la base al arrancar.
type SavedSnapshot struct {
	MatchID string
	State   []byte
}

// Tipos de fila de event_log (S2-03).
const (
	LogContaminate = "contaminate"
	LogClean       = "clean"
	LogVisit       = "visit"
)

// LogEntry es una fila de event_log: quién hizo qué con qué tanque.
type LogEntry struct {
	MatchID  string
	Tick     int64
	PlayerID string
	Kind     string
	TankSlot int32
}

// EventLog anota contaminaciones, limpiezas y visitas. Log no debe
// bloquear, porque lo llama la goroutine de la sala.
type EventLog interface {
	Log(entry LogEntry)
}
