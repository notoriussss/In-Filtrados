package room

import (
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// playingRoomTasks arma una partida en PLAYING sin goroutine Run
// para pruebas deterministas y sin carreras de datos.
func playingRoomTasks(
	t *testing.T,
	pub *fakePublisher,
) *Room {
	t.Helper()
	opts := []Option{
		WithCreator("crew1"),
	}
	if pub != nil {
		opts = append(opts, WithPublisher(pub))
	}
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithStations(),
		opts...,
	)
	for _, id := range []string{"crew1", "imp"} {
		out := make(chan *matchv1.ServerEvent, 1)
		r.addPlayer(Join{PlayerID: id, Out: out})
	}
	r.startMatch("crew1")
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la partida no empezó")
	}
	for id, p := range r.players {
		p.role = matchv1.Role_CREW
		if id == "imp" {
			p.role = matchv1.Role_IMPOSTOR
		}
		p.view.X = 400
		p.view.Y = 300
		p.assignedTasks = map[string]bool{
			"leak-1": true,
			"rain-1": true,
		}
		p.tasksCompleted = 0
		p.taskStartTick = 0
		p.taskStation = ""
	}
	return r
}

func TestTaskTooFastRejected(t *testing.T) {
	pub := &fakePublisher{}
	r := playingRoomTasks(t, pub)

	p := r.players["crew1"]
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    false,
	})

	r.tick += 10 // < taskMinTicks (60 ticks / 3 s)

	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    true,
	})

	if !p.assignedTasks["leak-1"] {
		t.Error("la tarea debe seguir asignada si se completó rápido")
	}
	if r.reservoir != 0 {
		t.Errorf("embalse debe ser 0, obtuvo %d", r.reservoir)
	}
	if len(pub.forKey(events.RoutingKeyTaskCompleted)) != 0 {
		t.Error("no debe emitir task.completed")
	}
}

func TestTaskDifferentStationRejected(t *testing.T) {
	pub := &fakePublisher{}
	r := playingRoomTasks(t, pub)

	p := r.players["crew1"]
	// Inicia en leak-1
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    false,
	})

	r.tick += taskMinTicks + 1

	// Se mueve a rain-1 (600, 300) y manda completed sobre rain-1
	p.view.X = 600
	p.view.Y = 300
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "rain-1",
		Completed:    true,
	})

	if !p.assignedTasks["rain-1"] || !p.assignedTasks["leak-1"] {
		t.Error("las tareas deben seguir asignadas al cambiar de estación")
	}
	if r.reservoir != 0 {
		t.Errorf("embalse debe ser 0, obtuvo %d", r.reservoir)
	}
	if len(pub.forKey(events.RoutingKeyTaskCompleted)) != 0 {
		t.Error("no debe emitir task.completed al cambiar de estación")
	}
}

func TestImpostorTaskIgnored(t *testing.T) {
	pub := &fakePublisher{}
	r := playingRoomTasks(t, pub)

	p := r.players["imp"]
	r.handleAction(PlayerAction{
		PlayerID:     "imp",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    false,
	})

	r.tick += taskMinTicks + 1

	r.handleAction(PlayerAction{
		PlayerID:     "imp",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    true,
	})

	if p.assignedTasks["leak-1"] {
		t.Error("la tarea debe removerse para el impostor")
	}
	if p.tasksCompleted != 1 {
		t.Errorf("tasksCompleted debe ser 1, obtuvo %d", p.tasksCompleted)
	}
	if r.reservoir != 0 {
		t.Errorf("embalse debe ser 0 para impostor, fue %d", r.reservoir)
	}
	if len(pub.forKey(events.RoutingKeyTaskCompleted)) != 0 {
		t.Error("el impostor no debe emitir task.completed")
	}
}

