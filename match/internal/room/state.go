package room

import (
	"time"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

const (
	tickInterval = 50 * time.Millisecond // 20 Hz (docs/tasks.md 0.4)
	stepPerTick  = 10                    // 200 units per second
	playerRadius = 16
	actionBuffer = 256

	// S1-11: empezar y terminar la partida.
	minPlayersToStart = 2
	depsTimeout       = 2 * time.Second

	// S2-02: roles y tanques.
	twoImpostorsFrom = 7  // con 7 o más jugadores hay 2 impostores
	noTank           = -1 // jugadores que llegaron después del último tanque
)

// colors are the 8 fixed player colors, given in order of arrival.
var colors = []string{
	"#e6194b",
	"#3cb44b",
	"#ffe119",
	"#4363d8",
	"#f58231",
	"#911eb4",
	"#46f0f0",
	"#f032e6",
}

// Join registers a player; Out receives the snapshots for that player.
type Join struct {
	PlayerID string
	Out      chan *matchv1.Snapshot
}

// Leave says that the stream with channel Out ended.
type Leave struct {
	PlayerID string
	Out      chan *matchv1.Snapshot
}

// Name dice cómo se llama un jugador (viene de CreateRoom o JoinRoom).
type Name struct {
	PlayerID    string
	DisplayName string
}

// PlayerAction es la última acción que mandó un jugador: moverse o empezar.
type PlayerAction struct {
	PlayerID string
	DX, DY   int32
	Start    bool
}

type player struct {
	view   *matchv1.PlayerView
	dx, dy int32
	out    chan *matchv1.Snapshot

	role     matchv1.Role // NO_ROLE hasta que empieza la partida
	tankSlot int          // noTank si no le tocó tanque
}

// tank es un tanque del huerto con su dueño (S2-02).
type tank struct {
	slot    int32
	ownerID string
	x, y    float64
}

func clampDir(v int32) int32 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
