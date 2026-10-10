package room

import (
	"crypto/rand"
	"fmt"
	"io"
	"math/big"
)

// impostorCount dice cuántos impostores lleva una partida: 1, o 2 desde
// twoImpostorsFrom jugadores (docs/tasks.md S2-02).
func impostorCount(players int) int {
	if players >= twoImpostorsFrom {
		return 2
	}
	return 1
}

// pickImpostors elige al azar los impostores entre ids con un
// Fisher-Yates parcial. rnd es crypto/rand.Reader fuera de los tests.
func pickImpostors(ids []string, rnd io.Reader) (map[string]bool, error) {
	pool := append([]string(nil), ids...)
	count := min(impostorCount(len(pool)), len(pool))
	picked := make(map[string]bool, count)
	for i := 0; i < count; i++ {
		remaining := big.NewInt(int64(len(pool) - i))
		n, err := rand.Int(rnd, remaining)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", msgPickImpostors, err)
		}
		j := i + int(n.Int64())
		pool[i], pool[j] = pool[j], pool[i]
		picked[pool[i]] = true
	}
	return picked, nil
}
