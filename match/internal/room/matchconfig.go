package room

import (
	"fmt"
	"log"
	"time"

	matchv1 "github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// Cuántos minutos puede durar la partida; el creador lo elige en LOBBY.
const (
	minMatchMinutes = 4
	maxMatchMinutes = 12
)

// validMatchMinutes dice si n está entre el mínimo y el máximo de minutos.
func validMatchMinutes(n int) bool {
	return n >= minMatchMinutes && n <= maxMatchMinutes
}

// impostorsNow son los infiltrados que tendría la partida si empezara
// ahora: lo que eligió el creador (o la regla de siempre si no eligió),
// recortado al tope de los jugadores que hay.
func (r *Room) impostorsNow() int {
	players := len(r.players)
	count := r.impostors
	if count < 1 {
		count = impostorCount(players)
	}
	return min(count, maxImpostors(players))
}

// canConfigure dice si playerID puede cambiar la configuración: solo el
// creador y solo en LOBBY.
func (r *Room) canConfigure(playerID, action string) bool {
	if r.phase != matchv1.Phase_LOBBY {
		return false
	}
	if r.creatorID != "" && playerID != r.creatorID {
		log.Printf(
			"room %s: %s no es el creador; %s ignorado",
			r.Code,
			playerID,
			action,
		)
		return false
	}
	return true
}

// setImpostorCount fija cuántos infiltrados hay. Un valor fuera de
// 1 a maxImpostors no cambia nada y le responde un error a quien lo mandó.
func (r *Room) setImpostorCount(playerID string, p *player, count int32) {
	if !r.canConfigure(playerID, "set_impostor_count") {
		return
	}
	limit := maxImpostors(len(r.players))
	if count < 1 || int(count) > limit {
		r.sendError(
			p,
			ErrCodeInvalidImpostorCount,
			fmt.Sprintf(errMsgInvalidImpostorCount, 1, limit),
		)
		return
	}
	r.impostors = int(count)
}

// setMatchMinutes fija cuánto dura la partida. Un valor fuera de rango
// no cambia nada y le responde un error a quien lo mandó.
func (r *Room) setMatchMinutes(playerID string, p *player, minutes int32) {
	if !r.canConfigure(playerID, "set_match_duration") {
		return
	}
	if !validMatchMinutes(int(minutes)) {
		r.sendError(
			p,
			ErrCodeInvalidMatchDuration,
			fmt.Sprintf(
				errMsgInvalidMatchDuration,
				minMatchMinutes,
				maxMatchMinutes,
			),
		)
		return
	}
	r.matchDuration = time.Duration(minutes) * time.Minute
}
