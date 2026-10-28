package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// Estos tests no corren Run: llaman a la sala desde una sola goroutine
// y avanzan los ticks a mano, así 20 s de juego tardan microsegundos.

type fakeEventLog struct {
	entries []LogEntry
}

func (f *fakeEventLog) Log(entry LogEntry) {
	f.entries = append(f.entries, entry)
}

func (f *fakeEventLog) count(kind string, slot int32) int {
	n := 0
	for _, e := range f.entries {
		if e.Kind == kind && e.TankSlot == slot {
			n++
		}
	}
	return n
}

// playingRoom arma una partida en PLAYING: "imp" es el impostor con el
// tanque 0; "crew1" y "crew2" son tripulantes con los tanques 1 y 2.
func playingRoom(t *testing.T) (*Room, *fakeEventLog) {
	t.Helper()
	eventLog := &fakeEventLog{}
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithTanks(),
		WithCreator("imp"),
		WithEventLog(eventLog),
	)
	for _, id := range []string{"imp", "crew1", "crew2"} {
		out := make(chan *matchv1.ServerEvent, 1)
		r.addPlayer(Join{PlayerID: id, Out: out})
	}
	r.startMatch("imp")
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la partida no empezó")
	}
	for id, p := range r.players {
		p.role = matchv1.Role_CREW
		if id == "imp" {
			p.role = matchv1.Role_IMPOSTOR
		}
	}
	return r, eventLog
}

func tickN(r *Room, n int) {
	for i := 0; i < n; i++ {
		r.step()
		r.tick++
	}
}

// placeAt pone al jugador encima del tanque slot.
func placeAt(r *Room, id string, slot int32) {
	spot := r.m.Tanks[slot]
	p := r.players[id]
	p.view.X, p.view.Y = float32(spot.X), float32(spot.Y)
}

func contaminate(r *Room, id string, slot int32) {
	r.handleAction(PlayerAction{
		PlayerID:    id,
		Contaminate: true,
		TankSlot:    slot,
	})
}

func move(r *Room, id string, dx, dy int32) {
	r.handleAction(PlayerAction{PlayerID: id, DX: dx, DY: dy})
}

func level(r *Room, slot int32) int32 {
	return r.tankAt(slot).contamination
}

// (a) un tripulante no puede contaminar.
func TestCrewCannotContaminate(t *testing.T) {
	r, _ := playingRoom(t)
	placeAt(r, "crew1", 2)
	contaminate(r, "crew1", 2)
	tickN(r, contaminateTicks+1)

	if got := level(r, 2); got != 0 {
		t.Fatalf("un tripulante contaminó el tanque: %d", got)
	}
}

func TestContaminateTakesThreeSecondsStill(t *testing.T) {
	r, eventLog := playingRoom(t)
	placeAt(r, "imp", 1)
	contaminate(r, "imp", 1)

	tickN(r, contaminateTicks-1)
	if got := level(r, 1); got != 0 {
		t.Fatalf("contaminó antes de 3 s: %d", got)
	}
	tickN(r, 1)
	if got := level(r, 1); got != contaminateAmount {
		t.Fatalf("want %d tras 3 s, got %d", contaminateAmount, got)
	}
	if eventLog.count(LogContaminate, 1) != 1 {
		t.Errorf("la contaminación debe quedar en event_log")
	}
}

func TestImpostorCannotContaminateFarOrOwnTank(t *testing.T) {
	r, _ := playingRoom(t)
	// Lejos: el impostor sigue en el punto de aparición.
	contaminate(r, "imp", 1)
	// Su propio tanque.
	placeAt(r, "imp", 0)
	contaminate(r, "imp", 0)
	tickN(r, contaminateTicks+1)

	if level(r, 1) != 0 {
		t.Errorf("contaminó un tanque lejano")
	}
	if level(r, 0) != 0 {
		t.Errorf("contaminó su propio tanque")
	}
}

// (b) moverse a mitad de los 3 segundos cancela.
func TestMovingCancelsContamination(t *testing.T) {
	r, _ := playingRoom(t)
	placeAt(r, "imp", 1)
	contaminate(r, "imp", 1)
	tickN(r, contaminateTicks/2)

	move(r, "imp", 1, 0)
	tickN(r, 1)
	move(r, "imp", 0, 0)
	placeAt(r, "imp", 1)
	tickN(r, contaminateTicks)

	if got := level(r, 1); got != 0 {
		t.Fatalf("moverse debía cancelar la contaminación: %d", got)
	}
}

// (c) se respeta la espera de 20 s entre contaminaciones.
func TestContaminateCooldown(t *testing.T) {
	r, _ := playingRoom(t)
	placeAt(r, "imp", 1)
	contaminate(r, "imp", 1)
	tickN(r, contaminateTicks)
	if level(r, 1) != contaminateAmount {
		t.Fatalf("la primera contaminación no terminó")
	}

	// Terminó en el tick T; la sala ya va en T+1.
	contaminate(r, "imp", 1)
	tickN(r, contaminateTicks)
	if got := level(r, 1); got != contaminateAmount {
		t.Fatalf("contaminó durante la espera: %d", got)
	}

	// T+61: faltan 339 ticks para T+400.
	tickN(r, contaminateCooldown-contaminateTicks-2)
	contaminate(r, "imp", 1)
	if r.players["imp"].pending != nil {
		t.Fatalf("aceptó contaminar 1 tick antes de los 20 s")
	}
	tickN(r, 1)
	contaminate(r, "imp", 1)
	tickN(r, contaminateTicks)
	if got := level(r, 1); got != 2*contaminateAmount {
		t.Fatalf("después de 20 s debía poder contaminar: %d", got)
	}
}

