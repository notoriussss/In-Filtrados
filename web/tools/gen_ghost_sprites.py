"""Genera los fantasmas: los mismos personajes con una cola en lugar de piernas.

Cuando un jugador muere se convierte en fantasma. Su fantasma es SU personaje
(la Jimena o la gota de su color, con su accesorio), pálido, sin piernas y
con una cola de fantasma que se afina y se curva hacia atrás. La cola está
dibujada a mano, píxel por píxel, en las tablas JIMENA_TAIL y GOTA_TAIL de
más abajo (o contorno, c tono oscuro, a base, h brillo); este script solo
la pega sobre cada personaje con los tonos de ese personaje y amplía igual
que gen_jimena_sprites.py. La cola ondea en 4 cuadros.

Cada hoja trae 8 celdas: los 4 cuadros con la cola a la derecha (el fantasma
mira a la izquierda) y los mismos 4 reflejados (mira a la derecha).

    web/public/assets/characters/jimena/ghost/<Color>-<accesorio|none>.png
        celdas de 136 x 165, la misma que jimena/baked
    web/public/assets/characters/gota/ghost/<color>.png
        celdas de 40 x 56; el accesorio de la gota se dibuja encima con la
        celda 0 de gota/accessories, igual que en un jugador vivo

Uso (desde la raíz del repo):
    python web/tools/gen_ghost_sprites.py             genera las hojas
    python web/tools/gen_ghost_sprites.py --preview   deja preview-ghost.png
"""

import os
import sys

import numpy as np
from PIL import Image

import gen_jimena_sprites as J

HERE = os.path.dirname(__file__)
CHARS = os.path.join(HERE, '..', 'public', 'assets', 'characters')
JIMENA_OUT = os.path.join(CHARS, 'jimena', 'ghost')
GOTA_BODIES = os.path.join(CHARS, 'gota', 'bodies')
GOTA_OUT = os.path.join(CHARS, 'gota', 'ghost')

FRAMES = 4
PALE = (230, 242, 255)  # hacia dónde se aclara un fantasma

# --- la cola de Jimena, en las celdas de arte de su rejilla ------------------
# Columnas 1 a 28 y filas 19 a 29 (JIMENA_ROW0). Hasta la fila 22 el cuerpo
# sigue siendo el de Jimena (cabeza, brazos, torso); la cola empieza en la 23,
# donde estaban las piernas.
JIMENA_ROW0 = 19
JIMENA_TAIL = [
    [  # cuadro 0
        '........................oo..',  # fila 19
        '.......................oo...',  # fila 20
        '......................oco...',  # fila 21
        '.....................oho....',  # fila 22
        '....ocaaaaaaaco....oohco....',  # fila 23
        '....ocaaaaaaaacoooohhao.....',  # fila 24
        '.....ocaaaaaaaahhhhaaco.....',  # fila 25
        '......ocaaaaaaaaaaaaco......',  # fila 26
        '.......occaaccaaaccco.......',  # fila 27
        '........ooccoocccooo........',  # fila 28
        '..........oo..ooo...........',  # fila 29
    ],
    [  # cuadro 1
        '............................',  # fila 19
        '........................oo..',  # fila 20
        '.......................oo...',  # fila 21
        '......................oco...',  # fila 22
        '....ocaaaaaaaco......oho....',  # fila 23
        '....ocaaaaaaaacooo.oohco....',  # fila 24
        '.....ocaaaaaaaahhhohhao.....',  # fila 25
        '......ocaaaaaaaaaahaaco.....',  # fila 26
        '.......occaaaccaaaaaco......',  # fila 27
        '........oocccooccccco.......',  # fila 28
        '..........ooo..ooooo........',  # fila 29
    ],
    [  # cuadro 2
        '........................oo..',  # fila 19
        '.......................oo...',  # fila 20
        '......................oco...',  # fila 21
        '.....................oho....',  # fila 22
        '....ocaaaaaaaco....oohco....',  # fila 23
        '....ocaaaaaaaacoooohhao.....',  # fila 24
        '.....ocaaaaaaaahhhhaaco.....',  # fila 25
        '......ocaaaaaaaaaaaaco......',  # fila 26
        '.......occcaaaccaacco.......',  # fila 27
        '........ooocccooccoo........',  # fila 28
        '...........ooo..oo..........',  # fila 29
    ],
    [  # cuadro 3
        '.......................oo...',  # fila 19
        '......................oco...',  # fila 20
        '.....................oho....',  # fila 21
        '...................oohco....',  # fila 22
        '....ocaaaaaaaco...ohhao.....',  # fila 23
        '....ocaaaaaaaacooohaaco.....',  # fila 24
        '.....ocaaaaaaaahhhaaco......',  # fila 25
        '......ocaaaaaaaaaacco.......',  # fila 26
        '.......occccaaacccoo........',  # fila 27
        '........oooocccooo..........',  # fila 28
        '............ooo..o..........',  # fila 29
    ],
]

