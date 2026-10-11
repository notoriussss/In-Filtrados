package room

import (
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// fakeClock es un reloj que los tests adelantan a mano.
type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time          { return c.t }
func (c *fakeClock) advance(d time.Duration) { c.t = c.t.Add(d) }

// graceRoom: 3 jugadores en PLAYING, con reloj falso y 90 s de gracia.
func graceRoom(
	t *testing.T,
) (*Room, *fakeClock, map[string]chan *matchv1.Snapshot) {
	t.Helper()
	clock := &fakeClock{t: time.Unix(1_700_000_000, 0)}
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithStations(),
		WithCreator("a"),
		WithClock(clock.now),
		WithGracePeriod(90*time.Second),
	)
	outs := make(map[string]chan *matchv1.Snapshot)
	for _, id := range []string{"a", "b", "c"} {
		outs[id] = make(chan *matchv1.Snapshot, 8)
		r.addPlayer(Join{PlayerID: id, Out: outs[id]})
	}
	r.startMatch("a")
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la partida no empezó")
	}
	return r, clock, outs
}

// disconnect corta el stream de id y deja pasar la espera de 1 s: el
// jugador queda en su periodo de gracia.
func disconnect(
	r *Room,
	clock *fakeClock,
	id string,
	out chan *matchv1.Snapshot,
) {
	r.removePlayer(Leave{PlayerID: id, Out: out})
	clock.advance(disconnectDebounce)
	r.updateGrace()
}

func TestASocketSwapIsNotADisconnection(t *testing.T) {
	r, clock, outs := graceRoom(t)
	pub := &fakePublisher{}
	r.publisher = pub
	// La página cierra el socket de la sala de espera y abre el de la
	// partida: entre uno y otro pasan unos milisegundos.
	r.removePlayer(Leave{PlayerID: "a", Out: outs["a"]})
	clock.advance(200 * time.Millisecond)
	r.updateGrace()
	if r.paused() {
		t.Error("un corte de 200 ms no pausa la sala")
	}
	r.addPlayer(Join{PlayerID: "a", Out: make(chan *matchv1.Snapshot, 8)})
	clock.advance(5 * time.Second)
	r.updateGrace()
	if r.paused() || len(pub.forKey(events.RoutingKeyPlayerDisconnected)) > 0 {
		t.Error("ni pausa ni aviso al monitor por cambiar de socket")
	}
}

func TestDisconnectedPlayerKeepsEverythingWithinGrace(t *testing.T) {
	r, clock, outs := graceRoom(t)
	b := r.players["b"]
	b.view.X, b.view.Y = 300, 250
	role := b.role
	tasks := len(b.assignedTasks)
	tank := b.tankSlot

	r.removePlayer(Leave{PlayerID: "b", Out: outs["b"]})
	if b.view.Connected {
		t.Fatal("debe quedar connected: false")
	}
	clock.advance(30 * time.Second) // 30 s sin wifi
	r.updateGrace()

	back := make(chan *matchv1.Snapshot, 8)
	r.addPlayer(Join{PlayerID: "b", Out: back})

	if !b.view.Connected || !b.view.Alive {
		t.Fatalf("al volver debe estar conectado y vivo: %+v", b.view)
	}
	if b.view.X != 300 || b.view.Y != 250 {
		t.Errorf("cambió de posición: %v,%v", b.view.X, b.view.Y)
	}
	if b.role != role ||
		len(b.assignedTasks) != tasks ||
		b.tankSlot != tank {
		t.Error("perdió su rol, sus tareas o su tanque")
	}
	if len(r.players) != 3 {
		t.Errorf("hay %d jugadores, se duplicó", len(r.players))
	}
}

func TestGraceExpiredTurnsIntoGhost(t *testing.T) {
	r, clock, outs := graceRoom(t)
	r.removePlayer(Leave{PlayerID: "c", Out: outs["c"]})

	clock.advance(89 * time.Second)
	r.updateGrace()
	if !r.players["c"].view.Alive {
		t.Fatal("pasó a fantasma antes de tiempo")
	}

	clock.advance(time.Second)
	r.updateGrace()
	if r.players["c"].view.Alive {
		t.Fatal("a los 90 s debe pasar a fantasma")
	}

	// Si vuelve tarde, sigue en la partida pero como fantasma.
	late := make(chan *matchv1.Snapshot, 8)
	r.addPlayer(Join{PlayerID: "c", Out: late})
	if r.players["c"].view.Alive || !r.players["c"].view.Connected {
		t.Error("al volver tarde sigue como fantasma conectado")
	}
}

func TestLobbyDisconnectHasNoGrace(t *testing.T) {
	r := NewRoom("TEST", "match-1", mapWithStations())
	out := make(chan *matchv1.Snapshot, 1)
	r.addPlayer(Join{PlayerID: "a", Out: out})
	r.removePlayer(Leave{PlayerID: "a", Out: out})
	if !r.players["a"].graceUntil.IsZero() {
		t.Error("en LOBBY no hay periodo de gracia")
	}
}

