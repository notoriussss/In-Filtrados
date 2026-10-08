package room

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

const (
	tickInterval = 50 * time.Millisecond // 20 Hz (docs/tasks.md 0.4)
	stepPerTick  = 10                    // 200 units per second
	playerRadius = 16
	actionBuffer = 256
)

// colors are the 8 fixed player colors, given in order of arrival.
var colors = []string{
	"#e6194b",
	"#3cb44b",
	"#ffe119",
	"#4363d8",
	"#f58231",
	"#911eb4",
	"#46f0f0",
	"#f032e6",
}

// Map holds the parts of shared/map.json that the room needs for now.
type Map struct {
	Width  float32 `json:"width"`
	Height float32 `json:"height"`
	Spawn  struct {
		X float32 `json:"x"`
		Y float32 `json:"y"`
	} `json:"spawn"`
}

func LoadMap(path string) (*Map, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read map: %w", err)
	}
	var m Map
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse map: %w", err)
	}
	return &m, nil
}

// Join registers a player; Out receives the snapshots for that player.
type Join struct {
	PlayerID string
	Out      chan *matchv1.Snapshot
}

// Leave says that the stream with channel Out ended.
type Leave struct {
	PlayerID string
	Out      chan *matchv1.Snapshot
}

// PlayerAction is the last direction a player sent.
type PlayerAction struct {
	PlayerID string
	DX, DY   int32
}

type player struct {
	view   *matchv1.PlayerView
	dx, dy int32
	out    chan *matchv1.Snapshot
}

func clampDir(v int32) int32 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}

func clamp(v, lo, hi float32) float32 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
