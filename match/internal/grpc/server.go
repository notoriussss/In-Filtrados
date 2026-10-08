// Package grpc implements the Match service from proto/match.proto.
// S1-07: only Play, against the fixed room DEV. S1-09 adds CreateRoom and JoinRoom here.
package grpc

import (
	"context"
	"errors"
	"io"
	"log"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/room"
)

type Server struct {
	matchv1.UnimplementedMatchServer
	dev *room.Room
}

func NewServer(dev *room.Room) *Server {
	return &Server{dev: dev}
}

func (s *Server) Play(stream matchv1.Match_PlayServer) error {
	first, err := stream.Recv()
	if err != nil {
		return err
	}
	join := first.GetJoin()
	if join == nil || join.GetPlayerId() == "" {
		return stream.Send(badMessage("El primer mensaje debe ser join"))
	}
	if join.GetMatchId() != s.dev.Code {
		return stream.Send(&matchv1.ServerEvent{Event: &matchv1.ServerEvent_Error{
			Error: &matchv1.Error{Code: "MATCH_NOT_FOUND", Message: "La partida no existe"},
		}})
	}

	playerID := join.GetPlayerId()
	out := make(chan *matchv1.Snapshot, 8)
	s.dev.Join(room.Join{PlayerID: playerID, Out: out})
	log.Printf("play: %s joined %s", playerID, s.dev.Code)
	defer func() {
		s.dev.Leave(room.Leave{PlayerID: playerID, Out: out})
		log.Printf("play: %s left %s", playerID, s.dev.Code)
	}()

	// Sender goroutine: the only one that calls stream.Send from here on.
	// Play waits for it before returning, because Send is not allowed after Play returns.
	ctx, cancel := context.WithCancel(stream.Context())
	sent := make(chan struct{})
	defer func() { cancel(); <-sent }()
	go func() {
		defer close(sent)
		for {
			select {
			case snap := <-out:
				if err := stream.Send(&matchv1.ServerEvent{Event: &matchv1.ServerEvent_Snapshot{Snapshot: snap}}); err != nil {
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
		if mv := msg.GetMove(); mv != nil {
			s.dev.Act(room.Action{PlayerID: playerID, DX: mv.GetDx(), DY: mv.GetDy()})
		}
	}
}

func badMessage(msg string) *matchv1.ServerEvent {
	return &matchv1.ServerEvent{Event: &matchv1.ServerEvent_Error{
		Error: &matchv1.Error{Code: "BAD_MESSAGE", Message: msg},
	}}
}
