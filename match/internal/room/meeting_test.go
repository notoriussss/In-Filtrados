package room

import (
	"fmt"
	"strings"
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

func TestChatRequiresMeetingPhase(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	// Partida en PLAYING: el chat debe ser ignorado
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-1",
		ChatText:      "hola equipo",
	})
	if len(r.chat) != 0 {
		t.Errorf("chat no permitido fuera de reunion, got %d", len(r.chat))
	}
}

func TestChatRequiresAlivePlayer(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true
	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})
	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("debe estar en Phase_MEETING")
	}

	// crew2 es un fantasma
	r.players["crew2"].view.Alive = false

	r.handleAction(PlayerAction{
		PlayerID:      "crew2",
		Chat:          true,
		ChatMessageID: "msg-ghost",
		ChatText:      "soy un fantasma",
	})
	if len(r.chat) != 0 {
		t.Errorf("fantasmas no pueden chatear, got %d msgs", len(r.chat))
	}
}

func TestChatLengthLimit(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true
	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	// Mensaje vacío rechazado
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-empty",
		ChatText:      "",
	})
	if len(r.chat) != 0 {
		t.Errorf("mensaje vacio debe rechazarse")
	}

	// 200 caracteres exactos aceptado
	exact200 := strings.Repeat("a", 200)
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-200",
		ChatText:      exact200,
	})
	if len(r.chat) != 1 {
		t.Fatalf(
			"mensaje de 200 caracteres debe aceptarse, got %d",
			len(r.chat),
		)
	}

	// Avanzar ticks para superar el cooldown de 1 segundo
	r.tick += chatCooldownTicks

	// 201 caracteres rechazado
	over200 := strings.Repeat("a", 201)
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-201",
		ChatText:      over200,
	})
	if len(r.chat) != 1 {
		t.Errorf("mensaje de 201 caracteres debe rechazarse")
	}
}

func TestChatRateLimit(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true
	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	// Primer mensaje aceptado
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-1",
		ChatText:      "primer mensaje",
	})
	if len(r.chat) != 1 {
		t.Fatalf("primer mensaje debe aceptarse")
	}

	// Mensaje antes de 1 segundo (10 ticks < chatCooldownTicks) rechazado
	r.tick += 10
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-spam",
		ChatText:      "mensaje spam",
	})
	if len(r.chat) != 1 {
		t.Errorf("mensaje antes de 1 s debe rechazarse por cooldown")
	}

	// Otro jugador puede chatear de inmediato (cooldown independiente)
	r.handleAction(PlayerAction{
		PlayerID:      "crew2",
		Chat:          true,
		ChatMessageID: "msg-crew2",
		ChatText:      "mensaje independiente",
	})
	if len(r.chat) != 2 {
		t.Errorf("otro jugador no debe bloquearse por cooldown ajeno")
	}

	// Jugador original puede volver a enviar tras completar 20 ticks
	r.tick += 10
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-2",
		ChatText:      "segundo mensaje",
	})
	if len(r.chat) != 3 {
		t.Errorf("mensaje tras 1 s debe aceptarse, got %d", len(r.chat))
	}
}

func TestChatHistoryLimit(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true
	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	for i := 0; i < 35; i++ {
		r.tick += chatCooldownTicks
		r.handleAction(PlayerAction{
			PlayerID:      "crew1",
			Chat:          true,
			ChatMessageID: fmt.Sprintf("msg-%d", i),
			ChatText:      fmt.Sprintf("mensaje %d", i),
		})
	}

	if len(r.chat) != chatHistoryLimit {
		t.Fatalf(
			"historial debe limitarse a %d, got %d",
			chatHistoryLimit,
			len(r.chat),
		)
	}
	if r.chat[0].id != "msg-5" {
		t.Errorf(
			"el primer mensaje retenido debe ser msg-5, got %s",
			r.chat[0].id,
		)
	}

	// Verificar vistas en snapshots
	views := r.chatViews()
	if len(views) != chatHistoryLimit {
		t.Errorf("chatViews debe retornar %d elementos", chatHistoryLimit)
	}
}
