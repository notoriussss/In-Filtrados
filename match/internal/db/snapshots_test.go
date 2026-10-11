package db

import "testing"

// Save no toca la base: solo deja la última instantánea de cada partida.
func TestSnapshotWriterKeepsOnlyTheLatestPerMatch(t *testing.T) {
	w := NewSnapshotWriter(nil)
	w.Save("m1", 10, []byte(`{"tick":10}`))
	w.Save("m1", 50, []byte(`{"tick":50}`))
	w.Save("m2", 7, []byte(`{"tick":7}`))

	if len(w.pending) != 2 {
		t.Fatalf("esperaba 2 partidas pendientes, hay %d", len(w.pending))
	}
	if got := w.pending["m1"].tick; got != 50 {
		t.Errorf("de m1 debe quedar la del tick 50, quedó %d", got)
	}
	select {
	case <-w.wake:
	default:
		t.Error("Save debe despertar al escritor")
	}
}
