package room

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
)

// spawnGap is the distance between two spawn points; more than the diameter
// of a player, so nobody appears on top of someone else.
const (
	spawnGap  = 40
	spawnCols = 5
	spawnRows = 2
	// maxSpawnRing limita la búsqueda de lugares libres alrededor del spawn.
	maxSpawnRing = 4
)

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Station is a 3R task location (reduce, reuse, recycle).
type Station struct {
	ID   string  `json:"id"`
	Type string  `json:"type"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	// Radius is how close the player must be; 0 means taskRadius.
	Radius float64 `json:"radius"`
}

// radius is the interaction range of the station.
func (s *Station) radius() float64 {
	if s.Radius > 0 {
		return s.Radius
	}
	return taskRadius
}

// FixPoint is where an emergency is fixed (S3-05): the two ends of the
// main pipe or the steam valve of the treatment plant.
type FixPoint struct {
	ID   string  `json:"id"`
	Kind string  `json:"kind"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

// TankSpot is where a garden tank stands (docs/tasks.md 0.3).
type TankSpot struct {
	Slot int32   `json:"slot"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

// Map holds the parts of shared/map.json that the room needs for now.
type Map struct {
	Width    float64    `json:"width"`
	Height   float64    `json:"height"`
	Spawn    Point      `json:"spawn"`
	Walls    []Rect     `json:"walls"`
	Stations []Station  `json:"stations"`
	Tanks    []TankSpot `json:"tanks"`
	// S3-05: puntos donde se arreglan las emergencias.
	FixPoints []FixPoint `json:"fixPoints"`

	spawnOnce sync.Once
	spawns    []Point
}

// LoadMap reads and checks the map. The service must not start without it.
func LoadMap(path string) (*Map, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", msgReadMap, err)
	}
	var m Map
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("%s: %w", msgParseMap, err)
	}
	if err := m.validate(); err != nil {
		return nil, err
	}
	return &m, nil
}

func (m *Map) validate() error {
	if m.Width <= 0 || m.Height <= 0 {
		return errMapSize
	}
	for _, w := range m.Walls {
		if w.W <= 0 || w.H <= 0 {
			return errWallSize
		}
	}
	if m.blocked(m.Spawn.X, m.Spawn.Y) {
		return errSpawn
	}
	return nil
}

// SpawnPoint places players on free points of a grid centered on spawn,
// spawnGap apart, nearest first (the mesa del mirador and its chairs
// block some of them). Slots past the 10 players of a room wrap around.
func (m *Map) SpawnPoint(slot int) (x, y float64) {
	m.spawnOnce.Do(m.buildSpawns)
	p := m.spawns[slot%len(m.spawns)]
	return p.X, p.Y
}

// buildSpawns busca los spawnCols × spawnRows puntos libres más cercanos
// al spawn, en anillos de la cuadrícula de spawnGap.
func (m *Map) buildSpawns() {
	want := spawnCols * spawnRows
	for ring := 0; ring <= maxSpawnRing && len(m.spawns) < want; ring++ {
		for dy := -ring; dy <= ring; dy++ {
			for dx := -ring; dx <= ring; dx++ {
				if max(abs(dx), abs(dy)) != ring || len(m.spawns) == want {
					continue
				}
				x := m.Spawn.X + float64(dx)*spawnGap
				y := m.Spawn.Y + float64(dy)*spawnGap
				if !m.blocked(x, y) {
					m.spawns = append(m.spawns, Point{X: x, Y: y})
				}
			}
		}
	}
	if len(m.spawns) == 0 {
		m.spawns = []Point{m.Spawn}
	}
}

func abs(v int) int {
	if v < 0 {
		return -v
	}
	return v
}
