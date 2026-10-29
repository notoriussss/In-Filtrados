"""Genera los personajes de Jimena con su accesorio YA integrado.

Los cuadros de Jimena (public/assets/characters/jimena/<Color>_Player-*.png)
son pixel art de ~22 x 30 píxeles de arte ampliado con suavizado. Poner un
accesorio nítido encima de ese cuerpo borroso se veía pegado, así que aquí:

1. se mide la rejilla de píxeles de arte de cada cuadro (jimena_grid.json),
2. se lee el cuerpo celda por celda, con colores planos (sin el suavizado),
3. se dibuja el accesorio en esa MISMA rejilla, con el mismo contorno que el
   cuerpo, y se funde con él (el sombrero tapa la coronilla, la mochila va
   por detrás, el impermeable tiñe el torso...), y
4. se amplía sin suavizado, con el mismo tamaño de píxel que tenía el cuadro.

Sale una hoja de 14 cuadros por color y accesorio (el mismo orden y celda que
usa sprites.ts), el personaje completo en lugar de un cuerpo y una capa:

    web/public/assets/characters/jimena/baked/<Color>-<accesorio|none>.png

Las coordenadas de los dibujos son (dx, dy): dx desde el centro de la cabeza
y dy desde la fila de la coronilla, en píxeles de arte. Las paletas son las de
los accesorios de la gota (public/assets/characters/gota).

Uso (desde la raíz del repo):
    python web/tools/gen_jimena_sprites.py            genera las hojas
    python web/tools/gen_jimena_sprites.py --fit      vuelve a medir la rejilla
    python web/tools/gen_jimena_sprites.py --preview [Color] [accesorio ...]
"""

import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageOps

HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, '..', 'public', 'assets', 'characters', 'jimena')
OUT = os.path.join(ROOT, 'baked')
GRID_FILE = os.path.join(HERE, 'jimena_grid.json')

# Mismo orden que SpriteFrame en web/src/game/render/sprites.ts.
FRAMES = [
    'front', 'front-walking1', 'front-walking2',
    'back', 'back-walking1', 'back-walking2',
    'left-walking1', 'left-passing1', 'left-walking2', 'left-passing2',
    'right-walking1', 'right-passing1', 'right-walking2', 'right-passing2',
]
COLORS = ['Red', 'Green', 'Yellow', 'Blue', 'Orange', 'Purple', 'Cyan', 'Magenta']
W, H = 88, 125
# Lo que sobresale del cuadro (sombreros, ramas, mochila): cada celda lleva
# PADX a cada lado y PADY arriba (sprites.ts: ACCESSORY_PAD_X y _PAD_Y).
PADX, PADY = 24, 40
CELL_W, CELL_H = W + 2 * PADX, H + PADY

# Rejilla de la hoja de dibujo de un accesorio y la celda de (dx=0, dy=0).
GW, GH = 40, 44
AX, AY = 20, 14

ACCESSORIES = [
    'cap', 'sprout', 'headphones', 'glasses', 'straw-hat', 'diving-mask',
    'scarf', 'backpack', 'helmet', 'flower', 'fisher-hat', 'raincoat',
]
BEHIND = {'backpack'}


