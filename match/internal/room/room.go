// Package room runs one match room in a single goroutine
// (docs/architecture.md).
package room

import (
	"context"
	"crypto/rand"
	"io"
	"log"
	"sort"
	"sync/atomic"
	"time"

	"google.golang.org/protobuf/proto"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
	"github.com/notoriussss/in-filtrados/match/internal/events"
)

// Room has no mutex: only the goroutine running Run touches its state.
type Room struct {
	Code    string
	MatchID string

	m       *Map
	players map[string]*player
	names   map[string]string
	order   int
	phase   matchv1.Phase
	tick    int64

	creatorID     string
	publisher     events.Publisher
	store         MatchStore
	matchDuration time.Duration
	startedAt     time.Time
	participants  []PlayerInfo
	tanks         []*tank
	rnd           io.Reader // azar de los roles: crypto/rand
	startTick     int64
	eventLog      EventLog
	reservoir     int32 // S2-04
	eventHistory  []LogEntry
	meeting       *meetingState
	chat          []chatEntry
	oilDrops      []*oilDrop        // S2-12
	cleanupDelay  time.Duration     // S2-06
	onCleanup     func(code string) // S2-06
	endedAt       time.Time         // S2-06
	ended         *matchv1.ServerEvent
	done          chan struct{}
	grace         time.Duration    // S3-01
	snapshots     SnapshotSaver    // S3-02
	savedKey      string           // fase de la última instantánea
	savedTick     int64            // tick de la última instantánea
	seenChat      map[string]bool  // S3-04: client_msg_id de la partida
	now           func() time.Time // S3-01: reloj, cambiable en tests

	joins   chan Join
	leaves  chan Leave
	actions chan PlayerAction
	nameCh  chan Name

	// connectedCount es actualizado atomicamente por la goroutine de la sala.
	connectedCount atomic.Int32

	// S3-05: emergencias, sabotajes y su espera compartida.
	emergency         *emergencyState
	sabotageReadyAt   int64
	pipesUsed         int
	nextRandomAt      int64
	randomEmergencies bool
	emergencyRand     func(n int) int
}

func NewRoom(code string, matchID string, m *Map, opts ...Option) *Room {
	r := &Room{
		Code:          code,
		MatchID:       matchID,
		m:             m,
		players:       make(map[string]*player),
		names:         make(map[string]string),
		phase:         matchv1.Phase_LOBBY,
		matchDuration: defaultMatchDuration,
		cleanupDelay:  defaultCleanupDelay,
		grace:         defaultGracePeriod,
		now:           time.Now,
		done:          make(chan struct{}),
		joins:         make(chan Join),
		leaves:        make(chan Leave),
		actions:       make(chan PlayerAction, actionBuffer),
		nameCh:        make(chan Name),
		seenChat:      make(map[string]bool),
		rnd:           rand.Reader,
	}
	for _, opt := range opts {
		opt(r)
	}
	return r
}

// These methods are called from other goroutines;
// they only send to channels if the room is still running.
func (r *Room) Join(j Join) {
	select {
	case r.joins <- j:
	case <-r.done:
	}
}

func (r *Room) Leave(l Leave) {
	select {
	case r.leaves <- l:
	case <-r.done:
	}
}

func (r *Room) Act(a PlayerAction) {
	select {
	case r.actions <- a:
	case <-r.done:
	}
}

func (r *Room) SetName(n Name) {
	select {
	case r.nameCh <- n:
	case <-r.done:
	}
}

