package room

import (
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

func meetingRoom(t *testing.T) (*Room, map[string]chan *matchv1.Snapshot) {
	t.Helper()
	r, _, outs := graceRoom(t)
	r.phase = matchv1.Phase_MEETING
	r.meeting = &meetingState{
		votes:        make(map[string]voteChoice),
		votingEndsAt: r.tick + meetingVotingTicks,
	}
	return r, outs
}

func TestChatWithASeenClientMsgIDIsDropped(t *testing.T) {
	r, _ := meetingRoom(t)
	r.handleChat("a", "id-1", "hola")
	r.tick += chatCooldownTicks
	r.handleChat("a", "id-1", "hola") // reintento al reconectar
	if len(r.chat) != 1 {
		t.Fatalf("el reintento se duplicó: %d mensajes", len(r.chat))
	}

	// Ni en la reunión siguiente, cuando el chat ya se vació.
	r.chat = nil
	r.tick += chatCooldownTicks
	r.handleChat("a", "id-1", "hola")
	if len(r.chat) != 0 {
		t.Error("un id ya visto en la partida se descarta siempre")
	}
	r.handleChat("a", "id-2", "otro")
	if len(r.chat) != 1 {
		t.Error("un id nuevo sí entra")
	}
}

func TestChatWithoutClientMsgIDIsDropped(t *testing.T) {
	r, _ := meetingRoom(t)
	r.handleChat("a", "", "hola")
	if len(r.chat) != 0 {
		t.Error("sin client_msg_id no se acepta")
	}
}

func TestSeenChatIDsSurviveARestore(t *testing.T) {
	r, _ := meetingRoom(t)
	r.handleChat("a", "id-1", "hola")
	saver := &fakeSaver{}
	r.snapshots = saver
	r.savedKey = ""
	r.maybeSave()

	got, err := Restore(saver.last().state, mapWithStations())
	if err != nil {
		t.Fatal(err)
	}
	got.chat = nil
	got.addPlayer(Join{PlayerID: "a", Out: make(chan *matchv1.Snapshot, 8)})
	got.addPlayer(Join{PlayerID: "b", Out: make(chan *matchv1.Snapshot, 8)})
	got.addPlayer(Join{PlayerID: "c", Out: make(chan *matchv1.Snapshot, 8)})
	got.tick += chatCooldownTicks
	got.handleChat("a", "id-1", "hola")
	if len(got.chat) != 0 {
		t.Error("tras reiniciar match, el id ya visto se sigue descartando")
	}
}

func TestDisconnectAndReconnectArePublished(t *testing.T) {
	r, clock, outs := graceRoom(t)
	pub := &fakePublisher{}
	r.publisher = pub

	leftAt := clock.now()
	disconnect(r, clock, "b", outs["b"])
	got := waitForEvents(t, pub, events.RoutingKeyPlayerDisconnected, 1)
	ev := got[0].payload.(events.PlayerDisconnected)
	// Ya pasó 1 s de espera: le quedan 89 de los 90.
	if ev.PlayerID != "b" || ev.MatchID != "match-1" ||
		ev.GraceSeconds != 89 || ev.DisplayName == "" {
		t.Errorf("evento incompleto: %+v", ev)
	}
	want := leftAt.Add(90 * time.Second).UTC().Format(time.RFC3339)
	if ev.GraceEndsAt != want {
		t.Errorf("grace_ends_at = %s, quiero %s", ev.GraceEndsAt, want)
	}

	r.addPlayer(Join{PlayerID: "b", Out: make(chan *matchv1.Snapshot, 8)})
	back := waitForEvents(t, pub, events.RoutingKeyPlayerReconnected, 1)
	if back[0].payload.(events.PlayerReconnected).PlayerID != "b" {
		t.Error("player.reconnected sin el jugador")
	}
}

func TestLobbyDisconnectIsNotPublished(t *testing.T) {
	pub := &fakePublisher{}
	r := NewRoom("TEST", "match-1", mapWithStations(), WithPublisher(pub))
	out := make(chan *matchv1.Snapshot, 1)
	r.addPlayer(Join{PlayerID: "a", Out: out})
	r.removePlayer(Leave{PlayerID: "a", Out: out})
	r.addPlayer(Join{PlayerID: "a", Out: out})
	time.Sleep(50 * time.Millisecond)
	if len(pub.forKey(events.RoutingKeyPlayerDisconnected)) != 0 ||
		len(pub.forKey(events.RoutingKeyPlayerReconnected)) != 0 {
		t.Error("en la sala de espera no hay periodo de gracia que avisar")
	}
}
