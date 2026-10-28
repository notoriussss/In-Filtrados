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

// maxImpostors es el tope que puede elegir el creador: la mitad de los
// jugadores menos uno (redondeada hacia abajo), y nunca menos de 1.
func maxImpostors(players int) int {
	return max(1, (players-1)/2)
}

// pickImpostors elige al azar count impostores entre ids con un
// Fisher-Yates parcial. rnd es crypto/rand.Reader fuera de los tests.
func pickImpostors(
	ids []string,
	count int,
	rnd io.Reader,
) (map[string]bool, error) {
	pool := append([]string(nil), ids...)
	count = min(count, len(pool))
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
