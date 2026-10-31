/* Phenomenon Atlas v2 — part 1: data, boards, time lens, camera. Boards: 00 home, 01 map (topics by research field; business themes left
   the site 2026-10-25 at the user's request, their data stay in the files;
   views Map | Squares | List), 02 gap, 03 ask. One theme (Swiss template, 2026-10-23) in light and dark mode. */
'use strict';
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n == null ? '—' : Math.round(n).toLocaleString('en-US');
const NS = 'http://www.w3.org/2000/svg';
const state = {board: 'map', lens: 'academic', theme: 'all',   // lens is always 'academic' (research fields); theme = the field picked
               heat: 'n', mode: 'month', period: null, view: 'map', search: '', selected: null, tab: 'questions',
               zoom: 1, tx: 0, ty: 0, drag: null, meta: null, topics: [], byId: {}, pts: null, topicFiles: {}, rankGroup: 'academic', rankTheme: 'all', rtab: 'list', acad: 'broad', rankBy: 'pod',
               qzoom: 1, qtx: 0, qty: 0, qdrag: null, contours: null, contourKey: null, camAnim: null, pullTimer: null};
const CORE_REL = 85; // papers at relevance >= CORE_REL are "core", below are "peripheral"
const PAPER_LIBRARY = 10470; // papers in the index after the 17 misfiled ones were removed (p5f, 2026-10-24); shown on the home page

/* ---------- data ---------- */
async function load() {
  const [meta, topics, buf, rowHeat] = await Promise.all([fetch('data/meta.json?v=t2').then(r => r.json()), fetch('data/topics.json?v=t3').then(r => r.json()), fetch('data/points.bin').then(r => r.arrayBuffer()), fetch('data/row_heat.json?v=r1').then(r => r.json())]);
  state.meta = meta; state.rowHeat = rowHeat; state.topics = topics; topics.forEach(t => state.byId[t.id] = t);
  const n = buf.byteLength / 8, dv = new DataView(buf);
  const x = new Uint16Array(n), y = new Uint16Array(n), t = new Uint16Array(n), m = new Uint8Array(n), w = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const o = i * 8; x[i] = dv.getUint16(o, true); y[i] = dv.getUint16(o + 2, true); t[i] = dv.getUint16(o + 4, true); m[i] = dv.getUint8(o + 6); w[i] = dv.getUint8(o + 7); }
  state.pts = {n, x, y, t, m, w};
  state.monthTotals = meta.month_episodes || meta.months.map(mo => topics.reduce((s, tp) => s + ((tp.heat[mo] || [0, 0])[0]), 0));
  state.period = meta.last_full_month;
  $('#stats').innerHTML = `<div><b>${fmt(meta.episodes)}</b><span>Podcasts</span></div><div><b>${fmt(meta.topics)}</b><span>Topics</span></div><div><b>${fmt(meta.problems)}</b><span>Verified problems</span></div>`;
  $('#footNote').textContent = footText(meta);
  bind(); $('#themeLabel').textContent = isLight() ? 'Dark' : 'Light'; setBoard('map');
  document.fonts && document.fonts.ready.then(() => { if (state.board === 'map') renderMap(); }); // names are measured, so redraw once Inter is in
}

