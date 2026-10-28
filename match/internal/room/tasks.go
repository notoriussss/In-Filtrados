package room

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
	"math/big"
	"sort"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// pickRandomStations chooses count unique station IDs from the map using
// crypto/rand. If there are fewer stations than count, it returns all of them.
func pickRandomStations(all []Station, count int) ([]string, error) {
	n := len(all)
	if n == 0 {
		return nil, nil
	}
	if count > n {
		count = n
	}

	indices := make([]int, n)
	for i := 0; i < n; i++ {
		indices[i] = i
	}

	for i := 0; i < count; i++ {
		max := big.NewInt(int64(n - i))
		jBig, err := rand.Int(rand.Reader, max)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", msgPickStations, err)
		}
		j := int(jBig.Int64()) + i
		indices[i], indices[j] = indices[j], indices[i]
	}

	result := make([]string, count)
	for i := 0; i < count; i++ {
		result[i] = all[indices[i]].ID
	}
	return result, nil
}

// assignTasks randomly assigns exactly tasksPerPlayer tasks to each player
// using the stations defined in the map.
func (r *Room) assignTasks() error {
	for _, p := range r.players {
		stations, err := pickRandomStations(r.m.Stations, tasksPerPlayer)
		if err != nil {
			return err
		}
		p.assignedTasks = make(map[string]bool, len(stations))
		for _, id := range stations {
			p.assignedTasks[id] = true
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

// myTasks arma la lista de tareas del jugador para su snapshot:
// pendientes y hechas, ordenadas por estación para que no salten.
func myTasks(p *player) []*matchv1.MyTask {
	tasks := make(
		[]*matchv1.MyTask,
		0,
		len(p.assignedTasks)+len(p.completedTasks),
	)
	for id := range p.assignedTasks {
		tasks = append(tasks, &matchv1.MyTask{StationId: id})
	}
	for _, id := range p.completedTasks {
		tasks = append(tasks, &matchv1.MyTask{StationId: id, Done: true})
	}
	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].StationId < tasks[j].StationId
	})
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
