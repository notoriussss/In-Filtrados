package room

import (
	"time"

	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// defaultMatchDuration es la duración máxima de la partida: 8 minutos (S2-06).
const defaultMatchDuration = 8 * time.Minute

// defaultCleanupDelay es el tiempo para liberar la sala de memoria (S2-06).
const defaultCleanupDelay = 30 * time.Second

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

// WithCleanupDelay configura la espera para liberar la sala; los tests la usan.
func WithCleanupDelay(duration time.Duration) Option {
	return func(r *Room) {
		if duration > 0 {
			r.cleanupDelay = duration
		}
	}
}

// WithOnCleanup registra la función que libera la sala del registro.
func WithOnCleanup(fn func(code string)) Option {
	return func(r *Room) { r.onCleanup = fn }
}

// WithEventLog anota en event_log lo que pasa con los tanques (S2-03).
func WithEventLog(eventLog EventLog) Option {
	return func(r *Room) { r.eventLog = eventLog }
}