/* ---------- scope helpers ---------- */
const periodObj = () => state.meta.periods.find(p => p.id === state.period);
const periodsOfMode = () => state.meta.periods.filter(p => p.mode === state.mode);
const isLight = () => document.documentElement.dataset.theme === 'light';
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const longDate = d => { const x = new Date(String(d).slice(0, 10) + 'T00:00:00'); return x.getDate() + ' ' + x.toLocaleString('en-US', {month: 'long'}) + ' ' + x.getFullYear(); };
const shortMonth = m => new Date(m + '-01T00:00:00').toLocaleString('en-US', {month: 'short'});
// footer on every board (home.js uses it too); no machine timestamp (UI round 2026-10-24)
const footText = m => `Data from ${longDate(m.date_from)} to ${longDate(m.date_to)} · ${fmt(m.episodes)} podcasts · podcasts that scored below ${m.relevance_min} out of 100 for relevance to business strategy are left out · © 2026 Phenomenon Atlas. All rights reserved.`;
function activeLabel() { // the academic label whose episodes alone should count, or 'all'
  if (state.board === 'map') return state.lens === 'academic' ? state.theme : 'all';
  if (state.board === 'gap') return state.rankGroup === 'academic' ? state.rankTheme : 'all';
  return 'all';
}
function heatOf(t, period = state.period) {
  const lab = activeLabel(); const h = (lab !== 'all' && t.labelHeat && t.labelHeat[lab]) ? t.labelHeat[lab][period] : t.heat[period];
  return h ? (state.heat === 'n' ? h[0] : h[1]) : 0;
}
function inScope(t) { return state.theme === 'all' || t.labels[state.theme] != null; }
function scopedTopics() { const q = state.search.trim().toLowerCase(); return state.topics.filter(t => inScope(t) && (!q || (t.name + ' ' + t.description).toLowerCase().includes(q))); }
function periodMonths() {
  const p = periodObj(); if (!p) return [];
  if (p.mode === 'month') return [state.meta.months.indexOf(p.id)];
  if (p.mode === 'quarter') { const qn = +p.id.slice(-1); return state.meta.months.map((m, i) => (Math.floor((+m.slice(5) - 1) / 3) + 1) === qn ? i : -1).filter(i => i >= 0); }
  return state.meta.months.map((m, i) => i);
}
// heat-rank ramp for list bars (value = percentile rank within the scoped topics): the template's blue for the
// coldest, grey at the median, the template's red for the hottest; lighter ends in dark mode
const LIGHT_STOPS = [[0, '#1f4e9e'], [.25, '#7f9bc9'], [.5, '#c4c4c4'], [.75, '#ee7d6c'], [1, '#e30613']];
const DARK_STOPS = [[0, '#5b8def'], [.25, '#3f5f9a'], [.5, '#3a3a3a'], [.75, '#a8342c'], [1, '#ff2a2a']];
function makeLUT(stops) { const hx = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); const S = stops.map(([v, c]) => [v, hx(c)]); const out = new Uint8Array(256 * 3);
  for (let k = 0; k < 256; k++) { const v = k / 255; let j = 0; while (j < S.length - 2 && v > S[j + 1][0]) j++; const f = Math.max(0, Math.min(1, (v - S[j][0]) / (S[j + 1][0] - S[j][0]))); for (let c = 0; c < 3; c++) out[k * 3 + c] = Math.round(S[j][1][c] + (S[j + 1][1][c] - S[j][1][c]) * f); }
  return out; }
const LIGHT_LUT = makeLUT(LIGHT_STOPS), DARK_LUT = makeLUT(DARK_STOPS);
function lutRGB(lut, v) { const k = Math.round(Math.max(0, Math.min(1, v)) * 255) * 3; return [lut[k], lut[k + 1], lut[k + 2]]; }
function colorRGB(v) { return lutRGB(isLight() ? LIGHT_LUT : DARK_LUT, v); }
function colorFor(v) { return `rgb(${colorRGB(v).join(',')})`; }
function heatValues(scoped) {
  const heats = scoped.map(t => heatOf(t)); const sorted = heats.slice().sort((a, b) => a - b); const n = sorted.length;
  const lower = h => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < h) lo = m + 1; else hi = m; } return lo; };
  const upper = h => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= h) lo = m + 1; else hi = m; } return lo; };
  return new Map(scoped.map((t, i) => [t.i, n > 1 ? ((lower(heats[i]) + upper(heats[i]) - 1) / 2) / (n - 1) : .5]));
}
function pct(arr, v) { const s = arr.slice().sort((a, b) => a - b); let lo = 0; while (lo < s.length && s[lo] < v) lo++; return s.length ? lo / s.length : 0; }

/* ---------- boards ---------- */
// board introductions and how-to steps (UI round 2026-10-24: say what the board shows and how to use it; calculation details live in
// the help dialogs and Method)
const COPY = {
  academic: ['01 Map · Research fields', 'Heat', 'The map board shows the problems practitioners raised in business podcasts, grouped into {topics} topics, and how often each topic came up in the period you pick. Each topic is listed under the fields of strategy research (17, plus Others) that an unusually large share of its problems concern. Click a topic to read its core questions and the podcast quotes they come from.'],
  gap: ['02 Gap · Practice and research', 'Gap', 'For each topic this board shows two numbers: how many podcast episodes discussed it in the period, and how many journal papers study the same questions. The list ranks topics by podcasts, by papers, or by the gap between the two. The quadrant places every topic by both, so you can find topics discussed a lot in podcasts but studied little in papers.'],
  ask: ['03 Ask · Podcasts and papers', 'Ask', 'Search finds topics related to your interests. The AI assistant helps you examine how your research question relates to practitioner concerns and existing research. It draws on retrieved podcast quotes and papers to support an initial assessment of the question’s potential.']};
