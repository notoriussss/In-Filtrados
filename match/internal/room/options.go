package room

import (
	"time"

	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// defaultMatchDuration es la regla temporal de la semana 1: 3 minutos.
const defaultMatchDuration = 3 * time.Minute

// Option configura una Room al crearla.
type Option func(*Room)

// WithCreator registra quién es el único que puede mandar Start.
func WithCreator(playerID string) Option {
	return func(r *Room) { r.creatorID = playerID }
}

// WithPublisher publica match.started y match.finished.
func WithPublisher(publisher events.Publisher) Option {
	return func(r *Room) { r.publisher = publisher }
}

// WithStore guarda la partida al empezar y al terminar.
func WithStore(store MatchStore) Option {
	return func(r *Room) { r.store = store }
}

// WithMatchDuration acorta la partida; los tests la usan.
func WithMatchDuration(duration time.Duration) Option {
	return func(r *Room) {
		if duration > 0 {
			r.matchDuration = duration
		}
	}
}

// WithGracePeriod fija cuánto se guarda el lugar de un jugador que se
// desconecta en plena partida (S3-01, RECONNECT_GRACE_SECONDS).
func WithGracePeriod(grace time.Duration) Option {
	return func(r *Room) {
		if grace > 0 {
			r.grace = grace
		}
	}
}

// WithSnapshots guarda la sala cada 2 s y en cada cambio de fase (S3-02).
func WithSnapshots(saver SnapshotSaver) Option {
	return func(r *Room) { r.snapshots = saver }
}

// WithClock cambia el reloj de la sala; los tests lo adelantan a mano.
func WithClock(now func() time.Time) Option {
	return func(r *Room) { r.now = now }
}

// WithEventLog anota en event_log lo que pasa con los tanques (S2-03).
func WithEventLog(eventLog EventLog) Option {
	return func(r *Room) { r.eventLog = eventLog }
}
