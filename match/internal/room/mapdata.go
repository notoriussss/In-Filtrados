package room

import (
	"encoding/json"
	"fmt"
	"os"
)

// spawnGap is the distance between two spawn points; more than the diameter
// of a player, so nobody appears on top of someone else.
const (
	spawnGap  = 40
	spawnCols = 5
	spawnRows = 2
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

// Map holds the parts of shared/map.json that the room needs for now.
type Map struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	Spawn  Point   `json:"spawn"`
	Walls  []Rect  `json:"walls"`
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

// SpawnPoint places players on a 5 x 2 grid centered on spawn, spawnGap
// apart. Slots past the 10 players of a room wrap around.
func (m *Map) SpawnPoint(slot int) (x, y float64) {
	slot %= spawnCols * spawnRows
	col := float64(slot % spawnCols)
	row := float64(slot / spawnCols)
	x = m.Spawn.X + (col-float64(spawnCols-1)/2)*spawnGap
	y = m.Spawn.Y + (row-float64(spawnRows-1)/2)*spawnGap
	return x, y
}