func TestCrewTaskSuccess(t *testing.T) {
	pub := &fakePublisher{}
	r := playingRoomTasks(t, pub)

	p := r.players["crew1"]
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    false,
	})

	r.tick += taskMinTicks + 1

	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    true,
	})

	if p.assignedTasks["leak-1"] {
		t.Error("la tarea debe haberse completado")
	}
	if p.tasksCompleted != 1 {
		t.Errorf("tasksCompleted debe ser 1, obtuvo %d", p.tasksCompleted)
	}
	if r.reservoir != 3 { // reduce suma 3
		t.Errorf("embalse debe ser 3, obtuvo %d", r.reservoir)
	}

	// Publish corre en goroutine: esperamos con timeout
	timeout := time.After(time.Second)
	ticker := time.NewTicker(5 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			evs := pub.forKey(events.RoutingKeyTaskCompleted)
			if len(evs) > 0 {
				tc, ok := evs[0].payload.(events.TaskCompleted)
				if !ok {
					t.Fatalf(
						"payload no es TaskCompleted: %T",
						evs[0].payload,
					)
				}
				if tc.LitersSaved != 300 {
					t.Errorf(
						"liters_saved debe ser 300, fue %d",
						tc.LitersSaved,
					)
				}
				if tc.TaskType != "reduce" {
					t.Errorf(
						"task_type debe ser reduce, fue %s",
						tc.TaskType,
					)
				}
				return
			}
		case <-timeout:
			t.Fatal("esperaba evento task.completed")
		}
	}
}

func TestTaskFailsIfTooFar(t *testing.T) {
	pub := &fakePublisher{}
	r := playingRoomTasks(t, pub)

	p := r.players["crew1"]
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    false,
	})

	r.tick += taskMinTicks + 1

	p.view.X += float32(taskRadius * 2)

	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    true,
	})

	if !p.assignedTasks["leak-1"] {
		t.Error("la tarea no debe completarse si el jugador está lejos")
	}
	if r.reservoir != 0 {
		t.Errorf("embalse debe ser 0, obtuvo %d", r.reservoir)
	}
	if len(pub.forKey(events.RoutingKeyTaskCompleted)) != 0 {
		t.Error("no debe emitir task.completed si falló por distancia")
	}
}

// lastSnapshot devuelve el último snapshot que la sala dejó en el canal
// del jugador después de un broadcast.
func lastSnapshot(t *testing.T, r *Room, id string) *matchv1.Snapshot {
	t.Helper()
	out := r.players[id].out
	for len(out) > 0 {
		<-out
	}
	r.broadcast()
	select {
	case snap := <-out:
		return snap
	default:
		t.Fatalf("no llegó snapshot para %s", id)
		return nil
	}
}

func TestSnapshotListsMyTasksAndMarksDone(t *testing.T) {
	r := playingRoomTasks(t, nil)
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
	})

	snap := lastSnapshot(t, r, "crew1")
	if snap.MyActiveTask != "leak-1" {
		t.Errorf("my_active_task debe ser leak-1, fue %q", snap.MyActiveTask)
	}

	r.tick += taskMinTicks + 1
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
		Completed:    true,
	})

	snap = lastSnapshot(t, r, "crew1")
	got := snap.MyTasks
	if len(got) != 2 ||
		got[0].StationId != "leak-1" || !got[0].Done ||
		got[1].StationId != "rain-1" || got[1].Done {
		t.Errorf("my_tasks inesperado: %v", got)
	}
	if snap.MyActiveTask != "" {
		t.Error("al completar no debe quedar tarea activa")
	}
}

func TestSnapshotNeverCarriesOtherPlayersTasks(t *testing.T) {
	r := playingRoomTasks(t, nil)
	r.players["imp"].assignedTasks = map[string]bool{"filter-1": true}

	for _, task := range lastSnapshot(t, r, "crew1").MyTasks {
		if task.StationId == "filter-1" {
			t.Error("crew1 recibió una tarea del otro jugador")
		}
	}
}

func TestMovingAwayCancelsTheTask(t *testing.T) {
	r := playingRoomTasks(t, nil)
	p := r.players["crew1"]
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
	})

	p.view.X += float32(taskRadius * 2)
	r.step()

	if p.taskStation != "" {
		t.Error("alejarse debe cancelar la tarea")
	}
	if lastSnapshot(t, r, "crew1").MyActiveTask != "" {
		t.Error("el snapshot no debe traer tarea activa")
	}
}
