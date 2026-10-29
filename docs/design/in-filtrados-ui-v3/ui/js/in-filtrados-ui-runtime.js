/* pk-core.js — motor de pixel art procedural (color, sombreado volumétrico, personajes).
   Todo se dibuja en canvas de baja resolución y se amplía con image-rendering: pixelated. */
(function (global) {
  'use strict';
  const PK = global.PK || (global.PK = {});

  /* ---------- color ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) { const v = l * 255; return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  const hexHsl = (hex) => rgbToHsl(...hexToRgb(hex));
  const hslHex = (h, s, l) => rgbToHex(...hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1)));
  const hueToward = (h, target, amt) => h + ((((target - h + 540) % 360) - 180) * amt);

  /* Rampa con cambio de tono: sombras hacia azul/violeta, luces hacia amarillo. Índice 0 = más oscuro. */
  function ramp(base, n) {
    n = n || 5;
    const [h, s, l] = hexHsl(base);
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) / ((n - 1) / 2);
      const L = clamp(l + t * 0.23 - (t < 0 ? 0.02 : 0), 0.05, 0.97);
      const H = t < 0 ? hueToward(h, 252, -t * 0.17) : hueToward(h, 62, t * 0.14);
      const S = clamp(s * (t < 0 ? 1 + -t * 0.14 : 1 - t * 0.24), 0, 1);
      out.push(hslHex(H, S, L));
    }
    return out;
  }
  const shift = (hex, dh, ds, dl) => { const [h, s, l] = hexHsl(hex); return hslHex(h + dh, s + ds, l + dl); };
  const mix = (a, b, t) => {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  Object.assign(PK, { hexToRgb, rgbToHex, hexHsl, hslHex, ramp, shift, mix, clamp });

  /* ---------- aleatorio y ruido ---------- */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
  }
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const bayer = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;
  Object.assign(PK, { rng, hash2, vnoise, bayer });

  /* ---------- canvas ---------- */
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    return c;
  }
  const ctxOf = (c) => { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return x; };
  const px = (ctx, x, y, col, a) => { if (a != null) ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(x | 0, y | 0, 1, 1); if (a != null) ctx.globalAlpha = 1; };
  const rect = (ctx, x, y, w, h, col, a) => { if (a != null) ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); if (a != null) ctx.globalAlpha = 1; };
  Object.assign(PK, { canvas, ctxOf, px, rect });

  /* Elipse rellena en píxeles (sin antialias). */
  function ell(ctx, cx, cy, rx, ry, col, a) {
    if (a != null) ctx.globalAlpha = a;
    ctx.fillStyle = col;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v <= 1) ctx.fillRect(x, y, 1, 1);
      }
    }
    if (a != null) ctx.globalAlpha = 1;
  }
  PK.ell = ell;

  /* Elipse sombreada (3 tonos) para detalles pequeños. ramp = rampa de 5. */
  function ball(ctx, cx, cy, rx, ry, rp, o) {
    o = o || {};
    const L = [-0.45, -0.62, 0.64];
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = u * u + v * v;
        if (d > 1) continue;
        const nz = Math.sqrt(1 - d);
        let l = u * L[0] + v * L[1] + nz * L[2];
        if (o.dither) l += (bayer(x, y) - 0.5) * o.dither;
        const i = l < 0.16 ? 0 : l < 0.42 ? 1 : l < 0.72 ? 2 : l < 0.9 ? 3 : 4;
        ctx.fillStyle = rp[i]; ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  PK.ball = ball;

  /* ---------- sombreado volumétrico ----------
     parts: { type:'ell'|'drop', cx, cy, rx, ry, z, ramp:[5], seam?, outline? }  */
  function normalAt(p, x, y) {
    if (p.type === 'drop') {
      const u0 = (x - p.cx) / p.rx, v0 = (y - p.cy) / p.ry;
      if (v0 >= 0) {
        const d = u0 * u0 + v0 * v0; if (d > 1) return null;
        return [u0, v0, Math.sqrt(1 - d)];
      }
      const tip = p.tip || 1.3, t = -v0 / tip;
      if (t > 1) return null;
      const wid = Math.pow(1 - t, 0.6);
      if (Math.abs(u0) > wid) return null;
      const nx = u0 * 0.95, ny = -t * 0.85, nz = Math.sqrt(Math.max(0.06, 1 - nx * nx - ny * ny));
      return [nx, ny, nz];
    }
    const u = (x - p.cx) / p.rx, v = (y - p.cy) / p.ry, d = u * u + v * v;
    if (d > 1) return null;
    return [u, v, Math.sqrt(1 - d)];
  }

  function shade(w, h, parts, o) {
    o = Object.assign({ light: [-0.45, -0.62, 0.64], dither: 0, rim: false, bands: [0.16, 0.42, 0.72, 0.9] }, o || {});
    const Ln = Math.hypot(...o.light), L = o.light.map((v) => v / Ln);
    const c = canvas(w, h), ctx = ctxOf(c), img = ctx.createImageData(w, h), d = img.data;
    const owner = new Int16Array(w * h).fill(-1);
    const put = (x, y, hex) => {
      const k = (y * w + x) * 4, rgb = hexToRgb(hex);
      d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; d[k + 3] = 255;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let best = -1, bn = null;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (best >= 0 && (p.z || 0) < (parts[best].z || 0)) continue;
          const n = normalAt(p, x + 0.5, y + 0.5);
          if (n) { best = i; bn = n; }
        }
        if (best < 0) continue;
        const p = parts[best];
        let l = bn[0] * L[0] + bn[1] * L[1] + bn[2] * L[2];
        if (o.dither) l += (bayer(x, y) - 0.5) * o.dither;
        const B = o.bands;
        let i = l < B[0] ? 0 : l < B[1] ? 1 : l < B[2] ? 2 : l < B[3] ? 3 : 4;
        if (o.rim && bn[2] < 0.5 && bn[0] * L[0] + bn[1] * L[1] < -0.1) i = Math.max(i, 3);
        owner[y * w + x] = best;
        put(x, y, p.ramp[i]);
      }
    }
    // separaciones entre piezas
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = owner[y * w + x]; if (a < 0 || !parts[a].seam) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) {
          const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const b = owner[Y * w + X];
          if (b >= 0 && b !== a && (parts[b].z || 0) < (parts[a].z || 0)) { put(x, y, parts[a].ramp[0]); break; }
        }
      }
    }
    // contorno de color
    const outl = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (owner[y * w + x] >= 0) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const b = owner[Y * w + X];
          if (b >= 0) { outl.push([x, y, parts[b].outline || shift(parts[b].ramp[0], 0, 0.05, -0.2)]); break; }
        }
      }
    }
    outl.forEach(([x, y, col]) => put(x, y, col));
    ctx.putImageData(img, 0, 0);
    return c;
  }
  PK.shade = shade;

  /* ---------- personajes ---------- */
  const PLAYER_COLORS = [
    { id: 'menta', name: 'Menta', hex: '#9be8c1' },
    { id: 'turquesa', name: 'Turquesa', hex: '#6fdde0' },
    { id: 'azul', name: 'Azul', hex: '#7fb0f2' },
    { id: 'pino', name: 'Pino', hex: '#4fae82' },
    { id: 'lima', name: 'Lima', hex: '#cfeb6a' },
    { id: 'ambar', name: 'Ámbar', hex: '#f4c869' },
    { id: 'coral', name: 'Coral', hex: '#f59c92' },
    { id: 'lila', name: 'Lila', hex: '#c3a5f0' },
  ];
  const ACCESSORIES = [
    { id: 'brote', name: 'Brote' },
    { id: 'audifonos', name: 'Audífonos' },
    { id: 'gorra', name: 'Gorra' },
    { id: 'lentes', name: 'Lentes' },
    { id: 'paja', name: 'Sombrero de paja' },
    { id: 'bufanda', name: 'Bufanda' },
    { id: 'flor', name: 'Flor' },
    { id: 'visor', name: 'Visor de buceo' },
  ];
  PK.PLAYER_COLORS = PLAYER_COLORS; PK.ACCESSORIES = ACCESSORIES;

  const GEO = {
    lg: { w: 36, h: 50, head: [18, 22, 10.2, 9.6, 4.6], body: [18, 36.5, 7.2, 8], armL: [9.6, 35.6, 2.7, 5.2], armR: [26.4, 35.6, 2.7, 5.2], legL: [14, 44.8, 3.9, 3], legR: [22, 44.8, 3.9, 3], eyeY: 22.5, eyeDx: 4, eyeW: 2, eyeH: 3, u: 1 },
    sm: { w: 18, h: 28, head: [9, 13.2, 6.2, 5.8, 2.6], body: [9, 20.6, 4.2, 4.8], armL: [4.3, 20.2, 1.6, 3.1], armR: [13.7, 20.2, 1.6, 3.1], legL: [7, 25, 2.1, 1.7], legR: [11, 25, 2.1, 1.7], eyeY: 13.5, eyeDx: 2.4, eyeW: 1, eyeH: 2, u: 0.6 },
  };

  function character(o) {
    o = Object.assign({ color: '#9be8c1', acc: null, face: 'neutral', view: 'front', size: 'lg', ghost: false, accColor: null }, o || {});
    const G = GEO[o.size];
    const base = o.color;
    const rp = ramp(base, 5);
    const outline = hslHex(hexHsl(base)[0] - 6, 0.5, 0.2);
    const part = (type, a, z, extra) => Object.assign({ type, cx: a[0], cy: a[1], rx: a[2], ry: a[3], z, ramp: rp, outline }, extra);
    const parts = [
      part('ell', G.legL, 0, { seam: false }),
      part('ell', G.legR, 0, { seam: false }),
      part('ell', G.body, 1, {}),
      part('drop', G.head, 3, { tip: 1 + G.head[4] / G.head[3], seam: true }),
      part('ell', G.armL, 2, { seam: true }),
      part('ell', G.armR, 2, { seam: true }),
    ];
    if (o.ghost) parts.splice(0, 2); // sin piernas
    if (o.ghost) parts[0] = Object.assign(parts[0], { cy: G.body[1] + G.body[3] * 0.15, ry: G.body[3] * 1.18 });
    const c = shade(G.w, G.h, parts, { rim: true, dither: 0 });
    const ctx = ctxOf(c);
    if (o.ghost) { // borde inferior ondulado
      const by = Math.round(G.body[1] + G.body[3] * 1.0), n = o.size === 'lg' ? 3.4 : 2.4;
      for (let x = 0; x < G.w; x++) {
        const yy = by - 0 + (Math.sin(x / n * Math.PI) > 0.1 ? 1 : 0) - 1;
        ctx.clearRect(x, yy + 1, 1, G.h);
      }
    }
    /* rostro */
    const [hx, hy] = G.head;
    const eyeCol = '#16323a';
    const back = o.view === 'back';
    if (!back) {
      const sideShift = o.view === 'side' ? Math.round(G.eyeDx * 0.8) : 0;
      const ex = [Math.round(hx - G.eyeDx + sideShift), Math.round(hx + G.eyeDx + sideShift)];
      const ey = Math.round(G.eyeY);
      const f = o.face;
      ex.forEach((x0, i) => {
        if (f === 'sleepy' || f === 'ghost' && false) { rect(ctx, x0 - 1 + (G.size === 'sm' ? 1 : 0), ey + 1, G.eyeW + 1, 1, eyeCol); return; }
        if (f === 'happy') { // ojos en arco
          if (o.size === 'lg') { px(ctx, x0 - 1, ey + 1, eyeCol); px(ctx, x0, ey, eyeCol); px(ctx, x0 + 1, ey, eyeCol); px(ctx, x0 + 2, ey + 1, eyeCol); }
          else rect(ctx, x0, ey, 1, 1, eyeCol);
          return;
        }
        rect(ctx, x0, ey, G.eyeW, G.eyeH, eyeCol);
        if (o.size === 'lg') px(ctx, x0, ey, '#ffffff');
      });
      if (o.size === 'lg') {
        const mx = Math.round(hx + sideShift), my = ey + 4;
        if (f === 'happy') { rect(ctx, mx - 1, my, 3, 1, eyeCol); px(ctx, mx - 2, my - 1, eyeCol); px(ctx, mx + 2, my - 1, eyeCol); }
        else if (f === 'worried') { rect(ctx, mx - 1, my + 1, 3, 1, eyeCol); px(ctx, mx - 2, my + 2, eyeCol); px(ctx, mx + 2, my + 2, eyeCol); }
        else if (f === 'ghost') { ell(ctx, mx + 0.5, my + 0.8, 1.3, 1.5, eyeCol); }
        else { rect(ctx, mx - 1, my, 2, 1, eyeCol); }
        // rubor
        const blush = shift(base, -14, 0.12, -0.04);
        rect(ctx, ex[0] - 2, ey + 3, 2, 1, blush); rect(ctx, ex[1] + 2, ey + 3, 2, 1, blush);
      } else {
        px(ctx, Math.round(hx + (o.view === 'side' ? 2 : 0)), Math.round(G.eyeY) + 3, eyeCol);
      }
    }
    if (o.acc) drawAccessory(ctx, o.acc, G, o);
    return c;
  }

  /* accesorios (dibujados después del sombreado) */
  function drawAccessory(ctx, id, G, o) {
    const [hx, hy, hrx, hry, tip] = G.head;
    const lg = o.size === 'lg';
    const u = G.u;
    const top = hy - hry - tip * 0.55; // cerca de la punta
    const P = (hex) => ramp(hex, 5);
    if (id === 'brote') {
      const g = P('#58c05f'), stem = '#2f7a46';
      const ty = Math.round(hy - hry - tip * 0.78);
      if (lg) {
        rect(ctx, hx - 0.5, ty - 2, 1, 3, stem);
        // hojas
        ball(ctx, hx - 4.6, ty - 3.6, 4.6, 2.6, g); ball(ctx, hx + 4.2, ty - 4.6, 4.2, 2.4, g);
        const dk = '#1e5a36';
        rect(ctx, hx - 8, ty - 3, 1, 1, dk); rect(ctx, hx + 8, ty - 4, 1, 1, dk);
      } else {
        rect(ctx, hx - 0.5, ty - 1, 1, 2, stem);
        ball(ctx, hx - 2.6, ty - 2.2, 2.6, 1.6, g); ball(ctx, hx + 2.4, ty - 2.8, 2.4, 1.5, g);
      }
    } else if (id === 'audifonos') {
      const cup = P('#ef6b73'), band = '#2d3b4d', bandHi = '#52667f';
      const r = lg ? 11.6 : 6.9;
      // banda
      for (let a = Math.PI * 1.05; a <= Math.PI * 1.95; a += 0.04) {
        const x = Math.round(hx + Math.cos(a) * r), y = Math.round(hy - 1.2 * u + Math.sin(a) * (hry + (lg ? 1.6 : 1)));
        px(ctx, x, y, band); if (lg) px(ctx, x, y + 1, '#1d2736');
        if (a < Math.PI * 1.5) px(ctx, x, y, bandHi);
      }
      const cy = hy + 1 * u;
      ball(ctx, hx - hrx - (lg ? 0.6 : 0.2), cy, lg ? 3 : 1.9, lg ? 4.2 : 2.8, cup);
      ball(ctx, hx + hrx + (lg ? 0.6 : 0.2), cy, lg ? 3 : 1.9, lg ? 4.2 : 2.8, cup);
    } else if (id === 'gorra') {
      const cp = P('#4a7fd6'), br = P('#35639f');
      const y0 = Math.round(hy - hry * 0.78), w = hrx * 0.98;
      ball(ctx, hx, y0 + 0.6 * u, w, hry * 0.72, cp);
      for (let x = Math.round(hx - w); x <= Math.round(hx + w); x++) { /* base recta */ }
      // visera
      const vy = Math.round(hy - hry * 0.18);
      if (lg) { ball(ctx, hx + 6.4, vy + 1.2, 6.6, 1.9, br); rect(ctx, hx - 9, vy - 0.5, 18, 1, shift(cp[0], 0, 0, 0)); px(ctx, hx, y0 - 3, '#f4f1d8'); }
      else { ball(ctx, hx + 3.6, vy + 0.8, 3.6, 1.1, br); }
    } else if (id === 'lentes') {
      if (lg) {
        const f = '#2b2f4a';
        [-G.eyeDx, G.eyeDx].forEach((dx) => {
          const cx = hx + dx + 0.5, cy = G.eyeY + 1.4;
          for (let a = 0; a < Math.PI * 2; a += 0.28) px(ctx, Math.round(cx + Math.cos(a) * 3.8), Math.round(cy + Math.sin(a) * 3.3), f);
          px(ctx, Math.round(cx - 2), Math.round(cy - 2), '#ffffff');
        });
        rect(ctx, hx - 1, G.eyeY + 0.5, 2, 1, f);
      } else {
        [-G.eyeDx, G.eyeDx].forEach((dx) => ell(ctx, hx + dx + 0.5, G.eyeY + 1, 2.2, 2.2, '#2b2f4a', 0.0));
        [-G.eyeDx, G.eyeDx].forEach((dx) => { for (let a = 0; a < Math.PI * 2; a += 0.9) px(ctx, Math.round(hx + dx + 0.5 + Math.cos(a) * 2.5), Math.round(G.eyeY + 1 + Math.sin(a) * 2.4), '#2b2f4a'); });
      }
    } else if (id === 'paja') {
      const st = P('#e2b95e'), band = '#c4543f';
      const by = Math.round(hy - hry * 0.55);
      if (lg) {
        ball(ctx, hx, by + 1, 15, 3.4, st);
        ball(ctx, hx, by - 3.2, 7.2, 5.4, st);
        rect(ctx, hx - 7, by - 1, 14, 2, band);
        for (let x = hx - 13; x < hx + 13; x += 3) px(ctx, Math.round(x), by + 2, st[1]);
      } else {
        ball(ctx, hx, by + 0.6, 8.4, 1.9, st); ball(ctx, hx, by - 1.8, 4.2, 3, st); rect(ctx, hx - 4, by - 0.4, 8, 1, band);
      }
    } else if (id === 'bufanda') {
      const sc = P('#e86a5a'), ny = G.body[1] - G.body[3] + (lg ? 0.2 : 0.4);
      ball(ctx, hx, ny, lg ? 9.2 : 5.6, lg ? 2.5 : 1.7, sc);
      if (lg) { ball(ctx, hx + 6.5, ny + 4.5, 2.2, 4.2, sc); rect(ctx, hx + 5.5, ny + 8, 3, 1, sc[0]); }
      else ball(ctx, hx + 4, ny + 2.4, 1.2, 2.2, sc);
    } else if (id === 'flor') {
      const fx = hx + (lg ? 5.8 : 3.5), fy = hy - hry * (lg ? 0.78 : 0.7), pet = P('#f7a1cf');
      if (lg) {
        [[0, -3], [3, -1], [2, 2.6], [-2, 2.6], [-3, -1]].forEach(([dx, dy]) => ball(ctx, fx + dx, fy + dy, 2.1, 2.1, pet));
        ball(ctx, fx, fy, 1.8, 1.8, P('#f6d14d'));
      } else {
        [[0, -1.6], [1.8, 0], [0, 1.6], [-1.8, 0]].forEach(([dx, dy]) => px(ctx, Math.round(fx + dx), Math.round(fy + dy), pet[3]));
        px(ctx, Math.round(fx), Math.round(fy), '#f6d14d');
      }
    } else if (id === 'visor') {
      const strap = '#26405b', lens = P('#7fe0ff'), frame = P('#ee8f3a');
      const ey = G.eyeY + 0.6;
      if (lg) {
        rect(ctx, hx - hrx + 0.5, ey - 1, hrx * 2 - 1, 2, strap);
        ball(ctx, hx, ey, 8.6, 4.6, frame);
        ball(ctx, hx, ey, 7.2, 3.5, lens);
        px(ctx, hx - 4, ey - 2, '#ffffff'); px(ctx, hx - 3, ey - 2, '#ffffff'); px(ctx, hx - 5, ey - 1, '#d6f6ff');
        rect(ctx, hx - 6, ey - 1, 2, 3, '#16323a'); rect(ctx, hx + 4, ey - 1, 2, 3, '#16323a');
      } else {
        rect(ctx, hx - hrx + 0.5, ey - 0.5, hrx * 2 - 1, 1, strap);
        ball(ctx, hx, ey, 5.2, 2.9, frame); ball(ctx, hx, ey, 4.2, 2.2, lens); px(ctx, hx - 2, ey - 1, '#ffffff');
        px(ctx, hx - 2, Math.round(ey), '#16323a'); px(ctx, hx + 2, Math.round(ey), '#16323a');
      }
    }
  }

  /* Halo punteado (dither) alrededor de un punto. */
  function halo(w, h, cx, cy, r, color, o) {
    o = Object.assign({ steps: 4, a: 0.5 }, o || {});
    const c = canvas(w, h), ctx = ctxOf(c), img = ctx.createImageData(w, h), d = img.data, rgb = hexToRgb(color);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dist = Math.hypot((x - cx) / (o.sx || 1), (y - cy) / (o.sy || 1)) / r;
      if (dist >= 1) continue;
      const k = 1 - dist;
      const q = Math.floor(k * o.steps * 1.2) / o.steps;
      const on = k * o.a * 2 > bayer(x, y) * (1 - 0.0) && q >= 0.0;
      if (on) { const i = (y * w + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = Math.round(255 * Math.min(1, 0.25 + k * 0.7)); }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
  Object.assign(PK, { character, halo });
})(typeof window !== 'undefined' ? window : globalThis);
/* pk-icons.js — íconos de 12×12 en pixel art. Letras: o contorno, a base, b luz, c sombra, w blanco, d detalle. */
(function (global) {
  'use strict';
  const PK = global.PK;
  const I = {
    gota: [
      '............', '.....oo.....', '.....oo.....', '....oabo....', '....oabo....', '...oabaao...',
      '..oabaaaao..', '..oabaaaco..', '..oaaaaaco..', '..oaaaacco..', '...occcco...', '....oooo....'],
    grifo: [ // Reducir: grifo que gotea
      '....oooo....', '...oabbbo...', '....oooo....', '.....oo.....', '..ooooooooo.', '.oabbbbaaaco',
      '.oaaaaaaaaco', '.ooooooooaco', '........oaco', '.........oco', '..........d.', '..........d.'],
    cubeta: [ // Reutilizar: cubeta con asa
      '............', '...oooooo...', '..o......o..', '.o........o.', '.oooooooooo.', '.obbwbbbaao.',
      '.obbaaaaaco.', '..obaaaaco..', '..obaaaaco..', '..oaaaaaco..', '...occcco...', '....oooo....'],
    filtro: [ // Reciclar: embudo con gotas
      '............', '.oooooooooo.', '.obbbbbbaao.', '..oabbbaaco.', '...oabaaco..', '....oaaco...',
      '.....oao....', '.....oco....', '.....oco....', '....d.o.d...', '.....d...d..', '............'],
    play: [
      '............', '..oo........', '..obo.......', '..obbo......', '..oabbo.....', '..oaabbo....',
      '..oaaabbo...', '..oaabbo....', '..oabbo.....', '..obbo......', '..obo.......', '..oo........'],
    parcela: [ // brote en tierra
      '............', '...oo..oo...', '..obbo.obbo.', '..oabboabco.', '...oaacaco..', '....oooaco..',
      '......oao...', '......oao...', '..oooooaooo.', '.occccaaccco', '.oooooooooo.', '............'],
    engranaje: [
      '............', '.....oo.....', '..oo.oo.oo..', '.oabooooabo.', '..oabbbbao..', '.ooabooboao.',
      '.oabo..obao.', '.ooabooboao.', '..oabbbbao..', '.oabooooabo.', '..oo.oo.oo..', '.....oo.....'],
    puerta: [
      '............', '..oooooooo..', '..oabbbbao..', '..oabbbbao..', '..oabbbbao..', '..oabbbbao..',
      '..oabbbbao..', '..oabbbdao..', '..oabbbbao..', '..oabbbbao..', '.oooooooooo.', '............'],
    check: [
      '............', '............', '..........oo', '.........obo', '........obbo', '.oo....obbo.',
      '.obo..obbo..', '..obooabo...', '...obbbo....', '....obo.....', '.....o......', '............'],
    equis: [
      '............', '.oo......oo.', '.obo....obo.', '..obo..obo..', '...obooao...', '....obao....',
      '....oaco....', '...obooao...', '..obo..oco..', '.obo....oco.', '.oo......oo.', '............'],
    aviso: [
      '............', '.....oo.....', '....oabo....', '....oabo....', '...oabbao...', '...oabdao...',
      '..oabbdbao..', '..oabbdbao..', '.oabbbbbbao.', '.oabbbdbbao.', '.oooooooooo.', '............'],
    reloj: [
      '............', '...oooooo...', '..oabbbbao..', '.oabbbdbbao.', '.oabbbdbbao.', '.oabbbdddao.',
      '.oabbbbbbao.', '.oabbbbbbao.', '..oabbbbao..', '...oooooo...', '............', '............'],
    chat: [
      '............', '.oooooooooo.', '.obbbbbbbbo.', '.obdbdbdbbo.', '.obbbbbbbbo.', '.obdbdbbbbo.',
      '.obbbbbbbco.', '.oooooocooo.', '....obco....', '....oco.....', '.....o......', '............'],
    ojo: [
      '............', '............', '...oooooo...', '..oabbbbao..', '.oabboowbao.', '.oabbodowbo.',
      '.oabbooobao.', '..oabbbbao..', '...oooooo...', '............', '............', '............'],
    izq: [
      '............', '......oo....', '.....obo....', '....obbo....', '...obbaao...', '..obbaaco...',
      '...obbaao...', '....obaao...', '.....obco...', '......oo....', '............', '............'],
    der: [
      '............', '....oo......', '....obo.....', '....obbo....', '...oaabbo...', '...ocaabbo..',
      '...oaabbo...', '...oaabo....', '...ocbo.....', '....oo......', '............', '............'],
    corona: [
      '............', '............', '.o...o...o..', '.oo.oao.oo..', '.oaooaooaao.', '.oabaaabaao.',
      '.oabbaabbao.', '.oaaaaaaaao.', '.occccccccc.', '.oooooooooo.', '............', '............'],
    mundo: [
      '............', '...oooooo...', '..obbaaaao..', '.obbaaoaaao.', '.obaaoooaao.', '.oaaaaoaaco.',
      '.oaabbaaaco.', '.oaabaaacco.', '..oaaaaaco..', '...oooooo...', '............', '............'],
    bomba: [ // gotas de aceite / contaminado
      '............', '....oooo....', '...oddddo...', '..odbddddo..', '..odddddoo..', '..odddddddo.',
      '..oddddddo..', '...odddddo..', '....oooooo..', '............', '............', '............'],
  };
  const DEFAULT = { o: '#17323f', a: '#4fc3f0', b: '#bdeeff', c: '#2b83b8', w: '#ffffff', d: '#17323f' };
  function icon(name, colors, scale) {
    const map = I[name]; if (!map) return null;
    const col = Object.assign({}, DEFAULT, colors || {});
    const c = PK.canvas(12, 12), ctx = PK.ctxOf(c);
    map.forEach((row, y) => { for (let x = 0; x < 12; x++) { const k = row[x]; if (k && k !== '.') PK.px(ctx, x, y, col[k] || '#ff00ff'); } });
    if (scale && scale > 1) { const s = PK.canvas(12 * scale, 12 * scale), sx = PK.ctxOf(s); sx.imageSmoothingEnabled = false; sx.drawImage(c, 0, 0, 12 * scale, 12 * scale); return s; }
    return c;
  }
  PK.icons = { map: I, make: icon, url: (name, colors) => icon(name, colors).toDataURL('image/png') };
})(typeof window !== 'undefined' ? window : globalThis);
/* iconos adicionales 12×12 (o contorno, a base, b luz, c sombra, w blanco, d detalle) */
(function (g) {
  const PK = g.PK, I = PK.icons.map;
  const add = (n, rows) => { rows.forEach((r) => { if (r.length !== 12) throw new Error('icono ' + n + ': ' + r); }); if (rows.length !== 12) throw new Error('icono ' + n + ' filas ' + rows.length); I[n] = rows; };
  add('copiar', ['............', '..oooooo....', '..oaaaao....', '..oabbaoooo.', '..oabbaoaao.', '..oabbaoabo.', '..oaaaaoabo.', '..ooooooabo.', '.....oaaabo.', '.....oaaaao.', '.....oooooo.', '............']);
  add('usuario', ['............', '....oooo....', '...oabbao...', '...oabaao...', '...oaaaco...', '....oooo....', '..oooooooo..', '.oabbbaaaco.', '.oabaaaaaco.', '.oaaaaaaaco.', '.oooooooooo.', '............']);
  add('altavoz', ['............', '.....oo.....', '....oao..o..', '..ooabo...o.', '.oaaabo.o.o.', '.oabbbo..oo.', '.oabbbo..oo.', '.oaaabo.o.o.', '..ooabo...o.', '....oao..o..', '.....oo.....', '............']);
  add('pantalla', ['............', '.oooooooooo.', '.oaaaaaaaao.', '.oabbbbbbao.', '.oabddddbao.', '.oabddddbao.', '.oabbbbbbao.', '.oaaaaaaaao.', '.oooooooooo.', '....oaao....', '..oooooooo..', '............']);
  add('teclado', ['............', '............', '.oooooooooo.', '.oabababaao.', '.oaaaaaaaao.', '.oabababaao.', '.oaaaaaaaao.', '.oabbbbbbao.', '.oaaaaaaaao.', '.oooooooooo.', '............', '............']);
  add('mapa', ['............', '.oooooooooo.', '.oabobaobao.', '.oabobaobao.', '.oaaobaoaao.', '.obbobaobbo.', '.oabobaobao.', '.oabobaobao.', '.oaaobaoaao.', '.oooooooooo.', '............', '............']);
  add('libro', ['............', '............', '.oooo..oooo.', '.oabbooabbo.', '.oabaooabao.', '.oabaooabao.', '.oabaooabao.', '.oaaaooaaao.', '.oooo..oooo.', '............', '............', '............']);
  add('trofeo', ['............', '.oooooooooo.', 'ooaabbbbaaoo', 'oa.oabbbao.o', 'oa.oabbaao.o', '.oooaaaaooo.', '....oaaco...', '.....oco....', '....oaaco...', '...oooooooo.', '...oaaaaaco.', '...oooooooo.']);
})(window);
/* ig-chars.js — personajes de In-Filtrados v2 (gotas «gummy» con volumen estilo Gather: contorno oscuro, sombreado por bandas, botas, ropa).
   Se carga DESPUÉS de pk-core.js. Define PK.character / PK.characterLayers / PK.characterSheet.

   Receta (todo opcional):
     { color:'#9be8c1',            // piel gelatina: cualquier hex (la rampa de 5 tonos se calcula sola)
       outfit:null,                // color de la ropa (null = versión oscura del color del jugador)
       accessory:'gorra', accessoryColor:null,
       face:'neutral',             // neutral|happy|worried|sleepy|surprised|angry|smug
       view:'front'|'side'|'back', // 'side' mira a la derecha (para la izquierda, voltear en horizontal)
       ghost:false, pose:'idle'|'walk', frame:0..3 }
   Celda nativa 40×56 px. Ancla (20,46) = punto (x,y) del jugador; pies en y≈52 (profundidad = y del jugador + 6). */
