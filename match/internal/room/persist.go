package room

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// S3-02: instantáneas. Cada 2 s y en cada cambio de fase la sala
// serializa su estado y se lo pasa a un SnapshotSaver, que lo escribe en
// otra goroutine. Si match se reinicia, Restore recrea la sala en pausa
// hasta que los jugadores vuelvan. Se pierden como mucho 2 s.

// saveEveryTicks: 40 ticks de 50 ms = 2 s.
const saveEveryTicks = 40

// savedRoom es lo que va a la columna state (JSONB) de snapshots. Lo
// que dura menos de 2 s (acciones a medias, la tarea en curso) no se
// guarda: al volver, el jugador solo tiene que empezarla de nuevo.
type savedRoom struct {
	Code           string            `json:"code"`
	MatchID        string            `json:"match_id"`
	CreatorID      string            `json:"creator_id"`
	TasksPerPlayer int               `json:"tasks_per_player,omitempty"`
	Impostors      int               `json:"impostors,omitempty"`
	MatchMinutes   int               `json:"match_minutes,omitempty"`
	Phase          matchv1.Phase     `json:"phase"`
	Tick           int64             `json:"tick"`
	StartTick      int64             `json:"start_tick"`
	MeetingTicks   int64             `json:"meeting_ticks,omitempty"`
	StartedAt      time.Time         `json:"started_at"`
	Order          int               `json:"order"`
	Reservoir      int32             `json:"reservoir"`
	Names          map[string]string `json:"names"`
	Participants   []PlayerInfo      `json:"participants"`
	Players        []savedPlayer     `json:"players"`
	Tanks          []savedTank       `json:"tanks"`
	Meeting        *savedMeeting     `json:"meeting,omitempty"`
	Chat           []savedChat       `json:"chat"`
	OilDrops       []savedOilDrop    `json:"oil_drops"`
	EventHistory   []LogEntry        `json:"event_history"`
	SeenChat       []string          `json:"seen_chat"`
	// S3-05: opcionales para que sirvan las instantáneas viejas.
	Emergency       *savedEmergency `json:"emergency,omitempty"`
	SabotageReadyAt int64           `json:"sabotage_ready_at,omitempty"`
	PipesUsed       int             `json:"pipes_used,omitempty"`
	NextRandomAt    int64           `json:"next_random_at,omitempty"`
	// Mesa: estado de la mesa de reuniones.
	MeetingReadyAt   int64 `json:"meeting_ready_at,omitempty"`
	MeetingCallsUsed int   `json:"meeting_calls_used,omitempty"`
}

type savedEmergency struct {
	Kind     string `json:"kind"`
	EndsAt   int64  `json:"ends_at"`
	Sabotage bool   `json:"sabotage"`
}

type savedPlayer struct {
	ID             string       `json:"id"`
	Name           string       `json:"name"`
	Color          string       `json:"color"`
	Skin           string       `json:"skin,omitempty"`
	Accessory      string       `json:"accessory,omitempty"`
	X              float32      `json:"x"`
	Y              float32      `json:"y"`
	Alive          bool         `json:"alive"`
	Role           matchv1.Role `json:"role"`
	TankSlot       int          `json:"tank_slot"`
	AssignedTasks  []string     `json:"assigned_tasks"`
	TasksCompleted int          `json:"tasks_completed"`
	// Opcional para que sirvan las instantáneas viejas.
	LitersSaved int `json:"liters_saved,omitempty"`
	// S2-11: opcional para que sirvan las instantáneas viejas.
	CompletedTasks  []string `json:"completed_tasks,omitempty"`
	NextContaminate int64    `json:"next_contaminate"`
	NextChatTick    int64    `json:"next_chat_tick"`
	Ejected         bool     `json:"ejected"`
	OilUntil        int64    `json:"oil_until"`
	NextOilDrop     int64    `json:"next_oil_drop"`
}

