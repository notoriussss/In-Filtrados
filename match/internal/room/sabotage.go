package room

import (
	"log"
	"math/rand/v2"
	"sort"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// S3-05: emergencias. Una emergencia es la tubería principal rota o el
// vapor en la planta. La dispara el impostor (sabotaje) o el servidor
// al azar, y las dos se ven idénticas: nadie sabe si fue mala suerte.
//
//   - Tubería: 30 s para que dos jugadores la sostengan a la vez en sus
//     dos extremos; si no, todos los tanques suben 20 puntos.
//   - Vapor: la visión de todos baja a la mitad hasta que alguien cierra
//     la válvula de la planta quedándose quieto 2 s junto a ella.
//
// Reglas: una sola activa, ninguna en los primeros 30 s ni en reunión,
// 40 s de espera compartida entre sabotajes y la tubería se sabotea
// máximo 2 veces por partida. Tras un sabotaje, las emergencias
// aleatorias esperan para no acumularse.

// emergencyState es la emergencia activa.
type emergencyState struct {
	kind     string
	endsAt   int64 // solo pipe; 0 si no vence
	sabotage bool  // la disparó un impostor (nunca viaja al navegador)
}

// isEmergencyKind dice si kind es una emergencia conocida.
func isEmergencyKind(kind string) bool {
	return kind == emergencyPipe || kind == emergencySteam
}

// handleSabotage dispara un sabotaje del impostor si las reglas lo dejan.
func (r *Room) handleSabotage(p *player, kind string) {
	if !r.canSabotage(p, kind) {
		return
	}
	r.startEmergency(kind, true)
	r.sabotageReadyAt = r.tick + sabotageCooldownTicks
	if kind == emergencyPipe {
		r.pipesUsed++
	}
	// Las aleatorias se pausan un rato para que no se acumulen.
	r.nextRandomAt = max(
		r.nextRandomAt,
		r.tick+randomPauseAfterSabotage,
	)
}

// canSabotage aplica las reglas del sabotaje (S3-05).
func (r *Room) canSabotage(p *player, kind string) bool {
	if r.phase != matchv1.Phase_PLAYING ||
		p.role != matchv1.Role_IMPOSTOR ||
		!isEmergencyKind(kind) ||
		r.emergency != nil {
		return false
	}
	if r.tick < r.sabotageReadyTick() {
		return false
	}
	return kind != emergencyPipe || r.pipesUsed < maxPipeSabotages
}

// sabotageReadyTick: desde cuándo se puede sabotear (espera compartida y
// los primeros 30 s de la partida).
func (r *Room) sabotageReadyTick() int64 {
	return max(r.sabotageReadyAt, r.startTick+emergencyGraceTicks)
}

// startEmergency activa la emergencia kind.
func (r *Room) startEmergency(kind string, sabotage bool) {
	e := &emergencyState{kind: kind, sabotage: sabotage}
	if kind == emergencyPipe {
		e.endsAt = r.tick + pipeDeadlineTicks
	}
	r.emergency = e
	log.Printf(
		"room %s: emergencia %s (sabotaje: %t)",
		r.Code,
		kind,
		sabotage,
	)
}

// endEmergency termina la emergencia y suelta a quienes la arreglaban.
// La próxima aleatoria llega entre 60 y 120 s después.
func (r *Room) endEmergency() {
	r.emergency = nil
	for _, p := range r.players {
		p.fixPoint = ""
		p.fixTicks = 0
	}
	r.nextRandomAt = max(r.nextRandomAt, r.tick+r.randomGap())
}

// handleFix empieza a arreglar en el punto pointID: vivo, quieto y a
// fixRange o menos de un punto de la emergencia activa.
func (r *Room) handleFix(p *player, pointID string) {
	if r.phase != matchv1.Phase_PLAYING ||
		r.emergency == nil ||
		!p.view.Alive ||
		isMoving(p) {
		return
	}
	fp := r.fixPointAt(pointID)
	if fp == nil || fp.Kind != r.emergency.kind || !nearFixPoint(p, fp) {
		return
	}
	p.fixPoint = pointID
	p.fixTicks = 0
	// Arreglar reemplaza cualquier otra cosa a medias.
	p.pending = nil
	p.taskStartTick = 0
	p.taskStation = ""
}

// stepEmergency avanza la emergencia activa (o lanza una aleatoria).
// Se llama una vez por tick en PLAYING, después de mover.
func (r *Room) stepEmergency() {
	r.stepFixers()
	e := r.emergency
	if e == nil {
		r.maybeRandomEmergency()
		return
	}
	switch e.kind {
	case emergencyPipe:
		if len(r.heldPoints()) >= r.pointsOf(emergencyPipe) {
			log.Printf("room %s: tubería arreglada", r.Code)
			r.endEmergency()
			return
		}
		if r.tick >= e.endsAt {
			log.Printf("room %s: la tubería reventó", r.Code)
			for _, t := range r.tanks {
				if !t.dead {
					r.addContamination(t, pipeDamage)
				}
			}
			r.endEmergency()
		}
	case emergencySteam:
		for _, p := range r.players {
			if p.fixPoint != "" && p.fixTicks >= steamFixTicks {
				log.Printf("room %s: vapor cerrado", r.Code)
				r.endEmergency()
				return
			}
		}
	}
}

// stepFixers suelta a quien se movió, se alejó o murió, y suma un tick
// al resto.
func (r *Room) stepFixers() {
	for _, p := range r.players {
		if p.fixPoint == "" {
			continue
		}
		fp := r.fixPointAt(p.fixPoint)
		if r.emergency == nil || fp == nil ||
			fp.Kind != r.emergency.kind ||
			!p.view.Alive || isMoving(p) || !nearFixPoint(p, fp) {
			p.fixPoint = ""
			p.fixTicks = 0
			continue
		}
		p.fixTicks++
	}
}

// maybeRandomEmergency lanza una emergencia al azar cuando toca.
func (r *Room) maybeRandomEmergency() {
	if !r.randomEmergencies ||
		r.tick < r.startTick+emergencyGraceTicks {
		return
	}
	if r.nextRandomAt == 0 {
		r.nextRandomAt = r.tick + r.randomGap()
		return
	}
	if r.tick < r.nextRandomAt {
		return
	}
	kind := emergencySteam
	if r.randIntn(2) == 0 {
		kind = emergencyPipe
	}
	r.startEmergency(kind, false)
}

// randomGap: ticks hasta la próxima emergencia aleatoria.
func (r *Room) randomGap() int64 {
	span := randomEmergencyMaxTicks - randomEmergencyMinTicks
	return int64(randomEmergencyMinTicks + r.randIntn(span+1))
}

// randIntn usa el azar de la sala (los tests lo fijan).
func (r *Room) randIntn(n int) int {
	if r.emergencyRand != nil {
		return r.emergencyRand(n)
	}
	return rand.IntN(n)
}

// cancelPipeForMeeting: una reunión apaga la tubería rota (si no, nadie
// llegaría a tiempo desde la plaza). El vapor sigue.
func (r *Room) cancelPipeForMeeting() {
	for _, p := range r.players {
		p.fixPoint = ""
		p.fixTicks = 0
	}
	if r.emergency != nil && r.emergency.kind == emergencyPipe {
		r.endEmergency()
	}
}

// heldPoints son los puntos con alguien arreglando ahora, ordenados.
func (r *Room) heldPoints() []string {
	seen := make(map[string]bool)
	for _, p := range r.players {
		if p.fixPoint != "" {
			seen[p.fixPoint] = true
		}
	}
	points := make([]string, 0, len(seen))
	for id := range seen {
		points = append(points, id)
	}
	sort.Strings(points)
	return points
}

// pointsOf cuenta los puntos de reparación de una emergencia.
func (r *Room) pointsOf(kind string) int {
	n := 0
	for _, fp := range r.m.FixPoints {
		if fp.Kind == kind {
			n++
		}
	}
	return max(n, 1)
}

func (r *Room) fixPointAt(id string) *FixPoint {
	for i := range r.m.FixPoints {
		if r.m.FixPoints[i].ID == id {
			return &r.m.FixPoints[i]
		}
	}
	return nil
}

func nearFixPoint(p *player, fp *FixPoint) bool {
	dx := float64(p.view.X) - fp.X
	dy := float64(p.view.Y) - fp.Y
	return dx*dx+dy*dy <= fixRange*fixRange
}

// emergencyView es lo que ven todos: nunca dice si fue un sabotaje.
func (r *Room) emergencyView() *matchv1.Emergency {
	if r.emergency == nil {
		return nil
	}
	return &matchv1.Emergency{
		Kind:       r.emergency.kind,
		EndsAtTick: r.emergency.endsAt,
		HeldPoints: r.heldPoints(),
	}
}

// sabotageView va solo en el snapshot del impostor.
func (r *Room) sabotageView(p *player) *matchv1.SabotageStatus {
	if p.role != matchv1.Role_IMPOSTOR || !r.inMatch() {
		return nil
	}
	return &matchv1.SabotageStatus{
		ReadyAtTick: r.sabotageReadyTick(),
		PipesLeft:   int32(max(maxPipeSabotages-r.pipesUsed, 0)),
	}
}

// activityOf dice qué está haciendo el jugador, para animarlo en el
// mapa. Limpiar y contaminar se ven igual ("tank"), y la tarea fingida
// del impostor se ve como una de verdad.
func (r *Room) activityOf(p *player) string {
	switch {
	case p.fixPoint != "":
		return activityFix
	case p.pending != nil:
		return activityTank
	case p.taskStation != "":
		if s := r.stationAt(p.taskStation); s != nil {
			return s.Type
		}
	}
	return ""
}
