package room

import (
	"errors"
	"math"
	"os"
	"path/filepath"
	"testing"
)

// The test runs in match/internal/room.
const sharedMapPath = "../../../shared/map.json"

// canal: walls from y 640 to 680, open only at the 3 bridges.
const (
	canalTop    = 640
	canalBottom = 680
)

func sharedMap(t *testing.T) *Map {
	t.Helper()
	m, err := LoadMap(sharedMapPath)
	if err != nil {
		t.Fatalf("load shared map: %v", err)
	}
	return m
}

// walk applies Move n times with the same step.
func walk(m *Map, x, y, dx, dy float64, n int) (float64, float64) {
	for i := 0; i < n; i++ {
		x, y = m.Move(x, y, dx, dy)
	}
	return x, y
}

func TestMoveDoesNotGoThroughWalls(t *testing.T) {
	m := sharedMap(t)
	tests := []struct {
		name   string
		x, y   float64
		dx, dy float64
		ok     func(x, y float64) bool
	}{
		{
			name: "down into the canal",
			x:    400, y: 600, dx: 0, dy: 10,
			ok: func(x, y float64) bool { return y+playerRadius <= canalTop },
		},
		{
			name: "up into the canal",
			x:    1200, y: 740, dx: 0, dy: -10,
			ok: func(x, y float64) bool {
				return y-playerRadius >= canalBottom
			},
		},
		{
			name: "left into the border",
			x:    300, y: 300, dx: -10, dy: 0,
			ok: func(x, y float64) bool { return x-playerRadius >= 20 },
		},
		{
			name: "up into the border",
			x:    300, y: 300, dx: 0, dy: -10,
			ok: func(x, y float64) bool { return y-playerRadius >= 20 },
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			x, y := tt.x, tt.y
			for i := 0; i < 100; i++ {
				x, y = m.Move(x, y, tt.dx, tt.dy)
				if !tt.ok(x, y) {
					t.Fatalf("step %d went into a wall: (%v, %v)", i, x, y)
				}
			}
		})
	}
}

func TestMoveSlidesAlongWalls(t *testing.T) {
	m := sharedMap(t)
	tests := []struct {
		name         string
		x, y         float64
		dx, dy       float64
		wantX, wantY float64
	}{
		{
			name: "diagonal into the canal slides in X",
			x:    400, y: 620, dx: 10, dy: 10,
			wantX: 410, wantY: 620,
		},
		{
			name: "diagonal into the left border slides in Y",
			x:    36, y: 300, dx: -10, dy: 10,
			wantX: 36, wantY: 310,
		},
		{
			name: "diagonal into the top-left corner stays",
			x:    36, y: 36, dx: -10, dy: -10,
			wantX: 36, wantY: 36,
		},
		{
			name: "free diagonal moves in both axes",
			x:    800, y: 500, dx: 10, dy: -10,
			wantX: 810, wantY: 490,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			x, y := m.Move(tt.x, tt.y, tt.dx, tt.dy)
			if x != tt.wantX || y != tt.wantY {
				t.Errorf(
					"want (%v, %v), got (%v, %v)",
					tt.wantX,
					tt.wantY,
					x,
					y,
				)
			}
		})
	}
}

func TestCanalOnlyCrossedByBridges(t *testing.T) {
	m := sharedMap(t)
	// Centers that fit through each 100-wide bridge with radius 16.
	bridges := []struct{ lo, hi float64 }{
		{36, 104},
		{766, 834},
		{1496, 1564},
	}
	onBridge := func(x float64) bool {
		for _, b := range bridges {
			if x >= b.lo && x <= b.hi {
				return true
			}
		}
		return false
	}

	crossings, inCrossing := 0, false
	for x := 40.0; x <= 1560; x += 2 {
		_, y := walk(m, x, 600, 0, 10, 20)
		crossed := y-playerRadius >= canalBottom
		if crossed != onBridge(x) {
			t.Errorf("x=%v: crossed=%v, on bridge=%v", x, crossed, onBridge(x))
		}
		if crossed && !inCrossing {
			crossings++
		}
		inCrossing = crossed
	}
	if crossings != len(bridges) {
		t.Errorf("want %d bridges, got %d", len(bridges), crossings)
	}
}

func TestMoveStaysInsideTheWorld(t *testing.T) {
	maps := map[string]*Map{
		"shared map": sharedMap(t),
		// Without walls, only the world bounds stop the player.
		"no walls": testMap(),
	}
	dirs := [][2]float64{
		{1, 0}, {-1, 0}, {0, 1}, {0, -1},
		{1, 1}, {1, -1}, {-1, 1}, {-1, -1},
	}
	starts := [][2]float64{{800, 500}, {300, 900}, {1300, 300}}
	for name, m := range maps {
		for _, s := range starts {
			for _, d := range dirs {
				x, y := s[0], s[1]
				for i := 0; i < 200; i++ {
					x, y = m.Move(x, y, d[0]*10, d[1]*10)
					if x < playerRadius ||
						x > m.Width-playerRadius ||
						y < playerRadius ||
						y > m.Height-playerRadius {
						t.Fatalf(
							"%s: from %v dir %v left the world at (%v, %v)",
							name,
							s,
							d,
							x,
							y,
						)
					}
				}
			}
		}
	}
}

func TestSpawnPoints(t *testing.T) {
	m := sharedMap(t)
	const players = 10
	xs, ys := make([]float64, players), make([]float64, players)
	for i := 0; i < players; i++ {
		xs[i], ys[i] = m.SpawnPoint(i)
		if m.blocked(xs[i], ys[i]) {
			t.Errorf("spawn %d (%v, %v) is blocked", i, xs[i], ys[i])
		}
		for j := 0; j < i; j++ {
			d := math.Hypot(xs[i]-xs[j], ys[i]-ys[j])
			if d < spawnGap {
				t.Errorf("spawns %d and %d are %v apart", i, j, d)
			}
		}
		dist := math.Hypot(xs[i]-m.Spawn.X, ys[i]-m.Spawn.Y)
		if dist > 2*spawnGap+spawnGap/2 {
			t.Errorf("spawn %d is %v away from the spawn point", i, dist)
		}
	}
}

func TestLoadMapErrors(t *testing.T) {
	dir := t.TempDir()
	write := func(name, body string) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		return p
	}
	tests := []struct {
		name string
		path string
		want error
	}{
		{
			name: "missing file",
			path: filepath.Join(dir, "missing.json"),
			want: os.ErrNotExist,
		},
		{
			name: "broken json",
			path: write("broken.json", `{"width": 1600,`),
		},
		{
			name: "no size",
			path: write("nosize.json", `{"spawn": {"x": 10, "y": 10}}`),
			want: errMapSize,
		},
		{
			name: "empty wall",
			path: write(
				"wall.json",
				`{"width": 100, "height": 100,
				  "spawn": {"x": 50, "y": 50},
				  "walls": [{"x": 0, "y": 0, "w": 0, "h": 10}]}`,
			),
			want: errWallSize,
		},
		{
			name: "spawn inside a wall",
			path: write(
				"spawn.json",
				`{"width": 100, "height": 100,
				  "spawn": {"x": 50, "y": 50},
				  "walls": [{"x": 40, "y": 40, "w": 20, "h": 20}]}`,
			),
			want: errSpawn,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, err := LoadMap(tt.path)
			if err == nil {
				t.Fatalf("want an error, got map %+v", m)
			}
			if tt.want != nil && !errors.Is(err, tt.want) {
				t.Errorf("want %v, got %v", tt.want, err)
			}
		})
	}
}
