package room

import (
	"crypto/rand"
	"math/big"
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
	}
}
