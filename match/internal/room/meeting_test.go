package room

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
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

func waitForEvents(
	t *testing.T,
	pub *fakePublisher,
	key string,
	count int,
) []publishedEvent {
	t.Helper()
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) {
		eventsList := pub.forKey(key)
		if len(eventsList) >= count {
			return eventsList
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf(
		"timeout esperando %d eventos con routing key %s",
		count,
		key,
	)
	return nil
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

func TestVoteSimpleMajorityEjects(t *testing.T) {
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

	// crew1 vota imp
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "imp",
	})
	if r.meeting.votingClosed {
		t.Error("la votacion no debe cerrarse con un solo voto")
	}

	// crew2 vota imp
	r.handleAction(PlayerAction{
		PlayerID:     "crew2",
		Vote:         true,
		VoteTargetID: "imp",
	})
	if r.meeting.votingClosed {
		t.Error("la votacion no debe cerrarse antes de que voten todos")
	}

	// imp vota crew1
	r.handleAction(PlayerAction{
		PlayerID:     "imp",
		Vote:         true,
		VoteTargetID: "crew1",
	})

	// Todos votaron: votación cerrada automáticamente
	if !r.meeting.votingClosed {
		t.Fatal("la votacion debio cerrarse al votar todos los vivos")
	}
	if r.meeting.ejectedID != "imp" {
		t.Errorf("ejectedID esperaba imp, got %s", r.meeting.ejectedID)
	}
	if !r.meeting.wasImpostor {
		t.Error("wasImpostor debia ser true")
	}
	if r.players["imp"].view.Alive {
		t.Error("el jugador expulsado debe tener Alive = false")
	}
	if !r.players["imp"].ejected {
		t.Error("el jugador expulsado debe tener ejected = true")
	}
	if r.meeting.resultEndsAt != r.tick+meetingResultTicks {
		t.Errorf(
			"resultEndsAt debia ser %d, got %d",
			r.tick+meetingResultTicks,
			r.meeting.resultEndsAt,
		)
	}
}

func TestVoteTieNoEjection(t *testing.T) {
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

	// Empate 1-1 y un skip
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "crew2",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "crew2",
		Vote:         true,
		VoteTargetID: "crew1",
	})
	r.handleAction(PlayerAction{
		PlayerID: "imp",
		Vote:     true,
		VoteSkip: true,
	})

	if !r.meeting.votingClosed {
		t.Fatal("la votacion debio cerrarse")
	}
	if r.meeting.ejectedID != "" {
		t.Errorf("en empate nadie debe salir, got %s", r.meeting.ejectedID)
	}
	for id, pl := range r.players {
		if !pl.view.Alive {
			t.Errorf("jugador %s no debio morir", id)
		}
	}
}

func TestVoteSkipMajorityNoEjection(t *testing.T) {
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

	// 1 voto a imp, 2 skips
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID: "crew2",
		Vote:     true,
		VoteSkip: true,
	})
	r.handleAction(PlayerAction{
		PlayerID: "imp",
		Vote:     true,
		VoteSkip: true,
	})

	if !r.meeting.votingClosed {
		t.Fatal("la votacion debio cerrarse")
	}
	if r.meeting.ejectedID != "" {
		t.Errorf(
			"con mayoria de skip nadie debe salir, got %s",
			r.meeting.ejectedID,
		)
	}
}

func TestGhostVoteIgnored(t *testing.T) {
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

	// Matar a crew2
	r.players["crew2"].view.Alive = false

	// crew2 intenta votar
	r.handleAction(PlayerAction{
		PlayerID:     "crew2",
		Vote:         true,
		VoteTargetID: "imp",
	})

	if _, ok := r.meeting.votes["crew2"]; ok {
		t.Error("voto de fantasma no debe registrarse")
	}
}

func TestMeetingLifecycleTimeoutAndResultScreen(t *testing.T) {
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

	// Solo crew1 vota imp
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "imp",
	})
	if r.meeting.votingClosed {
		t.Fatal("no debio cerrarse aun")
	}

	// Avanzar tiempo hasta que expire la votacion (45 s = 900 ticks)
	r.tick += meetingVotingTicks
	r.stepMeeting()

	if !r.meeting.votingClosed {
		t.Fatal("debio cerrarse por timeout de 45 s")
	}
	if r.meeting.ejectedID != "imp" {
		t.Errorf("ejectedID esperaba imp, got %s", r.meeting.ejectedID)
	}

	// 50 ticks despues: sigue en pantalla de resultado (MEETING)
	r.tick += 50
	r.stepMeeting()
	if r.phase != matchv1.Phase_MEETING || r.meeting == nil {
		t.Fatal("debe mantenerse en pantalla de resultado")
	}

	// 50 ticks mas (total 100 ticks = 5 s de resultado): vuelve a PLAYING
	r.tick += 50
	r.stepMeeting()
	if r.phase != matchv1.Phase_PLAYING {
		t.Errorf("debe volver a PLAYING, got %v", r.phase)
	}
	if r.meeting != nil {
		t.Error("meeting debe ser nil tras volver a PLAYING")
	}
}

