package room

import (
	"context"
	"crypto/rand"
	"log"
	"math/big"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// pickRandomStations chooses exactly count unique station IDs from the map.
// If there are fewer stations than count, it returns all of them.
func pickRandomStations(all []Station, count int) []string {
	n := len(all)
	if n == 0 {
		return nil
	}
	if count > n {
		count = n
	}

	// Create a copy of indices to shuffle
	indices := make([]int, n)
	for i := 0; i < n; i++ {
		indices[i] = i
	}

	// Fisher-Yates shuffle for 'count' elements using crypto/rand
	for i := 0; i < count; i++ {
		max := big.NewInt(int64(n - i))
		jBig, _ := rand.Int(rand.Reader, max)
		j := int(jBig.Int64()) + i
		indices[i], indices[j] = indices[j], indices[i]
	}

	result := make([]string, count)
	for i := 0; i < count; i++ {
		result[i] = all[indices[i]].ID
	}
	return result
}

// assignTasks randomly assigns exactly tasksPerPlayer tasks to each player
// using the stations defined in the map.
func (r *Room) assignTasks() {
	for _, p := range r.players {
		stations := pickRandomStations(r.m.Stations, tasksPerPlayer)
		p.assignedTasks = make(map[string]bool)
		for _, id := range stations {
			p.assignedTasks[id] = true
		}
		p.tasksCompleted = 0
		p.taskStartTick = 0
		p.currentTaskStation = ""
	}
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
	p.currentTaskStation = stationID
}

func (r *Room) completeTask(playerID string, p *player, stationID string) {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	if !p.assignedTasks[stationID] {
		return
	}
	if p.currentTaskStation != stationID {
		return
	}
	// Validar tiempo: deben pasar al menos taskMinTicks (3s)
	if p.taskStartTick == 0 || r.tick-p.taskStartTick < taskMinTicks {
		return
	}
	s := r.stationAt(stationID)
	if s == nil || !nearStation(p, s) {
		p.taskStartTick = 0
		p.currentTaskStation = ""
		return
	}

	// Completado con éxito
	delete(p.assignedTasks, stationID)
	p.tasksCompleted++
	p.taskStartTick = 0
	p.currentTaskStation = ""

	if p.role == matchv1.Role_IMPOSTOR {
		// El impostor finge la tarea, no suma al embalse ni publica evento.
		return
	}

	points := int32(0)
	switch s.Type {
	case "reduce":
		points = 3
	case "reuse":
		points = 4
	case "recycle":
		points = 5
	}

	if points > 0 {
		r.reservoir = min(r.reservoir+points, reservoirMax)

		if r.publisher != nil {
			ctx, cancel := context.WithTimeout(context.Background(), depsTimeout)
			defer cancel()
			event := events.NewTaskCompleted(r.MatchID, playerID, s.Type, points*100)
			if err := r.publisher.Publish(ctx, events.RoutingKeyTaskCompleted, event); err != nil {
				log.Printf("room %s: no se pudo publicar task.completed: %v", r.Code, err)
			}
		}
	}
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
	return dx*dx+dy*dy <= taskRadius*taskRadius
}

