package room

import (
	"encoding/json"
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// mapWithFixPoints es mapWithStations con los puntos de reparación.
func mapWithFixPoints() *Map {
	m := mapWithStations()
	m.FixPoints = []FixPoint{
		{ID: "pipe-west", Kind: emergencyPipe, X: 160, Y: 1110},
		{ID: "pipe-east", Kind: emergencyPipe, X: 1440, Y: 1110},
		{ID: "steam-valve", Kind: emergencySteam, X: 1430, Y: 330},
	}
	return m
}

// sabotageRoom arranca una partida con crew1, crew2 e imp. Ya pasaron
// los primeros 30 s, así que se puede sabotear.
func sabotageRoom(t *testing.T, opts ...Option) *Room {
	t.Helper()
	all := append([]Option{WithCreator("crew1")}, opts...)
	r := NewRoom("TEST", "match-1", mapWithFixPoints(), all...)
	for _, id := range []string{"crew1", "crew2", "imp"} {
		r.addPlayer(Join{
			PlayerID: id,
			Out:      make(chan *matchv1.ServerEvent, 1),
		})
	}
	r.startMatch("crew1")
	if r.phase != matchv1.Phase_PLAYING {
		t.Fatalf("la partida no empezó")
	}
	for id, p := range r.players {
		p.role = matchv1.Role_CREW
		if id == "imp" {
			p.role = matchv1.Role_IMPOSTOR
		}
	}
	advance(r, emergencyGraceTicks)
	return r
}

// advance corre n ticks de la sala, igual que el ticker.
func advance(r *Room, n int) {
	for i := 0; i < n; i++ {
		r.onTick()
	}
}

func sabotage(r *Room, id, kind string) {
	r.handleAction(PlayerAction{
		PlayerID:     id,
		Sabotage:     true,
		SabotageKind: kind,
	})
}

// standAt deja quieto al jugador en un punto de reparación y arregla.
func standAt(r *Room, id, pointID string) {
	fp := r.fixPointAt(pointID)
	p := r.players[id]
	p.view.X, p.view.Y = float32(fp.X), float32(fp.Y)
	p.dx, p.dy = 0, 0
	r.handleAction(PlayerAction{PlayerID: id, Fix: true, FixPointID: pointID})
}

func TestOnlyTheImpostorSabotages(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "crew1", emergencySteam)
	if r.emergency != nil {
		t.Fatal("un tripulante no puede sabotear")
	}
	sabotage(r, "imp", "flood")
	if r.emergency != nil {
		t.Fatal("un sabotaje desconocido se ignora")
	}
	sabotage(r, "imp", emergencySteam)
	if r.emergency == nil || r.emergency.kind != emergencySteam {
		t.Fatal("el impostor debió activar el vapor")
	}
}

func TestNoSabotageInTheFirst30Seconds(t *testing.T) {
	r := sabotageRoom(t)
	r.startTick = r.tick - emergencyGraceTicks + 20 // faltan 20 ticks
	sabotage(r, "imp", emergencySteam)
	if r.emergency != nil {
		t.Fatal("no se puede sabotear en los primeros 30 s")
	}
	advance(r, 20)
	sabotage(r, "imp", emergencySteam)
	if r.emergency == nil {
		t.Fatal("pasados 30 s el sabotaje debió activarse")
	}
}

func TestSharedCooldownAndOneAtATime(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencySteam)
	first := r.tick
	sabotage(r, "imp", emergencyPipe)
	if r.emergency.kind != emergencySteam {
		t.Fatal("solo puede haber un sabotaje activo")
	}

	// Se arregla al instante, pero la espera de 40 s sigue.
	standAt(r, "crew1", "steam-valve")
	advance(r, steamFixTicks+1)
	if r.emergency != nil {
		t.Fatal("el vapor debió quedar arreglado")
	}
	sabotage(r, "imp", emergencyPipe)
	if r.emergency != nil {
		t.Fatal("antes de 40 s no se puede volver a sabotear")
	}
	advance(r, int(first+sabotageCooldownTicks-r.tick))
	sabotage(r, "imp", emergencyPipe)
	if r.emergency == nil || r.emergency.kind != emergencyPipe {
		t.Fatal("a los 40 s el sabotaje debió activarse")
	}
}

func TestPipeNeedsTwoPlayersAtTheSameTime(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencyPipe)

	standAt(r, "crew1", "pipe-west")
	advance(r, 40)
	if r.emergency == nil {
		t.Fatal("un solo extremo no arregla la tubería")
	}
	snap := r.emergencyView()
	if len(snap.HeldPoints) != 1 || snap.HeldPoints[0] != "pipe-west" {
		t.Fatalf("held_points = %v", snap.HeldPoints)
	}

	// Moverse suelta el extremo.
	r.players["crew1"].dx = 1
	advance(r, 1)
	if len(r.heldPoints()) != 0 {
		t.Fatal("moverse debió soltar el extremo")
	}

	standAt(r, "crew1", "pipe-west")
	standAt(r, "crew2", "pipe-east")
	advance(r, 1)
	if r.emergency != nil {
		t.Fatal("dos jugadores a la vez debieron arreglarla")
	}
}

