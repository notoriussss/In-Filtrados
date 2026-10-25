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
	if r.colorTaken(p, color) {
		return
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

// colorTaken dice si otro jugador conectado ya usa ese color.
func (r *Room) colorTaken(p *player, color string) bool {
	for _, other := range r.players {
		if other != p && other.view.Connected &&
			strings.EqualFold(other.view.Color, color) {
			return true
		}
	}
	return false
}

// resolveColor se llama al reconectar: si mientras el jugador estaba
// fuera otro tomó su color, recibe el primero libre. Sin colores libres
// (más de 8 jugadores) conserva el suyo.
func (r *Room) resolveColor(p *player) {
	if !r.colorTaken(p, p.view.Color) {
		return
	}
	for _, c := range colors {
		if !r.colorTaken(p, c) {
			p.view.Color = c
			return
		}
	}
}