def hx(h, a=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


class Ramp:
    """Tonos de un material: oscuro, base, claro y brillo."""

    def __init__(self, dark, base, light, hi=None):
        self.dark, self.base, self.light = hx(dark), hx(base), hx(light)
        self.hi = hx(hi) if hi else self.light


# Paletas tomadas de los accesorios de la gota.
BLUE = Ramp('#2454b8', '#4a7fd6', '#80b3db', '#bfe0f2')
BLUE_D = Ramp('#1a3671', '#2454b8', '#4a7fd6', '#80b3db')
STRAW = Ramp('#c19023', '#e2b95e', '#eed9a0', '#fff1c4')
STRAW_BAND = Ramp('#7b3a24', '#c4543f', '#e0705a', '#f2a08c')
STRAW_BRIM = Ramp('#c19023', '#e5ce95', '#f4e6bd', '#fff6dc')
FISH = Ramp('#b9a46c', '#c9b27c', '#e1d6b6', '#f3ecd6')
FISH_BRIM = Ramp('#8d5c32', '#b97f48', '#d1a06a', '#e8c394')
FISH_BAND = Ramp('#2c5694', '#3d6fb0', '#6a9ad6', '#a6c6ee')
HELMET = Ramp('#db7804', '#f4c430', '#f7dc7a', '#fff7c2')
HELMET_BRIM = Ramp('#8e4a10', '#db7804', '#f0a23a', '#f8c878')
LAMP = Ramp('#d9a53a', '#fff0a8', '#fffbe0', '#ffffff')
CUP = Ramp('#d11e46', '#ef6b73', '#f0a6a5', '#ffd0cf')
BAND = Ramp('#3e4558', '#6a7690', '#a3b0c8', '#d4deee')
FRAME = Ramp('#1b2733', '#223344', '#3a5068', '#8fa3b2')
LENS = hx('#bef5fb')
LENS_HI = hx('#ffffff')
MASK_RIM = Ramp('#a8300a', '#d8440b', '#f07a3a', '#ffb07a')
MASK_LENS = Ramp('#3abfff', '#7fe0ff', '#bef5fb', '#ffffff')
STRAP = Ramp('#3f352c', '#594d40', '#7a6a58', '#9a8872')
SCARF = Ramp('#d3161f', '#e65a48', '#e9a393', '#f6c9bd')
SCARF_D = Ramp('#a50f18', '#d3161f', '#e65a48', '#e9a393')
PACK = Ramp('#378169', '#4fae82', '#7bbd97', '#a6d6ba')
PACK_D = Ramp('#25594a', '#378169', '#4fae82', '#7bbd97')
PACK_STRAP = Ramp('#1d2736', '#2d3b4d', '#52667f', '#8fa3b2')
COAT = Ramp('#d77606', '#f2c230', '#f7dc7a', '#fff1b0')
COAT_D = Ramp('#8e4a10', '#d77606', '#f0a23a', '#f8c878')
LEAF = Ramp('#369d50', '#58c05f', '#88cb87', '#b8e6b4')
STEM = Ramp('#235c27', '#2f7a4a', '#3f9a5c', '#58c05f')
PETAL = Ramp('#ae2696', '#f75dc0', '#f7a1cf', '#f9d9e7')
CENTER = Ramp('#d99a1c', '#f6d14d', '#f9e68a', '#fff6c2')

# Silueta de la cabeza de frente: dy -> (x0, x1), contorno incluido.
HEAD = {
    0: (-2, 2), 1: (-4, 4), 2: (-5, 5), 3: (-6, 6), 4: (-6, 6), 5: (-6, 6),
    6: (-7, 7), 7: (-7, 7), 8: (-7, 7), 9: (-7, 7), 10: (-7, 7),
    11: (-6, 6), 12: (-6, 6), 13: (-6, 6), 14: (-5, 5), 15: (-5, 5),
}


def spans(dy0, rows):
    """Lista de (x0, x1) -> {dy: (x0, x1)} empezando en la fila dy0."""
    return {dy0 + i: r for i, r in enumerate(rows)}


class Spr:
    """Un accesorio dibujado en la rejilla de arte."""

    def __init__(self):
        self.g = np.zeros((GH, GW, 4), dtype=np.uint8)
        self.m = np.zeros((GH, GW), dtype=bool)

    def put(self, dx, dy, c):
        x, y = AX + dx, AY + dy
        if 0 <= x < GW and 0 <= y < GH:
            self.g[y, x] = c
            self.m[y, x] = True

    def fill(self, region, ramp, shade=True):
        """Rellena una región {dy: (x0, x1)}; sombrea los bordes."""
        cells = {(dx, dy) for dy, (a, b) in region.items() for dx in range(a, b + 1)}
        return self.fillc(cells, ramp, shade)

    def fillc(self, cells, ramp, shade=True):
        """Igual que fill, con la región dada como conjunto de (dx, dy)."""
        for dx, dy in cells:
            c = ramp.base
            if shade:
                down = (dx, dy + 1) in cells
                up = (dx, dy - 1) in cells
                left = (dx - 1, dy) in cells
                right = (dx + 1, dy) in cells
                if not down or (not right and dx > 0):
                    c = ramp.dark
                elif not up or (not left and dx <= 0):
                    c = ramp.light
            self.put(dx, dy, c)
        return cells

    def dots(self, pts, c):
        for dx, dy in pts:
            self.put(dx, dy, c)

    def hline(self, dy, x0, x1, c):
        for dx in range(x0, x1 + 1):
            self.put(dx, dy, c)

    def vline(self, dx, y0, y1, c):
        for dy in range(y0, y1 + 1):
            self.put(dx, dy, c)

    def outline(self, ink):
        """Contorno de un píxel (4 vecinos) alrededor de todo lo pintado."""
        m = self.m
        ring = np.zeros_like(m)
        ring[1:, :] |= m[:-1, :]
        ring[:-1, :] |= m[1:, :]
        ring[:, 1:] |= m[:, :-1]
        ring[:, :-1] |= m[:, 1:]
        ring &= ~m
        self.g[ring] = ink
        self.m |= ring


def dilate(cells):
    out = set(cells)
    for dx, dy in cells:
        out |= {(dx + 1, dy), (dx - 1, dy), (dx, dy + 1), (dx, dy - 1)}
    return out


# --- accesorios de la cabeza ---------------------------------------------
# Cada función dibuja para 'front', 'back' o 'side' (mirando a la derecha).

def cap(s, view):
    dome = spans(-2, [(-3, 3), (-5, 5), (-6, 6), (-7, 7), (-7, 7), (-7, 7), (-7, 7)])
    s.fill(dome, BLUE)
    if view == 'side':
        s.fill({4: (7, 11), 5: (3, 12)}, BLUE_D)
        s.hline(5, -7, 2, BLUE_D.base)
    else:
        s.fill({5: (-8, 8)}, BLUE_D)
        if view == 'back':
            s.dots([(0, 4), (1, 4), (-1, 4)], BLUE_D.base)
    s.put(0 if view != 'side' else -1, -3, BLUE_D.base)
    s.put(-3, 0, BLUE.hi)
    s.put(-4, 1, BLUE.hi)


def sprout(s, view):
    ox = -1 if view == 'side' else 0
    s.fill({dy: (ox, ox) for dy in range(-4, 0)}, STEM, shade=False)
    left = {-6: (-5, -5), -5: (-5, -2), -4: (-4, -1)}
    right = {-6: (5, 5), -5: (2, 5), -4: (1, 4)}
    for leaf in (left, right):
        s.fill({dy: (ox + a, ox + b) for dy, (a, b) in leaf.items()}, LEAF)
    s.put(ox - 4, -5, LEAF.hi)
    s.put(ox + 3, -5, LEAF.light)


def headphones(s, view):
    head = {(dx, dy) for dy, (a, b) in HEAD.items() for dx in range(a, b + 1)}
    if view == 'side':
        s.fillc({(dx, dy) for dy in range(0, 6) for dx in (-2, -1)}, BAND)
        s.fillc({(dx, -1) for dx in range(-3, 1)}, BAND)
        s.fillc({(dx, -2) for dx in range(-3, 0)}, BAND)
        s.fill(spans(5, [(-3, 1), (-4, 2), (-4, 2), (-4, 2), (-4, 2), (-3, 1)]), CUP)
        s.dots([(-3, 6), (-2, 6)], CUP.hi)
    else:
        ring = dilate(dilate(head)) - head
        band = {(dx, dy) for dx, dy in ring if -3 <= dy <= 5}
        s.fillc(band, BAND)
        for side in (-1, 1):
            a, b = (8, 10) if side == 1 else (-10, -8)
            s.fill(
                {5: (a + 1, b - 1), 6: (a, b), 7: (a, b), 8: (a, b), 9: (a, b),
                 10: (a + 1, b - 1)},
                CUP,
            )
            s.put(a if side == 1 else b, 6, CUP.hi)


def glasses(s, view):
    if view == 'front':
        for a in (-3, 1):
            for dy in (6, 7, 8):
                for dx in range(a, a + 3):
                    s.put(dx, dy, LENS)
            s.put(a, 6, LENS_HI)
        for dx in (-1, 1):
            s.vline(dx, 7, 8, FRAME.dark)
        s.put(0, 7, FRAME.base)
        s.hline(7, -7, -5, FRAME.base)
        s.hline(7, 5, 7, FRAME.base)
    elif view == 'side':
        for dy in (6, 7, 8):
            for dx in range(4, 7):
                s.put(dx, dy, LENS)
        s.put(4, 6, LENS_HI)
        s.vline(6, 7, 8, FRAME.dark)
        s.hline(7, -6, 3, FRAME.base)
    else:
        s.hline(7, -8, -7, FRAME.base)
        s.hline(7, 7, 8, FRAME.base)


def straw_hat(s, view):
    s.fill(spans(-3, [(-3, 3), (-5, 5), (-6, 6), (-6, 6), (-6, 6)]), STRAW)
    s.fill({1: (-6, 6), 2: (-6, 6)}, STRAW_BAND)
    brim = spans(3, [(-11, 11), (-12, 12), (-10, 10)])
    if view == 'side':
        brim = spans(3, [(-10, 11), (-11, 12), (-9, 10)])
    s.fill(brim, STRAW_BRIM)
    s.hline(4, -9, 9, STRAW_BRIM.dark)
    for dx in range(-9, 10, 3):
        s.put(dx, 4, STRAW_BRIM.base)
    s.dots([(-3, -2), (-4, -1)], STRAW.hi)


def diving_mask(s, view):
    if view == 'front':
        s.fill({6: (-8, 8), 7: (-8, 8), 8: (-8, 8)}, STRAP)
        s.fill(spans(5, [(-5, 5), (-6, 6), (-6, 6), (-6, 6), (-5, 5), (-4, 4)]), MASK_RIM)
        s.fill(spans(6, [(-4, 4), (-5, 5), (-5, 5), (-4, 4)]), MASK_LENS)
        s.dots([(-4, 7), (-3, 6)], MASK_LENS.hi)
        s.put(0, 11, MASK_RIM.dark)
    elif view == 'side':
        s.fill({6: (-7, 2), 7: (-7, 2), 8: (-7, 2)}, STRAP)
        s.fill(spans(5, [(2, 7), (2, 9), (2, 9), (2, 9), (2, 8), (3, 7)]), MASK_RIM)
        s.fill(spans(6, [(3, 7), (3, 8), (3, 8), (3, 7)]), MASK_LENS)
        s.dots([(3, 7), (4, 6)], MASK_LENS.hi)
    else:
        s.fill({6: (-8, 8), 7: (-8, 8), 8: (-8, 8)}, STRAP)
        s.hline(7, -8, 8, STRAP.dark)
        s.dots([(-8, 6), (-8, 7), (-8, 8)], STRAP.light)


def helmet(s, view):
    dome = spans(-2, [(-3, 3), (-5, 5), (-6, 6), (-7, 7), (-7, 7), (-7, 7), (-7, 7)])
    s.fill(dome, HELMET)
    s.fill({5: (-9, 9)} if view != 'side' else {5: (-8, 12), 4: (7, 12)}, HELMET_BRIM)
    s.vline(0, -2, 3, HELMET.light)
    s.vline(-1, -1, 3, HELMET.light)
    if view == 'front':
        s.fill(spans(0, [(-2, 2), (-2, 2), (-1, 1)]), LAMP)
    elif view == 'side':
        s.fill(spans(0, [(3, 6), (3, 7), (4, 6)]), LAMP)
    s.put(-4, 0, HELMET.hi)


def flower(s, view):
    cx, cy = (4, -1) if view != 'side' else (2, -2)
    petals = [(0, -2), (-1, -1), (0, -1), (1, -1), (-2, 0), (-1, 0), (1, 0), (2, 0),
              (-1, 1), (0, 1), (1, 1), (0, 2)]
    cells = {(cx + dx, cy + dy) for dx, dy in petals}
    for dx, dy in sorted(cells, key=lambda p: (p[1], p[0])):
        down = (dx, dy + 1) in cells
        right = (dx + 1, dy) in cells
        up = (dx, dy - 1) in cells
        left = (dx - 1, dy) in cells
        c = PETAL.base
        if not down and not right:
            c = PETAL.dark
        if not up or not left:
            c = PETAL.light
        s.put(dx, dy, c)
    s.put(cx - 1, cy - 1, PETAL.hi)
    s.put(cx, cy, CENTER.base)
    s.put(cx - 1, cy + 3, LEAF.base)
    s.put(cx - 2, cy + 3, LEAF.light)
    s.put(cx - 1, cy + 4, LEAF.dark)


def fisher_hat(s, view):
    s.fill(spans(-2, [(-3, 3), (-5, 5), (-6, 6), (-6, 6)]), FISH)
    s.fill({2: (-7, 7), 3: (-7, 7)}, FISH_BAND)
    brim = spans(4, [(-10, 10), (-9, 9)])
    if view == 'side':
        brim = spans(4, [(-9, 11), (-8, 10)])
    s.fill(brim, FISH_BRIM)
    if view != 'back':
        s.dots([(4, 2), (4, 3), (5, 2), (5, 3)], hx('#c4543f'))
        s.put(5, 2, hx('#f2a08c'))
    s.put(-3, -1, FISH.hi)


HEAD_FN = {
    'cap': cap, 'sprout': sprout, 'headphones': headphones, 'glasses': glasses,
    'straw-hat': straw_hat, 'diving-mask': diving_mask, 'helmet': helmet,
    'flower': flower, 'fisher-hat': fisher_hat,
}


# --- accesorios del cuerpo -----------------------------------------------

def scarf(s, view):
    if view == 'side':
        s.fill({15: (-5, 5), 16: (-6, 6), 17: (-6, 6)}, SCARF)
        s.fill(spans(16, [(-9, -5), (-9, -5), (-9, -6), (-8, -6), (-8, -6), (-8, -7)]), SCARF_D)
    else:
        s.fill({15: (-4, 4), 16: (-6, 6), 17: (-7, 7)}, SCARF)
        tail = (3, 6) if view == 'front' else (-6, -3)
        s.fill(spans(18, [tail, tail, (tail[0], tail[1] - 1), (tail[0], tail[1] - 1),
                          (tail[0] + 1, tail[1] - 1)]), SCARF_D)
    for dx in range(-5, 6, 4):
        s.put(dx, 16, SCARF.light)


def backpack_front(s, view):
    if view == 'front':
        for sx in (-1, 1):
            a, b = (3, 4) if sx == 1 else (-4, -3)
            s.fill(spans(16, [(a, b)] * 6), PACK_STRAP)
    elif view == 'back':
        s.fill(spans(16, [(-6, 6)] * 9), PACK)
        s.fill(spans(19, [(-4, 4)] * 4), PACK_D)
        s.hline(18, -6, 6, PACK.dark)
        s.dots([(-2, 20), (2, 20)], PACK.light)
    else:
        s.fill(spans(16, [(-1, 1)] * 6), PACK_STRAP)


def backpack_behind(s, view):
    if view == 'front':
        s.fill(spans(16, [(-9, 9)] * 9), PACK)
        s.fill(spans(19, [(-8, 8)] * 3), PACK_D)
    elif view == 'side':
        s.fill(spans(16, [(-10, -3)] * 9), PACK)
        s.fill(spans(19, [(-9, -5)] * 4), PACK_D)
        s.hline(18, -10, -3, PACK.dark)


BODY_FN = {'scarf': (scarf, None), 'backpack': (backpack_front, backpack_behind)}


# --- rejilla de píxeles de arte de cada cuadro ---------------------------

def load_native(color, frame):
    return np.array(Image.open(os.path.join(ROOT, f'{color}_Player-{frame}.png')).convert('RGBA'))


def fit_axis(A, scale, lo=3.6, hi=4.7):
    """Mejor (paso, desfase) de la rejilla a lo largo de las filas de A:
    el que deja los píxeles de cada celda lo más parecidos entre sí. Todo en
    píxeles del cuadro de 88 x 125 (scale = px nativos por px del cuadro)."""
    L, K = A.shape
    cs = np.vstack([np.zeros((1, K)), np.cumsum(A, 0)])
    sq = np.concatenate([[0], np.cumsum((A ** 2).sum(1))])
    best = None
    for pitch in np.arange(lo, hi, 0.01) * scale:
        for off in np.arange(0, pitch, pitch / 48):
            n = int((L - off) / pitch) + 2
            E = np.clip(np.round(off + np.arange(-1, n) * pitch).astype(int), 0, L)
            a, b = E[:-1], E[1:]
            m = b - a
            d = cs[b] - cs[a]
            cost = ((sq[b] - sq[a]) - (d ** 2).sum(1) / np.maximum(m, 1))[m >= 2].sum()
            if best is None or cost < best[0]:
                best = (cost, pitch / scale, off / scale)
    return best[1], best[2]


def fit_grids():
    grids = {}
    for f in FRAMES:
        a = load_native('Red', f).astype(float)
        a[:, :, :3] *= a[:, :, 3:4] / 255
        h, w = a.shape[:2]
        sx, ox = fit_axis(a.transpose(1, 0, 2).reshape(w, -1), w / W)
        sy, oy = fit_axis(a.reshape(h, -1), h / H)
        grids[f] = dict(sx=round(sx, 4), ox=round(ox, 3), sy=round(sy, 4), oy=round(oy, 3))
        print('fit', f, grids[f])
    with open(GRID_FILE, 'w', encoding='utf-8') as fh:
        json.dump(grids, fh, indent=1)
    return grids


def load_grids():
    if not os.path.exists(GRID_FILE):
        return fit_grids()
    with open(GRID_FILE, encoding='utf-8') as fh:
        return json.load(fh)


def cell_range(g):
    """Celdas (i, j) que cubren la celda de la hoja, con su margen."""
    i0 = math.floor((-PADX - g['ox']) / g['sx'])
    i1 = math.ceil((W + PADX - g['ox']) / g['sx'])
    j0 = math.floor((-PADY - g['oy']) / g['sy'])
    j1 = math.ceil((H - g['oy']) / g['sy'])
    return i0, i1, j0, j1


def read_cells(color, frame, g):
    """Cuerpo de un cuadro, celda por celda: {(i, j): (r, g, b)} con las
    celdas opacas y el color más repetido del centro de cada una."""
    a = load_native(color, frame)
    h, w = a.shape[:2]
    kx, ky = w / W, h / H
    cells = {}
    i0, i1, j0, j1 = cell_range(g)
    for j in range(j0, j1):
        for i in range(i0, i1):
            xa = g['ox'] + (i + 0.25) * g['sx']
            xb = g['ox'] + (i + 0.75) * g['sx']
            ya = g['oy'] + (j + 0.25) * g['sy']
            yb = g['oy'] + (j + 0.75) * g['sy']
            xa, xb = max(0, int(round(xa * kx))), min(w, int(round(xb * kx)))
            ya, yb = max(0, int(round(ya * ky))), min(h, int(round(yb * ky)))
            if xb <= xa or yb <= ya:
                continue
            px = a[ya:yb, xa:xb].reshape(-1, 4)
            if np.median(px[:, 3]) < 128:
                continue
            px = px[px[:, 3] >= 128]
            cells[(i, j)] = tuple(int(v) for v in np.median(px[:, :3], axis=0))
    return cells


def cluster(colors, limit=48):
    """Agrupa colores parecidos: devuelve la lista de centros."""
    counts = {}
    for c in colors:
        counts[c] = counts.get(c, 0) + 1
    centers = []
    for c, _ in sorted(counts.items(), key=lambda kv: -kv[1]):
        for k in centers:
            if sum((int(x) - int(y)) ** 2 for x, y in zip(c, k)) < limit * limit:
                break
        else:
            centers.append(c)
    return centers


def nearest(c, centers):
    return min(range(len(centers)), key=lambda k: sum((int(x) - int(y)) ** 2
                                                       for x, y in zip(c, centers[k])))


class Bodies:
    """Los 14 cuadros de cada color como mapas de etiquetas de color: las
    etiquetas salen del personaje rojo y cada color pone sus tonos."""

    def __init__(self, grids):
        self.grids = grids
        red = {f: read_cells('Red', f, grids[f]) for f in FRAMES}
        centers = cluster([c for cells in red.values() for c in cells.values()])
        self.labels = {
            f: {ij: nearest(c, centers) for ij, c in cells.items()} for f, cells in red.items()
        }
        self.palettes = {}
        for color in COLORS:
            seen = {}
            for f in FRAMES:
                cells = read_cells(color, f, grids[f])
                for ij, lab in self.labels[f].items():
                    if ij in cells:
                        seen.setdefault(lab, []).append(cells[ij])
            self.palettes[color] = {
                lab: tuple(int(v) for v in np.median(np.array(cs), axis=0))
                for lab, cs in seen.items()
            }

    def ink(self, color):
        pal = self.palettes[color]
        return min(pal.values(), key=lum) + (255,)


def lum(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


# --- composición -----------------------------------------------------------

def view_of(name):
    if name.startswith('front'):
        return 'front'
    if name.startswith('back'):
        return 'back'
    return 'side'


def head_anchor(labels, view, flip):
    """(columna del centro, fila de la coronilla) de la cabeza en celdas.
    De lado el centro sale de la nuca, porque la nariz lo correría."""
    top = min(j for _, j in labels)
    cols = [i for i, j in labels if top <= j <= top + 14]
    lo, hi = min(cols), max(cols)
    if view == 'side':
        return (hi - 6 if flip else lo + 6), top
    return (lo + hi) // 2, top


def blit(canvas, ci0, cj0, spr, anchor, flip):
    """Pone un accesorio en el lienzo (celdas), con (dx=0, dy=0) en anchor.
    Si flip, el accesorio se refleja (cuadros que miran a la izquierda)."""
    ai, aj = anchor
    ys, xs = np.nonzero(spr.m)
    for y, x in zip(ys, xs):
        dx, dy = x - AX, y - AY
        i = ai - dx if flip else ai + dx
        j = aj + dy
        ci, cj = i - ci0, j - cj0
        if 0 <= ci < canvas.shape[1] and 0 <= cj < canvas.shape[0]:
            canvas[cj, ci] = spr.g[y, x]


def paint_raincoat(canvas, ci0, cj0, body, anchor, view, flip, ink):
    """Tiñe de amarillo el torso y las mangas del propio cuerpo, tono por
    tono, y le pone cuello, dobladillo y botones."""
    ai, aj = anchor
    dark = [c for c in body.values() if lum(c) > 70]
    base = max(set(dark), key=dark.count) if dark else (240, 50, 230)
    base_l = lum(base)
    for (i, j), c in body.items():
        dy = j - aj
        if not 17 <= dy <= 22 or lum(c) <= 70:
            continue
        if dy > 20 and abs(i - ai) > 4:
            continue  # las manos se quedan como están
        t = lum(c) / base_l
        col = COAT.dark if t < 0.93 else COAT.light if t > 1.07 else COAT.base
        if dy == 22:
            col = COAT.dark
        canvas[j - cj0, i - ci0] = col
    if view == 'front':
        for dy in (19, 21):
            canvas[aj + dy - cj0, ai - ci0] = COAT_D.dark
        for dy in range(17, 23):
            canvas[aj + dy - cj0, ai - ci0] = COAT.dark
    elif view == 'back':
        for dx in range(-3, 4):
            canvas[aj + 20 - cj0, ai + dx - ci0] = COAT.dark
    collar = Spr()
    collar.fill({16: (-5, 5), 17: (-6, 6)}, COAT_D)
    collar.outline(ink)
    blit(canvas, ci0, cj0, collar, anchor, flip)


def compose(bodies, color, frame, acc):
    """El cuadro del personaje con su accesorio, como una celda de la hoja."""
    g = bodies.grids[frame]
    labels = bodies.labels[frame]
    pal = bodies.palettes[color]
    body = {ij: pal[lab] for ij, lab in labels.items() if lab in pal}
    ink = bodies.ink(color)
    view = view_of(frame)
    flip = frame.startswith('left')
    ci0, ci1, cj0, cj1 = cell_range(g)
    canvas = np.zeros((cj1 - cj0, ci1 - ci0, 4), dtype=np.uint8)
    anchor = head_anchor(labels, view, flip)

    if acc in BODY_FN and BODY_FN[acc][1]:
        behind = Spr()
        BODY_FN[acc][1](behind, view)
        behind.outline(ink)
        blit(canvas, ci0, cj0, behind, anchor, flip)
    for (i, j), c in body.items():
        canvas[j - cj0, i - ci0] = c + (255,)
    if acc == 'raincoat':
        paint_raincoat(canvas, ci0, cj0, body, anchor, view, flip, ink)
    elif acc in HEAD_FN or acc in BODY_FN:
        front = Spr()
        (HEAD_FN[acc] if acc in HEAD_FN else BODY_FN[acc][0])(front, view)
        front.outline(ink)
        blit(canvas, ci0, cj0, front, anchor, flip)

    # amplía sin suavizado, con el mismo tamaño de píxel que tenía el cuadro
    xs = np.floor((np.arange(CELL_W) + 0.5 - PADX - g['ox']) / g['sx']).astype(int) - ci0
    ys = np.floor((np.arange(CELL_H) + 0.5 - PADY - g['oy']) / g['sy']).astype(int) - cj0
    ok_x = (xs >= 0) & (xs < canvas.shape[1])
    ok_y = (ys >= 0) & (ys < canvas.shape[0])
    out = canvas[np.clip(ys, 0, canvas.shape[0] - 1)][:, np.clip(xs, 0, canvas.shape[1] - 1)]
    out[~ok_y, :] = 0
    out[:, ~ok_x] = 0
    return Image.fromarray(out, 'RGBA')


def build(bodies, color, acc):
    sheet = Image.new('RGBA', (CELL_W * len(FRAMES), CELL_H), (0, 0, 0, 0))
    for i, f in enumerate(FRAMES):
        sheet.alpha_composite(compose(bodies, color, f, acc), (i * CELL_W, 0))
    return sheet


def preview(bodies, color, accs):
    names = ['front', 'right-walking1', 'back', 'left-walking2']
    scale = 2
    accs = accs or ['none'] + ACCESSORIES
    sheet = Image.new('RGBA', (len(names) * CELL_W * scale, len(accs) * CELL_H * scale),
                      (20, 40, 70, 255))
    for r, acc in enumerate(accs):
        s = build(bodies, color, acc)
        for c, n in enumerate(names):
            i = FRAMES.index(n)
            cell = s.crop((i * CELL_W, 0, (i + 1) * CELL_W, CELL_H))
            cell = cell.resize((CELL_W * scale, CELL_H * scale), Image.NEAREST)
            sheet.alpha_composite(cell, (c * CELL_W * scale, r * CELL_H * scale))
    path = os.path.join(os.environ.get('PREVIEW_DIR', HERE), 'preview.png')
    sheet.convert('RGB').save(path)
    print('preview:', os.path.abspath(path))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--fit' in sys.argv:
        fit_grids()
        return
    bodies = Bodies(load_grids())
    if '--preview' in sys.argv:
        color = args[0] if args and args[0] in COLORS else 'Magenta'
        preview(bodies, color, [a for a in args if a not in COLORS])
        return
    os.makedirs(OUT, exist_ok=True)
    for color in COLORS:
        for acc in ['none'] + ACCESSORIES:
            build(bodies, color, acc).save(os.path.join(OUT, f'{color}-{acc}.png'), optimize=True)
        print('ok', color)


if __name__ == '__main__':
    main()
