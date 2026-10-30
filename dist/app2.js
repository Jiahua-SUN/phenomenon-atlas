/* Phenomenon Atlas v2 — part 2: the map board. Map view = heat density map in the manner of VOSviewer's density view (user,
   2026-10-23): every topic in scope adds a Gaussian weighted by its heat in the period; the colour fills the whole panel, so the outline
   comes from the data and changes with every filter (period, measure, lens, theme or field, search). Kernel width = 4 x the median
   nearest-neighbour spacing of the topics in scope (fixed, no control). Colour scale is relative: its top is the 99.7th percentile of
   density in the fit view of the current scope and period, so zooming keeps colours stable. Names all one size (user 2026-10-25); hotter names win overlaps.
   Places: x3/y3 in topics.json (p3n_density_layout.py: continuous t-SNE of topic centroids). Squares view: app2c.js. List view below. */
'use strict';
const DENS_STOPS = ['#0a1630', '#132d5e', '#1f4e9e', '#4c74b8', '#93a8cf', '#cfc6cb', '#e9a090', '#e65a45', '#e30613', '#8c0a12'];
const DENS_LUT = makeLUT(DENS_STOPS.map((c, i) => [i / (DENS_STOPS.length - 1), c]));
const KERNEL = 4;
const clamp01 = v => Math.max(0, Math.min(1, v));
const lumOf = c => .2126 * (c[0] / 255) ** 2.2 + .7152 * (c[1] / 255) ** 2.2 + .0722 * (c[2] / 255) ** 2.2;

