package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// contaminateDone deja a "imp" recién terminado de contaminar el tanque 1:
// la contaminación terminó en el tick r.tick-1.
func contaminateDone(t *testing.T, r *Room) {
	t.Helper()
	placeAt(r, "imp", 1)
	contaminate(r, "imp", 1)
	tickN(r, contaminateTicks)
	if level(r, 1) != contaminateAmount {
		t.Fatalf("la contaminación no terminó")
	}
}

func TestContaminateDropsOilWithImpostorColor(t *testing.T) {
	r, _ := playingRoom(t)
	contaminateDone(t, r)

	if len(r.oilDrops) != 1 {
		t.Fatalf("want 1 gota al contaminar, got %d", len(r.oilDrops))
	}
	d := r.oilDrops[0]
	imp := r.players["imp"]
	if d.color != imp.view.Color {
		t.Errorf("color: want %s, got %s", imp.view.Color, d.color)
	}
	spot := r.m.Tanks[1]
	if float64(d.x) != spot.X || float64(d.y) != spot.Y {
		t.Errorf("la gota no cayó donde está el impostor")
	}
	if want := r.tick - 1 + oilDropLifeTicks; d.expiresAt != want {
		t.Errorf("expiresAt: want %d, got %d", want, d.expiresAt)
	}
}

func TestOilTrailLastsFifteenSeconds(t *testing.T) {
	r, _ := playingRoom(t)
	contaminateDone(t, r)
	move(r, "imp", -1, 0)

	// Quedan oilTrailTicks-1 ticks del rastro: caen las 14 gotas restantes.
	tickN(r, oilTrailTicks-1)
	if got := len(r.oilDrops); got != 15 {
		t.Fatalf("want 15 gotas en 15 s, got %d", got)
	}
	if r.oilDrops[0].x == r.oilDrops[1].x {
		t.Errorf("las gotas deben seguir al impostor")
	}

	// Pasado el rastro no caen más; las viejas empiezan a vencer.
	tickN(r, oilDropEveryTicks)
	if got := len(r.oilDrops); got >= 15 {
		t.Fatalf("después de 15 s no deben caer gotas: %d", got)
	}
}

func TestOilDropsExpireAfterFifteenSeconds(t *testing.T) {
	r, _ := playingRoom(t)
	contaminateDone(t, r)

	// La primera gota cayó en el tick T = r.tick-1 y se borra en el step
	// del tick T+300.
	tickN(r, oilDropLifeTicks-1)
	if got := len(r.oilDrops); got != 15 {
		t.Fatalf("la primera gota venció antes de tiempo: %d", got)
	}
	tickN(r, 1)
	if got := len(r.oilDrops); got != 14 {
		t.Fatalf("la primera gota debía vencer a los 15 s: %d", got)
	}
	tickN(r, oilTrailTicks)
	if got := len(r.oilDrops); got != 0 {
		t.Fatalf("a los 30 s no debe quedar ninguna gota: %d", got)
	}
}

func TestCleaningDropsNoOil(t *testing.T) {
	r, _ := playingRoom(t)
	r.tankAt(2).contamination = contaminateAmount
	placeAt(r, "imp", 2)
	clean(r, "imp", 2)
	tickN(r, cleanTicks+1)

	if level(r, 2) == contaminateAmount {
		t.Fatalf("la limpieza no terminó")
	}
	if len(r.oilDrops) != 0 {
		t.Fatalf("limpiar no deja gotas: %d", len(r.oilDrops))
	}
}

func TestSnapshotCarriesOilDrops(t *testing.T) {
	r, _ := playingRoom(t)
	contaminateDone(t, r)

	out := r.players["crew1"].out
	select {
	case <-out: // vacía un snapshot viejo si lo hubiera
	default:
	}
	r.broadcast()
	ev := <-out
	snap := snapOf(ev)
	drops := snap.GetOilDrops()
	if len(drops) != 1 {
		t.Fatalf("want 1 gota en el snapshot, got %d", len(drops))
	}
	want := &matchv1.OilDrop{
		X:             r.oilDrops[0].x,
		Y:             r.oilDrops[0].y,
		Color:         r.players["imp"].view.Color,
		ExpiresAtTick: r.oilDrops[0].expiresAt,
	}
	if drops[0].String() != want.String() {
		t.Errorf("want %v, got %v", want, drops[0])
	}
}
