package room

import (
	"fmt"
	mrand "math/rand"
	"sort"
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// seeded da un azar fijo: la misma semilla sortea lo mismo.
func seeded(seed int64) *mrand.Rand {
	return mrand.New(mrand.NewSource(seed))
}

func realStations(t *testing.T) []Station {
	t.Helper()
	m, err := LoadMap(sharedMapPath)
	if err != nil {
		t.Fatal(err)
	}
	return m.Stations
}

func playerIDs(n int) []string {
	ids := make([]string, n)
	for i := range ids {
		ids[i] = fmt.Sprintf("p%d", i)
	}
	return ids
}

func typesOf(stations []Station, list []string) map[string]int {
	typeOf := map[string]string{}
	for _, s := range stations {
		typeOf[s.ID] = s.Type
	}
	count := map[string]int{}
	for _, id := range list {
		count[typeOf[id]]++
	}
	return count
}

func TestPlanGivesEveryPlayerTheChosenCountWithoutRepeats(t *testing.T) {
	stations := realStations(t)
	for _, n := range []int{4, 6, 8} {
		plans, err := planTasks(stations, playerIDs(7), n, seeded(1))
		if err != nil {
			t.Fatal(err)
		}
		if len(plans) != 7 {
			t.Fatalf("n=%d: %d plans for 7 players", n, len(plans))
		}
		for id, list := range plans {
			if len(list) != n {
				t.Errorf("n=%d: %s got %d tasks", n, id, len(list))
			}
			if got := len(uniq(list)); got != n {
				t.Errorf("n=%d: %s has repeats: %v", n, id, list)
			}
		}
	}
}

func uniq(list []string) map[string]bool {
	set := map[string]bool{}
	for _, id := range list {
		set[id] = true
	}
	return set
}

func TestPlanDiffersBetweenPlayers(t *testing.T) {
	stations := realStations(t)
	for _, n := range []int{4, 6, 8} {
		for seed := int64(1); seed <= 20; seed++ {
			plans, err := planTasks(stations, playerIDs(5), n, seeded(seed))
			if err != nil {
				t.Fatal(err)
			}
			sets := map[string]bool{}
			orders := map[string]bool{}
			for _, list := range plans {
				sets[setKey(list)] = true
				orders[fmt.Sprint(list)] = true
			}
			if len(sets) != len(plans) {
				t.Errorf("n=%d seed=%d: two players share a set", n, seed)
			}
			if len(orders) != len(plans) {
				t.Errorf("n=%d seed=%d: two players share an order", n, seed)
			}
		}
	}
}

func TestPlanIsDisjointWhenStationsAreEnough(t *testing.T) {
	stations := realStations(t)
	plans, err := planTasks(stations, playerIDs(2), 6, seeded(3))
	if err != nil {
		t.Fatal(err)
	}
	all := map[string]bool{}
	for _, list := range plans {
		for _, id := range list {
			if all[id] {
				t.Fatalf("%s assigned twice with 12 stations for 2x6", id)
			}
			all[id] = true
		}
	}
}

func TestPlanMixesThe3R(t *testing.T) {
	stations := realStations(t)
	for _, n := range []int{4, 6, 8} {
		for seed := int64(1); seed <= 20; seed++ {
			plans, err := planTasks(stations, playerIDs(6), n, seeded(seed))
			if err != nil {
				t.Fatal(err)
			}
			for id, list := range plans {
				counts := typesOf(stations, list)
				if len(counts) != 3 {
					t.Errorf("n=%d %s: only %v", n, id, counts)
				}
				lo, hi := n, 0
				for _, c := range counts {
					lo, hi = min(lo, c), max(hi, c)
				}
				if hi-lo > 1 {
					t.Errorf("n=%d %s: uneven %v", n, id, counts)
				}
			}
		}
	}
}

func TestPlanSpreadsStationsEvenly(t *testing.T) {
	stations := realStations(t)
	for _, n := range []int{4, 6, 8} {
		for _, players := range []int{3, 5, 8, 10} {
			plans, err := planTasks(
				stations, playerIDs(players), n, seeded(int64(players)),
			)
			if err != nil {
				t.Fatal(err)
			}
			load := map[string]int{}
			for _, list := range plans {
				for _, id := range list {
					load[id]++
				}
			}
			lo, hi := players*n, 0
			for _, s := range stations {
				lo, hi = min(lo, load[s.ID]), max(hi, load[s.ID])
			}
			if hi-lo > 1 {
				t.Errorf("n=%d players=%d: loads %d..%d", n, players, lo, hi)
			}
		}
	}
}

func TestPlanIsDeterministicForASeed(t *testing.T) {
	stations := realStations(t)
	a, _ := planTasks(stations, playerIDs(5), 6, seeded(42))
	b, _ := planTasks(stations, playerIDs(5), 6, seeded(42))
	c, _ := planTasks(stations, playerIDs(5), 6, seeded(43))
	if fmt.Sprint(a) != fmt.Sprint(b) {
		t.Error("same seed gave different plans")
	}
	if fmt.Sprint(a) == fmt.Sprint(c) {
		t.Error("different seeds gave the same plan")
	}
}

func TestPlanCapsAtTheNumberOfStations(t *testing.T) {
	stations := realStations(t)[:3]
	plans, err := planTasks(stations, playerIDs(2), 8, seeded(1))
	if err != nil {
		t.Fatal(err)
	}
	for id, list := range plans {
		if len(list) != 3 {
			t.Errorf("%s got %d tasks, want 3", id, len(list))
		}
	}
}

// startedRoom empieza una partida con n jugadores, azar fijo y el mapa real.
func startedRoom(t *testing.T, players, tasks int, seed int64) *Room {
	t.Helper()
	m, err := LoadMap(sharedMapPath)
	if err != nil {
		t.Fatal(err)
	}
	r := NewRoom("TEST", "match-1", m, WithCreator("p0"))
	r.rnd = seeded(seed)
	r.tasksPerPlayer = tasks
	for _, id := range playerIDs(players) {
		r.addPlayer(Join{
			PlayerID: id,
			Out:      make(chan *matchv1.ServerEvent, 4),
		})
	}
	r.startMatch("p0")
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatal("la partida no empezó")
	}
	return r
}