/* ---------- density: scope, fit and colour reference ---------- */
function scopeKey() { return [state.period, state.lens, state.theme, state.heat, state.search.trim().toLowerCase(), $('#pointCloud').clientWidth, $('#pointCloud').clientHeight].join('|'); }
function densityPrep() {
  const key = scopeKey(); if (state.dens && state.dens.key === key) return state.dens;
  const g = mapGeom(), scoped = scopedTopics(), X = scoped.map(t => t.x3), Y = scoped.map(t => t.y3), n = scoped.length;
  const nn = X.map((x, a) => { let m = 9; for (let b = 0; b < n; b++) if (a !== b) { const d = (x - X[b]) ** 2 + (Y[a] - Y[b]) ** 2; if (d < m) m = d; } return Math.sqrt(m); }).sort((a, b) => a - b);
  const bx0 = n ? Math.min(...X) : 0, bx1 = n ? Math.max(...X) : 1, by0 = n ? Math.min(...Y) : 0, by1 = n ? Math.max(...Y) : 1, pad = 34;
  const bw = Math.max(bx1 - bx0, .05), bh = Math.max(by1 - by0, .05), s = Math.min((g.W - 2 * pad) / bw, (g.H - 2 * pad - 30) / bh);
  const D = {key, scoped, w: scoped.map(t => heatOf(t)), s, ox: (g.W - bw * s) / 2 - bx0 * s, oy: (g.H - bh * s) / 2 - by0 * s + 10, nn: n > 1 ? nn[n >> 1] : .02};
  D.wmax = Math.max(1, ...D.w); D.sig = KERNEL * D.nn * s;   // kernel in fit-view pixels
  state.dens = D; const G = densityGrid(D, g, {zoom: 1, tx: 0, ty: 0}, 6), v = Array.from(G.D).sort((a, b) => a - b); D.q = v[Math.floor(v.length * .997)] || 1;
  // problems shown in the period (caption)
  const P = state.pts, inset = new Uint8Array(state.topics.length), months = new Set(periodMonths()); scoped.forEach(t => inset[t.i] = 1); let count = 0;
  for (let i = 0; i < P.n; i++) if (inset[P.t[i]] && months.has(P.m[i]) && (state.heat === 'n' || P.w[i])) count++; D.count = count;
  return D;
}
const fitXY = (D, t) => [D.ox + t.x3 * D.s, D.oy + t.y3 * D.s];
function densityQ(t) { const D = densityPrep(), g = mapGeom(), [fx, fy] = fitXY(D, t); return [(fx - g.ox) / g.sx, 65535 - (fy - g.oy) / g.sy]; }
const camPt = (fx, fy, g, cam) => [g.W / 2 + (fx - g.W / 2) * cam.zoom + cam.tx, g.H / 2 + (fy - g.H / 2) * cam.zoom + cam.ty];
// kernel sums on a screen grid of `cell` px
function densityGrid(D, g, cam, cell) {
  const GX = Math.ceil(g.W / cell), GY = Math.ceil(g.H / cell), A = new Float32Array(GX * GY), sg = D.sig * cam.zoom / cell, r = Math.ceil(3.2 * sg), kx = new Float32Array(2 * r + 1), ky = new Float32Array(2 * r + 1);
  D.scoped.forEach((t, k) => { const wv = D.w[k]; if (!wv) return; const [sx, sy] = camPt(...fitXY(D, t), g, cam), gx = sx / cell, gy = sy / cell; if (gx < -r || gy < -r || gx > GX + r || gy > GY + r) return;
    const x0 = Math.floor(gx) - r, y0 = Math.floor(gy) - r, a0 = Math.max(0, -x0), a1 = Math.min(2 * r, GX - 1 - x0), b0 = Math.max(0, -y0), b1 = Math.min(2 * r, GY - 1 - y0);
    for (let a = a0; a <= a1; a++) kx[a] = Math.exp(-.5 * ((x0 + a - gx) / sg) ** 2); for (let b = b0; b <= b1; b++) ky[b] = Math.exp(-.5 * ((y0 + b - gy) / sg) ** 2);
    for (let b = b0; b <= b1; b++) { const o = (y0 + b) * GX + x0, kb = ky[b] * wv; for (let a = a0; a <= a1; a++) A[o + a] += kb * kx[a]; } });
  return {D: A, GX, GY, cell};
}
function drawDensity(ctx, g, quick) {
  const D = densityPrep(), G = densityGrid(D, g, state, quick ? 5 : 2.2), off = document.createElement('canvas'); off.width = G.GX; off.height = G.GY;
  const im = off.getContext('2d').createImageData(G.GX, G.GY), tk = new Uint8Array(G.GX * G.GY);
  for (let k = 0; k < tk.length; k++) { const i = Math.round(Math.min(1, G.D[k] / D.q) ** .8 * 255); tk[k] = i; im.data.set([DENS_LUT[i * 3], DENS_LUT[i * 3 + 1], DENS_LUT[i * 3 + 2], 255], k * 4); }
  off.getContext('2d').putImageData(im, 0, 0); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(off, 0, 0, G.GX * G.cell, G.GY * G.cell);
  state.densTk = {tk, GX: G.GX, GY: G.GY, cell: G.cell}; return D;
}
// names on the canvas: the selected topic always, then by heat (a hotter name wins when two would overlap); one size for all names, the
// colour already shows heat (user 2026-10-25); ink against the colour underneath
function drawDensityNames(ctx, g) {
  const D = state.dens, T = state.densTk, boxes = [], hits = []; if (!D || !T) return;
  const lim = Math.round(150 * Math.sqrt(state.zoom) * g.W / 1100), sel = state.selected;
  const order = D.scoped.map((t, k) => k).sort((a, b) => (D.scoped[b].id === sel) - (D.scoped[a].id === sel) || D.w[b] - D.w[a] || D.scoped[b].episodes - D.scoped[a].episodes);
  const under = (x, y) => { const gx = Math.min(T.GX - 1, Math.max(0, Math.floor(x / T.cell))), gy = Math.min(T.GY - 1, Math.max(0, Math.floor(y / T.cell))), i = T.tk[gy * T.GX + gx]; return [DENS_LUT[i * 3], DENS_LUT[i * 3 + 1], DENS_LUT[i * 3 + 2]]; };
  let n = 0; ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const k of order) { const t = D.scoped[k], isSel = t.id === sel; if (n >= lim && !isSel) break; let [sx, sy] = camPt(...fitXY(D, t), g, state); if (sx < 0 || sy < 0 || sx > g.W || sy > g.H) continue;
    const fs = 12; if (isSel) sy -= fs * .6 + 10;   // the selected name sits above its marker
    ctx.font = `${isSel ? 800 : 600} ${fs}px Inter, Arial, sans-serif`; ctx.letterSpacing = '0px';
    const tw = ctx.measureText(t.name).width, b = [sx - tw / 2 - 2, sy - fs * .6, sx + tw / 2 + 2, sy + fs * .6];
    if (!isSel && (b[0] < 2 || b[2] > g.W - 2 || b[1] < 2 || b[3] > g.H - 2 || boxes.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]))) continue; boxes.push(b); hits.push([b, t]); n++;
    let L = 0; for (let s = -2; s <= 2; s++) L += lumOf(under(sx + s / 4 * tw / 2, sy)) / 5; const darkInk = L > .3;
    ctx.globalAlpha = 1; ctx.lineWidth = 1.8; ctx.strokeStyle = darkInk ? 'rgba(250,247,240,.3)' : 'rgba(8,14,30,.32)'; ctx.fillStyle = darkInk ? '#16181b' : '#f4f3f0';
    if (isSel) { ctx.lineWidth = 4; ctx.strokeStyle = darkInk ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.75)'; }
    ctx.strokeText(t.name, sx, sy); ctx.fillText(t.name, sx, sy); }
  ctx.restore(); D.hits = hits;
}
// markers on the SVG layer (cheap to redraw on hover): the selected topic and the hovered one
function drawDensityMarks() {
  const svg = $('#labelLayer'), g = mapGeom(), D = state.dens; svg.innerHTML = ''; svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`); if (!D) return;
  for (const [id, cls] of [[state.hover, 'mark hover'], [state.selected, 'mark selected']]) { const t = id && D.scoped.find(x => x.id === id); if (!t) continue;
    const [x, y] = camPt(...fitXY(D, t), g, state), c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', cls === 'mark selected' ? 7 : 5); c.setAttribute('class', cls); svg.appendChild(c); }
}
function densityTopicAt(ev) {
  const D = state.dens; if (!D) return null; const g = mapGeom(), box = $('#mapCanvas').getBoundingClientRect(), mx = ev.clientX - box.left, my = ev.clientY - box.top;
  for (const [b, t] of (D.hits || []).slice().reverse()) if (mx >= b[0] && mx <= b[2] && my >= b[1] && my <= b[3]) return t;
  let best = null, bd = 16 * 16; for (const t of D.scoped) { const [x, y] = camPt(...fitXY(D, t), g, state), d = (x - mx) ** 2 + (y - my) ** 2; if (d < bd) { bd = d; best = t; } } return best;
}
function bindDensity() {
  if (state.densBound) return; state.densBound = true; const mc = $('#mapCanvas'); let pending = null;
  mc.addEventListener('mousemove', e => { if (state.view !== 'map' || state.drag || state.camAnim) return; pending = e; if (state.hoverRaf) return;
    state.hoverRaf = requestAnimationFrame(() => { state.hoverRaf = null; const t = densityTopicAt(pending), id = t ? t.id : null; mc.style.cursor = t ? 'pointer' : '';
      if (id !== state.hover) { state.hover = id; drawDensityMarks(); } if (t) showTip(t, pending); else hideTip(); }); });
  mc.addEventListener('mouseleave', () => { if (state.view === 'map' && state.hover) { state.hover = null; drawDensityMarks(); hideTip(); } });
}
function drawLegend() {
  const cv = $('#legendBar'); if (!cv) return; const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  for (let i = 0; i < W; i++) { const v = i / (W - 1), c = lutRGB(DENS_LUT, v); x.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; x.fillRect(i, 0, 1, H); }
}

/* ---------- map ---------- */
function renderMap(opts = {}) {
  if (state.view !== 'map' || state.board !== 'map') { renderSquares(); renderTrend(); return; }   // app2c.js / app2t.js; each does nothing outside its own view
  const c = $('#pointCloud'); const dpr = window.devicePixelRatio || 1; const g = mapGeom(); if (!g.W) return; c.width = g.W * dpr; c.height = g.H * dpr; const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, g.W, g.H);
  bindDensity(); drawLegend(); $('#mapCanvas').dataset.view = state.view; const heatTxt = state.heat === 'n' ? 'were discussed in many podcast episodes in this period, dark blue areas in few' : 'earned many audience points in this period, dark blue areas few';
  const D = drawDensity(ctx, g, !!opts.quick); drawDensityNames(ctx, g); drawDensityMarks();
  $('#captionCount').textContent = `${fmt(D.scoped.length)} topics · ${fmt(D.count)} problems · ${periodObj().label}`;
  $('#encodingNote').textContent = `Topics with similar problems sit close together. Red areas ${heatTxt}. The colours are relative to what is shown, so they compare places on the map, not months. All names are the same size; where two would overlap, the more discussed topic keeps its name. Zoom in to see more names, and click a name to open the topic.`;
}
function renderLabels() { renderMap(); }
function showTip(t, e) { const tip = $('#tooltip'); tip.innerHTML = `<strong>${esc(t.name)}</strong>${esc(t.description)}<small>${fmt(heatOf(t))} ${state.heat === 'n' ? 'episodes' : 'audience points'} in ${esc(periodObj().label)} · ${fmt(t.episodes)} episodes in all months · ${t.papers || 0} related papers, ${t.papers_strict || 0} of them core. Click to open.</small>`; tip.hidden = false; const box = $('#mapCanvas').getBoundingClientRect(); tip.style.left = Math.min(e.clientX - box.left + 14, box.width - 310) + 'px'; tip.style.top = Math.min(e.clientY - box.top + 12, box.height - 120) + 'px'; }
function hideTip() { $('#tooltip').hidden = true; }
function nearestTopic(ev) { return densityTopicAt(ev); }
// a filter change: the old picture fades out while the new one is drawn at once
function transitionMap() {
  if (state.view !== 'map' || state.board !== 'map') { renderMap(); return; }
  const c = $('#pointCloud'), o = $('#oldMap');
  if (!reduceMotion() && !document.hidden && c.width && !$('#workspace').hidden) { o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); o.className = 'old-map show'; void o.offsetWidth; o.classList.add('away'); setTimeout(() => o.className = 'old-map', 450); }
  state.zoom = 1; state.tx = 0; state.ty = 0; $('#zoomReset').textContent = 'Fit'; renderMap({animate: true});
}

/* ---------- list view ---------- */
function renderList() {
  if (state.view !== 'list' || state.board !== 'map') return;
  const scoped = scopedTopics().sort((a, b) => heatOf(b) - heatOf(a)); const mx = Math.max(1, ...scoped.map(t => heatOf(t))); const vals = heatValues(scoped);
  $('#listPanel').innerHTML = scoped.map((t, i) => `<button class="topic-row ${state.selected === t.id ? 'selected' : ''}" data-id="${t.id}" style="animation-delay:${Math.min(i, 30) * 12}ms"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="title">${esc(t.name)}<small>${esc(t.description)}</small></span><span class="cnt">${fmt(heatOf(t))}<small>${state.heat === 'n' ? 'episodes' : 'audience points'}</small></span><span class="bar"><i data-w="${100 * heatOf(t) / mx}" style="width:0;background:${colorFor(vals.get(t.i))}"></i></span></button>`).join('') || '<p class="pending">No topics match.</p>';
  requestAnimationFrame(() => $$('#listPanel .bar i').forEach(i => i.style.width = i.dataset.w + '%'));
  $$('#listPanel .topic-row').forEach(b => b.onclick = () => selectTopic(b.dataset.id));
}
