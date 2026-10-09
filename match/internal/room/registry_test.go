package room

import "testing"

func TestAddIfFreeKeepsExistingRoom(t *testing.T) {
	g := NewRegistry()
	first := NewRoom("ABCD", "match-1", testMap())
	second := NewRoom("ABCD", "match-2", testMap())

	if !g.AddIfFree(first) {
		t.Fatal("the first room should be added")
	}
	if g.AddIfFree(second) {
		t.Fatal("a second room with the same code should be rejected")
	}
	if r, _ := g.Get("ABCD"); r != first {
		t.Errorf("the first room was overwritten")
	}
}
