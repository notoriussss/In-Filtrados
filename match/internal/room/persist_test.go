package room

import (
	"sync"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// fakeSaver guarda en memoria lo que la sala manda a escribir.
type fakeSaver struct {
	mu    sync.Mutex
	saves []savedCall
}

type savedCall struct {
	matchID string
	tick    int64
	state   []byte
}

func (f *fakeSaver) Save(matchID string, tick int64, state []byte) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.saves = append(f.saves, savedCall{matchID, tick, state})
}

func (f *fakeSaver) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.saves)
}

func (f *fakeSaver) last() savedCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.saves[len(f.saves)-1]
}

func TestPauseFreezesTheRoomWhileSomeoneIsInGrace(t *testing.T) {
	r, clock, outs := graceRoom(t)
	imp := r.players["a"]
	imp.role = matchv1.Role_IMPOSTOR
	b := r.players["b"]
	b.dx = 1 // b camina a la derecha
	for i := 0; i < 5; i++ {
		r.onTick()
	}
	tick := r.tick
	x := b.view.X

	disconnect(r, clock, "c", outs["c"])
	if !r.paused() {
		t.Fatal("con un jugador en gracia la sala debe pausarse")
	}
	drain(outs["a"])
	for i := 0; i < 200; i++ { // 10 s de pausa
		r.onTick()
	}
	if r.tick != tick {
		t.Errorf("el tick avanzó en pausa: %d → %d", tick, r.tick)
	}
	if b.view.X != x {
		t.Error("nadie se mueve en pausa")
	}

	// En pausa se ignoran las acciones, salvo la dirección.
	r.handleAction(PlayerAction{PlayerID: "b", DX: 0, DY: 0})
	if b.dx != 0 {
		t.Error("la dirección sí se guarda en pausa")
	}
	r.handleAction(PlayerAction{
		PlayerID: "a", Contaminate: true, TankSlot: 1,
	})
	if imp.pending != nil {
		t.Error("contaminar debe ignorarse en pausa")
	}

	snap := waitSnapshot(t, outs["a"])
	if !snap.Paused || len(snap.WaitingFor) != 1 ||
		snap.WaitingFor[0] != "c" {
		t.Errorf("el snapshot debe decir a quién se espera: %v %v",
			snap.Paused, snap.WaitingFor)
	}

	r.addPlayer(Join{PlayerID: "c", Out: make(chan *matchv1.Snapshot, 8)})
	if r.paused() {
		t.Fatal("al volver c la sala sigue")
	}
	r.onTick()
	if r.tick != tick+1 {
		t.Errorf("el tick debe seguir donde quedó: %d", r.tick)
	}
}

func TestPausedTimeDoesNotCountForTheMatchClock(t *testing.T) {
	r, clock, outs := graceRoom(t)
	r.matchDuration = 10 * tickInterval
	disconnect(r, clock, "c", outs["c"])
	for i := 0; i < 100; i++ {
		r.onTick()
	}
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatal("la partida terminó durante la pausa")
	}
}

func TestLobbyIsNeverPaused(t *testing.T) {
	r := NewRoom("TEST", "match-1", mapWithStations())
	out := make(chan *matchv1.Snapshot, 1)
	r.addPlayer(Join{PlayerID: "a", Out: out})
	r.removePlayer(Leave{PlayerID: "a", Out: out})
	if r.paused() {
		t.Error("la sala de espera no se pausa")
	}
}

func TestSavesOnPhaseChangeAndEveryTwoSeconds(t *testing.T) {
	saver := &fakeSaver{}
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithStations(),
		WithCreator("a"),
		WithSnapshots(saver),
	)
	for _, id := range []string{"a", "b"} {
		r.addPlayer(Join{
			PlayerID: id,
			Out:      make(chan *matchv1.Snapshot, 64),
		})
	}
	for i := 0; i < 50; i++ {
		r.onTick()
	}
	if saver.count() != 0 {
		t.Fatal("la sala de espera no se guarda")
	}

	r.startMatch("a")
	r.onTick()
	if saver.count() != 1 {
		t.Fatalf("el inicio se guarda en el acto: %d", saver.count())
	}
	for i := 0; i < saveEveryTicks-2; i++ {
		r.onTick()
	}
	if saver.count() != 1 {
		t.Fatalf("antes de 2 s no se guarda de nuevo: %d", saver.count())
	}
	r.onTick()
	r.onTick()
	if saver.count() != 2 {
		t.Fatalf("a los 2 s se guarda otra vez: %d", saver.count())
	}

	r.phase = matchv1.Phase_MEETING // un cambio de fase no espera
	r.meeting = &meetingState{votes: map[string]voteChoice{}}
	r.onTick()
	if saver.count() != 3 {
		t.Fatalf("el cambio de fase se guarda en el acto: %d", saver.count())
	}
	if got := saver.last(); got.matchID != "match-1" || got.tick != r.tick {
		t.Errorf("instantánea con datos equivocados: %+v", got)
	}
}