func TestStartGivesImpostorsAndCrewDifferentLists(t *testing.T) {
	r := startedRoom(t, 6, 6, 7)
	sets := map[string]bool{}
	roles := map[matchv1.Role]int{}
	for id, p := range r.players {
		if len(p.taskOrder) != 6 || len(p.assignedTasks) != 6 {
			t.Errorf("%s: %d ordered, %d assigned", id, len(p.taskOrder),
				len(p.assignedTasks))
		}
		sets[setKey(p.taskOrder)] = true
		roles[p.role]++
	}
	if len(sets) != 6 {
		t.Errorf("want 6 different sets, got %d", len(sets))
	}
	if roles[matchv1.Role_IMPOSTOR] == 0 {
		t.Error("no impostor in the room")
	}
}

func TestMyTasksFollowTheAssignedOrder(t *testing.T) {
	r := startedRoom(t, 4, 8, 11)
	for id, p := range r.players {
		got := make([]string, 0, 8)
		for _, task := range myTasks(p) {
			got = append(got, task.StationId)
		}
		if fmt.Sprint(got) != fmt.Sprint(p.taskOrder) {
			t.Errorf("%s: snapshot %v, assigned %v", id, got, p.taskOrder)
		}
	}
	// Una tarea hecha se queda en su lugar, marcada.
	p := r.players["p1"]
	first := p.taskOrder[0]
	delete(p.assignedTasks, first)
	p.completedTasks = append(p.completedTasks, first)
	tasks := myTasks(p)
	if tasks[0].StationId != first || !tasks[0].Done {
		t.Errorf("first task moved or not done: %v", tasks[0])
	}
}

func TestPlanSurvivesSaveAndRestore(t *testing.T) {
	r := startedRoom(t, 5, 6, 5)
	before := map[string][]string{}
	for id, p := range r.players {
		before[id] = append([]string(nil), p.taskOrder...)
	}
	state := r.toSaved()
	restored := map[string][]string{}
	for _, sp := range state.Players {
		restored[sp.ID] = sp.TaskOrder
	}
	for id, order := range before {
		if fmt.Sprint(restored[id]) != fmt.Sprint(order) {
			t.Errorf("%s: saved %v, had %v", id, restored[id], order)
		}
	}
	ids := make([]string, 0, len(before))
	for id := range before {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	if len(ids) != 5 {
		t.Fatalf("lost players: %v", ids)
	}
}