type savedTank struct {
	Slot          int32   `json:"slot"`
	OwnerID       string  `json:"owner_id"`
	X             float64 `json:"x"`
	Y             float64 `json:"y"`
	Contamination int32   `json:"contamination"`
	Dead          bool    `json:"dead"`
	Reported      bool    `json:"reported"`
}

type savedMeeting struct {
	ReporterID   string                `json:"reporter_id"`
	TankSlot     int32                 `json:"tank_slot"`
	Reason       matchv1.MeetingReason `json:"reason,omitempty"`
	Votes        map[string]savedVote  `json:"votes"`
	VotingEndsAt int64                 `json:"voting_ends_at"`
	ResultEndsAt int64                 `json:"result_ends_at"`
	VotingClosed bool                  `json:"voting_closed"`
	EjectedID    string                `json:"ejected_id"`
	WasImpostor  bool                  `json:"was_impostor"`
}

type savedVote struct {
	TargetID string `json:"target_id"`
	Skip     bool   `json:"skip"`
}

type savedChat struct {
	ID       string `json:"id"`
	PlayerID string `json:"player_id"`
	Text     string `json:"text"`
	Tick     int64  `json:"tick"`
}

type savedOilDrop struct {
	X         float32 `json:"x"`
	Y         float32 `json:"y"`
	Color     string  `json:"color"`
	ExpiresAt int64   `json:"expires_at"`
}

// saveKey cambia con la fase y al cerrar la votación: cada cambio se
// guarda en el acto, sin esperar los 2 s.
func (r *Room) saveKey() string {
	closed := r.meeting != nil && r.meeting.votingClosed
	return fmt.Sprintf("%d/%t", r.phase, closed)
}

// maybeSave guarda la instantánea si cambió la fase o pasaron 2 s de
// juego. Solo guarda partidas empezadas: la sala de espera no se
// recupera tras un reinicio. Nunca bloquea: Save solo deja el estado.
func (r *Room) maybeSave() {
	if r.snapshots == nil || r.phase == matchv1.Phase_LOBBY {
		return
	}
	key := r.saveKey()
	if key == r.savedKey {
		if r.phase == matchv1.Phase_ENDED ||
			r.tick-r.savedTick < saveEveryTicks {
			return
		}
	}
	state, err := json.Marshal(r.toSaved())
	if err != nil {
		log.Printf("room %s: no se pudo serializar: %v", r.Code, err)
		return
	}
	r.snapshots.Save(r.MatchID, r.tick, state)
	r.savedKey = key
	r.savedTick = r.tick
}

