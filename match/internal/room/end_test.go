package room

import (
	"sort"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// setupPlayingRoom crea una sala en PLAYING para pruebas de fin (S2-06).
func setupPlayingRoom(
	t *testing.T,
	players []string,
	impostors map[string]bool,
	pub *fakePublisher,
	store *fakeStore,
	opts ...Option,
) *Room {
	t.Helper()
	allOpts := []Option{
		WithCreator(players[0]),
	}
	if pub != nil {
		allOpts = append(allOpts, WithPublisher(pub))
	}
	if store != nil {
		allOpts = append(allOpts, WithStore(store))
	}
	allOpts = append(allOpts, opts...)

	r := NewRoom("TEST", "match-1", mapWithTanks(), allOpts...)
	for _, id := range players {
		out := make(chan *matchv1.ServerEvent, 16)
		r.addPlayer(Join{PlayerID: id, Out: out})
	}
	r.startMatch(players[0])
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la sala no paso a PLAYING")
	}

	// Asignar roles explícitos para pruebas deterministas
	for id, p := range r.players {
		if impostors[id] {
			p.role = matchv1.Role_IMPOSTOR
		} else {
			p.role = matchv1.Role_CREW
		}
	}
	return r
}

// TestWinCondition_Reservoir100: los tripulantes ganan
// si el embalse llega a 100.
func TestWinCondition_Reservoir100(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{"crew1", "crew2", "imp"}
	impMap := map[string]bool{"imp": true}
	r := setupPlayingRoom(t, players, impMap, pub, store)

	r.reservoir = 99
	r.step()
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la sala debio seguir en PLAYING con 99 de embalse")
	}

	r.reservoir = 100
	r.step()

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("la sala debio terminar en ENDED, got %v", r.phase)
	}
	if store.finishes != 1 || store.winner != events.WinnerCrew {
		t.Errorf(
			"ganador en store esperado %s, got %s",
			events.WinnerCrew,
			store.winner,
		)
	}
	evs := waitForEvents(t, pub, events.RoutingKeyFinished, 1)
	if len(evs) != 1 {
		t.Fatalf("esperaba 1 evento match.finished, got %d", len(evs))
	}
	mf := evs[0].payload.(events.MatchFinished)
	if mf.Winner != events.WinnerCrew {
		t.Errorf(
			"ganador en evento esperado %s, got %s",
			events.WinnerCrew,
			mf.Winner,
		)
	}
}

// TestWinCondition_AllImpostorsEjected: los tripulantes ganan si se expulsa
// a todos los impostores.
func TestWinCondition_AllImpostorsEjected(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{"crew1", "crew2", "imp"}
	impMap := map[string]bool{"imp": true}
	r := setupPlayingRoom(t, players, impMap, pub, store)

	imp := r.players["imp"]
	imp.ejected = true
	imp.view.Alive = false

	r.step()

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("la sala debio terminar en ENDED, got %v", r.phase)
	}
	if store.winner != events.WinnerCrew {
		t.Errorf(
			"ganador en store esperado %s, got %s",
			events.WinnerCrew,
			store.winner,
		)
	}

	// Verificar participantes en store
	if len(store.endParticipants) != 3 {
		t.Errorf(
			"esperaba 3 participantes guardados, got %d",
			len(store.endParticipants),
		)
	}
	for _, part := range store.endParticipants {
		if part.PlayerID == "imp" && !part.Ejected {
			t.Errorf("imp debia estar guardado como ejected=true")
		}
	}
}

// TestWinCondition_TwoImpostors_BothMustBeEjected: con 2 impostores,
// ambos deben ser expulsados para que ganen los tripulantes.
func TestWinCondition_TwoImpostors_BothMustBeEjected(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{
		"c1", "c2", "c3", "c4", "c5", "imp1", "imp2",
	}
	impMap := map[string]bool{"imp1": true, "imp2": true}
	r := setupPlayingRoom(t, players, impMap, pub, store)

	// Expulsar solo al primer impostor
	r.players["imp1"].ejected = true
	r.players["imp1"].view.Alive = false

	r.step()
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("con un impostor vivo la partida no debe terminar")
	}

	// Expulsar al segundo impostor
	r.players["imp2"].ejected = true
	r.players["imp2"].view.Alive = false

	r.step()
	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("al expulsar ambos impostores debio terminar en ENDED")
	}
	if store.winner != events.WinnerCrew {
		t.Errorf(
			"ganador esperado %s, got %s",
			events.WinnerCrew,
			store.winner,
		)
	}
}

