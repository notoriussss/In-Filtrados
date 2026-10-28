package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// matchEndedIn busca el MatchEnded que haya quedado en el canal.
func matchEndedIn(ch chan *matchv1.ServerEvent) *matchv1.MatchEnded {
	for {
		select {
		case ev := <-ch:
			if me := ev.GetMatchEnded(); me != nil {
				return me
			}
		default:
			return nil
		}
	}
}

func TestHostLeavingOnPurposeEndsTheMatchForEveryone(t *testing.T) {
	r, _, outs := graceRoom(t)
	store := &fakeStore{}
	r.store = store
	for _, out := range outs {
		drain(out)
	}

	r.handleAction(PlayerAction{PlayerID: "a", Leave: true})

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("la partida debe terminar, fase: %v", r.phase)
	}
	if store.finishes != 1 || store.winner != events.WinnerNone {
		t.Errorf(
			"debe guardarse sin ganador: finishes=%d winner=%q",
			store.finishes,
			store.winner,
		)
	}
	for _, id := range []string{"b", "c"} {
		me := matchEndedIn(outs[id])
		if me == nil {
			t.Fatalf("%s no recibió MatchEnded", id)
		}
		if me.Reason != events.ReasonHostLeft || me.Winner != "" {
			t.Errorf("%s: motivo=%q ganador=%q", id, me.Reason, me.Winner)
		}
	}
}

func TestHostLosingConnectionStillOnlyPausesTheRoom(t *testing.T) {
	r, clock, outs := graceRoom(t)

	disconnect(r, clock, "a", outs["a"])

	if r.phase != matchv1.Phase_PLAYING || !r.paused() {
		t.Errorf("sin conexión se espera al host: fase=%v", r.phase)
	}
}

func TestAnotherPlayerLeavingDoesNotEndTheMatch(t *testing.T) {
	r, _, _ := graceRoom(t)

	r.handleAction(PlayerAction{PlayerID: "b", Leave: true})

	if r.phase != matchv1.Phase_PLAYING {
		t.Errorf("solo el host cierra la sala, fase: %v", r.phase)
	}
}

func TestHostLeavingTheLobbyClosesTheRoom(t *testing.T) {
	r := NewRoom("TEST", "match-1", mapWithStations(), WithCreator("a"))
	outs := map[string]chan *matchv1.ServerEvent{}
	for _, id := range []string{"a", "b"} {
		outs[id] = make(chan *matchv1.ServerEvent, 8)
		r.addPlayer(Join{PlayerID: id, Out: outs[id]})
	}
	drain(outs["b"])

	r.handleAction(PlayerAction{PlayerID: "a", Leave: true})

	if r.phase != matchv1.Phase_ENDED {
		t.Fatalf("la sala debe cerrarse, fase: %v", r.phase)
	}
	me := matchEndedIn(outs["b"])
	if me == nil || me.Reason != events.ReasonHostLeft {
		t.Errorf("b debe saber que el host se fue: %+v", me)
	}
}
