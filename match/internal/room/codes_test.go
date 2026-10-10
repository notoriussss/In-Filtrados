package room_test

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/internal/room"
	"github.com/stretchr/testify/require"
)

func TestGenerateCode(t *testing.T) {
	for i := 0; i < 1000; i++ {
		code, err := room.GenerateCode()
		require.NoError(t, err)
		require.Len(t, code, 4)
		for _, ch := range code {
			// ningún carácter ambiguo
			require.NotContains(t, "O0I1", string(ch))
		}
	}
}