// Ask has two functions, so its steps follow the card that is picked (ask = Search, assess = AI assistant; ask.js repaints on a
// switch); one mixed list read oddly (user 2026-10-25)
const HOWTO = {
  map: ['Pick a month', 'Pick a research field if you like', 'Click a topic to see its questions and the podcast quotes behind them'],
  trend: ['Choose a series with the three buttons below', 'Point at a line, or tap it, to read a value', 'In Top 20 topics, click a card to open the topic'],
  gap: ['Pick a period, and a research field if you like', 'Rank the list by podcasts, papers or the gap, or switch to the quadrant', 'Click a topic to see its questions and papers'],
  ask: ['Pick Search or the AI assistant below', 'Enter a topic, research question or a few sentences', 'Click a topic to read its questions, podcast quotes and papers'],
  assess: ['Pick Search or the AI assistant below', 'Connect your model and enter one research question in English', 'Read the assessment and inspect its supporting quotes and papers']};
function paintHowto(key) { $('#howto').innerHTML = HOWTO[key].map((x, i) => `<li><b>${i + 1}</b>${x}</li>`).join(''); }
function setCopy(key) { const c = COPY[key]; $('#boardEyebrow').textContent = c[0]; $('#boardTitle').innerHTML = c[1]; $('#boardCopy').innerHTML = c[2].replace('{topics}', state.meta ? fmt(state.meta.topics) : '');
  paintHowto(key === 'academic' ? (state.view === 'trend' ? 'trend' : 'map') : key === 'ask' && window.askMode?.() === 'assess' ? 'assess' : key); $('#howto').hidden = false; enter($('.intro')); }
function setBoard(b) {
  state.board = b; $$('.rail-btn').forEach(x => x.classList.toggle('active', x.dataset.board === b)); moveRailIndicator();
  $('#timeLens').hidden = b === 'ask' || (b === 'map' && state.view === 'trend'); $('#scopeRow').hidden = b !== 'map'; $('#workspace').hidden = b !== 'map'; $('#gapBoard').hidden = b !== 'gap'; $('#askBoard').hidden = b !== 'ask';
  const host = b === 'gap' ? $('#gapLayout') : $('#workspace'); const d = $('#detail'); if (d.parentElement !== host) host.appendChild(d);
  setCopy(b === 'map' ? state.lens : b); enter(b === 'map' ? $('#workspace') : b === 'gap' ? $('#gapBoard') : $('#askBoard'));
  closeDetail(true);
  if (b === 'map') { state.theme = 'all'; fillThemeSelect(); renderTime(); transitionMap(); renderList(); }
  if (b === 'gap') { renderTime(); fillRankTheme(); renderRank(); }
  if (b === 'ask') askStatus();
}
function enter(el) { if (!el || reduceMotion()) return; el.classList.remove('board-enter'); void el.offsetWidth; el.classList.add('board-enter'); el.addEventListener('animationend', () => el.classList.remove('board-enter'), {once: true}); }
function moveRailIndicator() { const b = $('.rail-btn.active'), ind = $('#railIndicator'); if (!b || !ind) return; ind.style.top = (b.offsetTop + (b.offsetHeight - 40) / 2) + 'px'; ind.style.opacity = 1; }
function applyTheme(light, save = true) {
  document.documentElement.dataset.theme = light ? 'light' : 'dark'; $('#themeLabel').textContent = light ? 'Dark' : 'Light'; $('meta[name=theme-color]').content = light ? '#ffffff' : '#000000';
  if (save) { try { localStorage.setItem('atlasTheme3', light ? 'light' : 'dark'); } catch (e) {} }
  if (state.meta) { state.zoom = 1; state.tx = 0; state.ty = 0; $('#zoomReset').textContent = 'Fit'; renderMap({animate: true}); renderList(); if (state.board === 'gap') renderRank(); }
}
function fillThemeSelect() {
  const sel = $('#themeSelect'), items = state.meta.labels;
  sel.innerHTML = `<option value="all">All fields (${fmt(state.topics.length)} topics)</option>` + items.map(it => `<option value="${it.id}">${esc(it.name)} (${state.topics.filter(t => t.labels[it.id] != null).length} topics)</option>`).join('');
  sel.value = state.theme; updateScopeNote();
}
function updateScopeNote() {
  const it = state.meta.labels.find(x => x.id === state.theme);
  $('#scopeNote').textContent = it ? (it.definition || it.description || '') : 'Pick a field to see only its topics.';
}

