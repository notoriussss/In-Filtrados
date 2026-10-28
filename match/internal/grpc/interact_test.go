package grpc

import (
	"testing"

	"github.com/notoriussss/in-filtrados/match/gen/matchv1"
)

// Los tanques no se limpian: un Interact sobre un tanque (lo que mandaban
// los clientes viejos para limpiar) ya no se convierte en ninguna acción.
func TestInteractOnATankDoesNothing(t *testing.T) {
	_, ok := interactAction("p1", &matchv1.Interact{
		Target: &matchv1.Interact_TankSlot{TankSlot: 1},
	})
	if ok {
		t.Fatal("interactuar con un tanque no debe hacer nada")
	}
}

func TestInteractOnAStationIsATask(t *testing.T) {
	action, ok := interactAction("p1", &matchv1.Interact{
		Target:    &matchv1.Interact_StationId{StationId: "leak-1"},
		Completed: true,
	})
	if !ok || !action.InteractTask || action.StationID != "leak-1" ||
		!action.Completed {
		t.Fatalf("la estación debe ser una tarea: %+v ok=%v", action, ok)
	}
}
