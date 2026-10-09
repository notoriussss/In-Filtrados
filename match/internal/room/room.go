// Package room runs one match room in a single goroutine (docs/architecture.md).
package room

import (
	"context"
	"log"
	"sort"
	"sync/atomic"
	"time"

	"google.golang.org/protobuf/proto"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// Room has no mutex: only the goroutine running Run touches its state.
type Room struct {
	Code    string
	MatchID string

	m       *Map
	players map[string]*player
	order   int
	phase   matchv1.Phase
	tick    int64

	creatorID     string
	publisher     events.Publisher
	store         MatchStore
	matchDuration time.Duration
	startedAt     time.Time
	participants  []PlayerInfo

	joins   chan Join
	leaves  chan Leave
	actions chan PlayerAction

	// connectedCount es actualizado atomicamente por la goroutine de la sala.
	connectedCount atomic.Int32
}

func NewRoom(code string, matchID string, m *Map, opts ...Option) *Room {
	r := &Room{
		Code:          code,
		MatchID:       matchID,
		m:             m,
		players:       make(map[string]*player),
		phase:         matchv1.Phase_LOBBY,
		matchDuration: defaultMatchDuration,
		joins:         make(chan Join),
		leaves:        make(chan Leave),
		actions:       make(chan PlayerAction, actionBuffer),
	}
	for _, opt := range opts {
		opt(r)
	}
	return r
}

// These three methods are called from other goroutines; they only send to channels.
func (r *Room) Join(j Join)        { r.joins <- j }
func (r *Room) Leave(l Leave)      { r.leaves <- l }
func (r *Room) Act(a PlayerAction) { r.actions <- a }

func (r *Room) Run(ctx context.Context) {
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		select {
		case j := <-r.joins:
			r.addPlayer(j)
		case l := <-r.leaves:
			r.removePlayer(l)
		case a := <-r.actions:
			r.handleAction(a)
		case <-ticker.C:
			r.step()
			r.tick++
			r.broadcast()
		case <-ctx.Done():
			return
		}
	}
}

// handleAction aplica Start o el movimiento del jugador.
func (r *Room) handleAction(a PlayerAction) {
	if a.Start {
		r.startMatch(a.PlayerID)
		return
	}
	if p, ok := r.players[a.PlayerID]; ok {
		p.dx, p.dy = clampDir(a.DX), clampDir(a.DY)
	}
}

func (r *Room) addPlayer(j Join) {
	if p, ok := r.players[j.PlayerID]; ok { // same player coming back
		p.view.Connected = true
		p.out = j.Out
		return
	}
	r.connectedCount.Add(1)
	x, y := r.m.SpawnPoint(r.order)
	r.players[j.PlayerID] = &player{
		view: &matchv1.PlayerView{
			Id:        j.PlayerID,
			Name:      j.PlayerID,
			Color:     colors[r.order%len(colors)],
			X:         float32(x),
			Y:         float32(y),
			Connected: true,
			Alive:     true,
		},
		out: j.Out,
	}
	r.order++
}

// removePlayer marks the player as disconnected. Only the stream that is
// still registered can do it, so a stale stream cannot kick a reconnected one.
func (r *Room) removePlayer(l Leave) {
	p, ok := r.players[l.PlayerID]
	if !ok || p.out != l.Out {
		return
	}
	p.view.Connected = false
	p.dx, p.dy = 0, 0
	p.out = nil
}

