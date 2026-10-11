package room

import (
	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// startContaminate empieza a contaminar el tanque slot (S2-03). Solo el
// impostor vivo, quieto, a tankRange o menos de un tanque ajeno vivo y
// fuera de su tiempo de espera.
func (r *Room) startContaminate(id string, p *player, slot int32) {
	if r.phase != matchv1.Phase_PLAYING ||
		p.role != matchv1.Role_IMPOSTOR ||
		!p.view.Alive ||
		r.tick < p.nextContaminate {
		return
	}
	t := r.tankAt(slot)
	if t == nil || t.ownerID == id || !r.canWorkOn(p, t) {
		return
	}
	p.pending = &tankAction{
		kind:      LogContaminate,
		slot:      slot,
		ticksLeft: contaminateTicks,
	}
}

// startClean empieza a limpiar el tanque slot, propio o ajeno.
func (r *Room) startClean(p *player, slot int32) {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	t := r.tankAt(slot)
	if t == nil || t.contamination == 0 || !r.canWorkOn(p, t) {
		return
	}
	p.pending = &tankAction{
		kind:      LogClean,
		slot:      slot,
		ticksLeft: cleanTicks,
	}
}

// canWorkOn: el tanque sigue vivo y el jugador está quieto y cerca.
func (r *Room) canWorkOn(p *player, t *tank) bool {
	return !t.dead && !isMoving(p) && nearTank(p, t)
}

// stepTanks avanza las acciones en curso, el tanque del impostor y las
// visitas. Se llama una vez por tick en PLAYING, después de mover.
func (r *Room) stepTanks() {
	for id, p := range r.players {
		r.stepAction(id, p)
	}
	r.driftImpostorTanks()
	r.logVisits()
}

func (r *Room) stepAction(id string, p *player) {
	if p.pending == nil {
		return
	}
	t := r.tankAt(p.pending.slot)
	if t == nil || !r.canWorkOn(p, t) {
		p.pending = nil // se movió, se alejó o el tanque murió
		return
	}
	p.pending.ticksLeft--
	if p.pending.ticksLeft > 0 {
		return
	}
	kind := p.pending.kind
	p.pending = nil
	switch kind {
	case LogContaminate:
		p.nextContaminate = r.tick + contaminateCooldown
		r.addContamination(t, contaminateAmount)
	case LogClean:
		t.contamination = max(t.contamination-cleanAmount, 0)
	}
	r.logEvent(id, kind, t.slot)
}

// driftImpostorTanks sube 1 punto el tanque del impostor cada 5 s, para
// que no sea el único siempre limpio.
func (r *Room) driftImpostorTanks() {
	// stepTanks corre una vez por tick desde startTick: este es el tick
	// número elapsed de la partida.
	elapsed := r.tick - r.startTick + 1
	if elapsed%impostorDriftTicks != 0 {
		return
	}
	for _, t := range r.tanks {
		owner, ok := r.players[t.ownerID]
		if ok && owner.role == matchv1.Role_IMPOSTOR && !t.dead {
			r.addContamination(t, impostorDriftAmount)
		}
	}
}

// addContamination sube el tanque; a 100 muere y su dueño queda fantasma.
func (r *Room) addContamination(t *tank, amount int32) {
	t.contamination = min(t.contamination+amount, maxContamination)
	if t.contamination < maxContamination {
		return
	}
	t.dead = true
	if owner, ok := r.players[t.ownerID]; ok {
		owner.view.Alive = false
		owner.pending = nil
	}
}

// logVisits anota cada vez que un jugador entra a tankRange de un tanque.
func (r *Room) logVisits() {
	for id, p := range r.players {
		if p.nearTanks == nil {
			p.nearTanks = make(map[int32]bool)
		}
		for _, t := range r.tanks {
			near := nearTank(p, t)
			if near && !p.nearTanks[t.slot] {
				r.logEvent(id, LogVisit, t.slot)
			}
			p.nearTanks[t.slot] = near
		}
	}
}

func (r *Room) logEvent(playerID, kind string, slot int32) {
	entry := LogEntry{
		MatchID:  r.MatchID,
		Tick:     r.tick,
		PlayerID: playerID,
		Kind:     kind,
		TankSlot: slot,
	}
	r.eventHistory = append(r.eventHistory, entry)
	if r.eventLog != nil {
		r.eventLog.Log(entry)
	}
}

func (r *Room) tankAt(slot int32) *tank {
	for _, t := range r.tanks {
		if t.slot == slot {
			return t
		}
	}
	return nil
}

func isMoving(p *player) bool {
	return p.dx != 0 || p.dy != 0
}

func nearTank(p *player, t *tank) bool {
	dx := float64(p.view.X) - t.x
	dy := float64(p.view.Y) - t.y
	return dx*dx+dy*dy <= tankRange*tankRange
}
