package room

import (
	"strings"

	matchv1 "github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// Personajes: "jimena" es el de inicio y "gota" se compra, uno por color
// (id de la tienda "gota-<color sin #>", como "gota-e6194b").
const (
	skinJimena = "jimena"
	skinGota   = "gota"
)

// gotaItemID es el artículo de la tienda que da la gota de ese color.
func gotaItemID(color string) string {
	return "gota-" + strings.TrimPrefix(strings.ToLower(color), "#")
}

func skinOrDefault(skin string) string {
	if skin == skinGota {
		return skinGota
	}
	return skinJimena
}

func ownedSet(items []string) map[string]bool {
	set := make(map[string]bool, len(items))
	for _, it := range items {
		set[strings.ToLower(it)] = true
	}
	return set
}

// setOwned reemplaza lo comprado de p con lo que dice players.
func (p *player) setOwned(items []string) {
	p.owned = ownedSet(items)
}

func (p *player) owns(item string) bool {
	return p.owned[strings.ToLower(item)]
}

// pickSkin cambia el personaje de p en la sala de espera. Se ignora fuera
// de LOBBY o si pide la gota de un color que no compró.
func (r *Room) pickSkin(p *player, skin string) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	switch strings.ToLower(skin) {
	case skinJimena:
		p.view.Skin = skinJimena
	case skinGota:
		if p.owns(gotaItemID(p.view.Color)) {
			p.view.Skin = skinGota
		}
	}
}

// fixSkin devuelve a Jimena a quien lleva una gota que no es suya, por
// ejemplo tras cambiar de color.
func (r *Room) fixSkin(p *player) {
	if p.view.Skin == skinGota && !p.owns(gotaItemID(p.view.Color)) {
		p.view.Skin = skinJimena
	}
}
