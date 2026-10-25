package room

import (
	"strings"

	matchv1 "github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// pickColor cambia el color de p en la sala de espera. Se ignora fuera
// de LOBBY, si no es uno de los 8 colores o si otro jugador conectado ya
// lo tiene.
func (r *Room) pickColor(p *player, color string) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	color = strings.ToLower(color)
	if !isPlayerColor(color) {
		return
	}
	for _, other := range r.players {
		if other != p && other.view.Connected &&
			strings.EqualFold(other.view.Color, color) {
			return
		}
	}
	p.view.Color = color
}

func isPlayerColor(color string) bool {
	for _, c := range colors {
		if c == color {
			return true
		}
	}
	return false
}
