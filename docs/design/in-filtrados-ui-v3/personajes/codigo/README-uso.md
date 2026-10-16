# Generador de personajes v2 · In-Filtrados

`in-filtrados-personajes.js` es un archivo único, sin dependencias, que define el objeto global `PK`
(motor de color + personajes). Funciona en cualquier navegador; no necesita Vite ni npm.

```html
<script src="in-filtrados-personajes.js"></script>
<script>
  const receta = {
    color: '#e6194b',        // piel gelatina: cualquier hex (p. ej. el color que asigna el servidor)
    outfit: null,            // color de la ropa (overol); null = versión oscura del color del jugador
    accessory: 'gorra',      // brote, audifonos, gorra, lentes, paja, bufanda, flor, visor, casco, pescador, impermeable, mochila, null
    accessoryColor: null,    // null = color predeterminado del accesorio; o cualquier hex
    face: 'happy',           // neutral, happy, worried, sleepy, surprised, angry, smug
    view: 'front',           // front | side (mira a la derecha; voltear para ir a la izquierda) | back
    pose: 'walk', frame: 2,  // idle 0..1 · walk 0..3
    ghost: false             // versión fantasma
  };
  const cv = PK.character(receta);                 // <canvas> de 40×56 px nativos (ampliar con image-rendering: pixelated)
  const { body, accessory } = PK.characterLayers(receta); // capas separadas
  const hoja = PK.characterSheet(receta);          // 18 columnas (3 vistas × 6 poses) × 2 filas (vivo / fantasma)
  const retrato = PK.characterPortrait(receta, 4); // busto ampliado ×4
</script>
```

## Dibujarlo en el juego (mapa 4096×3072, 1 unidad = 1 px)

Las hojas de `../hojas/` están a escala nativa: celda 40×56 px, ancla (20, 46) = posición `(p.x, p.y)` del
jugador (círculo de colisión de radio 16). Los pies quedan ~6 px más abajo, así que ordena por profundidad con
`baseY = p.y + 6` junto con los props de `mapa/props/props.json`.

```ts
ctx.drawImage(hoja, col * 40, fila * 56, 40, 56, p.x - 20, p.y - 46, 40, 56);
```

- Columnas: `front_idle0, front_idle1, front_walk0..3, side_…, back_…` (ver `hojas/indice.json`).
- Fila 0 = vivo, fila 1 = fantasma (dibujar con alpha ≈ 0.62).
- Ir a la izquierda: vista `side` volteada en horizontal. Animación: idle 2 fps, caminar 8 fps.
- Sombra: `hojas/sombra.png` (24×8) en `(p.x - 12, p.y + 1)`, debajo del sprite.
- Con los colores del servidor: `PK.characterSheet({ color: p.color, accessory: … })` una vez por jugador (cachear),
  o usa las hojas ya hechas `hojas/cuerpo-servidor/<hex>.png` + la capa `hojas/accesorios/<id>.png` encima.

## Editar personajes

Abre `../editor/editor-personajes.html` (doble clic). Cambias nombre, color, ropa, accesorio (y su color), cara,
vista, pose y fantasma; exportas PNG, hoja completa, solo cuerpo, solo accesorio o retrato, y copias la receta en
JSON. El equipo de 8 se guarda en tu navegador y se importa/exporta como JSON (mismo formato que
`../recetas/jugadores-ejemplo.json`).

## Agregar un accesorio nuevo

En `in-filtrados-personajes.js`: (1) añade `{ id, name, color }` a `ACCESSORIES`; (2) en `accLayer(o, R)` agrega una
rama `else if (id === 'tu-id') { … }` (dibuja en la capa `A` con `A.ell(cx, cy, rx, ry, color)` para formas
sombreadas, `A.rect` / `A.put` para píxeles; `R.head`, `R.body`, `R.side`, `R.back` dan la geometría de cada
vista y pose). El contorno oscuro se agrega solo.