// (d) 2 contaminaciones matan el tanque y el dueño es fantasma.
func TestTwoContaminationsKillTheTank(t *testing.T) {
	r, eventLog := playingRoom(t)
	placeAt(r, "imp", 1)
	for i := 0; i < 2; i++ {
		contaminate(r, "imp", 1)
		tickN(r, contaminateTicks)
		tickN(r, contaminateCooldown)
	}

	tk := r.tankAt(1)
	if tk.contamination != maxContamination || !tk.dead {
		t.Fatalf("el tanque debía morir: %+v", tk)
	}
	if r.players["crew1"].view.Alive {
		t.Fatalf("el dueño del tanque muerto debía quedar fantasma")
	}
	if eventLog.count(LogContaminate, 1) != 2 {
		t.Errorf(
			"want 2 contaminaciones en event_log, got %d",
			eventLog.count(LogContaminate, 1),
		)
	}

	// El snapshot lo muestra a todos.
	views := r.tankViews()
	if !views[1].Dead || views[1].Contamination != maxContamination {
		t.Errorf("el snapshot debe mostrar el tanque muerto: %+v", views[1])
	}
}

// Nadie limpia tanques: lo que contamina el impostor no baja nunca, ni
// con los tripulantes parados junto al tanque.
func TestContaminationNeverGoesDown(t *testing.T) {
	r, _ := playingRoom(t)
	placeAt(r, "imp", 1)
	contaminate(r, "imp", 1)
	tickN(r, contaminateTicks)
	if level(r, 1) != contaminateAmount {
		t.Fatalf("la contaminación no terminó")
	}

	placeAt(r, "crew1", 1)
	placeAt(r, "crew2", 1)
	for i := 0; i < 30; i++ {
		tickN(r, 100)
		if got := level(r, 1); got < contaminateAmount {
			t.Fatalf("la contaminación bajó a %d", got)
		}
	}
}

// Con 50 de daño por contaminación, dos matan un tanque.
func TestContaminateAmountKillsInTwoHits(t *testing.T) {
	if 2*contaminateAmount < maxContamination {
		t.Fatalf("dos contaminaciones deben bastar para matar un tanque")
	}
	if contaminateAmount >= maxContamination {
		t.Fatalf("una sola contaminación no debe matar un tanque")
	}
}

// El tanque del impostor nunca muere solo: ni la subida automática ni la
// tubería lo pasan de 99 (partida EEES: 60 de subida + 2 tuberías).
func TestImpostorTankNeverDies(t *testing.T) {
	r, _ := playingRoom(t)
	imp := r.tankAt(0)
	imp.contamination = maxContamination - 1
	tickN(r, impostorDriftTicks)
	r.addContamination(imp, pipeDamage)

	if imp.contamination != maxContamination-1 || imp.dead {
		t.Fatalf("el tanque del impostor debía quedar en 99: %+v", imp)
	}
	if !r.players["imp"].view.Alive {
		t.Fatal("el impostor no debe quedar fantasma por su tanque")
	}
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatal("la partida no debe terminar")
	}
}

func TestImpostorTankRisesAlone(t *testing.T) {
	r, _ := playingRoom(t)
	tickN(r, impostorDriftTicks)
	if got := level(r, 0); got != impostorDriftAmount {
		t.Fatalf("a los 5 s el tanque del impostor debía subir 1: %d", got)
	}
	tickN(r, 4*impostorDriftTicks)
	if got := level(r, 0); got != 5*impostorDriftAmount {
		t.Fatalf("a los 25 s debía ir en 5: %d", got)
	}
	if level(r, 1) != 0 || level(r, 2) != 0 {
		t.Errorf("los tanques de los tripulantes no suben solos")
	}
}

func TestVisitIsLoggedOnceWhenEntering(t *testing.T) {
	r, eventLog := playingRoom(t)
	placeAt(r, "crew2", 1)
	tickN(r, 10)
	if got := eventLog.count(LogVisit, 1); got != 1 {
		t.Fatalf("quedarse junto al tanque es 1 visita, got %d", got)
	}

	r.players["crew2"].view.Y -= 3 * tankRange // se aleja
	tickN(r, 1)
	placeAt(r, "crew2", 1) // y vuelve
	tickN(r, 1)
	if got := eventLog.count(LogVisit, 1); got != 2 {
		t.Fatalf("volver a acercarse es otra visita, got %d", got)
	}
	for _, e := range eventLog.entries {
		if e.MatchID != "match-1" {
			t.Errorf("event_log sin match_id: %+v", e)
		}
	}
}

func TestNoTankActionsInLobby(t *testing.T) {
	r := NewRoom("TEST", "match-1", mapWithTanks(), WithCreator("imp"))
	r.addPlayer(Join{PlayerID: "imp", Out: make(chan *matchv1.ServerEvent, 1)})
	r.players["imp"].role = matchv1.Role_IMPOSTOR
	contaminate(r, "imp", 1)
	if r.players["imp"].pending != nil {
		t.Fatalf("en LOBBY no se contamina")
	}
}
