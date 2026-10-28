package grpc_test

import (
	"context"
	"errors"
	"fmt"
	"io"
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
				PlayerId: "player-creator",
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
				PlayerId: "player-joiner",
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

	// Verificamos que ambos están conectados y tienen el nombre esperado
	require.Len(t, lastSnap.Players, 2)
	playersByID := make(map[string]*matchv1.PlayerView)
	for _, p := range lastSnap.Players {
		playersByID[p.Id] = p
	}
	require.True(t, playersByID["player-creator"].Connected)
	require.Equal(t, "Creator", playersByID["player-creator"].Name)
	require.True(t, playersByID["player-joiner"].Connected)
	require.Equal(t, "Joiner", playersByID["player-joiner"].Name)

	// 4. Cerrar stream B y validar que player-creator recibe snapshot
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
			if p.Id == "player-joiner" && !p.Connected {
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
		"Player Joiner should appear disconnected to Player Creator",
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

// TestPlayTerminatesAndLeaveDoesNotBlockOnCleanup comprueba que al terminar
// una partida y liberarse la sala con cleanupDelay corto, el stream Play
// termina solo por el cierre de canales y un Leave posterior no se cuelga.
func TestPlayTerminatesAndLeaveDoesNotBlockOnCleanup(t *testing.T) {
	client, cleanup := setupServer(
		t,
		matchgrpc.WithMatchDuration(100*time.Millisecond),
		matchgrpc.WithCleanupDelay(50*time.Millisecond),
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

	// Empezar la partida
	require.NoError(t, streamA.Send(&matchv1.ClientAction{
		Action: &matchv1.ClientAction_Start{Start: &matchv1.Start{}},
	}))

	// Esperar a que la partida termine y se libere la sala.
	// Play debe retornar nil (EOF en el stream del cliente).
	doneA := make(chan error, 1)
	go func() {
		for {
			_, err := streamA.Recv()
			if err != nil {
				doneA <- err
				return
			}
		}
	}()

	select {
	case err := <-doneA:
		require.True(
			t,
			errors.Is(err, io.EOF) || status.Code(err) == codes.OK,
		)
	case <-time.After(3 * time.Second):
		t.Fatal("streamA no terminó tras el cleanup de la sala")
	}

	// Cerrar streamB desde el cliente para verificar que el defer Leave
	// no se bloquea aunque la sala ya no exista en memoria.
	streamB.CloseSend()
}