// TestWinCondition_ImpostorParity: gana el impostor si quedan tantos
// impostores vivos como tripulantes vivos tras bajas de tripulantes.
func TestWinCondition_ImpostorParity(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{"crew1", "crew2", "crew3", "imp"}
	impMap := map[string]bool{"imp": true}
	r := setupPlayingRoom(t, players, impMap, pub, store)

	// Al inicio: 1 imp, 3 crew -> sigue PLAYING
	r.step()
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("al inicio con 3 tripulantes debe seguir PLAYING")
	}

	// Muere crew1: 1 imp, 2 crew -> sigue PLAYING
	r.players["crew1"].view.Alive = false
	r.step()
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("con 2 tripulantes vivos debe seguir PLAYING")
	}

	// Muere crew2: 1 imp, 1 crew -> paridad alcanzada
	r.players["crew2"].view.Alive = false
	r.step()

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("con paridad 1 a 1 debio terminar en ENDED")
	}
	if store.winner != events.WinnerImpostor {
		t.Errorf(
			"ganador esperado %s, got %s",
			events.WinnerImpostor,
			store.winner,
		)
	}
	evs := waitForEvents(t, pub, events.RoutingKeyFinished, 1)
	if len(evs) != 1 {
		t.Fatalf("esperaba 1 evento match.finished, got %d", len(evs))
	}
	mf := evs[0].payload.(events.MatchFinished)
	if mf.Winner != events.WinnerImpostor {
		t.Errorf(
			"evento ganador esperado %s, got %s",
			events.WinnerImpostor,
			mf.Winner,
		)
	}
}

// TestWinCondition_EightMinutesTimeout: gana el impostor si pasan 8 minutos
// sin que el embalse llegue a 100.
func TestWinCondition_EightMinutesTimeout(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{"crew1", "crew2", "imp"}
	impMap := map[string]bool{"imp": true}
	r := setupPlayingRoom(
		t,
		players,
		impMap,
		pub,
		store,
		WithMatchDuration(8*time.Minute),
	)

	r.reservoir = 40 // embalse incompleto
	// Simular que han transcurrido 8 minutos en ticks (S2-06, S3-02)
	r.startedAt = r.now().Add(-8*time.Minute - time.Second)
	r.tick = r.startTick + int64(8*time.Minute/tickInterval)

	r.step()

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("tras 8 minutos debio terminar en ENDED")
	}
	if store.winner != events.WinnerImpostor {
		t.Errorf(
			"ganador esperado %s por timeout, got %s",
			events.WinnerImpostor,
			store.winner,
		)
	}
}

// TestHarvestFormula: harvest = tareas completadas * 5 + (10 si tanque vivo).
func TestHarvestFormula(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{"crew1", "crew2", "imp"}
	impMap := map[string]bool{"imp": true}
	r := setupPlayingRoom(t, players, impMap, pub, store)

	// crew1: 3 tareas completadas, tanque vivo (slot 0)
	// harvest = 3 * 5 + 10 = 25
	r.players["crew1"].tasksCompleted = 3

	// crew2: 2 tareas completadas, tanque muerto (slot 1)
	// harvest = 2 * 5 + 0 = 10
	r.players["crew2"].tasksCompleted = 2
	t2 := r.tankAt(int32(r.players["crew2"].tankSlot))
	if t2 != nil {
		t2.dead = true
	}

	// imp: 0 tareas completadas, tanque vivo (slot 2)
	// harvest = 0 * 5 + 10 = 10
	r.players["imp"].tasksCompleted = 0

	// Ganar por embalse a 100
	r.reservoir = 100
	r.step()

	evs := waitForEvents(t, pub, events.RoutingKeyFinished, 1)
	if len(evs) != 1 {
		t.Fatalf("esperaba evento match.finished")
	}
	mf := evs[0].payload.(events.MatchFinished)

	harvestMap := make(map[string]int)
	for _, p := range mf.Players {
		harvestMap[p.PlayerID] = p.Harvest
	}

	if harvestMap["crew1"] != 25 {
		t.Errorf("crew1 harvest esperado 25, got %d", harvestMap["crew1"])
	}
	if harvestMap["crew2"] != 10 {
		t.Errorf("crew2 harvest esperado 10, got %d", harvestMap["crew2"])
	}
	if harvestMap["imp"] != 10 {
		t.Errorf("imp harvest esperado 10, got %d", harvestMap["imp"])
	}
}

