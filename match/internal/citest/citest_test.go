package citest

import "testing"

// Deliberately failing test: checks that a red CI blocks the merge (S1-05).
// This PR must be closed without merging.
func TestCIBlocksMerge(t *testing.T) {
	t.Fatal("intentional failure: this PR must not be mergeable")
}
