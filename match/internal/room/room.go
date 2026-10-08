// Package room runs one match room in a single goroutine (docs/architecture.md).
// S1-07 only needs the fixed room DEV; S1-08 grows this file into the real room.
package room

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"google.golang.org/protobuf/proto"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

const (
	tickInterval = 50 * time.Millisecond // 20 Hz (docs/tasks.md 0.4)
	stepPerTick  = 10                    // 200 units per second
	playerRadius = 16
)

var colors = []string{"#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6"}

// Map holds the parts of shared/map.json that S1-07 needs.
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

// Action is the last direction a player sent.
type Action struct {
	PlayerID string
	DX, DY   int32
}

type player struct {
	view   *matchv1.PlayerView
	dx, dy int32
	out    chan *matchv1.Snapshot
}

// Room has no mutex: only the goroutine running Run touches players and tick.
type Room struct {
	Code    string
	m       *Map
	players map[string]*player
	order   int
	tick    int64

	joins   chan Join
	leaves  chan Leave
	actions chan Action
}

func New(code string, m *Map) *Room {
	return &Room{
		Code:    code,
		m:       m,
		players: make(map[string]*player),
		joins:   make(chan Join),
		leaves:  make(chan Leave),
		actions: make(chan Action, 256),
	}
}

// These three methods are called from the gRPC goroutines; they only send to channels.
func (r *Room) Join(j Join)   { r.joins <- j }
func (r *Room) Leave(l Leave) { r.leaves <- l }
func (r *Room) Act(a Action)  { r.actions <- a }

func (r *Room) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		select {
		case j := <-r.joins:
			r.addPlayer(j)
		case l := <-r.leaves:
			// Only the stream that is still registered can disconnect the player.
			if p, ok := r.players[l.PlayerID]; ok && p.out == l.Out {
				p.view.Connected = false
				p.dx, p.dy = 0, 0
				p.out = nil
			}
		case a := <-r.actions:
			if p, ok := r.players[a.PlayerID]; ok {
				p.dx, p.dy = clampDir(a.DX), clampDir(a.DY)
			}
		case <-ticker.C:
			r.step()
			r.tick++
			r.broadcast()
		case <-ctx.Done():
			return
		}
	}
}

func (r *Room) addPlayer(j Join) {
	if p, ok := r.players[j.PlayerID]; ok { // same player coming back
		p.view.Connected = true
		p.out = j.Out
		return
	}
	r.players[j.PlayerID] = &player{
		view: &matchv1.PlayerView{
			Id:        j.PlayerID,
			Name:      j.PlayerID,
			Color:     colors[r.order%len(colors)],
			X:         r.m.Spawn.X,
			Y:         r.m.Spawn.Y,
			Connected: true,
			Alive:     true,
		},
		out: j.Out,
	}
	r.order++
}

// step moves every player by its direction. Walls come in S1-10; for now it only keeps them on the map.
func (r *Room) step() {
	for _, p := range r.players {
		p.view.X = clamp(p.view.X+float32(p.dx*stepPerTick), playerRadius, r.m.Width-playerRadius)
		p.view.Y = clamp(p.view.Y+float32(p.dy*stepPerTick), playerRadius, r.m.Height-playerRadius)
	}
}

// broadcast never blocks: if a player's channel is full, that snapshot is dropped for them.
func (r *Room) broadcast() {
	views := make([]*matchv1.PlayerView, 0, len(r.players))
	for _, p := range r.players {
		views = append(views, proto.Clone(p.view).(*matchv1.PlayerView))
	}
	snap := &matchv1.Snapshot{Tick: r.tick, Phase: matchv1.Phase_LOBBY, Players: views}
	for _, p := range r.players {
		if p.out == nil {
			continue
		}
		select {
		case p.out <- snap:
		default:
		}
	}
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
