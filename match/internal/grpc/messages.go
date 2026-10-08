// Package grpc implements the Match service from proto/match.proto.
// messages.go defines all constants and helper constructors for gRPC return messages.
package grpc

import "github.com/notoriussss/in-filtrados/match/gen/matchv1"

// Error codes returned in ServerEvent_Error.
const (
	ErrCodeMatchNotFound = "MATCH_NOT_FOUND"
	ErrCodeBadMessage    = "BAD_MESSAGE"
)

// User-facing error messages returned in ServerEvent_Error.
const (
	ErrMsgMatchNotFound   = "La partida no existe"
	ErrMsgFirstMustBeJoin = "El primer mensaje debe ser join"
)

func matchNotFoundError() *matchv1.ServerEvent {
	return &matchv1.ServerEvent{
		Event: &matchv1.ServerEvent_Error{
			Error: &matchv1.Error{
				Code:    ErrCodeMatchNotFound,
				Message: ErrMsgMatchNotFound,
			},
		},
	}
}

func badMessage(msg string) *matchv1.ServerEvent {
	return &matchv1.ServerEvent{
		Event: &matchv1.ServerEvent_Error{
			Error: &matchv1.Error{
				Code:    ErrCodeBadMessage,
				Message: msg,
			},
		},
	}
}
