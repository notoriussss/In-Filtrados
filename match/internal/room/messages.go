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

// Errors sent to the player whose set_impostor_count or
// set_match_duration is out of range.
const (
	ErrCodeInvalidImpostorCount = "INVALID_IMPOSTOR_COUNT"
	errMsgInvalidImpostorCount  = "La cantidad de infiltrados debe " +
		"estar entre %d y %d"

	ErrCodeInvalidMatchDuration = "INVALID_MATCH_DURATION"
	errMsgInvalidMatchDuration  = "La duración debe estar entre %d y " +
		"%d minutos"
)

// Errors sent to the player whose report of a polluted tank is rejected.
const (
	ErrCodeMeetingInProgress = "MEETING_IN_PROGRESS"
	errMsgMeetingInProgress  = "Ya hay una reunión en curso"

	ErrCodeReportNotAlive = "REPORT_NOT_ALIVE"
	errMsgReportNotAlive  = "Los fantasmas no pueden reportar"

	ErrCodeUnknownTank = "UNKNOWN_TANK"
	errMsgUnknownTank  = "Ese tanque no existe"

	ErrCodeTankNotPolluted = "TANK_NOT_POLLUTED"
	errMsgTankNotPolluted  = "El tanque no está contaminado al 100 %"

	ErrCodeTankAlreadyReported = "TANK_ALREADY_REPORTED"
	errMsgTankAlreadyReported  = "Ese tanque ya se reportó"

	ErrCodeReportTooFar = "REPORT_TOO_FAR"
	errMsgReportTooFar  = "Acércate más al tanque para reportarlo"
)

// Prefixes that wrap the read and parse errors of LoadMap.
const (
	msgReadMap  = "read map"
	msgParseMap = "parse map"

	msgPickImpostors = "pick impostors"
	msgPickStations  = "pick stations"
	msgRestoreRoom   = "restore room"
)