func TestStaleStreamCannotDisconnectAResumedPlayer(t *testing.T) {
	r, _, outs := graceRoom(t)
	back := make(chan *matchv1.Snapshot, 8)
	// Reconecta antes de que el stream viejo termine de cerrar.
	r.addPlayer(Join{PlayerID: "a", Out: back})
	r.removePlayer(Leave{PlayerID: "a", Out: outs["a"]})
	if !r.players["a"].view.Connected {
		t.Error("el stream viejo no debe desconectar al nuevo")
	}
}

func TestResumeSendsAFullSnapshotRightAway(t *testing.T) {
	r, _, outs := graceRoom(t)
	r.phase = matchv1.Phase_MEETING
	r.meeting = &meetingState{
		reporterID: "a",
		votes:      map[string]voteChoice{"a": {skip: true}},
	}
	r.chat = []chatEntry{{id: "m1", playerID: "a", text: "hola", tick: 3}}
	r.removePlayer(Leave{PlayerID: "b", Out: outs["b"]})

	back := make(chan *matchv1.Snapshot, 8)
	r.addPlayer(Join{PlayerID: "b", Out: back}) // sin esperar al ticker

	select {
	case snap := <-back:
		if snap.Phase != matchv1.Phase_MEETING || snap.Meeting == nil {
			t.Error("falta el estado de la reunión")
		}
		if len(snap.Chat) != 1 || snap.Chat[0].Text != "hola" {
			t.Errorf("falta el chat: %v", snap.Chat)
		}
		if snap.MyRole != r.players["b"].role {
			t.Error("falta su rol")
		}
		want := int32(len(r.players["b"].assignedTasks))
		if want == 0 || snap.MyTaskProgress.GetTotal() != want {
			t.Errorf("faltan sus tareas: %v", snap.MyTaskProgress)
		}
	default:
		t.Fatal("no recibió el snapshot de inmediato")
	}
}

func TestDisconnectedVoterCountsAsSkip(t *testing.T) {
	r, _, outs := graceRoom(t)
	r.phase = matchv1.Phase_MEETING
	r.meeting = &meetingState{
		reporterID:   "a",
		votes:        make(map[string]voteChoice),
		votingEndsAt: r.tick + meetingVotingTicks,
	}
	r.handleVote("a", "b", false)
	r.removePlayer(Leave{PlayerID: "c", Out: outs["c"]})

	r.closeVoting()

	// a vota por b y c (desconectado) cuenta como saltar: 1 a 1, nadie
	// sale. Sin la regla, b saldría con 1 voto contra 0.
	if r.meeting.ejectedID != "" {
		t.Errorf("no debía salir nadie, salió %q", r.meeting.ejectedID)
	}
	if v, ok := r.meeting.votes["c"]; !ok || !v.skip {
		t.Error("el voto de c debe contar como skip")
	}
	if _, ok := r.meeting.votes["b"]; ok {
		t.Error("b está conectado: no se le inventa un voto")
	}
}

func TestGhostDisconnectDoesNotPause(t *testing.T) {
	r, clock, outs := graceRoom(t)
	// c ya es un fantasma (expulsado o tanque muerto)
	r.players["c"].view.Alive = false

	disconnect(r, clock, "c", outs["c"])
	if r.paused() {
		t.Fatal("un fantasma desconectado no debe pausar la sala")
	}
	if len(r.waitingFor()) != 0 {
		t.Fatalf(
			"waitingFor no debe incluir al fantasma: %v",
			r.waitingFor(),
		)
	}
}

func TestRestoreRoomWithGhostDoesNotWaitForGhost(t *testing.T) {
	r, _, _ := graceRoom(t)
	// c es fantasma
	r.players["c"].view.Alive = false
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

	// Solo los vivos ("a" y "b") deben estar en espera
	wf := got.waitingFor()
	if len(wf) != 2 || wf[0] != "a" || wf[1] != "b" {
		t.Fatalf("solo los vivos deben estar en espera, got: %v", wf)
	}
	if !got.players["c"].leftAt.IsZero() ||
		!got.players["c"].graceUntil.IsZero() {
		t.Error("el fantasma no debe tener gracia asignada al restaurar")
	}
}

func TestGraceExpiryDuringMeetingClosesVotingIfAllAliveVoted(t *testing.T) {
	r, clock, outs := graceRoom(t)
	r.phase = matchv1.Phase_MEETING
	r.meeting = &meetingState{
		reporterID:   "a",
		votes:        make(map[string]voteChoice),
		votingEndsAt: r.tick + meetingVotingTicks,
	}
	// "a" y "b" votan
	r.handleVote("a", "b", false)
	r.handleVote("b", "a", false)

	// "c" se desconecta y entra en gracia
	disconnect(r, clock, "c", outs["c"])
	if r.meeting.votingClosed {
		t.Fatal("la votación no debe cerrarse mientras c está en gracia")
	}

	// Pasa el tiempo de gracia completo: c vence y pasa a fantasma
	clock.advance(r.grace + time.Second)
	r.updateGrace()

	if !r.meeting.votingClosed {
		t.Fatal("al vencer c y quedar 2/2 votos, debe cerrarse la votación")
	}
}
