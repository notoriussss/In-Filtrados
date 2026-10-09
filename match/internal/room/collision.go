package room

// Move moves first in X and then in Y. Each step is undone if the player's
// circle would touch a wall or leave the world, so a player walking
// diagonally into a wall slides along it instead of getting stuck.
func (m *Map) Move(x, y, dx, dy float64) (nx, ny float64) {
	nx, ny = x+dx, y
	if m.blocked(nx, ny) {
		nx = x
	}
	ny = y + dy
	if m.blocked(nx, ny) {
		ny = y
	}
	return nx, ny
}

// blocked reports whether a player centered at (x, y) leaves the world or
// overlaps a wall. Touching a wall edge exactly is allowed.
func (m *Map) blocked(x, y float64) bool {
	const r = playerRadius
	if x-r < 0 || x+r > m.Width || y-r < 0 || y+r > m.Height {
		return true
	}
	for _, w := range m.Walls {
		// Closest point of the wall to the circle center.
		cx := clamp(x, w.X, w.X+w.W)
		cy := clamp(y, w.Y, w.Y+w.H)
		if (x-cx)*(x-cx)+(y-cy)*(y-cy) < r*r {
			return true
		}
	}
	return false
}
