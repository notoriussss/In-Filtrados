package room

import (
	"fmt"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// lobbyWithPlayers arma una sala en LOBBY con n jugadores; crew1 es el
// creador y devuelve su canal.
func lobbyWithPlayers(
	t *testing.T,
	n int,
) (*Room, chan *matchv1.ServerEvent) {
	t.Helper()
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithManyStations(),
		WithCreator("crew1"),
	)
	creatorOut := make(chan *matchv1.ServerEvent, 8)
	r.addPlayer(Join{PlayerID: "crew1", Out: creatorOut})
	for i := 1; i < n; i++ {
		r.addPlayer(Join{
			PlayerID: fmt.Sprintf("p%d", i),
			Out:      make(chan *matchv1.ServerEvent, 8),
		})
	}
	return r, creatorOut
}

func setImpostors(r *Room, playerID string, n int32) {
	r.handleAction(PlayerAction{
		PlayerID:         playerID,
		SetImpostorCount: true,
		ImpostorCount:    n,
	})
}

func setMinutes(r *Room, playerID string, n int32) {
	r.handleAction(PlayerAction{
		PlayerID:        playerID,
		SetMatchMinutes: true,
		MatchMinutes:    n,
	})
}

func TestMaxImpostorsIsHalfThePlayersMinusOne(t *testing.T) {
	cases := []struct{ players, want int }{
		{2, 1}, {3, 1}, {4, 1}, {5, 2}, {6, 2},
		{7, 3}, {8, 3}, {9, 4}, {10, 4},
	}
	for _, c := range cases {
		if got := maxImpostors(c.players); got != c.want {
			t.Errorf("%d jugadores: want %d, got %d", c.players, c.want, got)
		}
	}
}

func TestImpostorsDefaultKeepsTheOldRule(t *testing.T) {
	for players, want := range map[int]int{2: 1, 6: 1, 7: 2, 10: 2} {
		r, _ := lobbyWithPlayers(t, players)
		if got := r.impostorsNow(); got != want {
			t.Errorf("%d jugadores: want %d, got %d", players, want, got)
		}
	}
}

func TestImpostorCountAcceptsUpToTheLimit(t *testing.T) {
	r, _ := lobbyWithPlayers(t, 9)
	for _, n := range []int32{1, 2, 4} {
		setImpostors(r, "crew1", n)
		if got := r.impostorsNow(); got != int(n) {
			t.Errorf("want %d, got %d", n, got)
		}
	}
}

func TestImpostorCountRejectsOutOfRange(t *testing.T) {
	for _, n := range []int32{-1, 0, 5, 100} {
		r, out := lobbyWithPlayers(t, 9)
		setImpostors(r, "crew1", n)
		if r.impostors != 0 {
			t.Errorf("%d: value changed to %d", n, r.impostors)
		}
		e := (<-out).GetError()
		if e == nil || e.Code != ErrCodeInvalidImpostorCount {
			t.Errorf("%d: want %s, got %v", n, ErrCodeInvalidImpostorCount, e)
		}
	}
}

func TestImpostorCountIsClippedWhenPlayersLeave(t *testing.T) {
	r, _ := lobbyWithPlayers(t, 9)
	setImpostors(r, "crew1", 4)
	for i := 1; i <= 5; i++ {
		delete(r.players, fmt.Sprintf("p%d", i))
	}
	if got := r.impostorsNow(); got != 1 {
		t.Fatalf("4 jugadores: want 1 impostor, got %d", got)
	}
}

func TestImpostorCountOnlyCreatorInLobby(t *testing.T) {
	r, _ := lobbyWithPlayers(t, 9)
	setImpostors(r, "p1", 3)
	if r.impostors != 0 {
		t.Fatalf("a guest changed the count to %d", r.impostors)
	}
	r.phase = matchv1.Phase_PLAYING
	setImpostors(r, "crew1", 3)
	if r.impostors != 0 {
		t.Fatalf("changed outside LOBBY to %d", r.impostors)
	}
}

func TestMatchStartsWithTheChosenImpostors(t *testing.T) {
	for _, n := range []int32{1, 2, 3} {
		r, _ := lobbyWithPlayers(t, 8)
		setImpostors(r, "crew1", n)
		r.startMatch("crew1")
		if r.phase != matchv1.Phase_PLAYING {
			t.Fatalf("la partida no empezó")
		}
		got := 0
		for _, p := range r.players {
			if p.role == matchv1.Role_IMPOSTOR {
				got++
			}
		}
		if got != int(n) {
			t.Errorf("want %d impostors, got %d", n, got)
		}
	}
}

func TestMatchMinutesDefaultsToEight(t *testing.T) {
	r, _ := lobbyWithPlayers(t, 2)
	if r.matchDuration != 8*time.Minute {
		t.Fatalf("want 8 min, got %v", r.matchDuration)
	}
}

func TestMatchMinutesAcceptsLimits(t *testing.T) {
	for _, n := range []int32{4, 8, 12} {
		r, _ := lobbyWithPlayers(t, 2)
		setMinutes(r, "crew1", n)
		if r.matchDuration != time.Duration(n)*time.Minute {
			t.Errorf("want %d min, got %v", n, r.matchDuration)
		}
	}
}

func TestMatchMinutesRejectsOutOfRange(t *testing.T) {
	for _, n := range []int32{-1, 0, 3, 13, 60} {
		r, out := lobbyWithPlayers(t, 2)
		setMinutes(r, "crew1", n)
		if r.matchDuration != defaultMatchDuration {
			t.Errorf("%d: duration changed to %v", n, r.matchDuration)
		}
		e := (<-out).GetError()
		if e == nil || e.Code != ErrCodeInvalidMatchDuration {
			t.Errorf("%d: want %s, got %v", n, ErrCodeInvalidMatchDuration, e)
		}
	}
}

func TestMatchMinutesOnlyCreatorInLobby(t *testing.T) {
	r, _ := lobbyWithPlayers(t, 2)
	setMinutes(r, "p1", 12)
	if r.matchDuration != defaultMatchDuration {
		t.Fatalf("a guest changed the duration to %v", r.matchDuration)
	}
	r.phase = matchv1.Phase_PLAYING
	setMinutes(r, "crew1", 12)
	if r.matchDuration != defaultMatchDuration {
		t.Fatalf("changed outside LOBBY to %v", r.matchDuration)
	}
}

func TestSnapshotCarriesImpostorsAndMinutes(t *testing.T) {
	r, out := lobbyWithPlayers(t, 9)
	setImpostors(r, "crew1", 3)
	setMinutes(r, "crew1", 10)
	r.broadcast()
	snap := drain(out)
	if snap == nil || snap.Impostors != 3 || snap.MatchMinutes != 10 {
		t.Fatalf("want 3 impostors and 10 min, got %v", snap)
	}
}

func TestMatchConfigIsSaved(t *testing.T) {
	r, _ := lobbyWithPlayers(t, 9)
	setImpostors(r, "crew1", 3)
	setMinutes(r, "crew1", 10)
	s := r.toSaved()
	if s.Impostors != 3 || s.MatchMinutes != 10 {
		t.Fatalf("saved %d impostors, %d min", s.Impostors, s.MatchMinutes)
	}
}
