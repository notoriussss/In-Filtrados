package room

import (
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// latestSnapshot vacía el canal y devuelve el último snapshot recibido.
func latestSnapshot(out chan *matchv1.ServerEvent) *matchv1.Snapshot {
	var snap *matchv1.Snapshot
	for {
		select {
		case ev := <-out:
			if s := ev.GetSnapshot(); s != nil {
				snap = s
			}
		default:
			return snap
		}
	}
}

func TestSnapshotMatchEndsAtTick(t *testing.T) {
	r, out := lobbyWithPlayers(t, 4)
	setMinutes(r, "crew1", 5)

	r.broadcast()
	if got := latestSnapshot(out).GetMatchEndsAtTick(); got != 0 {
		t.Fatalf("en LOBBY no hay reloj: want 0, got %d", got)
	}

	r.handleAction(PlayerAction{PlayerID: "crew1", Start: true})
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la sala no paso a PLAYING")
	}
	r.broadcast()
	want := r.startTick + int64(5*time.Minute/tickInterval)
	snap := latestSnapshot(out)
	if got := snap.GetMatchEndsAtTick(); got != want {
		t.Fatalf("fin de la partida: want %d, got %d", want, got)
	}
	if left := snap.GetMatchEndsAtTick() - snap.GetTick(); left != 6000 {
		t.Errorf("faltan %d ticks, want 6000 (5 min)", left)
	}
}

func TestMatchTimeKeepsRunningInMeetingAndEndsAfterIt(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	r := setupPlayingRoom(
		t,
		[]string{"crew1", "crew2", "imp"},
		map[string]bool{"imp": true},
		pub,
		store,
		WithMatchDuration(4*time.Minute),
	)
	r.reservoir = 40
	r.tick = r.startTick + meetingCallGraceTicks
	r.handleCallMeeting("crew1")
	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("la reunion no empezo")
	}
	endsAt := r.matchEndsAtTick()
	if endsAt != r.startTick+4800 {
		t.Fatalf("el reloj debe seguir en la reunion: got %d", endsAt)
	}

	// El tiempo se acaba en plena reunion: la partida sigue en MEETING
	// hasta que termina el resultado y entonces ganan los infiltrados.
	r.tick = endsAt
	r.meeting.votingClosed = true
	r.meeting.resultEndsAt = endsAt + 5
	r.step()
	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("la reunion no se interrumpe, phase %v", r.phase)
	}
	r.tick = r.meeting.resultEndsAt
	r.step()
	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("sin tiempo debio terminar en ENDED")
	}
	me := r.ended.GetMatchEnded()
	if me.GetWinner() != events.WinnerImpostor {
		t.Errorf("ganador: want %s, got %s", events.WinnerImpostor, me.GetWinner())
	}
	if me.GetReason() != events.ReasonTimeOut {
		t.Errorf("motivo: want %s, got %s", events.ReasonTimeOut, me.GetReason())
	}
	if store.winner != events.WinnerImpostor {
		t.Errorf("la base guardo %s", store.winner)
	}
}