func TestBurstPipeContaminatesEveryTank(t *testing.T) {
	r := sabotageRoom(t)
	r.tankAt(0).contamination = 90
	sabotage(r, "imp", emergencyPipe)
	advance(r, pipeDeadlineTicks+1)
	if r.emergency != nil {
		t.Fatal("la tubería debió reventar a los 30 s")
	}
	for _, tk := range r.tanks {
		want := int32(pipeDamage)
		if tk.slot == 0 {
			want = maxContamination
		}
		// El tanque del impostor sube además 1 punto cada 5 s.
		if tk.ownerID == "imp" {
			want = tk.contamination
		}
		if tk.contamination != want {
			t.Errorf("tanque %d: %d, quería %d",
				tk.slot, tk.contamination, want)
		}
	}
	if !r.tankAt(0).dead {
		t.Error("el tanque al 100 % debió morir")
	}
}

func TestSteamFixNeedsTwoSecondsStill(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencySteam)
	standAt(r, "crew1", "pipe-west")
	if r.players["crew1"].fixPoint != "" {
		t.Fatal("un extremo de la tubería no arregla el vapor")
	}
	standAt(r, "crew1", "steam-valve")
	advance(r, steamFixTicks-1)
	if r.emergency == nil {
		t.Fatal("menos de 2 s no cierra la válvula")
	}
	advance(r, 1)
	if r.emergency != nil {
		t.Fatal("2 s quieto debió cerrar la válvula")
	}
}

func TestGhostsCannotFix(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencySteam)
	r.players["crew1"].view.Alive = false
	standAt(r, "crew1", "steam-valve")
	if r.players["crew1"].fixPoint != "" {
		t.Fatal("un fantasma no arregla emergencias")
	}
}

func TestPipeAtMostTwicePerMatch(t *testing.T) {
	r := sabotageRoom(t)
	for i := 0; i < maxPipeSabotages; i++ {
		sabotage(r, "imp", emergencyPipe)
		if r.emergency == nil {
			t.Fatalf("la tubería %d debió romperse", i+1)
		}
		standAt(r, "crew1", "pipe-west")
		standAt(r, "crew2", "pipe-east")
		advance(r, sabotageCooldownTicks)
	}
	sabotage(r, "imp", emergencyPipe)
	if r.emergency != nil {
		t.Fatal("la tubería se rompe máximo 2 veces")
	}
	if got := r.sabotageView(r.players["imp"]).PipesLeft; got != 0 {
		t.Errorf("pipes_left = %d", got)
	}
}

func TestMeetingCancelsThePipeAndBlocksSabotage(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencyPipe)
	tk := r.tankAt(r.players["crew2"].tankSlot32())
	tk.dead = true
	tk.contamination = maxContamination
	p := r.players["crew1"]
	p.view.X, p.view.Y = float32(tk.x), float32(tk.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew1",
		Report:   true,
		TankSlot: tk.slot,
	})
	if r.phase != matchv1.Phase_MEETING {
		t.Fatal("el reporte debió abrir la reunión")
	}
	if r.emergency != nil {
		t.Fatal("la reunión apaga la tubería rota")
	}
	r.sabotageReadyAt = 0
	sabotage(r, "imp", emergencySteam)
	if r.emergency != nil {
		t.Fatal("no se puede sabotear en una reunión")
	}
}

func TestSabotageLooksLikeARandomEmergency(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencyPipe)
	sabotaged := r.emergencyView()

	random := sabotageRoom(
		t,
		WithRandomEmergencies(true),
		WithEmergencyRand(func(int) int { return 0 }),
	)
	advance(random, randomEmergencyMinTicks+1)
	if random.emergency == nil || random.emergency.sabotage {
		t.Fatal("debió saltar una emergencia aleatoria")
	}
	view := random.emergencyView()
	if view.Kind != sabotaged.Kind ||
		view.EndsAtTick-random.emergency.endsAt != 0 ||
		len(view.HeldPoints) != len(sabotaged.HeldPoints) {
		t.Fatalf("se ven distinto: %v vs %v", view, sabotaged)
	}

	// Solo el impostor recibe su estado de sabotaje.
	if r.sabotageView(r.players["crew1"]) != nil {
		t.Error("un tripulante no debe recibir my_sabotage")
	}
	if r.sabotageView(r.players["imp"]) == nil {
		t.Error("el impostor debe recibir my_sabotage")
	}
}

