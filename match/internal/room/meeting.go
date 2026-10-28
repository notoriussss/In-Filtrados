package room

import (
	"context"
	"log"
	"math"
	"sort"
	"unicode/utf8"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// handleReport procesa la acción de reportar un tanque muerto (S2-05).
func (r *Room) handleReport(playerID string, tankSlot int32) {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	p, ok := r.players[playerID]
	if !ok || !p.view.Alive {
		return
	}
	t := r.tankAt(tankSlot)
	if t == nil || !t.dead || t.reported {
		return
	}
	if !nearDeadTank(p, t) {
		return
	}

	t.reported = true
	r.startMeeting(
		playerID,
		matchv1.MeetingReason_MEETING_REASON_REPORT,
		tankSlot,
	)
}

// handleCallMeeting convoca una reunión desde la mesa del mirador.
// Valida lo mismo que el servidor debe validar siempre: fase, vida,
// cercanía, emergencia activa, gracia inicial, espera y usos.
func (r *Room) handleCallMeeting(playerID string) {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	p, ok := r.players[playerID]
	if !ok || !p.view.Alive {
		return
	}
	if r.emergency != nil {
		return
	}
	if r.tick < r.startTick+meetingCallGraceTicks {
		return
	}
	if r.tick < r.meetingReadyAt {
		return
	}
	if r.meetingCallsUsed >= meetingCallsMax {
		return
	}
	center := r.m.MeetingPoint()
	dx := float64(p.view.X) - center.X
	dy := float64(p.view.Y) - center.Y
	if dx*dx+dy*dy > meetingCallRange*meetingCallRange {
		return
	}

	r.meetingCallsUsed++
	r.meetingReadyAt = r.tick + meetingCallCooldownTicks
	r.startMeeting(
		playerID,
		matchv1.MeetingReason_MEETING_REASON_EMERGENCY,
		-1,
	)
}

// startMeeting abre la fase de reunión y coloca a todos alrededor de la
// mesa. reason distingue un reporte de una convocatoria.
func (r *Room) startMeeting(
	reporterID string,
	reason matchv1.MeetingReason,
	tankSlot int32,
) {
	r.cancelPipeForMeeting()
	r.phase = matchv1.Phase_MEETING
	r.chat = nil
	r.teleportToMeeting()

	// Tras una reunión por reporte, la mesa espera un poco antes de
	// permitir una convocatoria: no queremos dos reuniones seguidas.
	if reason == matchv1.MeetingReason_MEETING_REASON_REPORT {
		ready := r.tick +
			meetingVotingTicks +
			meetingResultTicks +
			meetingCallAfterReportTicks
		if ready > r.meetingReadyAt {
			r.meetingReadyAt = ready
		}
	}

	r.meeting = &meetingState{
		reporterID:   reporterID,
		tankSlot:     tankSlot,
		reason:       reason,
		votes:        make(map[string]voteChoice),
		votingEndsAt: r.tick + meetingVotingTicks,
	}
}

// teleportToMeeting mueve a todos alrededor de la mesa y frena su avance.
// Los puntos forman un arco al sur de la mesa: el norte lo ocupa la
// consola del mirador.
func (r *Room) teleportToMeeting() {
	ids := make([]string, 0, len(r.players))
	for id := range r.players {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	center := r.m.MeetingPoint()
	for i, id := range ids {
		p := r.players[id]
		x, y := r.meetingSpot(i, len(ids), center)
		p.view.X = float32(x)
		p.view.Y = float32(y)
		p.dx = 0
		p.dy = 0
		p.pending = nil
		p.taskStartTick = 0
		p.taskStation = ""
	}
}

// meetingSpot reparte a los jugadores en uno o dos arcos frente a la
// mesa. Si un punto queda bloqueado, prueba un radio mayor y, como
// último recurso, usa el spawn de siempre.
func (r *Room) meetingSpot(
	slot, total int,
	center Point,
) (float64, float64) {
	const startDeg = 20.0
	const endDeg = 160.0
	radii := []float64{56, 80}

	if total <= 5 {
		angle := startDeg
		if total > 1 {
			angle += (endDeg - startDeg) *
				float64(slot) / float64(total-1)
		}
		if point, ok := r.freeMeetingSpot(center, angle, radii); ok {
			return point.X, point.Y
		}
	} else {
		ring := slot % len(radii)
		count := (total + len(radii) - 1) / len(radii)
		index := slot / len(radii)
		angle := startDeg
		if count > 1 {
			angle += (endDeg - startDeg) *
				float64(index) / float64(count-1)
		}
		if point, ok := r.freeMeetingSpot(
			center,
			angle,
			[]float64{radii[ring]},
		); ok {
			return point.X, point.Y
		}
	}

	return r.m.SpawnPoint(slot)
}

// freeMeetingSpot busca un punto libre sobre un ángulo y varios radios.
func (r *Room) freeMeetingSpot(
	center Point,
	angleDeg float64,
	radii []float64,
) (Point, bool) {
	angle := angleDeg * math.Pi / 180
	for _, radius := range radii {
		point := Point{
			X: center.X + math.Cos(angle)*radius,
			Y: center.Y + math.Sin(angle)*radius,
		}
		if !r.m.blocked(point.X, point.Y) {
			return point, true
		}
	}
	return Point{}, false
}

func (r *Room) meetingView() *matchv1.Meeting {
	if r.meeting == nil {
		return nil
	}
	votesCast := make([]string, 0, len(r.meeting.votes))
	for voterID := range r.meeting.votes {
		votesCast = append(votesCast, voterID)
	}
	sort.Strings(votesCast)
	endsAt := r.meeting.votingEndsAt
	votingClosed := false
	ejectedID := ""
	wasImpostor := false

	if r.meeting.votingClosed {
		endsAt = r.meeting.resultEndsAt
		votingClosed = true
		ejectedID = r.meeting.ejectedID
		wasImpostor = r.meeting.wasImpostor
	}
	return &matchv1.Meeting{
		ReporterId:   r.meeting.reporterID,
		TankSlot:     r.meeting.tankSlot,
		VotesCast:    votesCast,
		EndsAtTick:   endsAt,
		VotingClosed: votingClosed,
		EjectedId:    ejectedID,
		WasImpostor:  wasImpostor,
		Reason:       r.meeting.reason,
	}
}

// meetingButtonView es el estado que ve el HUD: cuándo puede volver a
// convocar y cuántas convocatorias quedan. null fuera de PLAYING.
func (r *Room) meetingButtonView() *matchv1.MeetingButton {
	if r.phase != matchv1.Phase_PLAYING {
		return nil
	}
	return &matchv1.MeetingButton{
		ReadyAtTick: r.meetingReadyAt,
		CallsLeft:   int32(max(meetingCallsMax-r.meetingCallsUsed, 0)),
	}
}

func (r *Room) chatViews() []*matchv1.ChatMessage {
	if len(r.chat) == 0 {
		return nil
	}
	views := make([]*matchv1.ChatMessage, 0, len(r.chat))
	for _, c := range r.chat {
		views = append(views, &matchv1.ChatMessage{
			Id:       c.id,
			PlayerId: c.playerID,
			Text:     c.text,
			Tick:     c.tick,
		})
	}
	return views
}

func nearDeadTank(p *player, t *tank) bool {
	dx := float64(p.view.X) - t.x
	dy := float64(p.view.Y) - t.y
	return dx*dx+dy*dy <= reportRange*reportRange
}

// handleChat procesa un mensaje de chat durante la reunión (S2-05).
func (r *Room) handleChat(playerID string, msgID string, text string) {
	if r.phase != matchv1.Phase_MEETING || r.meeting == nil {
		return
	}
	p, ok := r.players[playerID]
	if !ok || !p.view.Alive {
		return
	}
	if text == "" || utf8.RuneCountInString(text) > chatMaxChars {
		return
	}
	if r.tick < p.nextChatTick {
		return
	}
	// S3-04: un client_msg_id ya visto en la partida es un reintento del
	// navegador (chat escrito sin conexión): se descarta.
	if msgID == "" || r.seenChat[msgID] {
		return
	}
	r.seenChat[msgID] = true

	p.nextChatTick = r.tick + chatCooldownTicks
	entry := chatEntry{
		id:       msgID,
		playerID: playerID,
		text:     text,
		tick:     r.tick,
	}
	r.chat = append(r.chat, entry)
	if len(r.chat) > chatHistoryLimit {
		r.chat = r.chat[len(r.chat)-chatHistoryLimit:]
	}
}

// handleVote procesa el voto de un jugador durante la reunión (S2-05).
func (r *Room) handleVote(
	voterID string,
	targetID string,
	skip bool,
) {
	if r.phase != matchv1.Phase_MEETING || r.meeting == nil {
		return
	}
	if r.meeting.votingClosed {
		return
	}
	voter, ok := r.players[voterID]
	if !ok || !voter.view.Alive {
		return
	}
	if _, alreadyVoted := r.meeting.votes[voterID]; alreadyVoted {
		return
	}
	if !skip {
		target, ok := r.players[targetID]
		if !ok || !target.view.Alive {
			return
		}
	} else {
		targetID = ""
	}

	r.meeting.votes[voterID] = voteChoice{
		targetID: targetID,
		skip:     skip,
	}

	if r.allAliveVoted() {
		r.closeVoting()
	}
}

// allAliveVoted verifica si todos los jugadores vivos ya votaron.
func (r *Room) allAliveVoted() bool {
	if r.meeting == nil {
		return false
	}
	for id, p := range r.players {
		if p.view.Alive {
			if _, ok := r.meeting.votes[id]; !ok {
				return false
			}
		}
	}
	return true
}

// closeVoting finaliza la votación, cuenta los votos y expulsa si corresponde.
func (r *Room) closeVoting() {
	if r.meeting == nil || r.meeting.votingClosed {
		return
	}
	r.meeting.votingClosed = true
	r.meeting.resultEndsAt = r.tick + meetingResultTicks
	r.skipForDisconnected()

	ejectedID, wasImpostor := r.tallyVotes()
	r.meeting.ejectedID = ejectedID
	r.meeting.wasImpostor = wasImpostor

	if ejectedID != "" {
		if p, ok := r.players[ejectedID]; ok {
			p.view.Alive = false
			p.ejected = true
			p.dx = 0
			p.dy = 0
			p.pending = nil
			p.taskStartTick = 0
			p.taskStation = ""
		}
		r.publishPlayerEjected(ejectedID, wasImpostor)
	}
}

// publishPlayerEjected emite el evento player.ejected de forma asíncrona.
func (r *Room) publishPlayerEjected(
	playerID string,
	wasImpostor bool,
) {
	if r.publisher == nil {
		return
	}
	pub := r.publisher
	code := r.Code
	event := events.NewPlayerEjected(
		r.MatchID,
		playerID,
		wasImpostor,
	)
	go func() {
		ctx, cancel := context.WithTimeout(
			context.Background(),
			depsTimeout,
		)
		defer cancel()
		err := pub.Publish(
			ctx,
			events.RoutingKeyPlayerEjected,
			event,
		)
		if err != nil {
			log.Printf(
				"room %s: no se pudo publicar player.ejected: %v",
				code,
				err,
			)
		}
	}()
}

// skipForDisconnected: el vivo desconectado que no alcanzó a votar
// cuenta como "saltar" (S3-01).
func (r *Room) skipForDisconnected() {
	for id, p := range r.players {
		if !p.view.Alive || p.view.Connected {
			continue
		}
		if _, voted := r.meeting.votes[id]; !voted {
			r.meeting.votes[id] = voteChoice{skip: true}
		}
	}
}

// tallyVotes evalúa los votos de la reunión actual.
func (r *Room) tallyVotes() (string, bool) {
	if r.meeting == nil {
		return "", false
	}
	return tallyVotes(
		r.meeting.votes,
		func(playerID string) bool {
			p, ok := r.players[playerID]
			return ok && p.view.Alive
		},
		func(playerID string) bool {
			p, ok := r.players[playerID]
			return ok && p.role == matchv1.Role_IMPOSTOR
		},
	)
}

// tallyVotes cuenta votos según las reglas de S2-05:
// - Solo cuentan votos de jugadores vivos hacia jugadores vivos o skip.
// - La mayoría simple expulsa al jugador más votado.
// - En empate o mayoría de skip nadie sale.
func tallyVotes(
	votes map[string]voteChoice,
	isAlive func(playerID string) bool,
	isImpostor func(playerID string) bool,
) (ejectedID string, wasImpostor bool) {
	if len(votes) == 0 {
		return "", false
	}
	counts := make(map[string]int)
	skipCount := 0

	for voterID, choice := range votes {
		if !isAlive(voterID) {
			continue
		}
		if choice.skip {
			skipCount++
			continue
		}
		if !isAlive(choice.targetID) {
			continue
		}
		counts[choice.targetID]++
	}

	maxVotes := 0
	topCandidate := ""
	tie := false

	candidates := make([]string, 0, len(counts))
	for id := range counts {
		candidates = append(candidates, id)
	}
	sort.Strings(candidates)

	for _, id := range candidates {
		c := counts[id]
		if c > maxVotes {
			maxVotes = c
			topCandidate = id
			tie = false
		} else if c == maxVotes {
			tie = true
		}
	}

	if maxVotes == 0 || tie || skipCount >= maxVotes {
		return "", false
	}

	return topCandidate, isImpostor(topCandidate)
}

// stepMeeting avanza la votación y el tiempo de pantalla de resultado (S2-05).
func (r *Room) stepMeeting() {
	if r.meeting == nil {
		return
	}
	if !r.meeting.votingClosed {
		if r.tick >= r.meeting.votingEndsAt {
			r.closeVoting()
		}
		return
	}
	if r.tick >= r.meeting.resultEndsAt {
		r.meeting = nil
		r.phase = matchv1.Phase_PLAYING
	}
}
