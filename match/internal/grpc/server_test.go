package grpc_test

import (
	"context"
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	matchgrpc "github.com/notoriussss/in-filtrados/match/internal/grpc"
	"github.com/notoriussss/in-filtrados/match/internal/room"
)

const bufSize = 1024 * 1024

func setupServer(
	t *testing.T,
	opts ...matchgrpc.ServerOption,
) (matchv1.MatchClient, func()) {
	t.Helper()
	lis := bufconn.Listen(bufSize)
	s := grpc.NewServer()

	// Cargamos el mapa asumiendo el directorio del test
	m, err := room.LoadMap("../../../shared/map.json")
	require.NoError(t, err)

	reg := room.NewRegistry()
	matchv1.RegisterMatchServer(s, matchgrpc.NewServer(reg, m, opts...))

	go func() {
		if err := s.Serve(lis); err != nil && err != grpc.ErrServerStopped {
			panic(err)
		}
	}()

	conn, err := grpc.DialContext(context.Background(), "bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) {
			return lis.Dial()
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	require.NoError(t, err)

	client := matchv1.NewMatchClient(conn)

	cleanup := func() {
		conn.Close()
		s.Stop()
	}

	return client, cleanup
}

func TestCreateJoinPlay(t *testing.T) {
	client, cleanup := setupServer(t)
	defer cleanup()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. CreateRoom
	createRes, err := client.CreateRoom(ctx, &matchv1.CreateRoomRequest{
		PlayerId:    "player-creator",
		DisplayName: "Creator",
	})
	require.NoError(t, err)
	require.Len(t, createRes.RoomCode, 4)
	require.NotEmpty(t, createRes.MatchId)

	// 2. JoinRoom
	joinRes, err := client.JoinRoom(ctx, &matchv1.JoinRoomRequest{
		RoomCode:    createRes.RoomCode,
		PlayerId:    "player-joiner",
		DisplayName: "Joiner",
	})
	require.NoError(t, err)
	require.Equal(t, createRes.MatchId, joinRes.MatchId)
	require.Equal(t, createRes.RoomCode, joinRes.RoomCode)

	matchID := createRes.MatchId

	// 3. Play stream A
	streamA, err := client.Play(ctx)
	require.NoError(t, err)
	err = streamA.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  matchID,
				PlayerId: "player-A",
			},
		},
	})
	require.NoError(t, err)

	// 3. Play stream B
	ctxB, cancelB := context.WithCancel(context.Background())
	defer cancelB()
	streamB, err := client.Play(ctxB)
	require.NoError(t, err)
	err = streamB.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Join{
			Join: &matchv1.Join{
				MatchId:  matchID,
				PlayerId: "player-B",
			},
		},
	})
	require.NoError(t, err)

	// Esperar que ambos se unan a la goroutine de la sala
	time.Sleep(100 * time.Millisecond)

	// Limpiar snapshots iniciales
	_, _ = streamA.Recv()
	_, _ = streamB.Recv()

	// Contar snapshots de streamA por ~1 segundo
	count := 0
	deadline := time.Now().Add(1 * time.Second)
	var lastSnap *matchv1.Snapshot
	for time.Now().Before(deadline) {
		ev, err := streamA.Recv()
		if err != nil {
			break
		}
		snap := ev.GetSnapshot()
		require.NotNil(t, snap)
		count++
		lastSnap = snap
	}
	require.GreaterOrEqual(t, count, 18)

	// Verificamos que ambos están conectados
	require.Len(t, lastSnap.Players, 2)
	playersByID := make(map[string]*matchv1.PlayerView)
	for _, p := range lastSnap.Players {
		playersByID[p.Id] = p
	}
	require.True(t, playersByID["player-A"].Connected)
	require.True(t, playersByID["player-B"].Connected)

	// 4. Cerrar stream B y validar que player-A recibe snapshot
	// con connected: false
	cancelB()

	disconnected := false
	deadline = time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		ev, err := streamA.Recv()
		if err != nil {
			break
		}
		snap := ev.GetSnapshot()
		require.NotNil(t, snap)
		for _, p := range snap.Players {
			if p.Id == "player-B" && !p.Connected {
				disconnected = true
				break
			}
		}
		if disconnected {
			break
		}
	}
	require.True(
		t,
		disconnected,
		"Player B should appear disconnected to Player A",
	)
}

func TestJoinRoomFull(t *testing.T) {
	client, cleanup := setupServer(t)
	defer cleanup()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	createRes, err := client.CreateRoom(ctx, &matchv1.CreateRoomRequest{
		PlayerId: "creator",
	})
	require.NoError(t, err)

	// Conectar a 10 jugadores
	for i := 0; i < 10; i++ {
		stream, err := client.Play(ctx)
		require.NoError(t, err)
		err = stream.Send(&matchv1.ClientAction{
			Action: &matchv1.ClientAction_Join{
				Join: &matchv1.Join{
					MatchId:  createRes.MatchId,
					PlayerId: fmt.Sprintf("player-%d", i),
				},
			},
		})
		require.NoError(t, err)

		// Esperar al primer snapshot para asegurar que se procesó el
		// Join internamente
		_, err = stream.Recv()
		require.NoError(t, err)
	}

	// El Join 11 debe fallar
	_, err = client.JoinRoom(ctx, &matchv1.JoinRoomRequest{
		RoomCode: createRes.RoomCode,
	})
	require.Error(t, err)
	st, ok := status.FromError(err)
	require.True(t, ok)
	require.Equal(t, codes.ResourceExhausted, st.Code())
}