func (r *Room) toSaved() savedRoom {
	s := savedRoom{
		Code:           r.Code,
		MatchID:        r.MatchID,
		CreatorID:      r.creatorID,
		TasksPerPlayer: r.tasksPerPlayer,
		Impostors:      r.impostors,
		MatchMinutes:   int(r.matchDuration / time.Minute),
		Phase:          r.phase,
		Tick:           r.tick,
		StartTick:      r.startTick,
		MeetingTicks:   r.meetingTicks,
		StartedAt:      r.startedAt,
		Order:          r.order,
		Reservoir:      r.reservoir,
		Names:          r.names,
		Participants:   r.participants,
		EventHistory:   r.eventHistory,

		SabotageReadyAt:  r.sabotageReadyAt,
		PipesUsed:        r.pipesUsed,
		NextRandomAt:     r.nextRandomAt,
		MeetingReadyAt:   r.meetingReadyAt,
		MeetingCallsUsed: r.meetingCallsUsed,
	}
	if e := r.emergency; e != nil {
		s.Emergency = &savedEmergency{
			Kind:     e.kind,
			EndsAt:   e.endsAt,
			Sabotage: e.sabotage,
		}
	}
	for id := range r.seenChat {
		s.SeenChat = append(s.SeenChat, id)
	}
	for id, p := range r.players {
		tasks := make([]string, 0, len(p.assignedTasks))
		for station := range p.assignedTasks {
			tasks = append(tasks, station)
		}
		s.Players = append(s.Players, savedPlayer{
			ID:              id,
			Name:            p.view.Name,
			Color:           p.view.Color,
			Skin:            p.view.Skin,
			Accessory:       p.view.Accessory,
			X:               p.view.X,
			Y:               p.view.Y,
			Alive:           p.view.Alive,
			Role:            p.role,
			TankSlot:        p.tankSlot,
			AssignedTasks:   tasks,
			TasksCompleted:  p.tasksCompleted,
			LitersSaved:     p.litersSaved,
			CompletedTasks:  p.completedTasks,
			NextContaminate: p.nextContaminate,
			NextChatTick:    p.nextChatTick,
			Ejected:         p.ejected,
			OilUntil:        p.oilUntil,
			NextOilDrop:     p.nextOilDrop,
		})
	}
	for _, t := range r.tanks {
		s.Tanks = append(s.Tanks, savedTank{
			Slot:          t.slot,
			OwnerID:       t.ownerID,
			X:             t.x,
			Y:             t.y,
			Contamination: t.contamination,
			Dead:          t.dead,
			Reported:      t.reported,
		})
	}
	if m := r.meeting; m != nil {
		votes := make(map[string]savedVote, len(m.votes))
		for voter, v := range m.votes {
			votes[voter] = savedVote{TargetID: v.targetID, Skip: v.skip}
		}
		s.Meeting = &savedMeeting{
			ReporterID:   m.reporterID,
			TankSlot:     m.tankSlot,
			Reason:       m.reason,
			Votes:        votes,
			VotingEndsAt: m.votingEndsAt,
			ResultEndsAt: m.resultEndsAt,
			VotingClosed: m.votingClosed,
			EjectedID:    m.ejectedID,
			WasImpostor:  m.wasImpostor,
		}
	}
	for _, c := range r.chat {
		s.Chat = append(s.Chat, savedChat{
			ID:       c.id,
			PlayerID: c.playerID,
			Text:     c.text,
			Tick:     c.tick,
		})
	}
	for _, d := range r.oilDrops {
		s.OilDrops = append(s.OilDrops, savedOilDrop{
			X:         d.x,
			Y:         d.y,
			Color:     d.color,
			ExpiresAt: d.expiresAt,
		})
	}
	return s
}