# --- la cola de la gota, en píxeles de su celda de 40 x 56 -------------------
# Filas 39 a 54 (GOTA_ROW0). Hasta la fila 46 el cuerpo sigue siendo el de la
# gota (cabeza, brazos, camiseta); la cola empieza en la 47, donde estaban las
# botas.
GOTA_ROW0 = 39
GOTA_WAIST = 46
GOTA_TAIL = [
    [  # cuadro 0
        '........................................',  # fila 39
        '......................................o.',  # fila 40
        '.....................................oo.',  # fila 41
        '....................................oo..',  # fila 42
        '...................................oco..',  # fila 43
        '..................................oho...',  # fila 44
        '.................................ohao...',  # fila 45
        '................................ohaco...',  # fila 46
        '.............ocaaaaaaaaaaco....ohaao....',  # fila 47
        '.............ocaaaaaaaaaaacoooohaaco....',  # fila 48
        '..............ocaaaaaaaaaaahhhhaaao.....',  # fila 49
        '...............ocaaaaaaaaaaaaaaaaco.....',  # fila 50
        '................ocaaaaaaaaaaaaaaao......',  # fila 51
        '.................ocaaaccaaaaaaaaco......',  # fila 52
        '..................occcooccccccaco.......',  # fila 53
        '...................ooo..ooooooco........',  # fila 54
    ],
    [  # cuadro 1
        '........................................',  # fila 39
        '........................................',  # fila 40
        '......................................o.',  # fila 41
        '.....................................oo.',  # fila 42
        '....................................oo..',  # fila 43
        '...................................oco..',  # fila 44
        '..................................oho...',  # fila 45
        '................................oohao...',  # fila 46
        '.............ocaaaaaaaaaaco....ohhaco...',  # fila 47
        '.............ocaaaaaaaaaaacoooohaaao....',  # fila 48
        '..............ocaaaaaaaaaaahhhhaaaco....',  # fila 49
        '...............ocaaaaaaaaaaaaaaaaao.....',  # fila 50
        '................ocaaaaaaaaaaaaaaaco.....',  # fila 51
        '.................occaaaaccaaaaaaco......',  # fila 52
        '..................ooccccooccaaccoo......',  # fila 53
        '....................oooo..ooccoo........',  # fila 54
    ],
    [  # cuadro 2
        '........................................',  # fila 39
        '......................................o.',  # fila 40
        '.....................................oo.',  # fila 41
        '....................................oo..',  # fila 42
        '...................................oco..',  # fila 43
        '..................................oho...',  # fila 44
        '.................................ohao...',  # fila 45
        '................................ohaco...',  # fila 46
        '.............ocaaaaaaaaaaco....ohaao....',  # fila 47
        '.............ocaaaaaaaaaaacoooohaaco....',  # fila 48
        '..............ocaaaaaaaaaaahhhhaaao.....',  # fila 49
        '...............ocaaaaaaaaaaaaaaaaco.....',  # fila 50
        '................ocaaaaaaaaaaaaaaao......',  # fila 51
        '.................ocaccaaaaccaaaaco......',  # fila 52
        '..................ocooccccoocaaco.......',  # fila 53
        '...................o..oooo..occo........',  # fila 54
    ],
    [  # cuadro 3
        '......................................o.',  # fila 39
        '.....................................oo.',  # fila 40
        '....................................oo..',  # fila 41
        '...................................oco..',  # fila 42
        '..................................oho...',  # fila 43
        '.................................ohao...',  # fila 44
        '.................................oaco...',  # fila 45
        '................................ohao....',  # fila 46
        '.............ocaaaaaaaaaaco....ohaco....',  # fila 47
        '.............ocaaaaaaaaaaacoooohaao.....',  # fila 48
        '..............ocaaaaaaaaaaahhhhaaco.....',  # fila 49
        '...............ocaaaaaaaaaaaaaaaao......',  # fila 50
        '................ocaaaaaaaaaaaaaaco......',  # fila 51
        '.................ocaaaccaaaaaaaao.......',  # fila 52
        '..................occcooccccccaco.......',  # fila 53
        '...................ooo..ooooooco........',  # fila 54
    ],
]

