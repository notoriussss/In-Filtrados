package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// lobbyRoom arma una sala en LOBBY con "a" (colors[0]) y "b" (colors[1]),
// sin goroutine: las pruebas llaman a handleAction directo.
func lobbyRoom() *Room {
	r := NewRoom("TEST", "match-1", testMap())
	r.addPlayer(Join{PlayerID: "a", Out: make(chan *matchv1.ServerEvent, 1)})
	r.addPlayer(Join{PlayerID: "b", Out: make(chan *matchv1.ServerEvent, 1)})
	return r
}

func pick(r *Room, id, color string) {
	r.handleAction(PlayerAction{PlayerID: id, PickColor: true, Color: color})
}

func TestPickFreeColor(t *testing.T) {
	r := lobbyRoom()
	pick(r, "a", "#4363D8") // mayúsculas: se guarda en minúsculas
	if got := r.players["a"].view.Color; got != colors[3] {
		t.Errorf("want %s, got %s", colors[3], got)
	}
}

func TestPickColorOfConnectedPlayerIsIgnored(t *testing.T) {
	r := lobbyRoom()
	pick(r, "a", colors[1])
	if got := r.players["a"].view.Color; got != colors[0] {
		t.Errorf("want %s, got %s", colors[0], got)
	}
}

func TestPickColorOfDisconnectedPlayer(t *testing.T) {
	r := lobbyRoom()
	r.players["b"].view.Connected = false
	pick(r, "a", colors[1])
	if got := r.players["a"].view.Color; got != colors[1] {
		t.Errorf("want %s, got %s", colors[1], got)
	}
}

func TestPickUnknownColorIsIgnored(t *testing.T) {
	r := lobbyRoom()
	pick(r, "a", "#000000")
	if got := r.players["a"].view.Color; got != colors[0] {
		t.Errorf("want %s, got %s", colors[0], got)
	}
}

func TestPickColorOutsideLobbyIsIgnored(t *testing.T) {
	r := lobbyRoom()
	r.phase = matchv1.Phase_PLAYING
	pick(r, "a", colors[3])
	if got := r.players["a"].view.Color; got != colors[0] {
		t.Errorf("want %s, got %s", colors[0], got)
	}
}