// Restore recrea una sala desde su instantánea. Todos sus jugadores
// quedan desconectados y en periodo de gracia, así que la sala arranca
// en pausa hasta que vuelvan (docs/architecture.md, 6.3).
func Restore(state []byte, m *Map, opts ...Option) (*Room, error) {
	var s savedRoom
	if err := json.Unmarshal(state, &s); err != nil {
		return nil, fmt.Errorf("%s: %w", msgRestoreRoom, err)
	}
	r := NewRoom(s.Code, s.MatchID, m, opts...)
	r.creatorID = s.CreatorID
	if validTaskCount(s.TasksPerPlayer) {
		r.tasksPerPlayer = s.TasksPerPlayer
	}
	if s.Impostors >= 1 {
		r.impostors = s.Impostors
	}
	if validMatchMinutes(s.MatchMinutes) {
		r.matchDuration = time.Duration(s.MatchMinutes) * time.Minute
	}
	r.phase = s.Phase
	if r.phase == matchv1.Phase_ENDED {
		return nil, fmt.Errorf("partida ya terminada")
	}
	r.tick = s.Tick
	r.startTick = s.StartTick
	r.meetingTicks = s.MeetingTicks
	r.startedAt = s.StartedAt
	r.order = s.Order
	r.reservoir = s.Reservoir
	r.participants = s.Participants
	r.eventHistory = s.EventHistory
	r.sabotageReadyAt = s.SabotageReadyAt
	r.pipesUsed = s.PipesUsed
	r.nextRandomAt = s.NextRandomAt
	r.meetingReadyAt = s.MeetingReadyAt
	if r.meetingReadyAt == 0 {
		r.meetingReadyAt = r.startTick + meetingCallGraceTicks
	}
	r.meetingCallsUsed = s.MeetingCallsUsed
	if se := s.Emergency; se != nil && isEmergencyKind(se.Kind) {
		r.emergency = &emergencyState{
			kind:     se.Kind,
			endsAt:   se.EndsAt,
			sabotage: se.Sabotage,
		}
	}
	if s.Names != nil {
		r.names = s.Names
	}
	for _, id := range s.SeenChat {
		r.seenChat[id] = true
	}

	leftAt, graceUntil := time.Time{}, time.Time{}
	if r.inMatch() {
		leftAt = r.now()
		graceUntil = leftAt.Add(r.grace)
	}
	for _, sp := range s.Players {
		tasks := make(map[string]bool, len(sp.AssignedTasks))
		for _, station := range sp.AssignedTasks {
			tasks[station] = true
		}
		playerLeftAt, playerGraceUntil := time.Time{}, time.Time{}
		if r.inMatch() && sp.Alive {
			playerLeftAt = leftAt
			playerGraceUntil = graceUntil
		}
		r.players[sp.ID] = &player{
			view: &matchv1.PlayerView{
				Id:        sp.ID,
				Name:      sp.Name,
				Color:     sp.Color,
				Skin:      skinOrDefault(sp.Skin),
				Accessory: sp.Accessory,
				X:         sp.X,
				Y:         sp.Y,
				Connected: false,
				Alive:     sp.Alive,
			},
			role:            sp.Role,
			tankSlot:        sp.TankSlot,
			assignedTasks:   tasks,
			tasksCompleted:  sp.TasksCompleted,
			litersSaved:     sp.LitersSaved,
			completedTasks:  sp.CompletedTasks,
			nextContaminate: sp.NextContaminate,
			nextChatTick:    sp.NextChatTick,
			ejected:         sp.Ejected,
			oilUntil:        sp.OilUntil,
			nextOilDrop:     sp.NextOilDrop,
			leftAt:          playerLeftAt,
			graceUntil:      playerGraceUntil,
		}
	}
	r.connectedCount.Store(int32(len(r.players)))

	for _, st := range s.Tanks {
		r.tanks = append(r.tanks, &tank{
			slot:          st.Slot,
			ownerID:       st.OwnerID,
			x:             st.X,
			y:             st.Y,
			contamination: st.Contamination,
			dead:          st.Dead,
			reported:      st.Reported,
		})
	}
	if sm := s.Meeting; sm != nil {
		votes := make(map[string]voteChoice, len(sm.Votes))
		for voter, v := range sm.Votes {
			votes[voter] = voteChoice{targetID: v.TargetID, skip: v.Skip}
		}
		r.meeting = &meetingState{
			reporterID:   sm.ReporterID,
			tankSlot:     sm.TankSlot,
			reason:       sm.Reason,
			votes:        votes,
			votingEndsAt: sm.VotingEndsAt,
			resultEndsAt: sm.ResultEndsAt,
			votingClosed: sm.VotingClosed,
			ejectedID:    sm.EjectedID,
			wasImpostor:  sm.WasImpostor,
		}
	}
	for _, c := range s.Chat {
		r.chat = append(r.chat, chatEntry{
			id:       c.ID,
			playerID: c.PlayerID,
			text:     c.Text,
			tick:     c.Tick,
		})
	}
	for _, d := range s.OilDrops {
		r.oilDrops = append(r.oilDrops, &oilDrop{
			x:         d.X,
			y:         d.Y,
			color:     d.Color,
			expiresAt: d.ExpiresAt,
		})
	}
	// S3-04: el monitor ve a todos en periodo de gracia hasta que vuelvan.
	if r.inMatch() {
		for id, p := range r.players {
			if p.view.Alive {
				r.publishDisconnected(id, p, leftAt)
			}
		}
	}
	// Lo que se acaba de leer ya está guardado.
	r.savedKey = r.saveKey()
	r.savedTick = r.tick
	return r, nil
}
