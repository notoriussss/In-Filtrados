package room

import (
	"fmt"
	"log"

	matchv1 "github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// validTaskCount dice si n está entre el mínimo y el máximo de tareas.
func validTaskCount(n int) bool {
	return n >= minTasksPerPlayer && n <= maxTasksPerPlayer
}

// setTaskCount fija cuántas tareas hace cada jugador. Solo el creador y
// solo en LOBBY; un valor fuera de rango no cambia nada y le responde un
// error a quien lo mandó.
func (r *Room) setTaskCount(playerID string, p *player, count int32) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	if r.creatorID != "" && playerID != r.creatorID {
		log.Printf(
			"room %s: %s no es el creador; set_task_count ignorado",
			r.Code,
			playerID,
		)
		return
	}
	if !validTaskCount(int(count)) {
		r.sendError(
			p,
			ErrCodeInvalidTaskCount,
			fmt.Sprintf(
				errMsgInvalidTaskCount,
				minTasksPerPlayer,
				maxTasksPerPlayer,
			),
		)
		return
	}
	r.tasksPerPlayer = int(count)
}

// sendError deja un Error en el canal del jugador sin bloquear.
func (r *Room) sendError(p *player, code, message string) {
	ev := &matchv1.ServerEvent{
		Event: &matchv1.ServerEvent_Error{
			Error: &matchv1.Error{Code: code, Message: message},
		},
	}
	select {
	case p.out <- ev:
	default:
	}
}
