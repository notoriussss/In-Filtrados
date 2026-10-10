package room

import (
	"context"
	"crypto/rand"
	"fmt"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// S2-02: 1000 asignaciones con 5 jugadores; siempre 1 impostor y cada
// jugador lo fue entre 150 y 250 veces (lo esperado es 200).
func TestPickImpostorsIsFair(t *testing.T) {
	ids := []string{"a", "b", "c", "d", "e"}
	times := make(map[string]int)
	for i := 0; i < 1000; i++ {
		picked, err := pickImpostors(ids, rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		if len(picked) != 1 {
			t.Fatalf("debe haber exactamente 1 impostor, got %d", len(picked))
		}
		for id := range picked {
			times[id]++
		}
	}
	for _, id := range ids {
		if times[id] < 150 || times[id] > 250 {
			t.Errorf("%s fue impostor %d veces de 1000", id, times[id])
		}
	}
}

func TestImpostorCount(t *testing.T) {
	cases := []struct{ players, want int }{
		{2, 1}, {5, 1}, {6, 1}, {7, 2}, {10, 2},
	}
	for _, c := range cases {
		ids := make([]string, c.players)
		for i := range ids {
			ids[i] = fmt.Sprintf("p%d", i)
		}
		picked, err := pickImpostors(ids, rand.Reader)
		if err != nil {
			t.Fatal(err)
		}
		if len(picked) != c.want {
			t.Errorf(
				"%d jugadores: want %d impostores, got %d",
				c.players,
				c.want,
				len(picked),
			)
		}
	}
}

// startFive arranca una partida de 5 jugadores y devuelve sus canales.
func startFive(
	t *testing.T,
	opts ...Option,
) (*Room, map[string]chan *matchv1.Snapshot) {
	t.Helper()
	opts = append([]Option{WithCreator("p0")}, opts...)
	r := NewRoom("TEST", "match-1", mapWithTanks(), opts...)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	go r.Run(ctx)

	outs := make(map[string]chan *matchv1.Snapshot)
	for i := 0; i < 5; i++ {
		id := fmt.Sprintf("p%d", i)
		outs[id] = make(chan *matchv1.Snapshot, 256)
		r.Join(Join{PlayerID: id, Out: outs[id]})
	}
	waitPlayers(t, outs["p4"], 5)
	r.Act(PlayerAction{PlayerID: "p0", Start: true})
	for _, out := range outs {
		waitPhase(t, out, matchv1.Phase_PLAYING)
	}
	return r, outs
}

func TestEachSnapshotCarriesOnlyItsOwnRole(t *testing.T) {
	_, outs := startFive(t)

	impostors := 0
	for id, out := range outs {
		snap := waitTicks(t, out, 1)
		switch snap.MyRole {
		case matchv1.Role_IMPOSTOR:
			impostors++
		case matchv1.Role_CREW:
		default:
			t.Errorf("%s no recibió su rol: %v", id, snap.MyRole)
		}
	}
	if impostors != 1 {
		t.Fatalf("debe haber 1 impostor entre 5, got %d", impostors)
	}
}

func TestLobbySnapshotHasNoRole(t *testing.T) {
	r := startRoom(t, WithCreator("a"))
	a := make(chan *matchv1.Snapshot, 64)
	r.Join(Join{PlayerID: "a", Out: a})
	snap := waitPlayers(t, a, 1)
	if snap.MyRole != matchv1.Role_NO_ROLE {
		t.Errorf("en LOBBY no hay rol, got %v", snap.MyRole)
	}
}

func TestTanksAreGivenInOrderOfArrival(t *testing.T) {
	_, outs := startFive(t)
	snap := waitTicks(t, outs["p0"], 1)
	if len(snap.Tanks) != 5 {
		t.Fatalf("deben verse 5 tanques, got %d", len(snap.Tanks))
	}
	for i, tank := range snap.Tanks {
		want := fmt.Sprintf("p%d", i)
		if tank.Slot != int32(i) || tank.OwnerId != want {
			t.Errorf(
				"tanque %d: want slot %d de %s, got %+v",
				i,
				i,
				want,
				tank,
			)
		}
	}
}

func TestRolesAreSavedAndPublished(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	startFive(
		t,
		WithPublisher(pub),
		WithStore(store),
		WithMatchDuration(150*time.Millisecond),
	)

	store.mu.Lock()
	players := append([]PlayerInfo(nil), store.startPlayers...)
	store.mu.Unlock()
	if got := countRole(players); got != 1 {
		t.Fatalf("debe guardarse 1 impostor en participants, got %d", got)
	}

	deadline := time.After(2 * time.Second)
	for len(pub.forKey(events.RoutingKeyFinished)) == 0 {
		select {
		case <-deadline:
			t.Fatal("no se publicó match.finished")
		case <-time.After(20 * time.Millisecond):
		}
	}
	finished := pub.forKey(events.RoutingKeyFinished)
	event := finished[0].payload.(events.MatchFinished)
	impostors := 0
	for _, p := range event.Players {
		if p.Role == events.RoleImpostor {
			impostors++
		}
	}
	if impostors != 1 {
		t.Errorf("match.finished debe llevar 1 impostor, got %d", impostors)
	}
}

func countRole(players []PlayerInfo) int {
	count := 0
	for _, p := range players {
		if p.Role == events.RoleImpostor {
			count++
		}
	}
	return count
}