// TestFinishedEventCarriesLitersSaved: match.finished trae los litros que
// sumó cada jugador, para el ranking de players.
func TestFinishedEventCarriesLitersSaved(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	players := []string{"crew1", "crew2", "imp"}
	impMap := map[string]bool{"imp": true}
	r := setupPlayingRoom(t, players, impMap, pub, store)

	r.players["crew1"].litersSaved = 700
	r.players["imp"].litersSaved = 0

	r.reservoir = 100
	r.step()

	evs := waitForEvents(t, pub, events.RoutingKeyFinished, 1)
	mf := evs[0].payload.(events.MatchFinished)
	liters := make(map[string]int)
	for _, p := range mf.Players {
		liters[p.PlayerID] = p.LitersSaved
	}
	if liters["crew1"] != 700 {
		t.Errorf("crew1 litros esperados 700, got %d", liters["crew1"])
	}
	if liters["crew2"] != 0 || liters["imp"] != 0 {
		t.Errorf("crew2 e imp no suman litros: %v", liters)
	}
}

// TestMatchEndedBroadcastOnEventOut: verifica que los streams gRPC reciben
// el evento MatchEnded con winner y la lista de impostor_ids.
func TestMatchEndedBroadcastOnEventOut(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	r := NewRoom("TEST", "match-1", mapWithTanks(),
		WithCreator("c1"),
		WithPublisher(pub),
		WithStore(store),
	)

	outA := make(chan *matchv1.ServerEvent, 16)
	outB := make(chan *matchv1.ServerEvent, 16)
	r.addPlayer(Join{PlayerID: "c1", Out: outA})
	r.addPlayer(Join{PlayerID: "imp", Out: outB})
	r.startMatch("c1")

	r.players["c1"].role = matchv1.Role_CREW
	r.players["imp"].role = matchv1.Role_IMPOSTOR

	r.reservoir = 100
	r.step()

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("debio terminar en ENDED")
	}

	// Verificar recepción de ServerEvent_MatchEnded
	var receivedEnded *matchv1.MatchEnded
	timeout := time.After(500 * time.Millisecond)
drainLoop:
	for {
		select {
		case ev := <-outA:
			if me := ev.GetMatchEnded(); me != nil {
				receivedEnded = me
				break drainLoop
			}
		case <-timeout:
			break drainLoop
		}
	}

	if receivedEnded == nil {
		t.Fatalf("no se recibio MatchEnded por el canal EventOut")
	}
	if receivedEnded.Winner != events.WinnerCrew {
		t.Errorf(
			"winner en MatchEnded esperado %s, got %s",
			events.WinnerCrew,
			receivedEnded.Winner,
		)
	}
	sort.Strings(receivedEnded.ImpostorIds)
	if len(receivedEnded.ImpostorIds) != 1 ||
		receivedEnded.ImpostorIds[0] != "imp" {
		t.Errorf("impostor_ids inesperados: %v", receivedEnded.ImpostorIds)
	}
}

// TestRoomMemoryCleanupAfterDelay: verifica que a los 30 s de terminar
// la partida la sala se libera del registry y se cierran canales.
func TestRoomMemoryCleanupAfterDelay(t *testing.T) {
	cleaned := false
	cleanupDelay := 50 * time.Millisecond
	r := NewRoom("TEST", "match-1", mapWithTanks(),
		WithCreator("c1"),
		WithCleanupDelay(cleanupDelay),
		WithOnCleanup(func(code string) {
			if code == "TEST" {
				cleaned = true
			}
		}),
	)

	outA := make(chan *matchv1.ServerEvent, 16)
	r.addPlayer(Join{PlayerID: "c1", Out: outA})
	outB := make(chan *matchv1.ServerEvent, 16)
	r.addPlayer(Join{PlayerID: "c2", Out: outB})
	r.startMatch("c1")

	// Terminar partida
	r.reservoir = 100
	r.step()
	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("la sala debio terminar")
	}

	// De inmediato: cleanup aún no debe haber ocurrido
	stopped := r.onTick()
	if stopped {
		t.Fatalf("onTick no debio retornar true antes de cleanupDelay")
	}
	if cleaned {
		t.Fatalf("cleanup no debio ejecutarse antes del delay")
	}

	// Simular transcurso del tiempo de cleanup
	r.endedAt = r.now().Add(-cleanupDelay - time.Millisecond)

	stopped = r.onTick()
	if !stopped {
		t.Fatalf("onTick debio retornar true al cumplirse cleanupDelay")
	}
	if !cleaned {
		t.Fatalf("onCleanup debio ejecutarse para remover la sala")
	}

	// Vaciar mensajes en buffer para comprobar que los canales están cerrados
	for len(outA) > 0 {
		<-outA
	}
	_, openOut := <-outA
	if openOut {
		t.Errorf("el canal outA debio cerrarse")
	}
}
