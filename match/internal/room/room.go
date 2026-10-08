// Package room runs one match room in a single goroutine (docs/architecture.md).
package room

import (
	"context"
	"time"

	"google.golang.org/protobuf/proto"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// Room has no mutex: only the goroutine running Run touches its state.
type Room struct {
	Code    string
	MatchID string

	m       *Map
	players map[string]*player
	order   int
	phase   matchv1.Phase
	tick    int64

	joins   chan Join
	leaves  chan Leave
	actions chan PlayerAction
}

func NewRoom(code string, matchID string, m *Map) *Room {
	return &Room{
		Code:    code,
		MatchID: matchID,
		m:       m,
		players: make(map[string]*player),
		phase:   matchv1.Phase_LOBBY,
		joins:   make(chan Join),
		leaves:  make(chan Leave),
		actions: make(chan PlayerAction, actionBuffer),
	}
}

// These three methods are called from other goroutines; they only send to channels.
func (r *Room) Join(j Join)        { r.joins <- j }
func (r *Room) Leave(l Leave)      { r.leaves <- l }
func (r *Room) Act(a PlayerAction) { r.actions <- a }

func (r *Room) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		select {
		case j := <-r.joins:
			r.addPlayer(j)
		case l := <-r.leaves:
			r.removePlayer(l)
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

// removePlayer marks the player as disconnected. Only the stream that is
// still registered can do it, so a stale stream cannot kick a reconnected one.
func (r *Room) removePlayer(l Leave) {
	p, ok := r.players[l.PlayerID]
	if !ok || p.out != l.Out {
		return
	}
	p.view.Connected = false
	p.dx, p.dy = 0, 0
	p.out = nil
}

// step moves every player by its direction. Walls come in S1-10; for now it
// only keeps them on the map.
func (r *Room) step() {
	for _, p := range r.players {
		p.view.X = clamp(
			p.view.X+float32(p.dx*stepPerTick),
			playerRadius,
			r.m.Width-playerRadius,
		)
		p.view.Y = clamp(
			p.view.Y+float32(p.dy*stepPerTick),
			playerRadius,
			r.m.Height-playerRadius,
		)
	}
}

// broadcast never blocks: if a player's channel is full, that snapshot is
// dropped for them and the next one brings them up to date.
func (r *Room) broadcast() {
	views := make([]*matchv1.PlayerView, 0, len(r.players))
	for _, p := range r.players {
		views = append(views, proto.Clone(p.view).(*matchv1.PlayerView))
	}
	snap := &matchv1.Snapshot{
		Tick:    r.tick,
		Phase:   r.phase,
		Players: views,
	}
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
