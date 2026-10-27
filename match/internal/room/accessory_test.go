package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

func pickAcc(r *Room, id, acc string) {
	r.handleAction(PlayerAction{
		PlayerID:      id,
		PickAccessory: true,
		Accessory:     acc,
	})
}

// own le da a un jugador los artículos de la tienda (lo que haría players).
func own(r *Room, id string, items ...string) {
	r.handleAction(PlayerAction{PlayerID: id, SetOwned: true, Owned: items})
}

func TestPickOwnedAccessory(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", "straw-hat")
	pickAcc(r, "a", "STRAW-HAT") // mayúsculas: se normaliza a minúsculas
	if got := r.players["a"].view.Accessory; got != "straw-hat" {
		t.Errorf("want straw-hat, got %s", got)
	}
}

func TestPickLockedAccessoryIsIgnored(t *testing.T) {
	r := lobbyRoom()
	pickAcc(r, "a", "helmet")
	if got := r.players["a"].view.Accessory; got != "" {
		t.Errorf("a locked accessory was equipped: %s", got)
	}
}

func TestAccessoryCanBeRemoved(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", "cap")
	pickAcc(r, "a", "cap")
	pickAcc(r, "a", "none")
	if got := r.players["a"].view.Accessory; got != "" {
		t.Errorf("want no accessory, got %s", got)
	}
}

func TestMultiplePlayersCanShareSameAccessory(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", "headphones")
	own(r, "b", "headphones")
	pickAcc(r, "a", "headphones")
	pickAcc(r, "b", "headphones")
	if r.players["a"].view.Accessory != "headphones" ||
		r.players["b"].view.Accessory != "headphones" {
		t.Errorf("expected both players to share headphones accessory")
	}
}

func TestPickUnknownAccessoryIsIgnored(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", "unknown_hat")
	pickAcc(r, "a", "unknown_hat")
	if got := r.players["a"].view.Accessory; got != "" {
		t.Errorf("want no accessory, got %s", got)
	}
}

func TestPickAccessoryOutsideLobbyIsIgnored(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", "diving-mask")
	r.phase = matchv1.Phase_PLAYING
	pickAcc(r, "a", "diving-mask")
	if got := r.players["a"].view.Accessory; got != "" {
		t.Errorf("want no accessory, got %s", got)
	}
}

func TestNoAccessoryOnJoin(t *testing.T) {
	r := lobbyRoom()
	for _, id := range []string{"a", "b"} {
		if got := r.players[id].view.Accessory; got != "" {
			t.Errorf("player %s starts with accessory %q", id, got)
		}
	}
}