func TestRestoreBringsBackTheMatchPausedAndComplete(t *testing.T) {
	r, _, _ := graceRoom(t)
	a := r.players["a"]
	a.view.X, a.view.Y = 333, 222
	a.tasksCompleted = 2
	r.reservoir = 37
	r.tick = 1234
	r.tanks[0].contamination = 70
	r.phase = matchv1.Phase_MEETING
	r.meeting = &meetingState{
		reporterID:   "b",
		tankSlot:     1,
		lastVisitors: []string{"a", "c"},
		votes:        map[string]voteChoice{"a": {targetID: "c"}},
		votingEndsAt: 1500,
	}
	r.chat = []chatEntry{{id: "m1", playerID: "b", text: "fui yo?", tick: 1200}}
	r.oilDrops = []*oilDrop{{x: 1, y: 2, color: "#fff", expiresAt: 1300}}
	r.eventHistory = []LogEntry{{PlayerID: "a", Kind: LogVisit, TankSlot: 1}}
	saver := &fakeSaver{}
	r.snapshots = saver
	r.savedKey = ""
	r.maybeSave()

	clock := &fakeClock{t: time.Unix(1_800_000_000, 0)}
	got, err := Restore(
		saver.last().state,
		mapWithStations(),
		WithClock(clock.now),
		WithGracePeriod(time.Minute),
	)
	if err != nil {
		t.Fatal(err)
	}

	if got.Code != "TEST" || got.MatchID != "match-1" ||
		got.creatorID != "a" {
		t.Error("cambió la identidad de la sala")
	}
	if got.phase != matchv1.Phase_MEETING || got.tick != 1234 ||
		got.reservoir != 37 {
		t.Error("cambió la fase, el tick o el embalse")
	}
	ra := got.players["a"]
	if ra.view.X != 333 || ra.view.Y != 222 || ra.role != a.role ||
		ra.tasksCompleted != 2 ||
		len(ra.assignedTasks) != len(a.assignedTasks) ||
		ra.tankSlot != a.tankSlot {
		t.Errorf("el jugador no volvió igual: %+v", ra)
	}
	if got.tankAt(r.tanks[0].slot).contamination != 70 {
		t.Error("cambió la contaminación")
	}
	if got.meeting == nil || got.meeting.votes["a"].targetID != "c" ||
		got.meeting.votingEndsAt != 1500 {
		t.Error("cambió la reunión")
	}
	if len(got.chat) != 1 || got.chat[0].text != "fui yo?" {
		t.Error("se perdió el chat")
	}
	if len(got.oilDrops) != 1 || len(got.eventHistory) != 1 {
		t.Error("se perdieron las gotas o el historial de visitas")
	}

	// Todos desconectados y en gracia: la sala espera en pausa.
	if !got.paused() || len(got.waitingFor()) != 3 {
		t.Fatalf("debe arrancar en pausa esperando a los 3")
	}
	for _, id := range []string{"a", "b", "c"} {
		got.addPlayer(Join{
			PlayerID: id,
			Out:      make(chan *matchv1.Snapshot, 8),
		})
	}
	if got.paused() {
		t.Error("con los 3 de vuelta la sala sigue")
	}
	if len(got.players) != 3 {
		t.Error("se duplicaron jugadores al volver")
	}
}

func TestRestoreRejectsBrokenState(t *testing.T) {
	if _, err := Restore([]byte("{no"), mapWithStations()); err == nil {
		t.Error("una instantánea dañada debe dar error")
	}
}

// waitSnapshot toma el último snapshot del canal.
func waitSnapshot(
	t *testing.T,
	ch chan *matchv1.Snapshot,
) *matchv1.Snapshot {
	t.Helper()
	var last *matchv1.Snapshot
	for {
		select {
		case s := <-ch:
			last = s
		default:
			if last == nil {
				t.Fatal("no hay snapshots")
			}
			return last
		}
	}
}
