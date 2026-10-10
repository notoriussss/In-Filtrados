package room

import "errors"

// Errors returned by LoadMap when shared/map.json cannot be used.
var (
	errMapSize  = errors.New("map width and height must be positive")
	errWallSize = errors.New("every wall must have positive w and h")
	errSpawn    = errors.New("spawn must be inside the world and off the walls")
)

// Prefixes that wrap the read and parse errors of LoadMap.
const (
	msgReadMap  = "read map"
	msgParseMap = "parse map"
)
