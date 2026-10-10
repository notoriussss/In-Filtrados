// Package room: codes.go
// Genera códigos de sala de 4 letras sin caracteres ambiguos.
package room

import (
	"crypto/rand"
	"math/big"
)

// codeAlphabet excluye O, 0, I, 1 para evitar confusión visual.
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const codeLength = 4

// GenerateCode devuelve un código de 4 letras usando crypto/rand.
// Retorna error solo si el sistema operativo no puede proveer entropía.
func GenerateCode() (string, error) {
	alphabetLen := big.NewInt(int64(len(codeAlphabet)))
	result := make([]byte, codeLength)
	for i := range result {
		n, err := rand.Int(rand.Reader, alphabetLen)
		if err != nil {
			return "", err
		}
		result[i] = codeAlphabet[n.Int64()]
	}
	return string(result), nil
}
