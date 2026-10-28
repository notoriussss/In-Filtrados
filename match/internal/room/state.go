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
	tankRange           = 56  // unidades para contaminar, limpiar o visitar
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
	reportRange        = 80  // unidades para reportar tanque muerto
	meetingVotingTicks = 900 // 45 s para discutir y votar
	meetingResultTicks = 100 // 5 s de resultado antes de PLAYING
	chatMaxChars       = 200 // caracteres máximos por mensaje de chat
	chatCooldownTicks  = 20  // 1 s entre mensajes de chat
	chatHistoryLimit   = 30  // mensajes guardados en snapshot

	// S3-01: lugar reservado al jugador que se desconecta en partida.
	// En el laboratorio se sube con RECONNECT_GRACE_SECONDS.
	defaultGracePeriod = 90 * time.Second
	// Un corte más corto que esto no cuenta (cambio de socket).
	disconnectDebounce = time.Second

	// S2-12: gotas de aceite tras contaminar.
	oilTrailTicks     = 300 // 15 s soltando gotas
	oilDropEveryTicks = 20  // 1 gota por segundo
	oilDropLifeTicks  = 300 // cada gota dura 15 s

	// S3-05: emergencias (sabotajes y eventos aleatorios).
	emergencyPipe            = "pipe"
	emergencySteam           = "steam"
	emergencyGraceTicks      = 600  // ninguna en los primeros 30 s
	sabotageCooldownTicks    = 800  // 40 s de espera compartida
	maxPipeSabotages         = 2    // la tubería, máximo 2 por partida
	pipeDeadlineTicks        = 600  // 30 s para arreglar la tubería
	pipeDamage               = 20   // si revienta, cada tanque +20
	steamFixTicks            = 40   // 2 s quieto junto a la válvula
	fixRange                 = 48   // unidades para arreglar
	randomEmergencyMinTicks  = 1200 // aleatorias cada 60 a 120 s
	randomEmergencyMaxTicks  = 2400
	randomPauseAfterSabotage = 1200 // tras un sabotaje, 60 s sin azar

	// Lo que hace cada jugador, para animarlo (PlayerView.activity).
	activityTank = "tank"
	activityFix  = "fix"
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

// Join registers a player; Out receives server events.
type Join struct {
	PlayerID string
	Out      chan *matchv1.ServerEvent
	// Owned son los artículos que el jugador compró (los pone el gateway
	// con lo que dice players).
	Owned []string
}

// Leave says that the stream ended.
type Leave struct {
	PlayerID string
	Out      chan *matchv1.ServerEvent
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

	// S3-05: sabotear (solo el impostor) y arreglar una emergencia.
	Sabotage     bool
	SabotageKind string
	Fix          bool
	FixPointID   string

	// Elegir color en la sala de espera.
	PickColor bool
	Color     string

	// Elegir accesorio en la sala de espera.
	PickAccessory bool
	Accessory     string

	// Elegir personaje (jimena o gota) en la sala de espera.
	PickSkin bool
	Skin     string

	// Reemplazar lo comprado (solo lo manda el gateway).
	SetOwned bool
	Owned    []string
}

// isMove: la acción solo cambia la dirección (un Move).
func (a PlayerAction) isMove() bool {
	return !a.Start && !a.Contaminate && !a.Clean && !a.InteractTask &&
		!a.Report && !a.Vote && !a.Chat && !a.Sabotage && !a.Fix &&
		!a.PickColor && !a.PickAccessory && !a.PickSkin && !a.SetOwned
}

type player struct {
	view         *matchv1.PlayerView
	owned        map[string]bool // artículos comprados (ids de la tienda)
	dx, dy       int32
	out          chan *matchv1.ServerEvent
	pendingEnded bool

	role     matchv1.Role // NO_ROLE hasta que empieza la partida
	tankSlot int          // noTank si no le tocó tanque

	// S2-03: acción en curso, espera para contaminar y tanques cercanos.
	pending         *tankAction
	nextContaminate int64
	nearTanks       map[int32]bool

	// S2-04: Tasks
	tasksCompleted int
	assignedTasks  map[string]bool
	completedTasks []string // S2-11: para tacharlas en la lista
	taskStartTick  int64
	taskStation    string

	// S2-05: Chat y expulsión
	nextChatTick int64
	ejected      bool

	// S2-12: rastro de aceite hasta el tick oilUntil.
	oilUntil    int64
	nextOilDrop int64

	// S3-01: hasta cuándo se le guarda el lugar al desconectado. Es
	// tiempo de reloj, no ticks, para que siga corriendo en una pausa.
	leftAt     time.Time // cuándo se cortó su stream; cero si conectado
	graceUntil time.Time

	// S3-05: punto de reparación que sostiene y desde hace cuántos ticks.
	fixPoint string
	fixTicks int
}

// meetingState guarda el estado de la reunión activa (S2-05).
type meetingState struct {
	reporterID   string
	tankSlot     int32
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
	reported      bool
}

// oilDrop es una gota del rastro del impostor (S2-12).
type oilDrop struct {
	x, y      float32
	color     string
	expiresAt int64
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
