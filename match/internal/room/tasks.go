package room

import (
	"context"
	"log"
	"sort"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// assignTasks reparte r.tasksPerPlayer tareas a cada jugador (cuidador o
// impostor) con planTasks: listas distintas, en orden propio y parejas
// entre las estaciones del mapa. Solo corre al empezar la partida; el
// reparto queda en el estado de cada jugador y no se vuelve a sortear.
func (r *Room) assignTasks() error {
	ids := make([]string, 0, len(r.players))
	for id := range r.players {
		ids = append(ids, id)
	}
	plans, err := planTasks(r.m.Stations, ids, r.tasksPerPlayer, r.rnd)
	if err != nil {
		return err
	}
	for id, p := range r.players {
		p.taskOrder = plans[id]
		p.assignedTasks = make(map[string]bool, len(p.taskOrder))
		for _, station := range p.taskOrder {
			p.assignedTasks[station] = true
		}
		p.tasksCompleted = 0
		p.completedTasks = nil
		p.taskStartTick = 0
		p.taskStation = ""
	}
	return nil
}

func (r *Room) startTask(playerID string, p *player, stationID string) {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	if !p.assignedTasks[stationID] {
		return
	}
	s := r.stationAt(stationID)
	if s == nil || !nearStation(p, s) {
		return
	}
	// Empezar a contar el tiempo.
	p.taskStartTick = r.tick
	p.taskStation = stationID
}

func (r *Room) completeTask(playerID string, p *player, stationID string) {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	if !p.assignedTasks[stationID] {
		return
	}
	if p.taskStation == "" || p.taskStation != stationID {
		return
	}
	// Validar tiempo: deben pasar al menos taskMinTicks (3 s / 60 ticks)
	if r.tick-p.taskStartTick < taskMinTicks {
		return
	}
	s := r.stationAt(stationID)
	if s == nil || !nearStation(p, s) {
		p.taskStartTick = 0
		p.taskStation = ""
		return
	}

	// Completado con éxito
	delete(p.assignedTasks, stationID)
	p.completedTasks = append(p.completedTasks, stationID)
	p.tasksCompleted++
	p.taskStartTick = 0
	p.taskStation = ""

	if p.role == matchv1.Role_IMPOSTOR {
		// El impostor finge la tarea, no suma al embalse ni publica evento.
		return
	}

	points := taskPoints[s.Type]
	if points > 0 {
		p.litersSaved += int(points * litersPerPoint)
		r.updateReservoir()

		if r.publisher != nil {
			pub := r.publisher
			code := r.Code
			event := events.NewTaskCompleted(
				r.MatchID,
				playerID,
				s.Type,
				points*litersPerPoint,
			)
			go func() {
				ctx, cancel := context.WithTimeout(
					context.Background(),
					depsTimeout,
				)
				defer cancel()
				err := pub.Publish(
					ctx,
					events.RoutingKeyTaskCompleted,
					event,
				)
				if err != nil {
					log.Printf(
						"room %s: no se pudo publicar task.completed: %v",
						code,
						err,
					)
				}
			}()
		}
	}
}

// updateReservoir llena el embalse según el avance de la tripulación:
// los puntos de las tareas hechas (reduce 3, reuse 4, recycle 5) sobre
// los de todas sus tareas. Así se llena justo cuando la tripulación
// termina todo, con 4 jugadores o con 10. No cuentan las tareas de
// quien se fue de la partida (desconectado y fantasma) y nunca baja.
func (r *Room) updateReservoir() {
	var done, total int32
	for _, p := range r.players {
		if p.role != matchv1.Role_CREW ||
			(!p.view.Connected && !p.view.Alive) {
			continue
		}
		for id := range p.assignedTasks {
			total += r.stationPoints(id)
		}
		for _, id := range p.completedTasks {
			pts := r.stationPoints(id)
			done += pts
			total += pts
		}
	}
	if total == 0 {
		return
	}
	level := min(reservoirMax*done/total, reservoirMax)
	r.reservoir = max(r.reservoir, level)
}

func (r *Room) stationPoints(id string) int32 {
	if s := r.stationAt(id); s != nil {
		return taskPoints[s.Type]
	}
	return 0
}

// cancelFarTasks cancela la tarea en curso de quien se alejó de su
// estación, para que el navegador cierre el minijuego (S2-11).
func (r *Room) cancelFarTasks() {
	for _, p := range r.players {
		if p.taskStation == "" {
			continue
		}
		s := r.stationAt(p.taskStation)
		if s == nil || !nearStation(p, s) {
			p.taskStartTick = 0
			p.taskStation = ""
		}
	}
}

// myTasks arma la lista de tareas del jugador para su snapshot, en el
// orden en que se le asignaron (las hechas se quedan en su lugar). Sin
// orden guardado (instantáneas viejas), por estación.
func myTasks(p *player) []*matchv1.MyTask {
	done := make(map[string]bool, len(p.completedTasks))
	for _, id := range p.completedTasks {
		done[id] = true
	}
	ids := p.taskOrder
	if len(ids) != len(p.assignedTasks)+len(p.completedTasks) {
		ids = ids[:0:0]
		for id := range p.assignedTasks {
			ids = append(ids, id)
		}
		ids = append(ids, p.completedTasks...)
		sort.Strings(ids)
	}
	tasks := make([]*matchv1.MyTask, 0, len(ids))
	for _, id := range ids {
		tasks = append(
			tasks,
			&matchv1.MyTask{StationId: id, Done: done[id]},
		)
	}
	return tasks
}

func (r *Room) stationAt(id string) *Station {
	for i := range r.m.Stations {
		if r.m.Stations[i].ID == id {
			return &r.m.Stations[i]
		}
	}
	return nil
}

func nearStation(p *player, s *Station) bool {
	dx := float64(p.view.X) - s.X
	dy := float64(p.view.Y) - s.Y
	r := s.radius()
	return dx*dx+dy*dy <= r*r
}
