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

func isAccessory(accessory string) bool {
	for _, a := range accessories {
		if a == accessory {
			return true
		}
	}
	return false
}

// accessoryNone quita el accesorio; no se compra.
const accessoryNone = "none"

// pickAccessory cambia el accesorio de p en la sala de espera. Se ignora
// fuera de LOBBY, si el accesorio no existe o si el jugador no lo compró.
// A diferencia del color, varios jugadores pueden usar el mismo accesorio.
func (r *Room) pickAccessory(p *player, accessory string) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	accessory = strings.ToLower(accessory)
	if accessory == accessoryNone || accessory == "" {
		p.view.Accessory = ""
		return
	}
	if !isAccessory(accessory) || !p.owns(accessory) {
		return
	}
	p.view.Accessory = accessory
}
