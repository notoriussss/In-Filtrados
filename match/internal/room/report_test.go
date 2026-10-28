package room

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// reportRoom arma una partida en PLAYING con tres jugadores y buzones
// amplios para leer los errores. Devuelve el tanque de crew2, el que
// se contamina en las pruebas, y los buzones por jugador.
func reportRoom(
	t *testing.T,
) (*Room, *tank, map[string]chan *matchv1.ServerEvent) {
	t.Helper()
	r := NewRoom(
		"TEST",
		"match-1",
		mapWithTanks(),
		WithCreator("crew1"),
	)
	outs := make(map[string]chan *matchv1.ServerEvent)
	for _, id := range []string{"crew1", "crew2", "imp"} {
		outs[id] = make(chan *matchv1.ServerEvent, 8)
		r.addPlayer(Join{PlayerID: id, Out: outs[id]})
	}
	r.startMatch("crew1")
	for id, p := range r.players {
		p.role = matchv1.Role_CREW
		if id == "imp" {
			p.role = matchv1.Role_IMPOSTOR
		}
	}
	owned := tankOf(r, "crew2")
	if owned == nil {
		t.Fatal("crew2 debe tener un tanque")
	}
	return r, owned, outs
}

func tankOf(r *Room, ownerID string) *tank {
	for _, tk := range r.tanks {
		if tk.ownerID == ownerID {
			return tk
		}
	}
	return nil
}

// pollute lleva el tanque a 100 por el camino real del impostor.
func pollute(r *Room, tk *tank) {
	r.addContamination(tk, contaminateAmount)
	r.addContamination(tk, contaminateAmount)
}

func standAtTank(r *Room, id string, tk *tank) {
	p := r.players[id]
	p.view.X = float32(tk.x)
	p.view.Y = float32(tk.y)
}

func report(r *Room, id string, slot int32) {
	r.handleAction(PlayerAction{
		PlayerID: id,
		Report:   true,
		TankSlot: slot,
	})
}

// lastError devuelve el código del último Error del buzón, o "".
func lastError(out chan *matchv1.ServerEvent) string {
	code := ""
	for {
		select {
		case ev := <-out:
			if e := ev.GetError(); e != nil {
				code = e.GetCode()
			}
		default:
			return code
		}
	}
}

func tankView(r *Room, slot int32) *matchv1.TankView {
	for _, v := range r.tankViews() {
		if v.Slot == slot {
			return v
		}
	}
	return nil
}

func TestPollutedTankIsDeadAtOneHundred(t *testing.T) {
	r, tk, _ := reportRoom(t)

	r.addContamination(tk, contaminateAmount)
	if tk.dead {
		t.Fatal("a 50 el tanque sigue vivo")
	}
	r.addContamination(tk, contaminateAmount)

	v := tankView(r, tk.slot)
	if !v.Dead || v.Contamination != maxContamination {
		t.Errorf("el snapshot debe mostrar 100 y dead: %+v", v)
	}
}

func TestReportPollutedTankStartsMeetingAndKeepsItDirty(t *testing.T) {
	r, tk, outs := reportRoom(t)
	pollute(r, tk)
	standAtTank(r, "crew1", tk)

	report(r, "crew1", tk.slot)

	if r.phase != matchv1.Phase_MEETING || r.meeting == nil {
		t.Fatalf("el reporte debe abrir la reunión: %v", r.phase)
	}
	if r.meeting.reason != matchv1.MeetingReason_MEETING_REASON_REPORT ||
		r.meeting.tankSlot != tk.slot ||
		r.meeting.reporterID != "crew1" {
		t.Errorf("reunión incorrecta: %+v", r.meeting)
	}
	if code := lastError(outs["crew1"]); code != "" {
		t.Errorf("un reporte válido no responde error: %s", code)
	}

	// Tras la reunión el tanque sigue sucio y ya no se puede reportar.
	r.meeting = nil
	r.phase = matchv1.Phase_PLAYING
	v := tankView(r, tk.slot)
	if !v.Dead || v.Contamination != maxContamination || !v.Reported {
		t.Errorf("sigue contaminado y marcado como reportado: %+v", v)
	}
}

func TestReportRejectionsAnswerWithErrorCode(t *testing.T) {
	cases := []struct {
		name  string
		setup func(r *Room, tk *tank) int32 // devuelve el slot a reportar
		code  string
	}{
		{
			name: "tank below one hundred",
			setup: func(r *Room, tk *tank) int32 {
				r.addContamination(tk, contaminateAmount)
				standAtTank(r, "crew1", tk)
				return tk.slot
			},
			code: ErrCodeTankNotPolluted,
		},
		{
			name: "impostor tank capped at ninety nine",
			setup: func(r *Room, _ *tank) int32 {
				own := tankOf(r, "imp")
				pollute(r, own)
				standAtTank(r, "crew1", own)
				return own.slot
			},
			code: ErrCodeTankNotPolluted,
		},
		{
			name: "reporter too far",
			setup: func(r *Room, tk *tank) int32 {
				pollute(r, tk)
				p := r.players["crew1"]
				p.view.X = float32(tk.x + reportRange + 10)
				p.view.Y = float32(tk.y)
				return tk.slot
			},
			code: ErrCodeReportTooFar,
		},
		{
			name: "reporter is a ghost",
			setup: func(r *Room, tk *tank) int32 {
				pollute(r, tk)
				standAtTank(r, "crew1", tk)
				r.players["crew1"].view.Alive = false
				return tk.slot
			},
			code: ErrCodeReportNotAlive,
		},
		{
			name: "meeting already running",
			setup: func(r *Room, tk *tank) int32 {
				pollute(r, tk)
				standAtTank(r, "crew1", tk)
				r.phase = matchv1.Phase_MEETING
				return tk.slot
			},
			code: ErrCodeMeetingInProgress,
		},
		{
			name: "tank already reported",
			setup: func(r *Room, tk *tank) int32 {
				pollute(r, tk)
				tk.reported = true
				standAtTank(r, "crew1", tk)
				return tk.slot
			},
			code: ErrCodeTankAlreadyReported,
		},
		{
			name: "unknown slot",
			setup: func(r *Room, tk *tank) int32 {
				standAtTank(r, "crew1", tk)
				return 99
			},
			code: ErrCodeUnknownTank,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			r, tk, outs := reportRoom(t)
			slot := c.setup(r, tk)
			phase := r.phase

			report(r, "crew1", slot)

			if r.phase != phase || r.meeting != nil {
				t.Errorf("el rechazo no cambia la fase: %v", r.phase)
			}
			if got := lastError(outs["crew1"]); got != c.code {
				t.Errorf("error = %q, quiero %q", got, c.code)
			}
		})
	}
}