def mix(c, k):
    return tuple(int(c[n] * (1 - k) + PALE[n] * k) for n in range(3))


# --- Jimena -------------------------------------------------------------------

def compose_ghost(bodies, color, acc, frame):
    """Una celda de la hoja baked, pero con la cola en lugar de las piernas."""
    g = bodies.grids['front']
    labels = bodies.labels['front']
    pal = bodies.palettes[color]
    body = {ij: pal[lab] for ij, lab in labels.items() if lab in pal}
    ink = bodies.ink(color)
    ci0, ci1, cj0, cj1 = J.cell_range(g)
    canvas = np.zeros((cj1 - cj0, ci1 - ci0, 4), dtype=np.uint8)
    anchor = J.head_anchor(labels, 'front', False)

    if acc in J.BODY_FN and J.BODY_FN[acc][1]:
        behind = J.Spr()
        J.BODY_FN[acc][1](behind, 'front')
        behind.outline(ink)
        J.blit(canvas, ci0, cj0, behind, anchor, False)

    # cuerpo hasta la cintura, un poco pálido; el contorno se queda
    waist = JIMENA_ROW0 + 3
    for (i, j), c in body.items():
        if j <= waist:
            rgb = c if c == ink[:3] else mix(c, .25)
            canvas[j - cj0, i - ci0] = rgb + (255,)

    base, shade = pal[0], pal[2]
    tones = {
        'o': ink[:3],
        'c': mix(shade, .25),
        'a': mix(base, .25),
        'h': mix(base, .5),
    }
    for r, row in enumerate(JIMENA_TAIL[frame]):
        j = JIMENA_ROW0 + r
        for k, ch in enumerate(row):
            if ch == '.':
                continue
            ci, cj = (k + 1) - ci0, j - cj0
            if 0 <= ci < canvas.shape[1] and 0 <= cj < canvas.shape[0]:
                canvas[cj, ci] = tones[ch] + (255,)

    if acc == 'raincoat':
        J.paint_raincoat(canvas, ci0, cj0, {ij: c for ij, c in body.items() if ij[1] <= waist},
                         anchor, 'front', False, ink)
    elif acc in J.HEAD_FN or acc in J.BODY_FN:
        front = J.Spr()
        (J.HEAD_FN[acc] if acc in J.HEAD_FN else J.BODY_FN[acc][0])(front, 'front')
        front.outline(ink)
        J.blit(canvas, ci0, cj0, front, anchor, False)

    # amplía sin suavizado, igual que gen_jimena_sprites.compose
    xs = np.floor((np.arange(J.CELL_W) + 0.5 - J.PADX - g['ox']) / g['sx']).astype(int) - ci0
    ys = np.floor((np.arange(J.CELL_H) + 0.5 - J.PADY - g['oy']) / g['sy']).astype(int) - cj0
    ok_x = (xs >= 0) & (xs < canvas.shape[1])
    ok_y = (ys >= 0) & (ys < canvas.shape[0])
    out = canvas[np.clip(ys, 0, canvas.shape[0] - 1)][:, np.clip(xs, 0, canvas.shape[1] - 1)]
    out[~ok_y, :] = 0
    out[:, ~ok_x] = 0
    return Image.fromarray(out, 'RGBA')