func (r *Room) Run(ctx context.Context) {
	defer close(r.done)
	ticker := time.NewTicker(tickInterval)
	defer ticker.Stop()
	for {
		select {
		case j := <-r.joins:
			r.addPlayer(j)
		case l := <-r.leaves:
			r.removePlayer(l)
		case a := <-r.actions:
			r.handleAction(a)
		case n := <-r.nameCh:
			r.setName(n)
		case <-ticker.C:
			if r.onTick() {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// onTick es un tick del ticker de 20 Hz.
func (r *Room) onTick() bool {
	if r.phase == matchv1.Phase_ENDED {
		if r.now().Sub(r.endedAt) >= r.cleanupDelay {
			r.cleanup()
			return true
		}
	}
	r.updateGrace()
	// S3-02: en pausa el ticker sigue y manda snapshots, pero el tick no
	// avanza: no suben los tanques ni corren la reunión ni el reloj.
	if !r.paused() {
		r.step()
		r.tick++
	}
	r.broadcast()
	r.maybeSave()
	return false
}

func (r *Room) setName(n Name) {
	if n.DisplayName == "" {
		return
	}
	r.names[n.PlayerID] = n.DisplayName
	if p, ok := r.players[n.PlayerID]; ok {
		p.view.Name = n.DisplayName
	}
}

// handleAction aplica Start o el movimiento del jugador.
func (r *Room) handleAction(a PlayerAction) {
	if a.Start {
		r.startMatch(a.PlayerID)
		return
	}
	p, ok := r.players[a.PlayerID]
	if !ok {
		return
	}
	// S3-02: en pausa solo se guarda hacia dónde quiere ir cada uno (para
	// que al soltar una tecla no siga caminando al reanudar); el resto de
	// las acciones se ignora para que todo quede exactamente igual.
	if r.paused() && !a.isMove() {
		return
	}
	switch {
	case a.Report:
		r.handleReport(a.PlayerID, a.TankSlot)
	case a.Chat:
		r.handleChat(
			a.PlayerID,
			a.ChatMessageID,
			a.ChatText,
		)
	case a.Vote:
		r.handleVote(
			a.PlayerID,
			a.VoteTargetID,
			a.VoteSkip,
		)
	case a.Contaminate:
		if r.phase == matchv1.Phase_PLAYING {
			r.startContaminate(a.PlayerID, p, a.TankSlot)
		}
	case a.Clean:
		if r.phase == matchv1.Phase_PLAYING {
			r.startClean(p, a.TankSlot)
		}
	case a.Sabotage:
		r.handleSabotage(p, a.SabotageKind)
	case a.Fix:
		r.handleFix(p, a.FixPointID)
	case a.PickColor:
		r.pickColor(p, a.Color)
	case a.PickAccessory:
		r.pickAccessory(p, a.Accessory)
	case a.InteractTask:
		if r.phase == matchv1.Phase_PLAYING {
			if !a.Completed {
				r.startTask(a.PlayerID, p, a.StationID)
			} else {
				r.completeTask(a.PlayerID, p, a.StationID)
			}
		}
	default:
		if r.phase != matchv1.Phase_MEETING {
			p.dx, p.dy = clampDir(a.DX), clampDir(a.DY)
		}
	}
}

func (r *Room) addPlayer(j Join) {
	if p, ok := r.players[j.PlayerID]; ok { // same player coming back
		r.resumePlayer(j.PlayerID, p, j.Out)
		return
	}
	r.connectedCount.Add(1)
	x, y := r.m.SpawnPoint(r.order)
	name := r.names[j.PlayerID]
	if name == "" {
		name = j.PlayerID
	}
	tankSlot := noTank
	if r.order < len(r.m.Tanks) {
		tankSlot = r.order
	}
	color := colors[r.order%len(colors)]
	r.players[j.PlayerID] = &player{
		tankSlot: tankSlot,
		view: &matchv1.PlayerView{
			Id:        j.PlayerID,
			Name:      name,
			Color:     color,
			X:         float32(x),
			Y:         float32(y),
			Connected: true,
			Alive:     true,
			Accessory: defaultAccessoryForColor(color),
		},
		out: j.Out,
	}
	r.order++
}

// removePlayer marks the player as disconnected. Only the stream that is
// still registered can do it, so a stale stream cannot kick a reconnected one.
// En plena partida le guarda el lugar durante el periodo de gracia (S3-01).
func (r *Room) removePlayer(l Leave) {
	p, ok := r.players[l.PlayerID]
	if !ok {
		return
	}
	if l.Out != nil && p.out != l.Out {
		return
	}
	p.view.Connected = false
	p.dx, p.dy = 0, 0
	p.out = nil
	if r.inMatch() && p.view.Alive {
		// El periodo de gracia empieza en updateGrace si no vuelve en
		// disconnectDebounce: cambiar de socket (de la sala de espera a
		// la partida, o al recargar) no pausa ni avisa al monitor.
		p.leftAt = r.now()
	}
}

// resumePlayer reemplaza el canal de salida del jugador que vuelve y le
// manda de inmediato la foto completa: posición, rol, tareas, reunión y
// chat (S3-01). Así no espera al siguiente tick para ver la partida.
func (r *Room) resumePlayer(
	id string,
	p *player,
	out chan *matchv1.ServerEvent,
) {
	if !p.graceUntil.IsZero() {
		log.Printf("room %s: %s volvió a tiempo", r.Code, id)
		r.publishAsync(
			events.RoutingKeyPlayerReconnected,
			events.NewPlayerReconnected(r.MatchID, id, p.view.Name, r.now()),
		)
	}
	p.view.Connected = true
	r.resolveColor(p)
	p.out = out
	p.leftAt = time.Time{}
	p.graceUntil = time.Time{}
	r.sendTo(p, r.sharedView())
	if r.phase == matchv1.Phase_ENDED && r.ended != nil {
		select {
		case p.out <- r.ended:
		default:
			p.pendingEnded = true
		}
	}
}

// publishDisconnected avisa que el jugador entró en su periodo de
// gracia (S3-04); el monitor muestra la cuenta regresiva.
func (r *Room) publishDisconnected(id string, p *player, now time.Time) {
	r.publishAsync(
		events.RoutingKeyPlayerDisconnected,
		events.NewPlayerDisconnected(
			r.MatchID,
			id,
			p.view.Name,
			p.graceUntil.Sub(now).Round(time.Second),
			now,
		),
	)
}

// publishAsync publica sin frenar a la sala: el publicador espera la
// confirmación de RabbitMQ (o guarda en outbox) en otra goroutine.
func (r *Room) publishAsync(routingKey string, event any) {
	if r.publisher == nil {
		return
	}
	pub := r.publisher
	code := r.Code
	go func() {
		ctx, cancel := context.WithTimeout(
			context.Background(),
			depsTimeout,
		)
		defer cancel()
		if err := pub.Publish(ctx, routingKey, event); err != nil {
			log.Printf(
				"room %s: no se pudo publicar %s: %v",
				code,
				routingKey,
				err,
			)
		}
	}()
}

// updateGrace abre el periodo de gracia de quien lleva más de
// disconnectDebounce desconectado (la sala se pausa y se avisa al
// monitor) y convierte en fantasma a quien no volvió a tiempo, para que
// la partida no se trabe esperando a alguien que se fue de verdad.
func (r *Room) updateGrace() {
	if !r.inMatch() {
		return
	}
	now := r.now()
	for id, p := range r.players {
		if !p.view.Alive {
			continue
		}
		if !p.leftAt.IsZero() && p.graceUntil.IsZero() &&
			now.Sub(p.leftAt) >= disconnectDebounce {
			p.graceUntil = p.leftAt.Add(r.grace)
			r.publishDisconnected(id, p, now)
			log.Printf(
				"room %s: %s se desconectó; su lugar se guarda %s",
				r.Code,
				id,
				r.grace,
			)
		}
		if p.graceUntil.IsZero() || now.Before(p.graceUntil) {
			continue
		}
		p.leftAt = time.Time{}
		p.graceUntil = time.Time{}
		p.view.Alive = false
		p.pending = nil
		p.taskStartTick = 0
		p.taskStation = ""
		log.Printf(
			"room %s: %s no volvió a tiempo; pasa a fantasma",
			r.Code,
			id,
		)
		// Sus tareas ya no cuentan para llenar el embalse.
		r.updateReservoir()
		if r.meeting != nil && !r.meeting.votingClosed && r.allAliveVoted() {
			r.closeVoting()
		}
	}
}

// paused: la sala espera a alguien en su periodo de gracia (S3-02).
// El despliegue del laboratorio pausa con cualquier desconectado
// (docs/deployment-lab.md, sección 9).
//
// Solo el host (el creador de la sala) pausa la partida: si se va otro
// jugador, la partida sigue sin él mientras conserva su lugar durante la
// gracia. Una sala sin creador (DEV) nunca se pausa.
func (r *Room) paused() bool {
	if !r.inMatch() || r.creatorID == "" {
		return false
	}
	host, ok := r.players[r.creatorID]
	return ok && !host.graceUntil.IsZero()
}

// waitingFor son los jugadores en periodo de gracia, ordenados.
func (r *Room) waitingFor() []string {
	var ids []string
	for id, p := range r.players {
		if !p.graceUntil.IsZero() {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// inMatch: la partida está en juego (ni en la sala de espera ni terminada).
func (r *Room) inMatch() bool {
	return r.phase == matchv1.Phase_PLAYING ||
		r.phase == matchv1.Phase_MEETING
}

// startMatch pasa la sala a PLAYING: guarda la partida y publica el evento.
// Solo lo acepta el creador, en LOBBY y con al menos 2 jugadores conectados.
func (r *Room) startMatch(playerID string) {
	if r.phase != matchv1.Phase_LOBBY {
		return
	}
	if r.creatorID != "" && playerID != r.creatorID {
		log.Printf(
			"room %s: %s no es el creador; start ignorado",
			r.Code,
			playerID,
		)
		return
	}
	if r.connectedPlayers() < minPlayersToStart {
		log.Printf(
			"room %s: hacen falta %d jugadores para empezar",
			r.Code,
			minPlayersToStart,
		)
		return
	}

	if err := r.assignRoles(); err != nil {
		log.Printf("room %s: no se pudo empezar: %v", r.Code, err)
		return
	}
	r.phase = matchv1.Phase_PLAYING
	r.startedAt = time.Now()
	r.startTick = r.tick
	r.tanks = r.buildTanks()
	if err := r.assignTasks(); err != nil {
		log.Printf("room %s: no se pudo asignar tareas: %v", r.Code, err)
		return
	}
	r.reservoir = 0
	r.eventHistory = nil
	r.meeting = nil
	r.chat = nil
	r.oilDrops = nil
	r.emergency = nil
	r.sabotageReadyAt = 0
	r.pipesUsed = 0
	r.nextRandomAt = 0
	r.participants = r.snapshotParticipants()

	ctx, cancel := context.WithTimeout(context.Background(), depsTimeout)
	defer cancel()

	if r.store != nil {
		err := r.store.StartMatch(ctx, r.MatchID, r.Code, r.participants)
		if err != nil {
			log.Printf("room %s: no se pudo guardar el inicio: %v", r.Code, err)
		}
	}
	if r.publisher != nil {
		playerIDs := make([]string, 0, len(r.participants))
		for _, p := range r.participants {
			playerIDs = append(playerIDs, p.PlayerID)
		}
		event := events.NewMatchStarted(
			r.MatchID,
			r.Code,
			r.startedAt,
			playerIDs,
		)
		r.publishAsync(events.RoutingKeyStarted, event)
	}
	log.Printf("room %s: partida %s iniciada", r.Code, r.MatchID)
}

// finishMatch termina la partida con el ganador dado y persiste (S2-06).
func (r *Room) finishMatch(winner string) {
	if r.phase != matchv1.Phase_PLAYING && r.phase != matchv1.Phase_MEETING {
		return
	}
	r.phase = matchv1.Phase_ENDED
	r.endedAt = r.now()

	ctx, cancel := context.WithTimeout(context.Background(), depsTimeout)
	defer cancel()

	if r.store != nil {
		partResults := make([]ParticipantResult, 0, len(r.players))
		for id, p := range r.players {
			partResults = append(partResults, ParticipantResult{
				PlayerID: id,
				Ejected:  p.ejected,
			})
		}
		sort.Slice(partResults, func(i, j int) bool {
			return partResults[i].PlayerID < partResults[j].PlayerID
		})
		err := r.store.FinishMatch(
			ctx,
			r.MatchID,
			winner,
			partResults,
		)
		if err != nil {
			log.Printf("room %s: no se pudo guardar el fin: %v", r.Code, err)
		}
	}
	if r.publisher != nil {
		results := make([]events.PlayerResult, 0, len(r.players))
		for id, p := range r.players {
			results = append(results, events.PlayerResult{
				PlayerID: id,
				Role:     roleName(p.role),
				Ejected:  p.ejected,
				Harvest:  r.calculateHarvest(p),
			})
		}
		sort.Slice(results, func(i, j int) bool {
			return results[i].PlayerID < results[j].PlayerID
		})
		event := events.NewMatchFinished(
			r.MatchID,
			r.endedAt,
			winner,
			results,
		)
		r.publishAsync(events.RoutingKeyFinished, event)
	}
	log.Printf(
		"room %s: partida %s terminada (ganador: %s)",
		r.Code,
		r.MatchID,
		winner,
	)
	r.broadcast()
	r.broadcastMatchEnded(winner)
}

// broadcastMatchEnded envía MatchEnded a los streams de los jugadores (S2-06).
func (r *Room) broadcastMatchEnded(winner string) {
	impostorIDs := r.impostorIDs()
	ev := &matchv1.ServerEvent{
		Event: &matchv1.ServerEvent_MatchEnded{
			MatchEnded: &matchv1.MatchEnded{
				Winner:      winner,
				ImpostorIds: impostorIDs,
			},
		},
	}
	r.ended = ev
	for _, p := range r.players {
		if p.out == nil {
			continue
		}
		select {
		case p.out <- ev:
		default:
			p.pendingEnded = true
		}
	}
}

// cleanup libera la sala de memoria y notifica su remoción (S2-06).
func (r *Room) cleanup() {
	if r.onCleanup != nil {
		r.onCleanup(r.Code)
	}
	for _, p := range r.players {
		if p.out != nil {
			close(p.out)
			p.out = nil
		}
	}
	log.Printf(
		"room %s: sala liberada de memoria tras fin de partida",
		r.Code,
	)
}

// checkEndConditions evalúa las 4 condiciones de fin de partida (S2-06):
// 1. Ganan tripulantes si el embalse llega a 100.
// 2. Ganan tripulantes si todos los impostores fueron expulsados.
// 3. Gana impostor si vivos impostor >= vivos tripulante.
// 4. Gana impostor si pasan 8 minutos sin que el embalse llegue a 100.
func (r *Room) checkEndConditions() {
	if r.phase != matchv1.Phase_PLAYING {
		return
	}
	if r.reservoir >= reservoirMax {
		r.finishMatch(events.WinnerCrew)
		return
	}
	aliveImp, aliveCrew, deadCrew := r.countRoles()
	if aliveImp == 0 {
		r.finishMatch(events.WinnerCrew)
		return
	}
	if aliveImp > 0 && deadCrew > 0 && aliveImp >= aliveCrew {
		r.finishMatch(events.WinnerImpostor)
		return
	}
	if r.tick-r.startTick >= int64(r.matchDuration/tickInterval) {
		r.finishMatch(events.WinnerImpostor)
		return
	}
}

// allImpostorsEjected verifica si todos los impostores fueron expulsados.
func (r *Room) allImpostorsEjected() bool {
	totalImp := 0
	ejectedImp := 0
	for _, p := range r.players {
		if p.role == matchv1.Role_IMPOSTOR {
			totalImp++
			if p.ejected {
				ejectedImp++
			}
		}
	}
	return totalImp > 0 && ejectedImp == totalImp
}

// countRoles cuenta impostores vivos, tripulantes vivos y bajas de tripulantes.
func (r *Room) countRoles() (aliveImp, aliveCrew, deadCrew int) {
	for _, p := range r.players {
		switch p.role {
		case matchv1.Role_IMPOSTOR:
			if p.view.Alive {
				aliveImp++
			}
		case matchv1.Role_CREW:
			if p.view.Alive {
				aliveCrew++
			} else {
				deadCrew++
			}
		}
	}
	return aliveImp, aliveCrew, deadCrew
}

// calculateHarvest calcula la cosecha por jugador según la fórmula (S2-06):
// tareas completadas * 5 + (10 si su tanque sigue vivo).
func (r *Room) calculateHarvest(p *player) int {
	harvest := p.tasksCompleted * 5
	if p.tankSlot != noTank {
		if t := r.tankAt(int32(p.tankSlot)); t != nil && !t.dead {
			harvest += 10
		}
	}
	return harvest
}

// impostorIDs devuelve la lista ordenada de IDs de todos los impostores.
func (r *Room) impostorIDs() []string {
	var ids []string
	for id, p := range r.players {
		if p.role == matchv1.Role_IMPOSTOR {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// assignRoles elige los impostores entre todos los jugadores de la sala;
// el resto queda como tripulante.
func (r *Room) assignRoles() error {
	ids := make([]string, 0, len(r.players))
	for id := range r.players {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	impostors, err := pickImpostors(ids, r.rnd)
	if err != nil {
		return err
	}
	for id, p := range r.players {
		p.role = matchv1.Role_CREW
		if impostors[id] {
			p.role = matchv1.Role_IMPOSTOR
		}
	}
	return nil
}

// buildTanks crea un tanque por cada jugador que recibió lugar en el huerto.
func (r *Room) buildTanks() []*tank {
	tanks := make([]*tank, 0, len(r.m.Tanks))
	for id, p := range r.players {
		if p.tankSlot == noTank {
			continue
		}
		spot := r.m.Tanks[p.tankSlot]
		tanks = append(tanks, &tank{
			slot:    spot.Slot,
			ownerID: id,
			x:       spot.X,
			y:       spot.Y,
		})
	}
	sort.Slice(tanks, func(i, j int) bool {
		return tanks[i].slot < tanks[j].slot
	})
	return tanks
}

func roleName(role matchv1.Role) string {
	if role == matchv1.Role_IMPOSTOR {
		return events.RoleImpostor
	}
	return events.RoleCrew
}

// connectedPlayers cuenta los jugadores con un stream abierto.
func (r *Room) connectedPlayers() int {
	count := 0
	for _, p := range r.players {
		if p.out != nil {
			count++
		}
	}
	return count
}

// snapshotParticipants copia los jugadores actuales para la base y los eventos.
func (r *Room) snapshotParticipants() []PlayerInfo {
	infos := make([]PlayerInfo, 0, len(r.players))
	for id, p := range r.players {
		infos = append(infos, PlayerInfo{
			PlayerID:    id,
			DisplayName: p.view.Name,
			Role:        roleName(p.role),
		})
	}
	sort.Slice(infos, func(i, j int) bool {
		return infos[i].PlayerID < infos[j].PlayerID
	})
	return infos
}

// step mueve a cada jugador y evalúa las condiciones de la partida.
func (r *Room) step() {
	if r.phase != matchv1.Phase_MEETING {
		for _, p := range r.players {
			nx, ny := r.m.Move(
				float64(p.view.X),
				float64(p.view.Y),
				float64(p.dx*stepPerTick),
				float64(p.dy*stepPerTick),
			)
			p.view.X, p.view.Y = float32(nx), float32(ny)
		}
	}
	if r.phase == matchv1.Phase_PLAYING {
		r.stepTanks()
		r.cancelFarTasks()
		r.stepEmergency()
	}
	if r.phase == matchv1.Phase_MEETING {
		r.stepMeeting()
	}
	if r.phase == matchv1.Phase_PLAYING {
		r.checkEndConditions()
	}
}

// broadcast never blocks: if a player's channel is full, that snapshot is
// dropped for them and the next one brings them up to date.
func (r *Room) broadcast() {
	shared := r.sharedView()
	for _, p := range r.players {
		if p.out != nil {
			r.sendTo(p, shared)
			if p.pendingEnded && r.ended != nil {
				select {
				case p.out <- r.ended:
					p.pendingEnded = false
				default:
				}
			}
		}
	}
}

// sharedState es la parte del snapshot que es igual para todos.
// Players, tanks y drops se comparten porque nadie los modifica después
// de enviarlos.
type sharedState struct {
	players []*matchv1.PlayerView
	tanks   []*matchv1.TankView
	drops   []*matchv1.OilDrop
	meeting *matchv1.Meeting
	chat    []*matchv1.ChatMessage
	paused  bool
	waiting []string
	// S3-05: emergencia activa (sabotaje o aleatoria, se ven igual).
	emergency *matchv1.Emergency
}

func (r *Room) sharedView() sharedState {
	views := make([]*matchv1.PlayerView, 0, len(r.players))
	for _, p := range r.players {
		v := proto.Clone(p.view).(*matchv1.PlayerView)
		v.Activity = r.activityOf(p)
		views = append(views, v)
	}
	sort.Slice(views, func(i, j int) bool {
		if views[i].Id == r.creatorID {
			return true
		}
		if views[j].Id == r.creatorID {
			return false
		}
		return views[i].Id < views[j].Id
	})
	return sharedState{
		players: views,
		tanks:   r.tankViews(),
		drops:   r.oilDropViews(),
		meeting: r.meetingView(),
		chat:    r.chatViews(),
		paused:  r.paused(),
		waiting: r.waitingFor(),

		emergency: r.emergencyView(),
	}
}

// sendTo arma el snapshot de un jugador (my_role es solo el suyo) y lo
// deja en su canal sin bloquear envuelto como ServerEvent.
func (r *Room) sendTo(p *player, s sharedState) {
	snap := &matchv1.Snapshot{
		Tick:      r.tick,
		Phase:     r.phase,
		Players:   s.players,
		Tanks:     s.tanks,
		Reservoir: r.reservoir,
		MyRole:    p.role,
		MyTaskProgress: &matchv1.TaskProgress{
			Completed: int32(p.tasksCompleted),
			Total: int32(
				len(p.assignedTasks) + p.tasksCompleted,
			),
		},
		Meeting:      s.meeting,
		Chat:         s.chat,
		OilDrops:     s.drops,
		Paused:       s.paused,
		WaitingFor:   s.waiting,
		MyTasks:      myTasks(p),
		MyActiveTask: p.taskStation,
		Emergency:    s.emergency,
		MySabotage:   r.sabotageView(p),
	}
	ev := &matchv1.ServerEvent{
		Event: &matchv1.ServerEvent_Snapshot{
			Snapshot: snap,
		},
	}
	select {
	case p.out <- ev:
	default:
	}
}

func (r *Room) tankViews() []*matchv1.TankView {
	views := make([]*matchv1.TankView, 0, len(r.tanks))
	for _, t := range r.tanks {
		views = append(views, &matchv1.TankView{
			Slot:          t.slot,
			OwnerId:       t.ownerID,
			Contamination: t.contamination,
			Dead:          t.dead,
		})
	}
	return views
}

// PlayerCount devuelve cuántos jugadores hay en la sala.
// Es seguro llamarlo desde otras goroutines.
func (r *Room) PlayerCount() int {
	return int(r.connectedCount.Load())
}