func TestPlayerEjectedEventPublished(t *testing.T) {
	pub := &fakePublisher{}
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithTanks(),
		WithCreator("crew1"),
		WithPublisher(pub),
	)
	for _, id := range []string{"crew1", "imp"} {
		out := make(chan *matchv1.Snapshot, 1)
		r.addPlayer(Join{PlayerID: id, Out: out})
	}
	r.startMatch("crew1")
	r.players["crew1"].role = matchv1.Role_CREW
	r.players["imp"].role = matchv1.Role_IMPOSTOR

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

	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "imp",
		Vote:         true,
		VoteTargetID: "imp",
	})

	// Esperar que la goroutine publique el evento
	eventsList := waitForEvents(
		t,
		pub,
		events.RoutingKeyPlayerEjected,
		1,
	)
	ev, ok := eventsList[0].payload.(events.PlayerEjected)
	if !ok {
		t.Fatalf("payload no es PlayerEjected: %T", eventsList[0].payload)
	}
	if ev.PlayerID != "imp" || !ev.WasImpostor || ev.MatchID != "match-1" {
		t.Errorf("datos del evento incorrectos: %+v", ev)
	}
}

func TestTallyVotesTable(t *testing.T) {
	tests := []struct {
		name         string
		votes        map[string]voteChoice
		alive        map[string]bool
		impostors    map[string]bool
		wantEjected  string
		wantImpostor bool
	}{
		{
			name: "mayoria simple expulsa al impostor",
			votes: map[string]voteChoice{
				"p1": {targetID: "imp"},
				"p2": {targetID: "imp"},
				"p3": {targetID: "p1"},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "p3": true, "imp": true,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "imp",
			wantImpostor: true,
		},
		{
			name: "mayoria simple expulsa a tripulante inocente",
			votes: map[string]voteChoice{
				"p1": {targetID: "p2"},
				"p2": {targetID: "imp"},
				"p3": {targetID: "p2"},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "p3": true, "imp": true,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "p2",
			wantImpostor: false,
		},
		{
			name: "empate exacto no expulsa a nadie",
			votes: map[string]voteChoice{
				"p1": {targetID: "p2"},
				"p2": {targetID: "imp"},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "imp": true,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "",
			wantImpostor: false,
		},
		{
			name: "todos votan skip",
			votes: map[string]voteChoice{
				"p1": {skip: true},
				"p2": {skip: true},
				"p3": {skip: true},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "p3": true,
			},
			impostors:    map[string]bool{},
			wantEjected:  "",
			wantImpostor: false,
		},
		{
			name: "mayoria de skip supera al mas votado",
			votes: map[string]voteChoice{
				"p1": {skip: true},
				"p2": {skip: true},
				"p3": {targetID: "imp"},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "p3": true, "imp": true,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "",
			wantImpostor: false,
		},
		{
			name: "skip empata con el mas votado",
			votes: map[string]voteChoice{
				"p1": {skip: true},
				"p2": {targetID: "imp"},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "imp": true,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "",
			wantImpostor: false,
		},
		{
			name: "votos de fantasmas son ignorados",
			votes: map[string]voteChoice{
				"p1":    {targetID: "imp"},
				"ghost": {targetID: "p1"},
			},
			alive: map[string]bool{
				"p1": true, "imp": true, "ghost": false,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "imp",
			wantImpostor: true,
		},
		{
			name: "votos hacia un fantasma son ignorados",
			votes: map[string]voteChoice{
				"p1": {targetID: "ghost"},
				"p2": {targetID: "imp"},
				"p3": {targetID: "imp"},
			},
			alive: map[string]bool{
				"p1": true, "p2": true, "p3": true, "imp": true, "ghost": false,
			},
			impostors: map[string]bool{
				"imp": true,
			},
			wantEjected:  "imp",
			wantImpostor: true,
		},
		{
			name:         "votacion vacia sin votos registrados",
			votes:        map[string]voteChoice{},
			alive:        map[string]bool{"p1": true, "p2": true},
			impostors:    map[string]bool{},
			wantEjected:  "",
			wantImpostor: false,
		},
		{
			name: "sala grande de 8 jugadores con 2 impostores",
			votes: map[string]voteChoice{
				"c1": {targetID: "imp1"},
				"c2": {targetID: "imp1"},
				"c3": {targetID: "imp1"},
				"c4": {targetID: "imp2"},
				"c5": {skip: true},
				"c6": {skip: true},
				"i1": {targetID: "c1"},
				"i2": {targetID: "c1"},
			},
			alive: map[string]bool{
				"c1": true, "c2": true, "c3": true, "c4": true,
				"c5": true, "c6": true, "i1": true, "i2": true,
				"imp1": true, "imp2": true,
			},
			impostors: map[string]bool{
				"i1": true, "i2": true, "imp1": true, "imp2": true,
			},
			wantEjected:  "imp1",
			wantImpostor: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotEjected, gotWasImpostor := tallyVotes(
				tt.votes,
				func(id string) bool { return tt.alive[id] },
				func(id string) bool { return tt.impostors[id] },
			)
			if gotEjected != tt.wantEjected {
				t.Errorf(
					"tallyVotes() ejected = %q, want %q",
					gotEjected,
					tt.wantEjected,
				)
			}
			if gotWasImpostor != tt.wantImpostor {
				t.Errorf(
					"tallyVotes() wasImpostor = %v, want %v",
					gotWasImpostor,
					tt.wantImpostor,
				)
			}
		})
	}
}

func TestFullMeetingCycleIntegration(t *testing.T) {
	pub := &fakePublisher{}
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithTanks(),
		WithCreator("crew1"),
		WithPublisher(pub),
	)
	for _, id := range []string{"crew1", "crew2", "crew3", "imp"} {
		out := make(chan *matchv1.Snapshot, 1)
		r.addPlayer(Join{PlayerID: id, Out: out})
	}
	r.startMatch("crew1")
	for id, p := range r.players {
		p.role = matchv1.Role_CREW
		if id == "imp" {
			p.role = matchv1.Role_IMPOSTOR
		}
	}

	// 1. Registrar visitas a los tanques
	r.logEvent("crew2", LogVisit, 0)
	r.logEvent("imp", LogVisit, 0)
	r.logEvent("crew1", LogVisit, 0)
	r.logEvent("crew3", LogVisit, 1)

	// 2. Tanque 0 muere
	t0 := r.tankAt(0)
	t0.dead = true

	// 3. crew1 reporta tanque 0
	p1 := r.players["crew1"]
	p1.view.X = float32(t0.x)
	p1.view.Y = float32(t0.y)

	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("fase debe ser MEETING, got %v", r.phase)
	}
	if r.meeting == nil {
		t.Fatal("meeting no debe ser nil")
	}

	// Verificar visitantes del snapshot
	view := r.meetingView()
	expectedVisitors := []string{"crew1", "imp", "crew2"}
	if len(view.LastVisitors) != len(expectedVisitors) {
		t.Fatalf(
			"esperaba %d visitantes, got %d",
			len(expectedVisitors),
			len(view.LastVisitors),
		)
	}
	for i, v := range expectedVisitors {
		if view.LastVisitors[i] != v {
			t.Errorf(
				"visitante %d esperaba %s, got %s",
				i,
				v,
				view.LastVisitors[i],
			)
		}
	}

	// 4. Chat durante reunion
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-1",
		ChatText:      "vi a imp salir del huerto",
	})
	if len(r.chat) != 1 {
		t.Fatalf("esperaba 1 mensaje de chat, got %d", len(r.chat))
	}

	// Spam de chat rechazado por rate limit
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "msg-spam",
		ChatText:      "votemos a imp",
	})
	if len(r.chat) != 1 {
		t.Error("spam de chat debio rechazarse")
	}

	// imp responde (cooldown independiente)
	r.handleAction(PlayerAction{
		PlayerID:      "imp",
		Chat:          true,
		ChatMessageID: "msg-2",
		ChatText:      "yo estaba en la planta",
	})
	if len(r.chat) != 2 {
		t.Fatalf("esperaba 2 mensajes de chat, got %d", len(r.chat))
	}

	// 5. Todos votan por imp excepto imp que vota crew1
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "crew2",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "crew3",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "imp",
		Vote:         true,
		VoteTargetID: "crew1",
	})

	// Votacion cerrada anticipadamente
	if !r.meeting.votingClosed {
		t.Fatal("votacion debio cerrarse al votar todos")
	}
	if r.meeting.ejectedID != "imp" {
		t.Fatalf("ejectedID esperaba imp, got %s", r.meeting.ejectedID)
	}
	if !r.meeting.wasImpostor {
		t.Fatal("wasImpostor debia ser true")
	}
	if r.players["imp"].view.Alive {
		t.Fatal("imp debio quedar muerto")
	}

	// Esperar que la goroutine emita el evento player.ejected
	ejectedEvents := waitForEvents(
		t,
		pub,
		events.RoutingKeyPlayerEjected,
		1,
	)
	if len(ejectedEvents) != 1 {
		t.Fatalf("esperaba 1 evento player.ejected, got %d", len(ejectedEvents))
	}

	// 6. Transicion de pantalla de resultado tras 5 s (100 ticks)
	r.tick += 50
	r.stepMeeting()
	if r.phase != matchv1.Phase_MEETING {
		t.Fatal("a los 50 ticks aun debe seguir en MEETING")
	}

	r.tick += 50
	r.stepMeeting()
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("a los 100 ticks debe volver a PLAYING, got %v", r.phase)
	}
	if r.meeting != nil {
		t.Fatal("meeting debe ser nil tras volver a PLAYING")
	}

	// 7. Jugador expulsado ya no puede reportar ni chatear
	t1 := r.tankAt(1)
	t1.dead = true
	pImp := r.players["imp"]
	pImp.view.X = float32(t1.x)
	pImp.view.Y = float32(t1.y)

	r.handleAction(PlayerAction{
		PlayerID: "imp",
		Report:   true,
		TankSlot: 1,
	})
	if r.phase == matchv1.Phase_MEETING {
		t.Error("un jugador expulsado no puede volver a reportar")
	}
}