/* ---------- time lens ---------- */
function renderTime() {
  const sel = $('#periodSelect'); const list = periodsOfMode();
  sel.innerHTML = list.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join(''); sel.value = state.period;
  const i = list.findIndex(p => p.id === state.period); $('#prevPeriod').disabled = i <= 0; $('#nextPeriod').disabled = i >= list.length - 1;
  const po = periodObj(); $('#partialBadge').hidden = !po.partial; $('#partialBadge').textContent = po.partial ? `Data only up to ${longDate(state.meta.date_to)}` : '';
  $('#periodLab').textContent = {month: 'Month', quarter: 'Quarter', all: 'Year'}[state.mode] || 'Period'; $$('.mode-switch button').forEach(b => b.classList.toggle('selected', b.dataset.mode === state.mode));
  $$('.heat-switch button').forEach(b => b.classList.toggle('selected', b.dataset.heat === state.heat));
  const months = periodMonths();
  $('#periodEpisodes').textContent = fmt(months.reduce((s, mi) => s + state.monthTotals[mi], 0));
  const sel_t = state.selected ? state.byId[state.selected] : null;
  const vals = state.meta.months.map((mo, mi) => sel_t ? heatOf(sel_t, mo) : state.monthTotals[mi]); const mx = Math.max(1, ...vals);
  const prevH = state.timeHeights || {}; const nextH = {};
  const unit = sel_t ? (state.heat === 'n' ? 'episodes' : 'audience points') : 'podcasts';
  $('#barsCap').textContent = sel_t ? `${unit.charAt(0).toUpperCase() + unit.slice(1)} per month on “${sel_t.name}”. Click a month to show it.` : 'Podcasts per month. Click a month to show it.';
  $('#timeMonths').innerHTML = state.meta.months.map(mo => `<b>${shortMonth(mo)}</b>`).join('');
  $('#timeBars').innerHTML = state.meta.months.map((mo, mi) => { nextH[mo] = Math.max(2, 100 * vals[mi] / mx); const lab = (state.meta.periods.find(p => p.id === mo) || {}).label || mo; return `<button data-month="${mo}" class="${months.includes(mi) ? 'selected' : ''}" title="${esc(lab)}: ${fmt(vals[mi])} ${unit}" aria-label="Show ${esc(lab)}"><i style="height:${prevH[mo] ?? nextH[mo]}%"></i></button>`; }).join('');
  state.timeHeights = nextH; requestAnimationFrame(() => $$('#timeBars button').forEach(b => b.firstChild.style.height = nextH[b.dataset.month] + '%'));
  $$('#timeBars button').forEach(b => b.onclick = () => { state.mode = 'month'; choosePeriod(b.dataset.month); });
}
function choosePeriod(id) {
  state.period = id; renderTime();
  if (state.board === 'gap') { renderRank(); if (state.selected) renderDetail(); return; }
  renderList(); if (state.selected) renderDetail(); transitionMap();
}

/* ---------- map: geometry and camera ---------- */
function mapGeom() { const c = $('#pointCloud'); const W = c.clientWidth, H = c.clientHeight; const pad = 24; return {W, H, pad, sx: (W - 2 * pad) / 65535, sy: (H - 2 * pad) / 65535, ox: pad, oy: pad}; }
function toScreen(qx, qy, g) { const x = g.ox + qx * g.sx, y = g.oy + (65535 - qy) * g.sy; return [g.W / 2 + (x - g.W / 2) * state.zoom + state.tx, g.H / 2 + (y - g.H / 2) * state.zoom + state.ty]; }
function topicQ(t) { return densityQ(t); } // densityQ: app2.js
function topicScreen(t, g) { const [qx, qy] = topicQ(t); return toScreen(qx, qy, g); }
function animateCamera(target, ms = 650) {
  const from = {zoom: state.zoom, tx: state.tx, ty: state.ty}; const t0 = performance.now(); if (state.camAnim) cancelAnimationFrame(state.camAnim); if (reduceMotion()) ms = 0;
  const step = now => { const p = ms ? Math.min(1, (now - t0) / ms) : 1, e = 1 - Math.pow(1 - p, 3);
    state.zoom = from.zoom + (target.zoom - from.zoom) * e; state.tx = from.tx + (target.tx - from.tx) * e; state.ty = from.ty + (target.ty - from.ty) * e; $('#zoomReset').textContent = state.zoom === 1 && !state.tx && !state.ty ? 'Fit' : Math.round(state.zoom * 100) + '%';
    if (p < 1) { renderMap({quick: true}); state.camAnim = requestAnimationFrame(step); } else { state.camAnim = null; renderMap({animate: true}); } };
  $('#labelLayer').classList.add('moving'); state.camAnim = requestAnimationFrame(step);
}
function flyTo(t, zoom = Math.max(state.zoom, 2.4)) {
  const g = mapGeom(); const [qx, qy] = topicQ(t); const bx = g.ox + qx * g.sx, by = g.oy + (65535 - qy) * g.sy; animateCamera({zoom, tx: -(bx - g.W / 2) * zoom, ty: -(by - g.H / 2) * zoom}); }
function flyHome() { if (state.zoom === 1 && state.tx === 0 && state.ty === 0) return; animateCamera({zoom: 1, tx: 0, ty: 0}); }
