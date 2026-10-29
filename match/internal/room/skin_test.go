package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

func pickSkin(r *Room, id, skin string) {
	r.handleAction(PlayerAction{PlayerID: id, PickSkin: true, Skin: skin})
}

func TestPlayersStartAsJimena(t *testing.T) {
	r := lobbyRoom()
	for _, id := range []string{"a", "b"} {
		if got := r.players[id].view.Skin; got != skinJimena {
			t.Errorf("player %s starts as %q", id, got)
		}
	}
}

func TestGotaNeedsToBeBought(t *testing.T) {
	r := lobbyRoom()
	pickSkin(r, "a", "gota")
	if got := r.players["a"].view.Skin; got != skinJimena {
		t.Errorf("an unbought gota was equipped: %s", got)
	}
}

func TestBoughtGotaCanBeEquippedAndUnequipped(t *testing.T) {
	r := lobbyRoom()
	color := r.players["a"].view.Color
	own(r, "a", gotaItemID(color))
	pickSkin(r, "a", "gota")
	if got := r.players["a"].view.Skin; got != skinGota {
		t.Fatalf("want gota, got %s", got)
	}
	pickSkin(r, "a", "jimena")
	if got := r.players["a"].view.Skin; got != skinJimena {
		t.Errorf("want jimena, got %s", got)
	}
}

func TestGotaIsOnlyForItsOwnColor(t *testing.T) {
	r := lobbyRoom()
	other := "#4363d8" // not the color "a" starts with
	own(r, "a", gotaItemID(other))
	pickSkin(r, "a", "gota")
	if got := r.players["a"].view.Skin; got != skinJimena {
		t.Fatalf("gota of another color was equipped: %s", got)
	}
	r.handleAction(PlayerAction{PlayerID: "a", PickColor: true, Color: other})
	pickSkin(r, "a", "gota")
	if got := r.players["a"].view.Skin; got != skinGota {
		t.Errorf("want gota after picking its color, got %s", got)
	}
}

func TestChangingToAnUnboughtColorDropsTheGota(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", gotaItemID(r.players["a"].view.Color))
	pickSkin(r, "a", "gota")
	r.handleAction(PlayerAction{
		PlayerID: "a", PickColor: true, Color: "#4363d8",
	})
	if got := r.players["a"].view.Skin; got != skinJimena {
		t.Errorf("want jimena after leaving the owned color, got %s", got)
	}
}

func TestPickSkinOutsideLobbyIsIgnored(t *testing.T) {
	r := lobbyRoom()
	own(r, "a", gotaItemID(r.players["a"].view.Color))
	r.phase = matchv1.Phase_PLAYING
	pickSkin(r, "a", "gota")
	if got := r.players["a"].view.Skin; got != skinJimena {
		t.Errorf("skin changed during the match: %s", got)
	}
}

func TestOwnedItemsComeBackWithTheJoin(t *testing.T) {
	r := lobbyRoom()
	color := r.players["a"].view.Color
	r.addPlayer(Join{
		PlayerID: "a",
		Out:      make(chan *matchv1.ServerEvent, 1),
		Owned:    []string{gotaItemID(color)},
	})
	pickSkin(r, "a", "gota")
	if got := r.players["a"].view.Skin; got != skinGota {
		t.Errorf("want gota after rejoining with it owned, got %s", got)
	}
}
