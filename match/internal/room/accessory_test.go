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

func TestPickValidAccessory(t *testing.T) {
	r := lobbyRoom()
	pickAcc(r, "a", "STRAW-HAT") // mayúsculas: se normaliza a minúsculas
	if got := r.players["a"].view.Accessory; got != "straw-hat" {
		t.Errorf("want straw-hat, got %s", got)
	}
}

func TestMultiplePlayersCanShareSameAccessory(t *testing.T) {
	r := lobbyRoom()
	pickAcc(r, "a", "headphones")
	pickAcc(r, "b", "headphones")
	if r.players["a"].view.Accessory != "headphones" ||
		r.players["b"].view.Accessory != "headphones" {
		t.Errorf("expected both players to share headphones accessory")
	}
}

func TestPickUnknownAccessoryIsIgnored(t *testing.T) {
	r := lobbyRoom()
	initial := r.players["a"].view.Accessory
	pickAcc(r, "a", "unknown_hat")
	if got := r.players["a"].view.Accessory; got != initial {
		t.Errorf("want %s, got %s", initial, got)
	}
}

func TestPickAccessoryOutsideLobbyIsIgnored(t *testing.T) {
	r := lobbyRoom()
	initial := r.players["a"].view.Accessory
	r.phase = matchv1.Phase_PLAYING
	pickAcc(r, "a", "diving-mask")
	if got := r.players["a"].view.Accessory; got != initial {
		t.Errorf("want %s, got %s", initial, got)
	}
}

func TestDefaultAccessoryAssignedOnJoin(t *testing.T) {
	r := lobbyRoom()
	// "a" recibe color[0] ("#e6194b" -> cap)
	// "b" recibe color[1] ("#3cb44b" -> sprout)
	if got := r.players["a"].view.Accessory; got != "cap" {
		t.Errorf("want cap for player a, got %s", got)
	}
	if got := r.players["b"].view.Accessory; got != "sprout" {
		t.Errorf("want sprout for player b, got %s", got)
	}
}
