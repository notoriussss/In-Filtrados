package room

import (
	"strings"

	matchv1 "github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

var accessories = []string{
	"cap",
	"sprout",
	"headphones",
	"glasses",
	"straw-hat",
	"diving-mask",
	"scarf",
	"backpack",
	"helmet",
	"flower",
	"fisher-hat",
	"raincoat",
}

// defaultAccessoryForColor devuelve el accesorio por defecto
// asociado a un color, manteniendo consistencia con GOTA_ROSTER.
func defaultAccessoryForColor(color string) string {
	switch strings.ToLower(color) {
	case "#e6194b":
		return "cap"
	case "#3cb44b":
		return "sprout"
	case "#ffe119":
		return "headphones"
	case "#4363d8":
		return "flower"
	case "#f58231":
		return "straw-hat"
	case "#911eb4":
		return "glasses"
	case "#46f0f0":
		return "diving-mask"
	case "#f032e6":
		return "scarf"
	default:
		return "cap"
	}
}

func isAccessory(accessory string) bool {
	for _, a := range accessories {
		if a == accessory {
			return true
		}
	}
	return false
}

// pickAccessory cambia el accesorio de p en la sala de espera.
// Se ignora fuera de LOBBY o si el accesorio no es válido.
// A diferencia del color, varios jugadores pueden usar el mismo accesorio.
func (r *Room) pickAccessory(p *player, accessory string) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	accessory = strings.ToLower(accessory)
	if !isAccessory(accessory) {
		return
	}
	p.view.Accessory = accessory
}