def sheet_of(cells):
    """4 cuadros y los mismos 4 reflejados, en una hoja de una fila."""
    w, h = cells[0].size
    sheet = Image.new('RGBA', (w * 2 * len(cells), h), (0, 0, 0, 0))
    for i, cell in enumerate(cells):
        sheet.alpha_composite(cell, (i * w, 0))
        sheet.alpha_composite(cell.transpose(Image.FLIP_LEFT_RIGHT), ((len(cells) + i) * w, 0))
    return sheet


def build_jimena(bodies, color, acc):
    return sheet_of([compose_ghost(bodies, color, acc, f) for f in range(FRAMES)])


# --- gota ---------------------------------------------------------------------

def gota_cell(path, red, frame):
    im = np.array(Image.open(path).convert('RGBA'))
    cell = im[0:56, 0:40].copy()

    def tone(label_rgb):
        ys, xs = np.nonzero((red[:, :, :3] == np.array(label_rgb)).all(axis=2) & (red[:, :, 3] > 0))
        return tuple(int(v) for v in np.median(cell[ys, xs, :3], axis=0))

    ink = tone((31, 52, 66))
    base, shade, light = tone((130, 38, 60)), tone((79, 21, 42)), tone((168, 59, 75))
    cell[GOTA_WAIST + 1:, :] = 0
    for y in range(GOTA_WAIST + 1):
        for x in range(40):
            if cell[y, x, 3] and tuple(int(v) for v in cell[y, x, :3]) != ink:
                cell[y, x, :3] = mix(tuple(int(v) for v in cell[y, x, :3]), .15)
    tones = {'o': ink, 'c': mix(shade, .3), 'a': mix(base, .3), 'h': mix(light, .3)}
    for r, row in enumerate(GOTA_TAIL[frame]):
        for x, ch in enumerate(row):
            if ch != '.':
                cell[GOTA_ROW0 + r, x] = tones[ch] + (255,)
    return Image.fromarray(cell, 'RGBA')


def build_gota(name):
    red = np.array(Image.open(os.path.join(GOTA_BODIES, 'e6194b.png')).convert('RGBA'))[0:56, 0:40]
    path = os.path.join(GOTA_BODIES, name)
    return sheet_of([gota_cell(path, red, f) for f in range(FRAMES)])


# --- salida ---------------------------------------------------------------------

def preview():
    bodies = J.Bodies(J.load_grids())
    rows = [build_jimena(bodies, c, a) for c, a in
            [('Red', 'none'), ('Blue', 'cap'), ('Green', 'straw-hat'), ('Yellow', 'raincoat'),
             ('Purple', 'backpack'), ('Cyan', 'scarf')]]
    gotas = [build_gota(n) for n in ('e6194b.png', '4363d8.png', '3cb44b.png')]
    width = max(r.width for r in rows + gotas)
    height = sum(r.height for r in rows + gotas)
    sheet = Image.new('RGBA', (width, height), (19, 41, 74, 255))
    y = 0
    for r in rows + gotas:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    path = os.path.join(os.environ.get('PREVIEW_DIR', HERE), 'preview-ghost.png')
    sheet.convert('RGB').save(path)
    print('preview:', os.path.abspath(path))


def main():
    if '--preview' in sys.argv:
        preview()
        return
    bodies = J.Bodies(J.load_grids())
    os.makedirs(JIMENA_OUT, exist_ok=True)
    for color in J.COLORS:
        for acc in ['none'] + J.ACCESSORIES:
            build_jimena(bodies, color, acc).save(
                os.path.join(JIMENA_OUT, f'{color}-{acc}.png'), optimize=True)
        print('ok', color)
    os.makedirs(GOTA_OUT, exist_ok=True)
    for name in sorted(os.listdir(GOTA_BODIES)):
        if name.endswith('.png'):
            build_gota(name).save(os.path.join(GOTA_OUT, name), optimize=True)
    print('ok gota')


if __name__ == '__main__':
    main()
