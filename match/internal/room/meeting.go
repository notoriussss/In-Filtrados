package room

import (
	"sort"
	"unicode/utf8"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
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
	if t == nil || !t.dead {
		return
	}
	if !nearDeadTank(p, t) {
		return
	}

	r.phase = matchv1.Phase_MEETING
	r.teleportToPlaza()

	visitors := r.lastVisitors(tankSlot)
	r.meeting = &meetingState{
		reporterID:   playerID,
		tankSlot:     tankSlot,
		lastVisitors: visitors,
		votes:        make(map[string]voteChoice),
		votingEndsAt: r.tick + meetingVotingTicks,
	}
}

// teleportToPlaza mueve a todos los jugadores a la plaza y frena su avance.
func (r *Room) teleportToPlaza() {
	ids := make([]string, 0, len(r.players))
	for id := range r.players {
		ids = append(ids, id)
	}
	sort.Strings(ids)

	for i, id := range ids {
		p := r.players[id]
		x, y := r.m.SpawnPoint(i)
		p.view.X = float32(x)
		p.view.Y = float32(y)
		p.dx = 0
		p.dy = 0
		p.pending = nil
		p.taskStartTick = 0
		p.taskStation = ""
	}
}

// lastVisitors devuelve hasta 3 jugadores distintos que pasaron
// a 40 unidades o menos del tanque, según eventHistory.
func (r *Room) lastVisitors(slot int32) []string {
	seen := make(map[string]bool)
	var visitors []string
	for i := len(r.eventHistory) - 1; i >= 0; i-- {
		e := r.eventHistory[i]
		if e.TankSlot == slot && !seen[e.PlayerID] {
			seen[e.PlayerID] = true
			visitors = append(visitors, e.PlayerID)
			if len(visitors) == maxLastVisitors {
				break
			}
		}
	}
	return visitors
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
	return &matchv1.Meeting{
		ReporterId:   r.meeting.reporterID,
		TankSlot:     r.meeting.tankSlot,
		LastVisitors: r.meeting.lastVisitors,
		VotesCast:    votesCast,
		EndsAtTick:   r.meeting.votingEndsAt,
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

func (r *Room) stepMeeting() {
}
