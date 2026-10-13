package room

import (
	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// startOilTrail hace que el jugador suelte gotas durante oilTrailTicks
// (S2-12). La primera cae en este mismo tick; contaminar de nuevo
// alarga el rastro.
func (r *Room) startOilTrail(p *player) {
	p.oilUntil = r.tick + oilTrailTicks
	p.nextOilDrop = r.tick
}

// stepOil borra las gotas vencidas y suelta una gota por segundo en la
// posición de cada jugador vivo que todavía deja rastro.
func (r *Room) stepOil() {
	kept := r.oilDrops[:0]
	for _, d := range r.oilDrops {
		if d.expiresAt > r.tick {
			kept = append(kept, d)
		}
	}
	r.oilDrops = kept

	for _, p := range r.players {
		if !p.view.Alive ||
			r.tick >= p.oilUntil ||
			r.tick < p.nextOilDrop {
			continue
		}
		r.oilDrops = append(r.oilDrops, &oilDrop{
			x:         p.view.X,
			y:         p.view.Y,
			color:     p.view.Color,
			expiresAt: r.tick + oilDropLifeTicks,
		})
		p.nextOilDrop = r.tick + oilDropEveryTicks
	}
}

func (r *Room) oilDropViews() []*matchv1.OilDrop {
	views := make([]*matchv1.OilDrop, 0, len(r.oilDrops))
	for _, d := range r.oilDrops {
		views = append(views, &matchv1.OilDrop{
			X:             d.x,
			Y:             d.y,
			Color:         d.color,
			ExpiresAtTick: d.expiresAt,
		})
	}
	return views
}
