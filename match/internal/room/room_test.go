package room

import (
	"context"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

func TestTwoPlayersSeeEachOtherMove(t *testing.T) {
	m := &Map{Width: 1600, Height: 1200}
	m.Spawn.X, m.Spawn.Y = 800, 500
	r := New("DEV", m)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go r.Run(ctx)

	a := make(chan *matchv1.Snapshot, 64)
	b := make(chan *matchv1.Snapshot, 64)
	r.Join(Join{PlayerID: "a", Out: a})
	r.Join(Join{PlayerID: "b", Out: b})
	r.Act(Action{PlayerID: "a", DX: 1})

	time.Sleep(300 * time.Millisecond)

	var last *matchv1.Snapshot
	for len(b) > 0 {
		last = <-b
	}
	if last == nil || len(last.Players) != 2 {
		t.Fatalf("b should see 2 players, got %v", last)
	}
	for _, p := range last.Players {
		switch p.Id {
		case "a":
			if p.X <= 800 || p.Y != 500 {
				t.Errorf("a should have moved right, got (%v, %v)", p.X, p.Y)
			}
		case "b":
			if p.X != 800 || p.Y != 500 {
				t.Errorf("b should not move, got (%v, %v)", p.X, p.Y)
			}
		}
	}
}