func TestRandomEmergenciesAreOffUnlessEnabled(t *testing.T) {
	r := sabotageRoom(t)
	advance(r, randomEmergencyMaxTicks*2)
	if r.emergency != nil {
		t.Fatal("sin WithRandomEmergencies no hay emergencias al azar")
	}
}

func TestRandomEmergencyWaitsAfterASabotage(t *testing.T) {
	r := sabotageRoom(
		t,
		WithRandomEmergencies(true),
		WithEmergencyRand(func(int) int { return 0 }),
	)
	sabotage(r, "imp", emergencySteam)
	standAt(r, "crew1", "steam-valve")
	advance(r, steamFixTicks+1)
	if r.emergency != nil {
		t.Fatal("el vapor debió arreglarse")
	}
	fixedAt := r.tick
	advance(r, randomPauseAfterSabotage-int(steamFixTicks)-2)
	if r.emergency != nil {
		t.Fatal("tras un sabotaje las aleatorias esperan")
	}
	advance(r, int(fixedAt+randomEmergencyMinTicks-r.tick)+1)
	if r.emergency == nil {
		t.Fatal("pasada la espera debió llegar una aleatoria")
	}
}

func TestActivityShowsWhatEachPlayerDoes(t *testing.T) {
	r := sabotageRoom(t)
	crew := r.players["crew1"]
	crew.view.X, crew.view.Y = 400, 300 // leak-1
	crew.assignedTasks = map[string]bool{"leak-1": true}
	r.handleAction(PlayerAction{
		PlayerID:     "crew1",
		InteractTask: true,
		StationID:    "leak-1",
	})
	if got := r.activityOf(crew); got != taskReduce {
		t.Errorf("tarea: activity = %q", got)
	}

	imp := r.players["imp"]
	target := r.tankAt(r.players["crew2"].tankSlot32())
	imp.view.X, imp.view.Y = float32(target.x), float32(target.y)
	r.handleAction(PlayerAction{
		PlayerID:    "imp",
		Contaminate: true,
		TankSlot:    target.slot,
	})
	cleaner := r.players["crew2"]
	target.contamination = 10
	cleaner.view.X, cleaner.view.Y = float32(target.x), float32(target.y)
	r.handleAction(PlayerAction{
		PlayerID: "crew2",
		Clean:    true,
		TankSlot: target.slot,
	})
	if r.activityOf(imp) != activityTank ||
		r.activityOf(cleaner) != activityTank {
		t.Error("contaminar y limpiar deben verse igual")
	}

	sabotage(r, "imp", emergencySteam)
	standAt(r, "crew1", "steam-valve")
	if got := r.activityOf(crew); got != activityFix {
		t.Errorf("arreglar: activity = %q", got)
	}
	views := r.sharedView().players
	for _, v := range views {
		if v.Id == "crew1" && v.Activity != activityFix {
			t.Errorf("el snapshot debe llevar la actividad: %q", v.Activity)
		}
	}
}

func TestEmergencySurvivesASnapshotRestore(t *testing.T) {
	r := sabotageRoom(t)
	sabotage(r, "imp", emergencyPipe)
	saved := r.toSaved()
	got := restoreFrom(t, saved)
	if got.emergency == nil ||
		got.emergency.kind != emergencyPipe ||
		got.emergency.endsAt != r.emergency.endsAt ||
		got.pipesUsed != 1 ||
		got.sabotageReadyAt != r.sabotageReadyAt {
		t.Fatalf("restaurada: %+v", got.emergency)
	}
}

func TestReservoirIgnoresTasksOfPlayersWhoLeft(t *testing.T) {
	r := sabotageRoom(t)
	for _, id := range []string{"crew1", "crew2"} {
		r.players[id].assignedTasks = map[string]bool{"leak-1": true}
		r.players[id].completedTasks = nil
	}
	r.reservoir = 0
	gone := r.players["crew2"]
	gone.view.Connected = false
	gone.view.Alive = false
	crew := r.players["crew1"]
	delete(crew.assignedTasks, "leak-1")
	crew.completedTasks = []string{"leak-1"}
	r.updateReservoir()
	if r.reservoir != reservoirMax {
		t.Fatalf("embalse = %d, quería lleno", r.reservoir)
	}
}

// tankSlot32 es el slot del tanque del jugador como int32.
func (p *player) tankSlot32() int32 {
	return int32(p.tankSlot)
}

// restoreFrom serializa la sala guardada y la vuelve a levantar.
func restoreFrom(t *testing.T, saved savedRoom) *Room {
	t.Helper()
	state, err := json.Marshal(saved)
	if err != nil {
		t.Fatal(err)
	}
	r, err := Restore(state, mapWithFixPoints())
	if err != nil {
		t.Fatal(err)
	}
	return r
}
