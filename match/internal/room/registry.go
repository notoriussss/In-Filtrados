package room

import "sync"

// Registry finds rooms by code. It is the only type in this package with a
// mutex, because the gRPC goroutines share it; the rooms themselves do not.
type Registry struct {
	mu    sync.Mutex
	rooms map[string]*Room
}

func NewRegistry() *Registry {
	return &Registry{rooms: make(map[string]*Room)}
}

func (g *Registry) Add(r *Room) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.rooms[r.Code] = r
}

func (g *Registry) Get(code string) (*Room, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	r, ok := g.rooms[code]
	return r, ok
}

func (g *Registry) GetByMatchID(matchID string) (*Room, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	for _, r := range g.rooms {
		if r.MatchID == matchID {
			return r, true
		}
	}
	return nil, false
}

func (g *Registry) Remove(code string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.rooms, code)
}

// AddIfFree agrega la sala solo si su código no está ocupado.
func (g *Registry) AddIfFree(r *Room) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	if _, taken := g.rooms[r.Code]; taken {
		return false
	}
	g.rooms[r.Code] = r
	return true
}
