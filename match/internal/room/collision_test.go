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

func sharedMap(t *testing.T) *Map {
	t.Helper()
	m, err := LoadMap(sharedMapPath)
	if err != nil {
		t.Fatalf("load shared map: %v", err)
	}
	return m
}

// wallMap es un mundo de 1000 × 1000 con una pared de 200 × 40 en el
// centro, para probar el deslizamiento sin depender del arte del mapa.
func wallMap() *Map {
	return &Map{
		Width:  1000,
		Height: 1000,
		Spawn:  Point{X: 100, Y: 100},
		Walls:  []Rect{{X: 400, Y: 480, W: 200, H: 40}},
	}
}

func TestMoveDoesNotGoThroughWalls(t *testing.T) {
	m := wallMap()
	tests := []struct {
		name   string
		x, y   float64
		dx, dy float64
		ok     func(x, y float64) bool
	}{
		{
			name: "down into the wall",
			x:    500, y: 400, dx: 0, dy: 10,
			ok: func(x, y float64) bool { return y+playerRadius <= 480 },
		},
		{
			name: "up into the wall",
			x:    500, y: 600, dx: 0, dy: -10,
			ok: func(x, y float64) bool { return y-playerRadius >= 520 },
		},
		{
			name: "left into the border",
			x:    300, y: 300, dx: -10, dy: 0,
			ok: func(x, y float64) bool { return x-playerRadius >= 0 },
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
	m := wallMap()
	tests := []struct {
		name         string
		x, y         float64
		dx, dy       float64
		wantX, wantY float64
	}{
		{
			name: "diagonal into the wall slides in X",
			x:    500, y: 464, dx: 10, dy: 10,
			wantX: 510, wantY: 464,
		},
		{
			name: "diagonal into the left border slides in Y",
			x:    16, y: 300, dx: -10, dy: 10,
			wantX: 16, wantY: 310,
		},
		{
			name: "diagonal into the top-left corner stays",
			x:    16, y: 16, dx: -10, dy: -10,
			wantX: 16, wantY: 16,
		},
		{
			name: "free diagonal moves in both axes",
			x:    800, y: 800, dx: 10, dy: -10,
			wantX: 810, wantY: 790,
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

// reachable recorre el mapa en una cuadrícula de 8 unidades desde el
// spawn, como lo haría un jugador, y devuelve los centros alcanzables.
func reachable(m *Map) [][2]float64 {
	const cell = 8
	type key struct{ i, j int }
	start := key{int(m.Spawn.X) / cell, int(m.Spawn.Y) / cell}
	seen := map[key]bool{start: true}
	queue := []key{start}
	var out [][2]float64
	for len(queue) > 0 {
		k := queue[0]
		queue = queue[1:]
		out = append(out, [2]float64{
			float64(k.i * cell),
			float64(k.j * cell),
		})
		for _, d := range []key{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			n := key{k.i + d.i, k.j + d.j}
			if seen[n] || m.blocked(float64(n.i*cell), float64(n.j*cell)) {
				continue
			}
			seen[n] = true
			queue = append(queue, n)
		}
	}
	return out
}

// TestEverythingIsReachable: cada estación, tanque y punto de
// reparación de shared/map.json se alcanza a pie desde el spawn y queda
// dentro del rango con que match acepta la acción.
func TestEverythingIsReachable(t *testing.T) {
	m := sharedMap(t)
	pts := reachable(m)
	near := func(x, y, r float64) bool {
		for _, p := range pts {
			if math.Hypot(p[0]-x, p[1]-y) <= r {
				return true
			}
		}
		return false
	}
	for _, s := range m.Stations {
		if !near(s.X, s.Y, s.radius()) {
			t.Errorf("station %s is out of reach", s.ID)
		}
	}
	for _, tk := range m.Tanks {
		if !near(tk.X, tk.Y, tankRange) {
			t.Errorf("tank %d is out of reach", tk.Slot)
		}
		if !near(tk.X, tk.Y, reportRange) {
			t.Errorf("tank %d cannot be reported", tk.Slot)
		}
	}
	for _, fp := range m.FixPoints {
		if !near(fp.X, fp.Y, fixRange) {
			t.Errorf("fix point %s is out of reach", fp.ID)
		}
	}
	if len(m.Stations) < tasksPerPlayer {
		t.Errorf("want at least %d stations", tasksPerPlayer)
	}
	if len(m.Tanks) < 10 {
		t.Errorf("want 10 tanks, got %d", len(m.Tanks))
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
	starts := [][2]float64{{1328, 1008}, {336, 784}, {1040, 400}}
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
		if dist > 3*spawnGap {
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
