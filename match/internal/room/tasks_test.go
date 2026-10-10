package room

import (
	"context"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

type mockPublisher struct {
	events []any
}

func (m *mockPublisher) Publish(ctx context.Context, key string, payload any) error {
	m.events = append(m.events, payload)
	return nil
}

func startRoomWithTasks(t *testing.T, pub events.Publisher) *Room {
	opts := []Option{}
	if pub != nil {
		opts = append(opts, WithPublisher(pub))
	}
	r := startRoom(t, opts...)

	out := make(chan *matchv1.Snapshot, 64)
	r.Join(Join{PlayerID: "p1", Out: out})
	r.Join(Join{PlayerID: "p2", Out: out})
	waitPlayers(t, out, 2)

	r.Act(PlayerAction{PlayerID: "p1", Start: true})

	timeout := time.After(time.Second)
	for {
		select {
		case snap := <-out:
			if snap.Phase == matchv1.Phase_PLAYING {
				return r
			}
		case <-timeout:
			t.Fatal("never reached PLAYING")
		}
	}
}

func TestTaskTooFastRejected(t *testing.T) {
	pub := &mockPublisher{}
	r := startRoomWithTasks(t, pub)

	p1 := r.players["p1"]
	p1.role = matchv1.Role_CREW

	var stationID string
	for id := range p1.assignedTasks {
		stationID = id
		break
	}

	st := r.stationAt(stationID)
	p1.view.X, p1.view.Y = float32(st.X), float32(st.Y)

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: false})
	time.Sleep(50 * time.Millisecond)

	r.tick += 10 // < taskMinTicks (60)

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: true})
	time.Sleep(50 * time.Millisecond)

	if !p1.assignedTasks[stationID] {
		t.Error("task should still be assigned since it was completed too fast")
	}
	if r.reservoir != 0 {
		t.Error("reservoir should not have increased")
	}
	if len(pub.events) != 1 {
		t.Errorf("should only have match.started event, got %d", len(pub.events))
	}
}

func TestImpostorTaskIgnored(t *testing.T) {
	pub := &mockPublisher{}
	r := startRoomWithTasks(t, pub)

	p1 := r.players["p1"]
	p1.role = matchv1.Role_IMPOSTOR

	var stationID string
	for id := range p1.assignedTasks {
		stationID = id
		break
	}

	st := r.stationAt(stationID)
	p1.view.X, p1.view.Y = float32(st.X), float32(st.Y)

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: false})
	time.Sleep(50 * time.Millisecond)

	r.tick += taskMinTicks + 1

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: true})
	time.Sleep(50 * time.Millisecond)

	if p1.assignedTasks[stationID] {
		t.Error("task should be marked as done for impostor")
	}
	if r.reservoir != 0 {
		t.Error("reservoir should not have increased for impostor")
	}
	if len(pub.events) != 1 {
		t.Error("impostor should not trigger task.completed event")
	}
}

func TestCrewTaskSuccess(t *testing.T) {
	pub := &mockPublisher{}
	r := startRoomWithTasks(t, pub)

	p1 := r.players["p1"]
	p1.role = matchv1.Role_CREW

	var stationID string
	for id := range p1.assignedTasks {
		stationID = id
		break
	}

	st := r.stationAt(stationID)
	p1.view.X, p1.view.Y = float32(st.X), float32(st.Y)

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: false})
	time.Sleep(50 * time.Millisecond)

	r.tick += taskMinTicks + 1

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: true})
	time.Sleep(50 * time.Millisecond)

	if p1.assignedTasks[stationID] {
		t.Error("task should be completed")
	}
	if r.reservoir == 0 {
		t.Error("reservoir should have increased")
	}
	if len(pub.events) != 2 {
		t.Error("should have emitted task.completed event")
	}
}

func TestTaskFailsIfTooFar(t *testing.T) {
	pub := &mockPublisher{}
	r := startRoomWithTasks(t, pub)

	p1 := r.players["p1"]
	p1.role = matchv1.Role_CREW

	var stationID string
	for id := range p1.assignedTasks {
		stationID = id
		break
	}

	st := r.stationAt(stationID)
	p1.view.X, p1.view.Y = float32(st.X), float32(st.Y)

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: false})
	time.Sleep(50 * time.Millisecond)

	r.tick += taskMinTicks + 1

	p1.view.X += float32(taskRadius * 2)

	r.Act(PlayerAction{PlayerID: "p1", InteractTask: true, StationID: stationID, Completed: true})
	time.Sleep(50 * time.Millisecond)

	if !p1.assignedTasks[stationID] {
		t.Error("task should not be completed if too far")
	}
	if r.reservoir != 0 {
		t.Error("reservoir should not increase if failed")
	}
}
