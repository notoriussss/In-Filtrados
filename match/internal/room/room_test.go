package room

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

func testMap() *Map {
	m := &Map{Width: 1600, Height: 1200}
	m.Spawn.X, m.Spawn.Y = 800, 500
	return m
}

func startRoom(t *testing.T) *Room {
	t.Helper()
	r := NewRoom("TEST", "match-1", testMap())
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go r.Run(ctx)
	return r
}

// drain returns the last snapshot in ch, or nil if it is empty.
func drain(ch chan *matchv1.Snapshot) *matchv1.Snapshot {
	var last *matchv1.Snapshot
	for len(ch) > 0 {
		last = <-ch
	}
	return last
}

// waitPlayers waits for a snapshot in ch that has n players.
func waitPlayers(
	t *testing.T,
	ch chan *matchv1.Snapshot,
	n int,
) *matchv1.Snapshot {
	t.Helper()
	timeout := time.After(time.Second)
	for {
		select {
		case snap := <-ch:
			if len(snap.Players) == n {
				return snap
			}
		case <-timeout:
			t.Fatalf("no snapshot with %d players", n)
		}
	}
}

func findPlayer(snap *matchv1.Snapshot, id string) *matchv1.PlayerView {
	for _, p := range snap.Players {
		if p.Id == id {
			return p
		}
	}
	return nil
}

func TestTwoPlayersSeeEachOtherMove(t *testing.T) {
	r := startRoom(t)

	a := make(chan *matchv1.Snapshot, 64)
	b := make(chan *matchv1.Snapshot, 64)
	r.Join(Join{PlayerID: "a", Out: a})
	r.Join(Join{PlayerID: "b", Out: b})
	r.Act(PlayerAction{PlayerID: "a", DX: 1})

	time.Sleep(300 * time.Millisecond)

	last := drain(b)
	if last == nil || len(last.Players) != 2 {
		t.Fatalf("b should see 2 players, got %v", last)
	}
	pa, pb := findPlayer(last, "a"), findPlayer(last, "b")
	if pa.X <= 800 || pa.Y != 500 {
		t.Errorf("a should have moved right, got (%v, %v)", pa.X, pa.Y)
	}
	if pb.X != 800 || pb.Y != 500 {
		t.Errorf("b should not move, got (%v, %v)", pb.X, pb.Y)
	}
}

// S1-08 verification: 3 players moving from 3 goroutines for 1 second.
func TestThreePlayersConcurrentMoves(t *testing.T) {
	r := startRoom(t)

	type mover struct {
		id     string
		dx, dy int32
		out    chan *matchv1.Snapshot
	}
	movers := []*mover{
		{id: "a", dx: 1, dy: 0},
		{id: "b", dx: -1, dy: 0},
		{id: "c", dx: 0, dy: 1},
	}
	for _, mv := range movers {
		// 64 is more than the ~20 snapshots of one second: nothing is dropped.
		mv.out = make(chan *matchv1.Snapshot, 64)
		r.Join(Join{PlayerID: mv.id, Out: mv.out})
	}

	start := waitPlayers(t, movers[0].out, len(movers))
	for _, mv := range movers[1:] {
		drain(mv.out)
	}

	var wg sync.WaitGroup
	deadline := time.Now().Add(time.Second)
	for _, mv := range movers {
		wg.Add(1)
		go func(mv *mover) {
			defer wg.Done()
			for time.Now().Before(deadline) {
				r.Act(PlayerAction{
					PlayerID: mv.id,
					DX:       mv.dx,
					DY:       mv.dy,
				})
				time.Sleep(5 * time.Millisecond)
			}
		}(mv)
	}
	wg.Wait()

	for _, mv := range movers {
		last := drain(mv.out)
		if last == nil {
			t.Fatalf("%s got no snapshots", mv.id)
		}
		ticks := last.Tick - start.Tick
		if ticks < 18 || ticks > 22 {
			t.Errorf("%s: want 18-22 ticks, got %d", mv.id, ticks)
		}

		before := findPlayer(start, mv.id)
		after := findPlayer(last, mv.id)
		moved := (after.X-before.X)*float32(mv.dx) +
			(after.Y-before.Y)*float32(mv.dy)
		if moved < 180 || moved > 220 {
			t.Errorf("%s: want 200±20 units, got %v", mv.id, moved)
		}
		sideways := (after.X-before.X)*float32(mv.dy) +
			(after.Y-before.Y)*float32(mv.dx)
		if sideways != 0 {
			t.Errorf("%s: moved %v sideways", mv.id, sideways)
		}
	}
}

func TestColorsByArrivalOrder(t *testing.T) {
	r := startRoom(t)

	n := len(colors) + 1
	out := make(chan *matchv1.Snapshot, 64)
	for i := 0; i < n; i++ {
		r.Join(Join{PlayerID: fmt.Sprintf("p%d", i), Out: out})
	}

	snap := waitPlayers(t, out, n)
	for i := 0; i < n; i++ {
		p := findPlayer(snap, fmt.Sprintf("p%d", i))
		if want := colors[i%len(colors)]; p.Color != want {
			t.Errorf("p%d: want color %s, got %s", i, want, p.Color)
		}
	}
}

func TestLeaveMarksDisconnected(t *testing.T) {
	r := startRoom(t)

	a := make(chan *matchv1.Snapshot, 64)
	b := make(chan *matchv1.Snapshot, 64)
	r.Join(Join{PlayerID: "a", Out: a})
	r.Join(Join{PlayerID: "b", Out: b})
	r.Leave(Leave{PlayerID: "b", Out: b})

	time.Sleep(100 * time.Millisecond)
	drain(b)
	drain(a)
	time.Sleep(100 * time.Millisecond)

	if len(b) != 0 {
		t.Errorf("b left but still gets snapshots")
	}
	last := drain(a)
	if last == nil || findPlayer(last, "b").Connected {
		t.Errorf("b should be disconnected, got %v", last)
	}
}

func TestRegistry(t *testing.T) {
	g := NewRegistry()
	m := testMap()

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			code := fmt.Sprintf("R%d", i)
			g.Add(NewRoom(code, code, m))
			if _, ok := g.Get(code); !ok {
				t.Errorf("room %s not found", code)
			}
			g.Remove(code)
		}(i)
	}
	wg.Wait()

	if _, ok := g.Get("R0"); ok {
		t.Errorf("R0 should have been removed")
	}
}
