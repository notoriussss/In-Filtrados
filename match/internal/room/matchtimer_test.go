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

// clockMeetingRoom arma una sala PLAYING de 4 minutos con la reunión ya
// convocada por crew1.
func clockMeetingRoom(
	t *testing.T,
	store *fakeStore,
) *Room {
	t.Helper()
	r := setupPlayingRoom(
		t,
		[]string{"crew1", "crew2", "imp"},
		map[string]bool{"imp": true},
		&fakePublisher{},
		store,
		WithMatchDuration(4*time.Minute),
	)
	r.reservoir = 40
	r.tick = r.startTick + meetingCallGraceTicks
	r.handleCallMeeting("crew1")
	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("la reunion no empezo")
	}
	return r
}

// tickOnce es lo que hace onTick sin pausa ni broadcast.
func tickOnce(r *Room) {
	r.step()
	r.tick++
}

func TestMatchClockStandsStillDuringAMeeting(t *testing.T) {
	r := clockMeetingRoom(t, &fakeStore{})
	left := r.matchEndsAtTick() - r.tick
	endsAt := r.matchEndsAtTick()

	for i := 0; i < 200; i++ {
		tickOnce(r)
		if got := r.matchEndsAtTick() - r.tick; got != left {
			t.Fatalf("tick %d: faltan %d ticks, want %d", i, got, left)
		}
	}
	if r.matchEndsAtTick() != endsAt+200 {
		t.Errorf("el fin debio correrse 200 ticks")
	}

	// Al volver a PLAYING el reloj retoma desde donde se quedo.
	r.phase = matchv1.Phase_PLAYING
	r.meeting = nil
	tickOnce(r)
	if got := r.matchEndsAtTick() - r.tick; got != left-1 {
		t.Errorf("tras la reunion faltan %d, want %d", got, left-1)
	}
}

func TestMatchTimeoutStillWorksAfterAMeeting(t *testing.T) {
	store := &fakeStore{}
	r := clockMeetingRoom(t, store)
	for i := 0; i < 100; i++ {
		tickOnce(r)
	}
	r.phase = matchv1.Phase_PLAYING
	r.meeting = nil

	r.tick = r.matchEndsAtTick() - 1
	tickOnce(r)
	tickOnce(r)
	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("sin tiempo debio terminar en ENDED")
	}
	me := r.ended.GetMatchEnded()
	if me.GetWinner() != events.WinnerImpostor ||
		me.GetReason() != events.ReasonTimeOut {
		t.Errorf("fin: %s/%s", me.GetWinner(), me.GetReason())
	}
	if store.winner != events.WinnerImpostor {
		t.Errorf("la base guardo %s", store.winner)
	}
}

func TestMeetingAtZeroPlaysOutAndThenTheImpostorsWin(t *testing.T) {
	r := clockMeetingRoom(t, &fakeStore{})
	// El tiempo ya estaba en 0 cuando empezo la reunion.
	r.meetingTicks = r.tick - r.startTick - 4800
	if left := r.matchEndsAtTick() - r.tick; left != 0 {
		t.Fatalf("faltan %d ticks, want 0", left)
	}
	tickOnce(r)
	if r.phase != matchv1.Phase_MEETING {
		t.Fatalf("la reunion no se interrumpe, phase %v", r.phase)
	}
	if left := r.matchEndsAtTick() - r.tick; left != 0 {
		t.Errorf("en reunion el reloj se queda en 0, got %d", left)
	}

	r.meeting.votingClosed = true
	r.meeting.resultEndsAt = r.tick
	tickOnce(r) // cierra la reunion; ese tick cuenta como de reunion
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la reunion debio cerrarse, phase %v", r.phase)
	}
	tickOnce(r)
	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("al volver a PLAYING debio terminar, phase %v", r.phase)
	}
	me := r.ended.GetMatchEnded()
	if me.GetWinner() != events.WinnerImpostor ||
		me.GetReason() != events.ReasonTimeOut {
		t.Errorf("fin: %s/%s", me.GetWinner(), me.GetReason())
	}
}
