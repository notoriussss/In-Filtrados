package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

func playingRoomWithDeadTank(t *testing.T) *Room {
	t.Helper()
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithTanks(),
		WithCreator("crew1"),
	)
	for _, id := range []string{"crew1", "crew2", "imp"} {
		out := make(chan *matchv1.Snapshot, 1)
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
	}
	return r
}

func TestReportRequiresDeadTank(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = false // tanque vivo

	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)

	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	if r.phase == matchv1.Phase_MEETING {
		t.Error("no se puede reportar un tanque vivo")
	}
	if r.meeting != nil {
		t.Error("meeting no debe crearse para tanque vivo")
	}
}

func TestReportRequiresAliveReporter(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true

	p := r.players["crew1"]
	p.view.Alive = false // fantasma
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)

	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	if r.phase == matchv1.Phase_MEETING {
		t.Error("un fantasma no puede reportar")
	}
}

func TestReportRequiresNearDistance(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true

	p := r.players["crew1"]
	// Más de 60 unidades de distancia
	p.view.X = float32(t0.x + reportRange + 10)
	p.view.Y = float32(t0.y)

	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	if r.phase == matchv1.Phase_MEETING {
		t.Error("reportar a más de 60 unidades debe rechazarse")
	}
}

func TestReportSuccessfulTeleportsAndSetsMeeting(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true

	// Simular visitas previas al tanque 0:
	// imp visita, crew2 visita, imp visita otra vez, crew1 visita
	r.logEvent("imp", LogVisit, 0)
	r.logEvent("crew2", LogVisit, 0)
	r.logEvent("imp", LogVisit, 0)
	r.logEvent("crew1", LogVisit, 0)

	// Simular visita a otro tanque (no debe aparecer en el reporte de tanque 0)
	r.logEvent("imp", LogVisit, 1)

	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)
	p.dx = 1
	p.dy = 1

	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("debe cambiar a Phase_MEETING, fase actual %v", r.phase)
	}
	if r.meeting == nil {
		t.Fatal("meeting no debe ser nil tras reportar")
	}
	if r.meeting.reporterID != "crew1" {
		t.Errorf("reporterID debe ser crew1, got %s", r.meeting.reporterID)
	}
	if r.meeting.tankSlot != 0 {
		t.Errorf("tankSlot debe ser 0, got %d", r.meeting.tankSlot)
	}

	// Comprobar últimos 3 visitantes distintos
	// (del más reciente al más antiguo)
	expectedVisitors := []string{"crew1", "imp", "crew2"}
	if len(r.meeting.lastVisitors) != len(expectedVisitors) {
		t.Fatalf(
			"esperaba %d visitantes, got %d: %v",
			len(expectedVisitors),
			len(r.meeting.lastVisitors),
			r.meeting.lastVisitors,
		)
	}
	for i, v := range expectedVisitors {
		if r.meeting.lastVisitors[i] != v {
			t.Errorf(
				"visitante en [%d] esperaba %s, got %s",
				i,
				v,
				r.meeting.lastVisitors[i],
			)
		}
	}

	// Comprobar teletransporte: todos deben estar detenidos (dx=0, dy=0)
	for id, pl := range r.players {
		if pl.dx != 0 || pl.dy != 0 {
			t.Errorf("jugador %s debe tener dx=0 dy=0 tras reporte", id)
		}
	}

	// Comprobar vista del snapshot
	view := r.meetingView()
	if view == nil {
		t.Fatal("meetingView no debe ser nil")
	}
	if view.ReporterId != "crew1" || view.TankSlot != 0 {
		t.Errorf("meetingView campos incorrectos: %+v", view)
	}
	if view.EndsAtTick != r.tick+meetingVotingTicks {
		t.Errorf("EndsAtTick incorrecto: %d", view.EndsAtTick)
	}
}
