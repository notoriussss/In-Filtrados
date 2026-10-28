package room

import "errors"

// Errors returned by LoadMap when shared/map.json cannot be used.
var (
	errMapSize  = errors.New("map width and height must be positive")
	errWallSize = errors.New("every wall must have positive w and h")
	errSpawn    = errors.New("spawn must be inside the world and off the walls")
)

// Error sent to the player whose set_task_count is out of range.
const (
	ErrCodeInvalidTaskCount = "INVALID_TASK_COUNT"
	errMsgInvalidTaskCount  = "La cantidad de tareas debe estar " +
		"entre %d y %d"
)

// Prefixes that wrap the read and parse errors of LoadMap.
const (
	msgReadMap  = "read map"
	msgParseMap = "parse map"

	msgPickImpostors = "pick impostors"
	msgPickStations  = "pick stations"
	msgRestoreRoom   = "restore room"
)
