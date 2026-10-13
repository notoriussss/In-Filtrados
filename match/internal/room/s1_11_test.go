package room

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// publishedEvent guarda lo que el publicador falso recibió.
type publishedEvent struct {
	routingKey string
	payload    any
}

type fakePublisher struct {
	mu     sync.Mutex
	events []publishedEvent
}

func (f *fakePublisher) Publish(
	_ context.Context,
	routingKey string,
	payload any,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, publishedEvent{routingKey, payload})
	return nil
}

func (f *fakePublisher) forKey(routingKey string) []publishedEvent {
	f.mu.Lock()
	defer f.mu.Unlock()
	var found []publishedEvent
	for _, event := range f.events {
		if event.routingKey == routingKey {
			found = append(found, event)
		}
	}
	return found
}

type fakeStore struct {
	mu              sync.Mutex
	starts          int
	finishes        int
	winner          string
	startID         string
	startCode       string
	startPlayers    []PlayerInfo
	endParticipants []ParticipantResult
}

func (f *fakeStore) StartMatch(
	_ context.Context,
	matchID string,
	roomCode string,
	players []PlayerInfo,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.starts++
	f.startID = matchID
	f.startCode = roomCode
	f.startPlayers = append([]PlayerInfo(nil), players...)
	return nil
}

func (f *fakeStore) FinishMatch(
	_ context.Context,
	_ string,
	winner string,
	participants []ParticipantResult,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.finishes++
	f.winner = winner
	f.endParticipants = append([]ParticipantResult(nil), participants...)
	return nil
}

// waitPhase waits for a snapshot with the given phase.
func waitPhase(
	t *testing.T,
	ch chan *matchv1.ServerEvent,
	phase matchv1.Phase,
) *matchv1.Snapshot {
	t.Helper()
	timeout := time.After(time.Second)
	for {
		select {
		case ev := <-ch:
			snap := snapOf(ev)
			if snap != nil && snap.Phase == phase {
				return snap
			}
		case <-timeout:
			t.Fatalf("no snapshot with phase %v", phase)
		}
	}
}

func TestStartNeedsTwoPlayers(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	r := startRoom(t,
		WithCreator("creator"),
		WithPublisher(pub),
		WithStore(store),
	)

	out := make(chan *matchv1.ServerEvent, 64)
	r.Join(Join{PlayerID: "creator", Out: out})
	waitPlayers(t, out, 1)

	r.Act(PlayerAction{PlayerID: "creator", Start: true})
	time.Sleep(100 * time.Millisecond)

	if got := len(pub.forKey(events.RoutingKeyStarted)); got != 0 {
		t.Errorf(
			"con un solo jugador no debe publicarse match.started, got %d",
			got,
		)
	}
	if store.starts != 0 {
		t.Errorf("con un solo jugador no debe guardarse la partida")
	}
	if snap := drain(out); snap == nil || snap.Phase != matchv1.Phase_LOBBY {
		t.Errorf("la sala debe seguir en LOBBY, got %v", snap)
	}
}

func TestStartIsIgnoredAfterPlaying(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	r := startRoom(t,
		WithCreator("creator"),
		WithPublisher(pub),
		WithStore(store),
	)

	a := make(chan *matchv1.ServerEvent, 64)
	b := make(chan *matchv1.ServerEvent, 64)
	r.Join(Join{PlayerID: "creator", Out: a})
	r.Join(Join{PlayerID: "friend", Out: b})
	waitPlayers(t, b, 2)

	r.Act(PlayerAction{PlayerID: "creator", Start: true})
	waitPhase(t, b, matchv1.Phase_PLAYING)

	r.Act(PlayerAction{PlayerID: "creator", Start: true})
	time.Sleep(100 * time.Millisecond)

	if store.starts != 1 {
		t.Errorf(
			"start repetido no debe guardar otra partida, got %d",
			store.starts,
		)
	}
	if got := len(pub.forKey(events.RoutingKeyStarted)); got != 1 {
		t.Errorf("start repetido no debe publicar otro evento, got %d", got)
	}
}

