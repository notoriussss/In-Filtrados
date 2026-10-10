package room

import (
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// mapWithTanks es testMap con los 10 tanques del huerto de shared/map.json.
func mapWithTanks() *Map {
	m := testMap()
	m.Tanks = []TankSpot{
		{Slot: 0, X: 640, Y: 1040},
		{Slot: 1, X: 720, Y: 1040},
		{Slot: 2, X: 800, Y: 1040},
		{Slot: 3, X: 880, Y: 1040},
		{Slot: 4, X: 960, Y: 1040},
		{Slot: 5, X: 640, Y: 960},
		{Slot: 6, X: 720, Y: 960},
		{Slot: 7, X: 800, Y: 960},
		{Slot: 8, X: 880, Y: 960},
		{Slot: 9, X: 960, Y: 960},
	}
	return m
}

// mapWithStations es testMap con tanques y 3 estaciones conocidas.
func mapWithStations() *Map {
	m := mapWithTanks()
	m.Stations = []Station{
		{ID: "leak-1", Type: "reduce", X: 400, Y: 300},
		{ID: "rain-1", Type: "reuse", X: 600, Y: 300},
		{ID: "filter-1", Type: "recycle", X: 800, Y: 300},
	}
	return m
}

// waitTicks descarta lo que haya en ch y espera n snapshots nuevos.
func waitTicks(
	t *testing.T,
	ch chan *matchv1.Snapshot,
	n int,
) *matchv1.Snapshot {
	t.Helper()
	drain(ch)
	var last *matchv1.Snapshot
	timeout := time.After(2 * time.Second)
	for i := 0; i < n; i++ {
		select {
		case last = <-ch:
		case <-timeout:
			t.Fatalf("esperaba %d snapshots", n)
		}
	}
	return last
}