func TestReportAlreadyReportedTankRejected(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true
	p := r.players["crew1"]
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)

	// Primer reporte exitoso
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})
	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("primer reporte debe abrir meeting")
	}

	// Cerrar reunión por skip de todos
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Vote:     true,
		VoteSkip: true,
	})
	r.handleAction(PlayerAction{
		PlayerID: "crew2",
		Vote:     true,
		VoteSkip: true,
	})
	r.handleAction(PlayerAction{
		PlayerID: "imp",
		Vote:     true,
		VoteSkip: true,
	})

	// Avanzar los 5 s de resultado para volver a PLAYING
	r.tick += meetingResultTicks
	r.stepMeeting()
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("debe volver a PLAYING, got %v", r.phase)
	}

	// Moverse al tanque 0 e intentar reportarlo otra vez
	p.view.X = float32(t0.x)
	p.view.Y = float32(t0.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: 0,
	})

	if r.phase == matchv1.Phase_MEETING {
		t.Error("un tanque ya reportado no puede volver a reportarse")
	}
	if r.meeting != nil {
		t.Error("meeting debe seguir siendo nil")
	}
}

func TestMeetingViewHidesRoleUntilVotingClosed(t *testing.T) {
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

	// 1. Durante la votación activa: rol oculto y voting_closed = false
	viewBefore := r.meetingView()
	if viewBefore.VotingClosed {
		t.Error("VotingClosed debe ser false durante la votacion")
	}
	if viewBefore.EjectedId != "" {
		t.Errorf(
			"EjectedId debe ser vacio durante votacion, got %s",
			viewBefore.EjectedId,
		)
	}
	if viewBefore.WasImpostor {
		t.Error("WasImpostor debe ser false durante votacion")
	}

	// 2. Votar todos para cerrar votación y expulsar a imp
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "crew2",
		Vote:         true,
		VoteTargetID: "imp",
	})
	r.handleAction(PlayerAction{
		PlayerID:     "imp",
		Vote:         true,
		VoteTargetID: "crew1",
	})

	// 3. Tras el cierre (pantalla de 5 s): expone los valores reales
	viewAfter := r.meetingView()
	if !viewAfter.VotingClosed {
		t.Error("VotingClosed debe ser true tras cerrar votacion")
	}
	if viewAfter.EjectedId != "imp" {
		t.Errorf("EjectedId esperaba imp, got %s", viewAfter.EjectedId)
	}
	if !viewAfter.WasImpostor {
		t.Error("WasImpostor debe ser true para el impostor expulsado")
	}
}

