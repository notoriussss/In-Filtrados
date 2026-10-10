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

	// S2-03: tanques (los tiempos van en ticks de 50 ms).
	tankRange           = 40  // unidades para contaminar, limpiar o visitar
	maxContamination    = 100 // a 100 el tanque muere
	contaminateTicks    = 60  // 3 s quieto
	contaminateAmount   = 35
	contaminateCooldown = 400 // 20 s entre contaminaciones
	cleanTicks          = 40  // 2 s quieto
	cleanAmount         = 15
	impostorDriftTicks  = 100 // el tanque del impostor sube solo cada 5 s
	impostorDriftAmount = 1

	// S2-04: tareas 3R
	tasksPerPlayer = 4
	taskMinTicks   = 60 // 3 s
	taskRadius     = 40
	reservoirMax   = 100

	taskReduce     = "reduce"
	taskReuse      = "reuse"
	taskRecycle    = "recycle"
	pointsReduce   = 3
	pointsReuse    = 4
	pointsRecycle  = 5
	litersPerPoint = 100

	// S2-05: reunión, chat y votación
	reportRange        = 60  // unidades para reportar tanque muerto
	meetingVotingTicks = 900 // 45 s para discutir y votar
	meetingResultTicks = 100 // 5 s de resultado antes de PLAYING
	chatMaxChars       = 200 // caracteres máximos por mensaje de chat
	chatCooldownTicks  = 20  // 1 s entre mensajes de chat
	chatHistoryLimit   = 30  // mensajes guardados en snapshot
	maxLastVisitors    = 3   // visitantes máximos en el reporte
)

var taskPoints = map[string]int32{
	taskReduce:  pointsReduce,
	taskReuse:   pointsReuse,
	taskRecycle: pointsRecycle,
}

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

// PlayerAction es la última acción que mandó un jugador: moverse, empezar,
// contaminar, limpiar, hacer tarea, reportar, votar o chatear.
type PlayerAction struct {
	PlayerID     string
	DX, DY       int32
	Start        bool
	Contaminate  bool
	Clean        bool
	TankSlot     int32
	InteractTask bool
	StationID    string
	Completed    bool

	// S2-05: Report, Vote, Chat
	Report        bool
	Vote          bool
	VoteTargetID  string
	VoteSkip      bool
	Chat          bool
	ChatMessageID string
	ChatText      string
}

type player struct {
	view   *matchv1.PlayerView
	dx, dy int32
	out    chan *matchv1.Snapshot

	role     matchv1.Role // NO_ROLE hasta que empieza la partida
	tankSlot int          // noTank si no le tocó tanque

	// S2-03: acción en curso, espera para contaminar y tanques cercanos.
	pending         *tankAction
	nextContaminate int64
	nearTanks       map[int32]bool

	// S2-04: Tasks
	tasksCompleted int
	assignedTasks  map[string]bool
	taskStartTick  int64
	taskStation    string

	// S2-05: Chat
	lastChatTick int64
}

// meetingState guarda el estado de la reunión activa (S2-05).
type meetingState struct {
	reporterID   string
	tankSlot     int32
	lastVisitors []string
	votes        map[string]voteChoice // voterID -> choice
	votingEndsAt int64                 // tick donde vence la votación
	resultEndsAt int64                 // tick donde termina resultado
	votingClosed bool
	ejectedID    string
	wasImpostor  bool
}

type voteChoice struct {
	targetID string
	skip     bool
}

type chatEntry struct {
	id       string
	playerID string
	text     string
	tick     int64
}

// tankAction es contaminar o limpiar: termina cuando pasan ticksLeft
// ticks sin que el jugador se mueva.
type tankAction struct {
	kind      string // LogContaminate o LogClean
	slot      int32
	ticksLeft int
}

// tank es un tanque del huerto con su dueño (S2-02).
type tank struct {
	slot          int32
	ownerID       string
	x, y          float64
	contamination int32 // 0 a 100
	dead          bool
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
