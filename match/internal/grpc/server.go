package grpc

import (
	"context"
	"errors"
	"io"
	"log"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
	"github.com/notoriussss/in-filtrados/match/internal/room"
)

type Server struct {
	matchv1.UnimplementedMatchServer
	registry      *room.Registry
	m             *room.Map
	publisher     events.Publisher
	store         room.MatchStore
	eventLog      room.EventLog
	matchDuration time.Duration
}

// ServerOption configura el servidor gRPC.
type ServerOption func(*Server)

// WithPublisher publica match.started y match.finished.
func WithPublisher(publisher events.Publisher) ServerOption {
	return func(s *Server) { s.publisher = publisher }
}

// WithStore guarda las partidas en PostgreSQL.
func WithStore(store room.MatchStore) ServerOption {
	return func(s *Server) { s.store = store }
}

// WithEventLog anota en event_log lo que pasa con los tanques.
func WithEventLog(eventLog room.EventLog) ServerOption {
	return func(s *Server) { s.eventLog = eventLog }
}

// WithMatchDuration acorta la partida; los tests la usan.
func WithMatchDuration(duration time.Duration) ServerOption {
	return func(s *Server) { s.matchDuration = duration }
}

func NewServer(reg *room.Registry, m *room.Map, opts ...ServerOption) *Server {
	s := &Server{registry: reg, m: m}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

func (s *Server) CreateRoom(
	ctx context.Context,
	req *matchv1.CreateRoomRequest,
) (*matchv1.Room, error) {
	matchID := uuid.New().String()
	for i := 0; i < maxCodeAttempts; i++ {
		code, err := room.GenerateCode()
		if err != nil {
			log.Printf("createRoom: error generando código: %v", err)
			return nil, status.Error(codes.Internal, ErrMsgCodeGen)
		}
		r := room.NewRoom(
			code,
			matchID,
			s.m,
			s.roomOptions(req.GetPlayerId())...,
		)
		if !s.registry.AddIfFree(r) {
			continue // código ocupado: probar otro
		}
		// La sala vive más que el RPC que la creó.
		go r.Run(context.Background())
		r.SetName(room.Name{
			PlayerID:    req.GetPlayerId(),
			DisplayName: req.GetDisplayName(),
		})
		log.Printf("createRoom: código=%s matchId=%s", code, matchID)
		return &matchv1.Room{RoomCode: code, MatchId: matchID}, nil
	}
	return nil, status.Error(codes.Internal, ErrMsgCodeGen)
}

// roomOptions arma las opciones de la sala con las dependencias del server.
func (s *Server) roomOptions(creatorID string) []room.Option {
	opts := []room.Option{room.WithCreator(creatorID)}
	if s.publisher != nil {
		opts = append(opts, room.WithPublisher(s.publisher))
	}
	if s.store != nil {
		opts = append(opts, room.WithStore(s.store))
	}
	if s.eventLog != nil {
		opts = append(opts, room.WithEventLog(s.eventLog))
	}
	if s.matchDuration > 0 {
		opts = append(opts, room.WithMatchDuration(s.matchDuration))
	}
	return opts
}

func (s *Server) JoinRoom(
	ctx context.Context,
	req *matchv1.JoinRoomRequest,
) (*matchv1.Room, error) {
	r, ok := s.registry.Get(req.GetRoomCode())
	if !ok {
		return nil, status.Error(codes.NotFound, ErrMsgRoomNotFound)
	}
	if r.PlayerCount() >= maxPlayers {
		return nil, status.Error(
			codes.ResourceExhausted,
			ErrMsgRoomFull,
		)
	}
	r.SetName(room.Name{
		PlayerID:    req.GetPlayerId(),
		DisplayName: req.GetDisplayName(),
	})
	return &matchv1.Room{
		RoomCode: r.Code,
		MatchId:  r.MatchID,
	}, nil
}

func (s *Server) Play(stream matchv1.Match_PlayServer) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	join := first.GetJoin()
	if join == nil || join.GetPlayerId() == "" {
		return stream.Send(badMessage(ErrMsgFirstMustBeJoin))
	}

	r, ok := s.registry.GetByMatchID(join.GetMatchId())
	if !ok {
		return stream.Send(matchNotFoundError())
	}

	playerID := join.GetPlayerId()
	out := make(chan *matchv1.Snapshot, 8)
	r.Join(room.Join{PlayerID: playerID, Out: out})
	log.Printf("play: %s joined %s", playerID, r.Code)
	defer func() {
		r.Leave(room.Leave{PlayerID: playerID, Out: out})
		log.Printf("play: %s left %s", playerID, r.Code)
	}()

	// Sender goroutine: the only one that calls stream.Send from here on.
	// Play waits for it before returning, because Send is not allowed
	// after Play returns.
	ctx, cancel := context.WithCancel(stream.Context())
	sent := make(chan struct{})
	defer func() { cancel(); <-sent }()
	go func() {
		defer close(sent)
		for {
			select {
			case snap := <-out:
				event := &matchv1.ServerEvent{
					Event: &matchv1.ServerEvent_Snapshot{
						Snapshot: snap,
					},
				}
				if err := stream.Send(event); err != nil {
					return
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	for {
		msg, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		switch {
		case msg.GetMove() != nil:
			mv := msg.GetMove()
			r.Act(room.PlayerAction{
				PlayerID: playerID,
				DX:       mv.GetDx(),
				DY:       mv.GetDy(),
			})
		case msg.GetStart() != nil:
			r.Act(room.PlayerAction{PlayerID: playerID, Start: true})
		case msg.GetContaminate() != nil:
			r.Act(room.PlayerAction{
				PlayerID:    playerID,
				Contaminate: true,
				TankSlot:    msg.GetContaminate().GetTankSlot(),
			})
		case msg.GetInteract() != nil:
			if action, ok := interactAction(playerID, msg.GetInteract()); ok {
				r.Act(action)
			}
		}
	}
}

// interactAction traduce Interact: sobre un tanque es limpiar (S2-03),
// y sobre una estación es una tarea (S2-04).
func interactAction(
	playerID string,
	interact *matchv1.Interact,
) (room.PlayerAction, bool) {
	switch target := interact.GetTarget().(type) {
	case *matchv1.Interact_TankSlot:
		return room.PlayerAction{
			PlayerID: playerID,
			Clean:    true,
			TankSlot: target.TankSlot,
		}, true
	case *matchv1.Interact_StationId:
		return room.PlayerAction{
			PlayerID:     playerID,
			InteractTask: true,
			StationID:    target.StationId,
			Completed:    interact.GetCompleted(),
		}, true
	default:
		return room.PlayerAction{}, false
	}
}