func TestChatDuplicateMsgIDIgnored(t *testing.T) {
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

	// Primer mensaje con msgID = "dup-1"
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "dup-1",
		ChatText:      "mensaje original",
	})
	if len(r.chat) != 1 {
		t.Fatalf("primer mensaje debe aceptarse")
	}

	// Avanzar tiempo para superar cooldown
	r.tick += chatCooldownTicks

	// Segundo mensaje con el MISMO msgID
	r.handleAction(PlayerAction{
		PlayerID:      "crew1",
		Chat:          true,
		ChatMessageID: "dup-1",
		ChatText:      "mensaje duplicado retransmitido",
	})
	if len(r.chat) != 1 {
		t.Error("mensaje con msgID duplicado debe ignorarse")
	}
}

func TestGhostNotLoggedAsVisitor(t *testing.T) {
	r := playingRoomWithDeadTank(t)
	t0 := r.tankAt(0)
	t0.dead = true

	// crew2 es un fantasma
	r.players["crew2"].view.Alive = false
	r.players["crew2"].view.X = float32(t0.x)
	r.players["crew2"].view.Y = float32(t0.y)

	r.stepTanks()

	for _, entry := range r.eventHistory {
		if entry.PlayerID == "crew2" {
			t.Error("un fantasma no debe registrarse como visitante")
		}
	}
}
