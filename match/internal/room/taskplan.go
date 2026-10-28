package room

import (
	"crypto/rand"
	"fmt"
	"io"
	"math/big"
	"sort"
	"strings"
)

// maxPlanAttempts es cuántas veces se vuelve a sortear la lista de un
// jugador cuando le sale el mismo conjunto de estaciones que a otro.
const maxPlanAttempts = 10

// planTasks reparte count estaciones distintas a cada jugador, en un
// orden propio. Reglas, de la más a la menos importante:
//   - cada lista mezcla las tres 3R (reduce, reuse, recycle) lo más parejo
//     que permita count;
//   - ninguna estación queda mucho más repartida que otra, y
//   - dos jugadores no repiten el mismo conjunto si hay manera de evitarlo.
//
// Cuidadores e impostores se reparten igual, para que la lista de un
// impostor no lo delate. Todo el azar sale de rnd (crypto/rand fuera de
// las pruebas).
func planTasks(
	stations []Station,
	playerIDs []string,
	count int,
	rnd io.Reader,
) (map[string][]string, error) {
	count = min(count, len(stations))
	plans := make(map[string][]string, len(playerIDs))
	if count <= 0 {
		return plans, nil
	}

	// Quien sortea primero se lleva las estaciones menos repartidas:
	// el orden de los jugadores también es al azar.
	players := append([]string(nil), playerIDs...)
	sort.Strings(players)
	if err := shuffle(players, rnd); err != nil {
		return nil, err
	}

	load := make(map[string]int, len(stations))
	seen := make(map[string]bool, len(players))
	for _, id := range players {
		var list []string
		for try := 0; try < maxPlanAttempts; try++ {
			picked, err := pickBalanced(stations, count, load, rnd)
			if err != nil {
				return nil, err
			}
			list = picked
			if !seen[setKey(list)] {
				break
			}
		}
		seen[setKey(list)] = true
		for _, station := range list {
			load[station]++
		}
		plans[id] = list
	}
	return plans, nil
}

// pickBalanced elige count estaciones: siempre de la 3R que menos lleva
// la lista; a igual cantidad, de la 3R menos repartida entre todos los
// jugadores y, dentro de ella, de la estación menos repartida. El empate
// se resuelve al azar. Al final mezcla el orden de la lista.
func pickBalanced(
	stations []Station,
	count int,
	load map[string]int,
	rnd io.Reader,
) ([]string, error) {
	typeLoad := make(map[string]int, 3)
	for _, s := range stations {
		typeLoad[s.Type] += load[s.ID]
	}
	chosen := make(map[string]bool, count)
	perType := make(map[string]int, 3)
	list := make([]string, 0, count)
	for len(list) < count {
		var best []Station
		for _, s := range stations {
			if chosen[s.ID] {
				continue
			}
			switch {
			case len(best) == 0 || lessLoaded(s, best[0], perType, typeLoad, load):
				best = append(best[:0], s)
			case !lessLoaded(best[0], s, perType, typeLoad, load):
				best = append(best, s) // empate: se sortea
			}
		}
		j, err := intn(rnd, len(best))
		if err != nil {
			return nil, err
		}
		pick := best[j]
		chosen[pick.ID] = true
		perType[pick.Type]++
		list = append(list, pick.ID)
	}
	if err := shuffle(list, rnd); err != nil {
		return nil, err
	}
	return list, nil
}

// lessLoaded dice si a es mejor candidata que b: su 3R aparece menos en
// la lista, si no está menos repartida entre todos y, si no, la estación
// misma está menos repartida.
func lessLoaded(
	a, b Station,
	perType map[string]int,
	typeLoad map[string]int,
	load map[string]int,
) bool {
	if perType[a.Type] != perType[b.Type] {
		return perType[a.Type] < perType[b.Type]
	}
	if typeLoad[a.Type] != typeLoad[b.Type] {
		return typeLoad[a.Type] < typeLoad[b.Type]
	}
	return load[a.ID] < load[b.ID]
}

// setKey identifica el conjunto de estaciones sin importar el orden.
func setKey(list []string) string {
	sorted := append([]string(nil), list...)
	sort.Strings(sorted)
	return strings.Join(sorted, ",")
}

// intn devuelve un entero uniforme en [0, n) leído de rnd.
func intn(rnd io.Reader, n int) (int, error) {
	v, err := rand.Int(rnd, big.NewInt(int64(n)))
	if err != nil {
		return 0, fmt.Errorf("%s: %w", msgPickStations, err)
	}
	return int(v.Int64()), nil
}

// shuffle mezcla list con un Fisher-Yates leyendo de rnd.
func shuffle(list []string, rnd io.Reader) error {
	for i := len(list) - 1; i > 0; i-- {
		j, err := intn(rnd, i+1)
		if err != nil {
			return err
		}
		list[i], list[j] = list[j], list[i]
	}
	return nil
}