(function (g) {
  'use strict';
  const PK = g.PK;
  const { ramp, shift, mix, hexHsl, hslHex, hexToRgb, canvas, ctxOf } = PK;
  const W = 40, H = 56, OUT = '#1f3442';
  const LX = -0.52, LY = -0.68, LZ = 0.52;

  const PLAYER_COLORS = [
    { id: 'menta', name: 'Menta', hex: '#9be8c1' }, { id: 'turquesa', name: 'Turquesa', hex: '#6fdde0' },
    { id: 'azul', name: 'Azul', hex: '#7fb0f2' }, { id: 'pino', name: 'Pino', hex: '#4fae82' },
    { id: 'lima', name: 'Lima', hex: '#cfeb6a' }, { id: 'ambar', name: 'Ámbar', hex: '#f4c869' },
    { id: 'coral', name: 'Coral', hex: '#f59c92' }, { id: 'lila', name: 'Lila', hex: '#c3a5f0' },
  ];
  /* Colores que asigna el servidor (services/match) a cada jugador; los sprites se pueden teñir con cualquiera. */
  const SERVER_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6'];
  const ACCESSORIES = [
    { id: null, name: 'Ninguno' },
    { id: 'brote', name: 'Brote', color: '#58c05f' }, { id: 'audifonos', name: 'Audífonos', color: '#ef6b73' },
    { id: 'gorra', name: 'Gorra', color: '#4a7fd6' }, { id: 'lentes', name: 'Lentes', color: '#2b2f4a' },
    { id: 'paja', name: 'Sombrero de paja', color: '#e2b95e' }, { id: 'bufanda', name: 'Bufanda', color: '#e86a5a' },
    { id: 'flor', name: 'Flor', color: '#f7a1cf' }, { id: 'visor', name: 'Visor de buceo', color: '#ee8f3a' },
    { id: 'casco', name: 'Casco de obra', color: '#f4c430' }, { id: 'pescador', name: 'Gorro de pescador', color: '#c9b27c' },
    { id: 'impermeable', name: 'Impermeable', color: '#f2c230' }, { id: 'mochila', name: 'Tanque de riego', color: '#4fae82' },
  ];
  const FACES = [
    { id: 'neutral', name: 'Neutral' }, { id: 'happy', name: 'Feliz' }, { id: 'worried', name: 'Preocupado' },
    { id: 'sleepy', name: 'Soñoliento' }, { id: 'surprised', name: 'Sorprendido' }, { id: 'angry', name: 'Molesto' }, { id: 'smug', name: 'Pícaro' },
  ];
  const VIEWS = ['front', 'side', 'back'];
  const POSES = ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3'];
  const GEO = { sm: { w: W, h: H, ax: 20, ay: 46 }, lg: { w: W, h: H, ax: 20, ay: 46 } };

  const rgbOf = (hex) => hexToRgb(hex);
  const dark = (hex, t) => mix(hex, OUT, t);

  /* ---------- lienzo con ids de pieza ---------- */
  class Layer {
    constructor() { this.w = W; this.h = H; this.d = new Uint8ClampedArray(W * H * 4); this.id = new Int16Array(W * H).fill(-1); this.lineCol = {}; this.n = 0; }
    next() { return this.n++; }
    put(x, y, hex, id) {
      x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
      const k = (y * W + x), c = rgbOf(hex); this.d[k * 4] = c[0]; this.d[k * 4 + 1] = c[1]; this.d[k * 4 + 2] = c[2]; this.d[k * 4 + 3] = 255;
      if (id != null) this.id[k] = id;
    }
    has(x, y) { return x >= 0 && y >= 0 && x < W && y < H && this.d[(y * W + x) * 4 + 3] > 0; }
    rect(x, y, w, h, hex, id) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, hex, id); }
    /* elipse sombreada por bandas; opts: {tip, lean, spec:[[dx,dy]...], clip:fn(x,y)->bool, id, flat:hex} */
    ell(cx, cy, rx, ry, base, o) {
      o = o || {}; const rp = ramp(base, 5), id = o.id != null ? o.id : this.next();
      this.lineCol[id] = dark(rp[0], 0.35);
      const tip = o.tip || 0, lean = o.lean || 0;
      const vcy = cy - tip * 0.4, vry = ry + tip * 0.6; // elipse virtual para las normales de una gota
      const x0 = Math.floor(cx - rx - 2), x1 = Math.ceil(cx + rx + 2 + Math.abs(lean)), y0 = Math.floor(cy - ry - tip - 1), y1 = Math.ceil(cy + ry + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5; let inside = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
        if (!inside && tip && py < cy - ry * 0.35) {
          const ty = cy - ry - tip, t = (py - ty) / ((cy - ry * 0.35) - ty);
          if (t >= 0 && t <= 1) { const xc = cx + lean * Math.pow(1 - t, 1.4), hw = rx * 0.94 * Math.pow(t, 1.55); inside = Math.abs(px - xc) <= hw; }
        }
        if (!inside) continue;
        if (o.clip && !o.clip(px, py)) continue;
        const nx = Math.max(-1, Math.min(1, (px - cx) / rx)), ny = Math.max(-1, Math.min(1, (py - vcy) / vry)), r2 = nx * nx + ny * ny, nz = Math.sqrt(Math.max(0.04, 1 - r2));
        const d = nx * LX + ny * LY + nz * LZ;
        let idx = d > 0.6 ? 3 : d > 0.1 ? 2 : d > -0.4 ? 1 : 0;
        if (r2 > 0.62 && ny > 0.25 && nx > -0.45 && idx < 2) idx = Math.max(idx, idx + 1); // luz rebotada en el borde inferior
        this.put(x, y, o.flat || rp[idx], id);
      }
      (o.spec || []).forEach(([sx, sy]) => { const X = Math.floor(sx), Y = Math.floor(sy); if (this.id[Y * W + X] === id) this.put(X, Y, rp[4], id); });
      return id;
    }
    /* línea oscura entre piezas superpuestas + contorno exterior */
    finish(outCol) {
      const id = this.id, d = this.d, mark = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const a = id[y * W + x]; if (a < 0) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const b = id[Y * W + X]; if (b >= 0 && b > a) { mark.push([x, y, a]); break; }
        }
      }
      mark.forEach(([x, y, a]) => this.put(x, y, this.lineCol[a] || OUT, a));
      const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > 0) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (this.has(x + dx, y + dy)) { out.push([x, y]); break; } }
      }
      out.forEach(([x, y]) => this.put(x, y, outCol || OUT, -2));
      return this;
    }
    canvas() { const c = canvas(W, H), t = ctxOf(c), im = t.createImageData(W, H); im.data.set(this.d); t.putImageData(im, 0, 0); return c; }
  }

  /* ---------- esqueleto: posiciones según vista y pose ---------- */
  function rig(o) {
    const v = o.view, f = o.frame & 3, walk = o.pose === 'walk';
    const s = walk ? [-1, 0, 1, 0][f] : 0, bob = walk ? [0, 1, 0, 1][f] : 0, br = !walk && f >= 2 ? 1 : 0;
    const dy = -bob + br * 0.0, hd = -bob + br;
    const side = v === 'side';
    const R = {
      v, s, f, walk, side, back: v === 'back',
      head: { cx: 20 + (side ? 1 : 0), cy: 27 + hd, rx: side ? 11.6 : 12.4, ry: 10.8, tip: 7, lean: side ? -3 : 0 },
      body: { cx: 20, cy: 42 + dy * 0.6 + br * 0.5, rx: side ? 5.8 : 7.6, ry: 6 },
    };
    if (!side) {
      const lift = (a) => Math.max(0, a) * 2;
      R.bootL = { cx: 15.2, cy: 49.6 - lift(-s), rx: 3.7, ry: 2.6 }; R.bootR = { cx: 24.8, cy: 49.6 - lift(s), rx: 3.7, ry: 2.6 };
      const sw = walk ? 1.4 : 0, ay = 41.2 + dy * 0.8 + br * 0.5;
      R.armL = { cx: 10.6, cy: ay + s * sw, rx: 2.5, ry: 4.3 }; R.armR = { cx: 29.4, cy: ay - s * sw, rx: 2.5, ry: 4.3 };
    } else {
      const lf = walk && (f === 1 || f === 3);
      R.bootL = { cx: 20 + s * 3.6 - 0.5, cy: 49.6 - (lf && f === 1 ? 1.6 : 0), rx: 3.9, ry: 2.6 };
      R.bootR = { cx: 20 - s * 3.6 + 1.5, cy: 49.6 - (lf && f === 3 ? 1.6 : 0), rx: 3.9, ry: 2.6 };
      R.armN = { cx: 20.5 - s * 2.6, cy: 41.4 + dy * 0.8 + br * 0.5, rx: 2.4, ry: 4.3 };
    }
    return R;
  }

  function outfitOf(o) { if (o.outfit) return o.outfit; const [h, s, l] = hexHsl(o.color); return hslHex(h, Math.min(0.55, s * 0.7 + 0.1), 0.33); }

  function bodyLayer(o, R) {
    const L = new Layer(), skin = o.ghost ? mix(o.color, '#e6fbff', 0.42) : o.color, cloth = o.ghost ? skin : outfitOf(o);
    const BOOT = '#34506b';
    if (!o.ghost) {
      L.ell(R.bootL.cx, R.bootL.cy, R.bootL.rx, R.bootL.ry, BOOT, { spec: [[R.bootL.cx - 2, R.bootL.cy - 1.6]] });
      L.ell(R.bootR.cx, R.bootR.cy, R.bootR.rx, R.bootR.ry, BOOT, { spec: [[R.bootR.cx - 2, R.bootR.cy - 1.6]] });
      L.ell(R.body.cx, R.body.cy, R.body.rx, R.body.ry, cloth, {});
    } else {
      const wave = (px) => 49.5 + (Math.sin((px + R.f * 1.7) * 0.95) > 0.15 ? 1.5 : -0.5);
      L.ell(20, 41.5, 9, 8.5, skin, { clip: (px, py) => py < wave(px) });
    }
    const arm = (a, front) => {
      L.ell(a.cx, a.cy, a.rx, a.ry, skin, {});
      if (!o.ghost) L.ell(a.cx, a.cy - 2.2, a.rx + 0.3, 2.4, cloth, {});
    };
    if (!R.side) { arm(R.armL); arm(R.armR); } else arm(R.armN);
    const hd = R.head, hid = L.ell(hd.cx, hd.cy, hd.rx, hd.ry, skin, { tip: hd.tip, lean: hd.lean, spec: shine(hd, R) });
    R.hid = hid;
    if (!R.back && !R.side && !o.ghost) { // gotita en el pecho
      const bx = 20, by = 41 + R.body.cy - 42, c = mix(o.color, '#ffffff', 0.25);
      L.put(bx, by - 2, c, R.hid + 1); L.rect(bx - 1, by - 1, 3, 2, c, R.hid + 1); L.put(bx, by + 1, c, R.hid + 1);
    }
    return L;
  }
  function shine(hd, R) { // brillo de gelatina arriba-izquierda
    const x = hd.cx, y = hd.cy; if (R.back) return [[x - 7, y - 5], [x - 6, y - 6], [x - 5, y - 7], [x - 4, y - 7], [x - 7, y - 4]];
    return [[x - 8, y - 4], [x - 7, y - 5], [x - 6, y - 6], [x - 5, y - 7], [x - 4, y - 7], [x - 8, y - 3]];
  }

  /* ---------- caras ---------- */
  function face(L, o, R) {
    if (R.back) return;
    const hd = R.head, f = o.ghost && (o.face || 'neutral') === 'neutral' ? 'ghost' : (o.face || 'neutral'), E = '#16323a';
    const side = R.side, ey = Math.round(hd.cy + 1), eyes = side ? [Math.round(hd.cx + 4), Math.round(hd.cx + 9)] : [Math.round(hd.cx - 5), Math.round(hd.cx + 4)];
    const mx = side ? Math.round(hd.cx + 7) : Math.round(hd.cx), my = ey + (side ? 5 : 6), base = o.color;
    const oval = (x, y, w, h) => { for (let j = 0; j < h; j++) { const ins = j === 0 || j === h - 1 ? 1 : 0; L.rect(x + ins, y + j, w - ins * 2, 1, E, null); } };
    eyes.forEach((x0, i) => {
      const w = side && i === 1 ? 2 : 3;
      if (f === 'sleepy') { L.rect(x0, ey + 2, w, 1, E); return; }
      if (f === 'happy') { L.put(x0, ey + 2, E); L.put(x0 + 1, ey + 1, E); if (w > 2) L.put(x0 + 2, ey + 2, E); else L.put(x0 + 1, ey + 2, E); return; }
      if (f === 'surprised') { oval(x0 - (w > 2 ? 0 : 0), ey - 1, w, 6); L.put(x0, ey, '#ffffff'); return; }
      oval(x0, ey, w, 5); L.put(x0, ey + 1, '#ffffff');
      if (f === 'smug') { L.rect(x0, ey, w, 2, mix(base, OUT, 0.25)); L.rect(x0, ey + 1, w, 1, E); }
      if (f === 'worried') { L.put(i === 0 || side ? x0 + w - 1 : x0, ey - 2, E); L.put(i === 0 || side ? x0 + w - 2 : x0 + 1, ey - 1, E); }
      if (f === 'angry') { L.put(i === 0 || side ? x0 : x0 + w - 1, ey - 2, E); L.put(i === 0 || side ? x0 + 1 : x0 + w - 2, ey - 1 - 0, E); L.put(i === 0 || side ? x0 + 2 : x0 + w - 3, ey - 1, E); }
    });
    const m = (x, y) => L.put(x, y, E);
    if (f === 'happy') { m(mx - 2, my - 1); m(mx - 1, my); m(mx, my); m(mx + 1, my); m(mx + 2, my - 1); L.rect(mx - 1, my + 1, 3, 1, '#c8505a'); }
    else if (f === 'worried') { m(mx - 2, my + 1); m(mx - 1, my); m(mx, my); m(mx + 1, my); m(mx + 2, my + 1); }
    else if (f === 'sleepy') { L.rect(mx - 1, my, 2, 2, E); }
    else if (f === 'surprised' || f === 'ghost') { L.rect(mx - 1, my - 1, 3, 3, E); L.put(mx, my, mix(base, '#ffffff', 0.3)); }
    else if (f === 'angry') { L.rect(mx - 2, my, 5, 1, E); m(mx - 2, my + 1); m(mx + 2, my + 1); }
    else if (f === 'smug') { L.rect(mx - 2, my, 4, 1, E); m(mx + 2, my - 1); m(mx + 3, my - 2); }
    else L.rect(mx - 1, my, 3, 1, E);
    if (!o.ghost) {
      const bl = mix(base, '#ff6f86', 0.5); // mejillas
      if (side) L.rect(eyes[0] - 2, ey + 5, 2, 1, bl); else { L.rect(eyes[0] - 3, ey + 5, 2, 1, bl); L.rect(eyes[1] + 4, ey + 5, 2, 1, bl); }
    }
  }

  /* ---------- accesorios (capa transparente aparte, con su propio contorno) ---------- */
  function accLayer(o, R) {
    const A = new Layer(); const id = o.accessory; if (!id) return A.canvas();
    const def = (ACCESSORIES.find((a) => a.id === id) || {}).color, C = o.accessoryColor || def;
    const hd = R.head, hx = Math.round(hd.cx), hy = hd.cy, hry = hd.ry, side = R.side, back = R.back, fw = side ? 4 : 0;
    const top = hy - hry, ey = Math.round(hy + 1);
    const E = '#16323a';
    if (id === 'brote') {
      const ty = Math.round(top - hd.tip) + 1, tx = hx + (side ? -3 : 0), dk = shift(C, 0, 0, -0.3);
      A.rect(tx, ty - 3, 1, 4, dk);
      A.ell(tx - 4.5, ty - 4.5, 4.6, 2.5, C, {}); A.ell(tx + 4.5, ty - 5.5, 4.4, 2.4, C, {});
    } else if (id === 'audifonos') {
      const r = 12.6, band = '#2d3b4d';
      for (let a = Math.PI * 1.02; a <= Math.PI * 1.98; a += 0.025) { const x = Math.round(hx + Math.cos(a) * r), y = Math.round(hy - 2 + Math.sin(a) * (hry + 3)); if (a < Math.PI * 1.45) A.put(x, y, '#52667f'); else A.put(x, y, band); A.put(x, y + 1, '#1d2736'); }
      if (side) A.ell(hx + 1, hy + 1, 3.6, 4.8, C, {}); else { A.ell(hx - hd.rx - 0.2, hy + 1.2, 3.2, 4.8, C, {}); A.ell(hx + hd.rx + 0.2, hy + 1.2, 3.2, 4.8, C, {}); }
    } else if (id === 'gorra') {
      const y0 = hy - 8.6; A.ell(hx, y0, hd.rx - 0.7, 8.4, C, { clip: (px, py) => py < hy - 3.2 });
      A.rect(hx - Math.round(hd.rx - 0.8), Math.round(hy - 3.8), Math.round((hd.rx - 0.8) * 2), 1, dark(C, 0.3));
      if (!back) A.ell(hx + (side ? 7 : 0), hy - 3, side ? 7.4 : 9.4, 2, shift(C, 0, 0, -0.1), { clip: (px, py) => py > hy - 4.2 });
      else A.rect(hx - 3, Math.round(hy - 5), 6, 1, shift(C, 0, 0, -0.2));
      A.put(hx + (side ? -3 : 0), Math.round(y0 - 8), '#f4f1d8');
    } else if (id === 'lentes') {
      const f = C;
      if (back) { A.rect(hx - 11, ey + 1, 22, 1, f); }
      else {
        (side ? [hd.cx + 5.5] : [hd.cx - 4.5, hd.cx + 5.5]).forEach((cx) => { for (let a = 0; a < Math.PI * 2; a += 0.3) A.put(Math.round(cx + Math.cos(a) * 4.2), Math.round(ey + 2 + Math.sin(a) * 3.9), f); A.put(Math.round(cx - 2), Math.round(ey), '#ffffff'); });
        if (!side) A.rect(hx - 1, ey + 1, 2, 1, f); else A.rect(Math.round(hd.cx - hd.rx + 1), ey + 1, Math.round(hd.rx + 1), 1, f);
      }
    } else if (id === 'paja') {
      const by = Math.round(hy - 9);
      A.ell(hx + (side ? 1 : 0), by + 3, 17, 4, C, {});
      A.ell(hx + (side ? -1 : 0), by - 2.5, 8.6, 7, C, {});
      A.rect(hx - 8 + (side ? -1 : 0), by + 1, 17, 2, '#c4543f');
      for (let x = hx - 14; x < hx + 14; x += 3) A.put(x, by + 5, shift(C, 0, 0, -0.18));
    } else if (id === 'bufanda') {
      const ny = Math.round(R.head.cy + R.head.ry - 1.6), sc = C;
      A.ell(20, ny + 1, side ? 8 : 10.5, 3, sc, {});
      A.ell(side ? 15 : 27, ny + 6.5, 2.6, 5, shift(sc, 0, 0, -0.04), {}); A.rect(side ? 13 : 25, ny + 11, 5, 1, dark(sc, 0.25));
    } else if (id === 'flor') {
      const fx = hx + (side ? -1 : 7), fy = Math.round(hy - hry * 0.72), petal = C;
      [[0, -3.2], [3.2, -1], [2, 2.8], [-2, 2.8], [-3.2, -1]].forEach(([dx, dy]) => A.ell(fx + dx, fy + dy, 2.6, 2.6, petal, {}));
      A.ell(fx, fy, 2.2, 2.2, '#f6d14d', {});
    } else if (id === 'visor') {
      const strap = '#26405b', lens = '#7fe0ff', e2 = ey + 2;
      if (back) A.rect(hx - 11, e2 - 1, 22, 3, strap);
      else {
        A.rect(Math.round(hd.cx - hd.rx + 1), e2 - 1, Math.round(hd.rx * 2 - 2), 3, strap);
        const cx = Math.round(hd.cx + (side ? 5 : 0)), w = side ? 7 : 10.5;
        A.ell(cx, e2, w, 5.6, C, {}); A.ell(cx, e2, w - 1.9, 3.7, lens, {});
        A.rect(cx - Math.round(w - 4), e2 - 3, 3, 1, '#ffffff'); A.put(cx - Math.round(w - 3), e2 - 2, '#d6f6ff');
      }
    } else if (id === 'casco') {
      A.ell(hx, hy - 8.4, hd.rx + 0.2, 8.4, C, { clip: (px, py) => py < hy - 3 });
      A.ell(hx, hy - 3.2, hd.rx + 2.4, 1.8, C, {});
      A.rect(hx - 1, Math.round(hy - 16.4), 2, 11, shift(C, 0, 0, 0.1));
      if (!back) A.ell(hx + (side ? 4 : 0), hy - 11, 2.8, 2.4, '#fff7c2', {});
    } else if (id === 'pescador') {
      const by = Math.round(hy - 8);
      A.ell(hx, by + 3.2, 14.6, 3.4, C, {}); A.ell(hx, by - 1, 8.6, 6.4, C, {});
      A.rect(hx - 8, by + 1, 16, 2, '#3d6fb0'); A.rect(hx - 8, by + 1, 16, 1, '#6a9ad6');
      if (!back) { A.rect(hx - 7, by - 3, 1, 4, '#d9d9d9'); A.put(hx - 7, by + 1, '#e5483f'); A.put(hx - 7, by - 4, '#e5483f'); }
    } else if (id === 'impermeable') {
      const b = R.body, sk = C; const cut = (px, py) => true;
      const lay = [];
      A.ell(b.cx, b.cy + 0.2, b.rx + 0.5, b.ry + 0.4, sk, {});
      if (!side) { A.ell(R.armL.cx, R.armL.cy - 1.2, R.armL.rx + 0.5, R.armL.ry - 1, sk, {}); A.ell(R.armR.cx, R.armR.cy - 1.2, R.armR.rx + 0.5, R.armR.ry - 1, sk, {}); }
      else A.ell(R.armN.cx, R.armN.cy - 1.2, R.armN.rx + 0.5, R.armN.ry - 1, sk, {});
      if (!back) { A.rect(b.cx, Math.round(b.cy - 4), 1, 9, shift(sk, 0, 0, -0.14)); A.put(b.cx - 2, Math.round(b.cy), '#7a5a1e'); A.put(b.cx + 2, Math.round(b.cy), '#7a5a1e'); }
      // el cuerpo no debe tapar la cabeza: se recorta por la elipse de la cabeza
      const hh = R.head; A.d.forEach((v, i) => 0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const px = x + 0.5, py = y + 0.5; if (((px - hh.cx) / hh.rx) ** 2 + ((py - hh.cy) / hh.ry) ** 2 <= 1.0) { const k = (y * W + x) * 4; A.d[k + 3] = 0; A.id[y * W + x] = -1; } }
      A.ell(hh.cx, hh.cy + hh.ry - 0.5, side ? 8 : 9.4, 2.2, shift(sk, 0, 0, -0.06), { clip: (px, py) => py > hh.cy + hh.ry - 2.6 });
    } else if (id === 'mochila') {
      const tk = C, dk = '#2d3b4d', mt = '#8fa3b2', b = R.body;
      if (back) { A.ell(b.cx, b.cy - 1, 7.4, 8.2, tk, {}); A.rect(b.cx - 7, Math.round(b.cy - 4), 14, 1, mt); A.rect(b.cx - 7, Math.round(b.cy + 2), 14, 1, mt); A.rect(b.cx - 2, Math.round(b.cy - 10), 4, 2, mt); A.rect(b.cx + 6, Math.round(b.cy + 6), 5, 1, dk); }
      else if (side) { const sx = b.cx - 8; A.ell(sx, b.cy - 1, 3.6, 8.2, tk, {}); A.rect(sx - 3, Math.round(b.cy - 4), 6, 1, mt); A.rect(sx - 1, Math.round(b.cy - 10), 3, 2, mt); A.rect(b.cx - 4, Math.round(b.cy - 5), 1, 9, dk); }
      else { for (let k = 0; k < 11; k++) { const o2 = Math.round(k * 0.2); A.put(b.cx - 5 + o2, Math.round(b.cy - 5 + k), dk); A.put(b.cx + 4 - o2, Math.round(b.cy - 5 + k), dk); } A.ell(b.cx - 9.6, b.cy - 6, 1.8, 3.6, tk, {}); A.ell(b.cx + 9.6, b.cy - 6, 1.8, 3.6, tk, {}); A.rect(b.cx - 1, Math.round(b.cy - 1), 2, 1, mt); }
    }
    A.finish(dark(C, 0.72));
    return A.canvas();
  }

  function norm(o) {
    o = Object.assign({ color: '#9be8c1', outfit: null, accessory: null, accessoryColor: null, face: 'neutral', view: 'front', size: 'sm', ghost: false, pose: 'idle', frame: 0 }, o || {});
    if (o.acc !== undefined && o.accessory == null) o.accessory = o.acc;
    if (o.accessory === 'none' || o.accessory === 'ninguno' || o.accessory === '') o.accessory = null;
    return o;
  }
  function layers(o) {
    o = norm(o); const R = rig(o), L = bodyLayer(o, R); face(L, o, R); L.finish(OUT);
    return { body: L.canvas(), accessory: accLayer(o, R), G: R };
  }
  function character(o) { const L = layers(o), c = canvas(W, H), x = ctxOf(c); x.drawImage(L.body, 0, 0); x.drawImage(L.accessory, 0, 0); return c; }
  function characterSheet(o, so) {
    o = norm(o); so = Object.assign({ layer: 'full', ghostRow: true }, so || {});
    const cols = VIEWS.length * POSES.length, rows = so.ghostRow ? 2 : 1, c = canvas(W * cols, H * rows), ctx = ctxOf(c);
    for (let r = 0; r < rows; r++) VIEWS.forEach((v, vi) => POSES.forEach((p, pi) => {
      const L = layers(Object.assign({}, o, { view: v, pose: p.slice(0, -1), frame: +p.slice(-1), ghost: r === 1 }));
      const x = (vi * POSES.length + pi) * W, y = r * H;
      if (so.layer !== 'accessory') ctx.drawImage(L.body, x, y);
      if (so.layer !== 'body') ctx.drawImage(L.accessory, x, y);
    }));
    return c;
  }
  /* retrato: busto (cabeza + hombros) recortado de la vista frontal */
  function portrait(o, k) {
    const c = character(Object.assign({}, o, { view: 'front', pose: 'idle', frame: 0 })), pw = 34, ph = 36, out = canvas(pw * k, ph * k), x = ctxOf(out);
    x.imageSmoothingEnabled = false; x.drawImage(c, 3, 2, pw, ph, 0, 0, pw * k, ph * k); return out;
  }

  PK.PLAYER_COLORS = PLAYER_COLORS; PK.SERVER_COLORS = SERVER_COLORS; PK.ACCESSORIES = ACCESSORIES; PK.FACES = FACES; PK.VIEWS = VIEWS; PK.POSES = POSES; PK.CHAR_GEO = GEO;
  PK.defaultOutfit = (hex) => outfitOf({ color: hex });
  PK.character = character; PK.characterLayers = layers; PK.characterSheet = characterSheet; PK.normalizeRecipe = norm; PK.characterPortrait = portrait; PK.CHAR_CELL = { w: W, h: H, ax: 20, ay: 46 };
})(typeof window !== 'undefined' ? window : globalThis);
/* rt.js — entorno de las maquetas: ajuste del escenario, íconos, personajes gummy, variantes por query y animación de caminata. */
(function (g) {
  const PK = g.PK, UI = g.UI = {};
  UI.q = new URLSearchParams(location.search);
  UI.SC = PK.SERVER_COLORS;
  UI.ROSTER = [
    { n: 'Mateo', c: 0, a: 'gorra', f: 'neutral', cn: 'Rojo' }, { n: 'Samuel', c: 1, a: 'brote', f: 'happy', cn: 'Verde' }, { n: 'Ari', c: 2, a: 'audifonos', f: 'neutral', cn: 'Amarillo' },
    { n: 'Rocío', c: 3, a: 'flor', f: 'happy', cn: 'Azul' }, { n: 'Santi', c: 4, a: 'paja', f: 'smug', cn: 'Naranja' }, { n: 'Valen', c: 5, a: 'lentes', f: 'neutral', cn: 'Morado' },
    { n: 'Nico', c: 6, a: 'visor', f: 'surprised', cn: 'Cian' }, { n: 'Maru', c: 7, a: 'bufanda', f: 'happy', cn: 'Rosa' },
  ];
  const hex = (c) => (typeof c === 'number' ? UI.SC[c] : c);
  function put(cv, sp, k) { cv.width = sp.width; cv.height = sp.height; cv.style.width = sp.width * k + 'px'; cv.style.height = sp.height * k + 'px'; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height); x.drawImage(sp, 0, 0); }
  function recipe(o, fr) { return { color: hex(o.c), accessory: o.a || null, face: o.f || 'neutral', view: o.v || 'front', pose: o.p || 'idle', frame: fr == null ? (o.fr || 0) : fr, ghost: !!o.g }; }
  UI.hydrate = function (root) {
    root = root || document;
    root.querySelectorAll('canvas[data-icon]').forEach((cv) => {
      const colors = cv.dataset.colors ? JSON.parse(cv.dataset.colors) : undefined, ic = PK.icons.make(cv.dataset.icon, colors);
      cv.width = 12; cv.height = 12; const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 12, 12); x.drawImage(ic, 0, 0);
    });
    root.querySelectorAll('canvas[data-gc]').forEach((cv) => {
      const o = JSON.parse(cv.dataset.gc), k = o.k || 3; put(cv, PK.character(recipe(o)), k);
      if (o.flip) cv.style.transform = (cv.style.transform || '') + ' scaleX(-1)';
      if (o.anim) { let f = 0; const walk = o.anim === 'walk'; setInterval(() => { f = (f + 1) % (walk ? 4 : 2); put(cv, PK.character(Object.assign(recipe(o, f), { pose: walk ? 'walk' : 'idle' })), k); }, walk ? 130 : 520); }
    });
    root.querySelectorAll('canvas[data-pt]').forEach((cv) => {
      const o = JSON.parse(cv.dataset.pt), k = o.k || 2; put(cv, PK.characterPortrait({ color: hex(o.c), accessory: o.a || null, face: o.f || 'happy' }, 1), k);
    });
  };
  /* variantes: <section data-case="tab=audio"> se muestra si la query (o el valor por defecto de <body data-def="tab=audio">) coincide */
  UI.cases = function () {
    const def = {}; (document.body.dataset.def || '').split(';').forEach((p) => { const [k, v] = p.split('='); if (k) def[k] = v; });
    document.querySelectorAll('[data-case]').forEach((el) => { const [k, v] = el.dataset.case.split('='); const cur = UI.q.get(k) || def[k]; el.hidden = cur !== v; });
    document.querySelectorAll('[data-on]').forEach((el) => { const [k, v] = el.dataset.on.split('='); const cur = UI.q.get(k) || def[k]; el.classList.toggle('on', cur === v); });
  };
  UI.fit = function (stage) { const f = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')'; }; f(); addEventListener('resize', f); };
  UI.boot = function () { UI.fit(document.getElementById('stage')); UI.cases(); UI.hydrate(); };
})(window);
