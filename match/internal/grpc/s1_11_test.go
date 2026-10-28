package grpc_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
	matchgrpc "github.com/notoriussss/in-filtrados/match/internal/grpc"
	"github.com/notoriussss/in-filtrados/match/internal/room"
)

type fakePublisher struct {
	mu         sync.Mutex
	routingKey []string
}

func (f *fakePublisher) Publish(
	_ context.Context,
	routingKey string,
	_ any,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.routingKey = append(f.routingKey, routingKey)
	return nil
}

func (f *fakePublisher) count(routingKey string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	count := 0
	for _, key := range f.routingKey {
		if key == routingKey {
			count++
		}
	}
	return count
}

type fakeStore struct {
	mu     sync.Mutex
	starts int
}

func (f *fakeStore) StartMatch(
	_ context.Context,
	_ string,
	_ string,
	_ []room.PlayerInfo,
) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.starts++
	return nil
}

func (f *fakeStore) FinishMatch(
	_ context.Context,
	_ string,
	_ string,
	_ []room.ParticipantResult,
) error {
	return nil
}

func (f *fakeStore) started() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.starts
}

func waitForPhase(
	t *testing.T,
	stream matchv1.Match_PlayClient,
	phase matchv1.Phase,
) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		event, err := stream.Recv()
		require.NoError(t, err)
		snapshot := event.GetSnapshot()
		if snapshot != nil && snapshot.Phase == phase {
			return
		}
	}
	t.Fatalf("no llegó un snapshot con fase %v", phase)
}

// S1-11: el creador manda Start y la sala pasa a PLAYING, guardando la
// partida y publicando match.started.
func TestStartThroughStream(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	client, cleanup := setupServer(
		t,
		matchgrpc.WithPublisher(pub),
		matchgrpc.WithStore(store),
	)
	defer cleanup()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	created, err := client.CreateRoom(ctx, &matchv1.CreateRoomRequest{
		PlayerId:    "creator",
		DisplayName: "Creator",
	})
	require.NoError(t, err)

	streamA, err := client.Play(ctx)
	require.NoError(t, err)
	require.NoError(t, streamA.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  created.MatchId,
				PlayerId: "creator",
			},
		},
	}))
	_, err = streamA.Recv()
	require.NoError(t, err)

	streamB, err := client.Play(ctx)
	require.NoError(t, err)
	require.NoError(t, streamB.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  created.MatchId,
				PlayerId: "friend",
			},
		},
	}))
	_, err = streamB.Recv()
	require.NoError(t, err)

	streamC, err := client.Play(ctx)
	require.NoError(t, err)
	require.NoError(t, streamC.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  created.MatchId,
				PlayerId: "third",
			},
		},
	}))
	_, err = streamC.Recv()
	require.NoError(t, err)

	require.NoError(t, streamA.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Start{Start: &matchv1.Start{}},
	}))

	waitForPhase(t, streamB, matchv1.Phase_PLAYING)

	require.Equal(t, 1, store.started())
	require.Equal(t, 1, pub.count(events.RoutingKeyStarted))
}

// Un jugador que no es el creador no puede empezar la partida.
func TestStartFromNonCreatorIsIgnored(t *testing.T) {
	pub := &fakePublisher{}
	store := &fakeStore{}
	client, cleanup := setupServer(
		t,
		matchgrpc.WithPublisher(pub),
		matchgrpc.WithStore(store),
	)
	defer cleanup()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	created, err := client.CreateRoom(ctx, &matchv1.CreateRoomRequest{
		PlayerId: "creator",
	})
	require.NoError(t, err)

	streamA, err := client.Play(ctx)
	require.NoError(t, err)
	require.NoError(t, streamA.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  created.MatchId,
				PlayerId: "creator",
			},
		},
	}))
	_, err = streamA.Recv()
	require.NoError(t, err)

	streamB, err := client.Play(ctx)
	require.NoError(t, err)
	require.NoError(t, streamB.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  created.MatchId,
				PlayerId: "friend",
			},
		},
	}))
	_, err = streamB.Recv()
	require.NoError(t, err)

	require.NoError(t, streamB.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Start{Start: &matchv1.Start{}},
	}))

	time.Sleep(200 * time.Millisecond)

	require.Equal(t, 0, store.started())
	require.Equal(t, 0, pub.count(events.RoutingKeyStarted))

	// La sala sigue en LOBBY.
	event, err := streamA.Recv()
	require.NoError(t, err)
	require.Equal(t, matchv1.Phase_LOBBY, event.GetSnapshot().Phase)
}
