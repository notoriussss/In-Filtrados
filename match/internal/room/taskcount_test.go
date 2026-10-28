package room

import (
	"fmt"
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// mapWithManyStations tiene tantas estaciones como el mapa real (12).
func mapWithManyStations() *Map {
	m := mapWithTanks()
	for i := 0; i < 12; i++ {
		m.Stations = append(m.Stations, Station{
			ID:   fmt.Sprintf("st-%d", i),
			Type: taskReduce,
			X:    float64(100 + i*50),
			Y:    300,
		})
	}
	return m
}

// lobbyRoomTaskCount arma una sala en LOBBY con el creador y un invitado.
func lobbyRoomTaskCount(t *testing.T) (*Room, chan *matchv1.ServerEvent) {
	t.Helper()
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithManyStations(),
		WithCreator("crew1"),
	)
	creatorOut := make(chan *matchv1.ServerEvent, 4)
	r.addPlayer(Join{PlayerID: "crew1", Out: creatorOut})
	r.addPlayer(Join{
		PlayerID: "imp",
		Out:      make(chan *matchv1.ServerEvent, 4),
	})
	return r, creatorOut
}

func setCount(r *Room, playerID string, n int32) {
	r.handleAction(PlayerAction{
		PlayerID:     playerID,
		SetTaskCount: true,
		TaskCount:    n,
	})
}

func TestTaskCountDefaultsToSix(t *testing.T) {
	r, _ := lobbyRoomTaskCount(t)
	if r.tasksPerPlayer != 6 {
		t.Fatalf("want default 6, got %d", r.tasksPerPlayer)
	}
}

func TestTaskCountAcceptsLimits(t *testing.T) {
	for _, n := range []int32{4, 5, 8} {
		r, _ := lobbyRoomTaskCount(t)
		setCount(r, "crew1", n)
		if r.tasksPerPlayer != int(n) {
			t.Errorf("want %d, got %d", n, r.tasksPerPlayer)
		}
	}
}

func TestTaskCountRejectsOutOfRange(t *testing.T) {
	for _, n := range []int32{-1, 0, 3, 9, 100} {
		r, out := lobbyRoomTaskCount(t)
		setCount(r, "crew1", n)
		if r.tasksPerPlayer != defaultTasksPerPlayer {
			t.Errorf("%d: value changed to %d", n, r.tasksPerPlayer)
		}
		e := (<-out).GetError()
		if e == nil || e.Code != ErrCodeInvalidTaskCount {
			t.Errorf("%d: want %s, got %v", n, ErrCodeInvalidTaskCount, e)
		}
	}
}

func TestTaskCountOnlyCreatorInLobby(t *testing.T) {
	r, _ := lobbyRoomTaskCount(t)
	setCount(r, "imp", 8)
	if r.tasksPerPlayer != defaultTasksPerPlayer {
		t.Fatalf("a guest changed the count to %d", r.tasksPerPlayer)
	}
	r.phase = matchv1.Phase_PLAYING
	setCount(r, "crew1", 8)
	if r.tasksPerPlayer != defaultTasksPerPlayer {
		t.Fatalf("changed outside LOBBY to %d", r.tasksPerPlayer)
	}
}

func TestEveryPlayerGetsTheChosenTaskCount(t *testing.T) {
	for _, n := range []int32{4, 6, 8} {
		r, _ := lobbyRoomTaskCount(t)
		setCount(r, "crew1", n)
		r.startMatch("crew1")
		if r.phase != matchv1.Phase_PLAYING {
			t.Fatalf("la partida no empezó")
		}
		for id, p := range r.players {
			if got := len(p.assignedTasks); got != int(n) {
				t.Errorf("%d: %s got %d tasks", n, id, got)
			}
			if got := len(myTasks(p)); got != int(n) {
				t.Errorf("%d: %s sees %d tasks", n, id, got)
			}
		}
	}
}

func TestSnapshotCarriesTaskCount(t *testing.T) {
	r, out := lobbyRoomTaskCount(t)
	setCount(r, "crew1", 7)
	r.broadcast()
	snap := drain(out)
	if snap == nil || snap.TasksPerPlayer != 7 {
		t.Fatalf("want tasks_per_player 7, got %v", snap)
	}
}

func TestTaskCountSurvivesRestore(t *testing.T) {
	r, _ := lobbyRoomTaskCount(t)
	setCount(r, "crew1", 8)
	if got := r.toSaved().TasksPerPlayer; got != 8 {
		t.Fatalf("saved %d, want 8", got)
	}
}