// startMatch pasa la sala a PLAYING: guarda la partida y publica el evento.
// Solo lo acepta el creador, en LOBBY y con al menos 2 jugadores conectados.
func (r *Room) startMatch(playerID string) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	if r.creatorID != "" && playerID != r.creatorID {
		log.Printf("room %s: %s no es el creador; start ignorado", r.Code, playerID)
		return
	}
	if r.connectedPlayers() < minPlayersToStart {
		log.Printf(
			"room %s: hacen falta %d jugadores para empezar",
			r.Code,
			minPlayersToStart,
		)
		return
	}

	r.phase = matchv1.Phase_PLAYING
	r.startedAt = time.Now()
	r.participants = r.snapshotParticipants()

	ctx, cancel := context.WithTimeout(context.Background(), depsTimeout)
	defer cancel()

	if r.store != nil {
		err := r.store.StartMatch(ctx, r.MatchID, r.Code, r.participants)
		if err != nil {
			log.Printf("room %s: no se pudo guardar el inicio: %v", r.Code, err)
		}
	}
	if r.publisher != nil {
		playerIDs := make([]string, 0, len(r.participants))
		for _, p := range r.participants {
			playerIDs = append(playerIDs, p.PlayerID)
		}
		event := events.NewMatchStarted(
			r.MatchID,
			r.Code,
			r.startedAt,
			playerIDs,
		)
		err := r.publisher.Publish(ctx, events.RoutingKeyStarted, event)
		if err != nil {
			log.Printf("room %s: no se pudo publicar match.started: %v", r.Code, err)
		}
	}
	log.Printf("room %s: partida %s iniciada", r.Code, r.MatchID)
}

// finishMatch termina sola la partida con winner crew (regla de la semana 1).
func (r *Room) finishMatch() {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	r.phase = matchv1.Phase_ENDED
	finishedAt := time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), depsTimeout)
	defer cancel()

	if r.store != nil {
		err := r.store.FinishMatch(ctx, r.MatchID, events.WinnerCrew)
		if err != nil {
			log.Printf("room %s: no se pudo guardar el fin: %v", r.Code, err)
		}
	}
	if r.publisher != nil {
		results := make([]events.PlayerResult, 0, len(r.participants))
		for _, p := range r.participants {
			results = append(results, events.PlayerResult{
				PlayerID: p.PlayerID,
				Role:     events.RoleCrew,
				Ejected:  false,
				Harvest:  0,
			})
		}
		event := events.NewMatchFinished(
			r.MatchID,
			finishedAt,
			events.WinnerCrew,
			results,
		)
		err := r.publisher.Publish(ctx, events.RoutingKeyFinished, event)
		if err != nil {
			log.Printf("room %s: no se pudo publicar match.finished: %v", r.Code, err)
		}
	}
	log.Printf("room %s: partida %s terminada (crew)", r.Code, r.MatchID)
}

// connectedPlayers cuenta los jugadores con un stream abierto.
func (r *Room) connectedPlayers() int {
	count := 0
	for _, p := range r.players {
		if p.out != nil {
			count++
		}
	}
	return count
}

// snapshotParticipants copia los jugadores actuales para la base y los eventos.
func (r *Room) snapshotParticipants() []PlayerInfo {
	infos := make([]PlayerInfo, 0, len(r.players))
	for id, p := range r.players {
		infos = append(infos, PlayerInfo{PlayerID: id, DisplayName: p.view.Name})
	}
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].PlayerID < infos[j].PlayerID
	})
	return infos
}

// step mueve a cada jugador y termina la partida si se cumplió el tiempo.
func (r *Room) step() {
	if r.phase == matchv1.Phase_PLAYING &&
		time.Since(r.startedAt) >= r.matchDuration {
		r.finishMatch()
	}
	for _, p := range r.players {
		nx, ny := r.m.Move(
			float64(p.view.X),
			float64(p.view.Y),
			float64(p.dx*stepPerTick),
			float64(p.dy*stepPerTick),
		)
		p.view.X, p.view.Y = float32(nx), float32(ny)
	}
}

// broadcast never blocks: if a player's channel is full, that snapshot is
// dropped for them and the next one brings them up to date.
func (r *Room) broadcast() {
	views := make([]*matchv1.PlayerView, 0, len(r.players))
	for _, p := range r.players {
		views = append(views, proto.Clone(p.view).(*matchv1.PlayerView))
	}
	snap := &matchv1.Snapshot{
		Tick:    r.tick,
		Phase:   r.phase,
		Players: views,
	}
	for _, p := range r.players {
		if p.out == nil {
			continue
		}
		select {
		case p.out <- snap:
		default:
		}
	}
}

// PlayerCount devuelve cuántos jugadores hay en la sala.
// Es seguro llamarlo desde otras goroutines.
func (r *Room) PlayerCount() int {
	return int(r.connectedCount.Load())
}