func TestStartSavesAndPublishes(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	r := startRoom(t,
		WithCreator("creator"),
		WithPublisher(pub),
		WithStore(store),
	)

	a := make(chan *matchv1.ServerEvent, 64)
	b := make(chan *matchv1.ServerEvent, 64)
	r.Join(Join{PlayerID: "creator", Out: a})
	r.Join(Join{PlayerID: "friend", Out: b})
	waitPlayers(t, b, 2)

	// Un intruso no puede empezar la partida.
	r.Act(PlayerAction{PlayerID: "friend", Start: true})
	time.Sleep(100 * time.Millisecond)
	if store.starts != 0 {
		t.Fatalf("un jugador que no es el creador no debe empezar la partida")
	}

	r.Act(PlayerAction{PlayerID: "creator", Start: true})
	waitPhase(t, b, matchv1.Phase_PLAYING)

	if store.starts != 1 {
		t.Fatalf("debe guardarse la partida una vez, got %d", store.starts)
	}
	if store.startID != "match-1" || store.startCode != "TEST" {
		t.Errorf(
			"partida guardada con datos raros: %s %s",
			store.startID,
			store.startCode,
		)
	}
	if len(store.startPlayers) != 2 {
		t.Errorf(
			"deben guardarse 2 participantes, got %d",
			len(store.startPlayers),
		)
	}

	started := waitForEvents(
		t,
		pub,
		events.RoutingKeyStarted,
		1,
	)
	if len(started) != 1 {
		t.Fatalf("debe publicarse un match.started, got %d", len(started))
	}
	event, ok := started[0].payload.(events.MatchStarted)
	if !ok {
		t.Fatalf("payload inesperado: %T", started[0].payload)
	}
	if event.MatchID != "match-1" || event.RoomCode != "TEST" {
		t.Errorf("evento con datos raros: %+v", event)
	}
	if len(event.PlayerIDs) != 2 {
		t.Errorf(
			"el evento debe llevar 2 jugadores, got %d",
			len(event.PlayerIDs),
		)
	}
	if event.EventID == "" || event.StartedAt == "" {
		t.Errorf("el evento debe llevar event_id y started_at: %+v", event)
	}
}

func TestMatchFinishesAfterDuration(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	r := startRoom(t,
		WithCreator("creator"),
		WithPublisher(pub),
		WithStore(store),
		WithMatchDuration(150*time.Millisecond),
	)

	a := make(chan *matchv1.ServerEvent, 64)
	b := make(chan *matchv1.ServerEvent, 64)
	r.Join(Join{PlayerID: "creator", Out: a})
	r.Join(Join{PlayerID: "friend", Out: b})
	waitPlayers(t, b, 2)

	r.Act(PlayerAction{PlayerID: "creator", Start: true})
	waitPhase(t, b, matchv1.Phase_PLAYING)
	waitPhase(t, b, matchv1.Phase_ENDED)

	if store.finishes != 1 || store.winner != events.WinnerImpostor {
		t.Fatalf(
			"debe terminarse la partida con impostor: finishes=%d winner=%s",
			store.finishes,
			store.winner,
		)
	}

	finished := waitForEvents(
		t,
		pub,
		events.RoutingKeyFinished,
		1,
	)
	if len(finished) != 1 {
		t.Fatalf("debe publicarse un match.finished, got %d", len(finished))
	}
	event, ok := finished[0].payload.(events.MatchFinished)
	if !ok {
		t.Fatalf("payload inesperado: %T", finished[0].payload)
	}
	if event.Winner != events.WinnerImpostor {
		t.Errorf("winner inesperado: %s", event.Winner)
	}
	if event.EventID == "" || event.FinishedAt == "" {
		t.Errorf("el evento debe llevar event_id y finished_at: %+v", event)
	}
	if len(event.Players) != 2 {
		t.Fatalf(
			"el evento debe llevar 2 jugadores, got %d",
			len(event.Players),
		)
	}
	impostors := 0
	for _, player := range event.Players {
		if player.Role == events.RoleImpostor {
			impostors++
		} else if player.Role != events.RoleCrew {
			t.Errorf("rol inesperado: %+v", player)
		}
		if player.Ejected || player.Harvest != 0 {
			t.Errorf("resultado inesperado: %+v", player)
		}
	}
	if impostors != 1 {
		t.Errorf("debe haber 1 impostor (S2-02), got %d", impostors)
	}
}
