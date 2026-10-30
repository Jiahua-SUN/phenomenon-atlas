/* Phenomenon Atlas v2 — part 2c: the Squares view of the map board (user decision 2026-10-24: option A of the UI preview, plus the
   change on the previous period). It replaces the canvas Column ledger. One row per research field (business themes left the site 2026-10-25) holding every
   topic that belongs to it, so a topic can sit in several rows. One square per topic, from the topic of the row least discussed in podcasts (left)
   to the most discussed (right); colour = eight steps from blue through light blue and light red to red by the topic's rank among all squares shown. Under a field a
   topic counts only its episodes whose problems carry the field (labelHeat), as on the map. Row figures come from data/row_heat.json
   (p7a_export_row_heat.py): distinct episodes over the row's topics, so an episode raising several of them counts once. The change on
   the previous month or quarter is shown only when both are complete: the last month and quarter are partial (data to date_to), the
   first have nothing before them, and the whole year has no comparison. Others is always the last row. */
'use strict';
// eight steps, least to most discussed: blue, light blue, light red, red (user 2026-10-25); OKLCH, even lightness per side, neighbours
// at least 10 apart in OKLab (x100) in light mode and 9.8 in dark mode
const SQ_RAMP = ['#204ca4', '#4c75c3', '#7e9fda', '#b4c8ec', '#f7c7c1', '#f98f84', '#ed4f47', '#c7181d'], SQ_RAMP_D = ['#2c5dbd', '#5684da', '#88abea', '#b9cff6', '#facac4', '#fb988d', '#f96055', '#e62428'];
const sqLum = hx => { const c = [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const sqInk = hx => { const L = sqLum(hx); return (L + .05) / .0556 > 1.05 / (L + .05) ? '#111' : '#fff'; };   // black or white text, whichever contrasts more
const sqRamp = () => isLight() ? SQ_RAMP : SQ_RAMP_D;
state.sqSort = 'ep';
function sqPrev(p) { if (!p || p.mode === 'all') return null; const l = state.meta.periods.filter(x => x.mode === p.mode), i = l.indexOf(p); return i > 0 ? l[i - 1] : null; }
const sqCanCompare = p => !!p && !p.partial && sqPrev(p) != null;
const sqPct = (a, b) => b ? Math.round(100 * (a - b) / b) : null;
const sqSigned = c => (c > 0 ? '+' : c < 0 ? '−' : '') + Math.abs(c) + '%';
const sqArrow = c => c > 0 ? '▲ ' : c < 0 ? '▼ ' : '';
const sqShort = p => p.mode === 'month' ? p.label.replace(/ \d{4}$/, '') : p.label.replace(/^\d{4} /, '');   // "August", "Q2"
const sqDateTo = () => { const d = new Date(state.meta.date_to + 'T00:00:00'); return d.getDate() + ' ' + d.toLocaleString('en-US', {month: 'long'}); };
const sqVal = h => h ? (state.heat === 'n' ? h[0] : h[1]) : 0;
function sqTopicHeat(t, key, pid) { return sqVal(state.lens === 'academic' && key !== 'others' && t.labelHeat && t.labelHeat[key] ? t.labelHeat[key][pid] : t.heat[pid]); }

function renderSquares() {
  const panel = $('#squaresPanel'); if (state.view !== 'squares' || state.board !== 'map' || !panel || !state.rowHeat) return;
  hideSqTip(); const cur = periodObj(), prev = sqPrev(cur), ok = sqCanCompare(cur), R = sqRamp(), acad = state.lens === 'academic';
  const items = acad ? state.meta.labels : state.meta.themes, field = acad ? 'labels' : 'themes', RH = state.rowHeat.rows[state.lens];
  const unit = state.heat === 'n' ? 'episodes' : 'audience points', noun = acad ? 'field' : 'theme', single = state.theme !== 'all';
  const q = state.search.trim().toLowerCase(), match = t => !q || (t.name + ' ' + t.description).toLowerCase().includes(q);
  if (!ok && state.sqSort === 'chg') state.sqSort = 'ep';
  const rows = items.filter(it => !single || it.id === state.theme).map(it => {
    const k = it.id, e = sqVal(RH[k][cur.id]), pe = prev ? sqVal(RH[k][prev.id]) : null;
    const ts = state.topics.filter(t => t[field][k] != null).map(t => ({t, h: sqTopicHeat(t, k, cur.id), hp: prev ? sqTopicHeat(t, k, prev.id) : null}));
    return {k, name: it.name, n: ts.length, e, c: ok ? sqPct(e, pe) : null, ts: ts.sort((a, b) => a.h - b.h || a.t.episodes - b.t.episodes)}; });
  rows.sort((x, y) => ((x.k === 'others') - (y.k === 'others')) || (state.sqSort === 'chg' && ok ? (y.c - x.c) || (y.e - x.e) : y.e - x.e));   // Others always last
  // colour: rank of the square among all squares shown (five equal steps)
  const all = rows.flatMap(r => r.ts.map(s => s.h)).sort((a, b) => a - b), N = all.length;
  const step = v => { let lo = 0, hi = N; while (lo < hi) { const m = (lo + hi) >> 1; all[m] < v ? lo = m + 1 : hi = m; } return Math.min(R.length - 1, Math.floor(R.length * lo / Math.max(1, N))); };
  // layout (user 2026-10-24: less empty space on the right, figures at the right end): the squares fill the width between the name
  // column and the figures. All rows share one number of lines, so a row's length is proportional to its number of topics and the
  // longest row reaches the figures; lines are added until the squares are at least 9 px. One row alone gets 16 px squares.
  // phone = the CSS breakpoint (rows stacked); compact = a narrow board on a wide screen (e.g. a wide side panel): the figures go under
  // the name so the squares keep their room
  const phone = matchMedia('(max-width: 700px)').matches, compact = !phone && panel.clientWidth < 900;
  const NAME = compact ? 200 : 240, STATS = compact ? 0 : (ok ? 250 : 170), GAP = 16;
  const avail = Math.max(120, panel.clientWidth - (phone ? 0 : NAME + GAP + (STATS ? STATS + GAP : 0)));
  const maxN = Math.max(1, ...rows.map(r => r.n)), fit = (L, G) => Math.floor((avail + G) / Math.ceil(maxN / L)) - G; let S, G, L;
  if (single) { G = 3; S = 16; L = Math.max(1, Math.ceil(maxN / Math.max(8, Math.floor((avail + G) / (S + G))))); }
  else { G = 2; L = 1; S = fit(L, G); while (S < 9 && L < 40) S = fit(++L, G); S = Math.max(4, Math.min(16, S)); }
  const Unit = unit.charAt(0).toUpperCase() + unit.slice(1);
  const tot = state.rowHeat.total, tv = sqVal(tot[cur.id]), grew = rows.filter(r => r.c > 0).length;
  const overall = ok ? `All podcasts together: ${fmt(tv)} ${unit} in ${esc(cur.label)}, ${sqSigned(sqPct(tv, sqVal(tot[prev.id])))} compared with ${esc(prev.label)}.${single ? '' : ` ${grew === 0 ? 'None' : grew === rows.length ? 'All' : grew} of the ${rows.length} ${noun}s grew.`}`
    : cur.mode === 'all' ? `This is the whole year, so there is no earlier period to compare with.`
    : cur.partial ? `${esc(cur.label)} is not complete (data up to ${sqDateTo()}), so no comparison with ${esc(prev.label)} is shown.`
    : `${esc(cur.label)} is the first ${cur.mode} in the data, so there is no earlier ${cur.mode} to compare with.`;
  const nMatch = q ? new Set(rows.flatMap(r => r.ts.filter(s => match(s.t)).map(s => s.t.id))).size : 0;
  // one field alone (user 2026-10-25): named tiles, most discussed first; sqFitTiles sizes them to fill the width and one screen's height
  const tiles = single && rows[0] ? (r => `<div class="sq-tilehead"><button class="sq-name" data-key="${r.k}" title="Back to all ${noun}s"><span class="nm">${esc(r.name)}</span></button>
      <div class="sq-tilestats">${ok ? `<span><b>${r.c != null ? sqArrow(r.c) + sqSigned(r.c) : '—'}</b> vs ${esc(sqShort(prev))}</span>` : ''}<span><b>${fmt(r.e)}</b> ${unit}</span><span><b>${r.n}</b> topics</span></div></div>
    <div class="sq-tiles" id="sqTiles">${r.ts.slice().reverse().map(s => { const k = step(s.h); return `<button type="button" class="sq-tile${q ? (match(s.t) ? ' hit' : ' dim') : ''}" data-id="${s.t.id}" data-h="${s.h}" data-hp="${s.hp ?? ''}" style="background:${R[k]};color:${sqInk(R[k])}"><span>${esc(s.t.name)}</span></button>`; }).join('')}</div>`)(rows[0]) : '';
  panel.innerHTML = `<div class="sq-head">
    ${single ? `<button class="sq-back" data-act="all">← All ${noun}s</button>` : `<div class="ctl"><span class="lab">Sort rows by</span><div class="sq-sort tg" role="group" aria-label="Sort rows by"><button data-s="ep" class="${state.sqSort === 'ep' ? 'selected' : ''}">Most ${unit}</button><button data-s="chg" class="${state.sqSort === 'chg' ? 'selected' : ''}" ${ok ? '' : `disabled title="Only when ${esc(cur.label)} can be compared with the period before"`}>Biggest rise</button></div></div>`}</div>
    <p class="sq-intro">${single ? `Each tile is one topic of this ${noun}, from the most discussed in podcasts (top left) to the least discussed. Hover a tile to see its numbers and click it to open the topic. Click the ${noun} name to go back to all ${noun}s.` : `Each square is one topic, from the least discussed in podcasts on the left to the most discussed on the right. Hover a square to see the topic and click it to open it. Click a ${noun} name to show only that ${noun}.`}${acad ? ' Under a field, a topic counts only the episodes whose problems carry that field.' : ''}</p>
    <p class="sq-overall">${overall}</p>
    <div class="sq-legend"><span>${unit.charAt(0).toUpperCase() + unit.slice(1)} in ${esc(cur.label)}${cur.partial && cur.mode !== 'all' ? ` (to ${sqDateTo()})` : ''}:</span><span>fewer</span><span class="ramp">${R.map(c => `<i style="background:${c}"></i>`).join('')}</span><span>more</span>${q ? `<span class="sq-match">${nMatch} topic${nMatch === 1 ? '' : 's'} match “${esc(state.search.trim())}”, the others are faded</span>` : ''}</div>
    ${single ? tiles : `<div class="sq-rows${single ? ' single' : ''}${ok ? '' : ' nochg'}${compact ? ' compact' : ''}" style="--stats:${STATS}px">
      <div class="sq-row sq-headrow"><span></span><span class="lab">Topics in each ${noun}, from the least to the most discussed in podcasts →</span><div class="sq-stats lab">${ok ? `<span>vs ${esc(sqShort(prev))}</span>` : ''}<span>${Unit}</span><span>Topics</span></div></div>
      ${rows.map(r => `<div class="sq-row"><button class="sq-name" data-key="${r.k}" title="${single ? `Back to all ${noun}s` : `Show only this ${noun}`}"><span class="nm">${esc(r.name)}</span></button>
        <div class="sq-cells" style="grid-template-rows:repeat(${L},${S}px);grid-auto-columns:${S}px;gap:${G}px">${r.ts.map(s => `<i data-id="${s.t.id}" data-h="${s.h}" data-hp="${s.hp ?? ''}" class="${state.selected === s.t.id ? 'sel' : ''}${q ? (match(s.t) ? ' hit' : ' dim') : ''}" style="background:${R[step(s.h)]}"></i>`).join('')}</div>
        <div class="sq-stats">${ok ? `<span class="chg">${r.c != null ? sqArrow(r.c) + sqSigned(r.c) : '—'}<small> vs ${esc(sqShort(prev))}</small></span>` : ''}<span>${fmt(r.e)}<small> ${unit}</small></span><span>${r.n}<small> topics</small></span></div></div>`).join('')}</div>`}`;
  if (single) sqFitTiles();
  bindSquares();
}
// tile grid of one field (user 2026-10-25): a tile must hold a 60-character topic name (99% of names are 59 or fewer) at the base text
// size, so it is at least 150 px wide (110 on a phone) and tall enough for the lines that name needs. Among the column counts whose grid
// then fits one screen below the sticky header, the one with the largest tiles wins, so a small field fills the screen; when none fits
// (a large field), the grid takes the most columns and scrolls. Text size and lines follow the tile.
function sqFitTiles() {
  const g = $('#sqTiles'); if (!g || !g.children.length) return; const n = g.children.length, W = g.clientWidth; if (!W) return;
  const phone = W < 600, head = ($('.sw-head') || {offsetHeight: 0}).offsetHeight, H = Math.max(320, innerHeight - head - 28);
  const G = phone ? 4 : 6, MINW = phone ? 110 : 150, FS0 = phone ? 12 : 12.5, CH = 60;
  const lines = (w, fs) => Math.ceil(CH / Math.max(8, (w - 1.2 * fs) / (0.55 * fs)));   // lines a CH-character name needs (Inter: ~0.55 em a character)
  const needH = (w, fs) => lines(w, fs) * 1.25 * fs + 0.9 * fs + 2;
  let best = null, cmax = 1;
  for (let c = 1; c <= n; c++) {
    const w = (W - (c - 1) * G) / c; if (c > 1 && w < MINW) break; cmax = c;
    const r = Math.ceil(n / c), hFill = (H - (r - 1) * G) / r, h = Math.min(hFill, .75 * w);
    if (h >= needH(w, FS0)) { const sc = Math.min(w, 2.2 * h); if (!best || sc > best.sc) best = {c, w, h, sc}; }
  }
  if (!best) { const w = (W - (cmax - 1) * G) / cmax; best = {c: cmax, w, h: needH(w, FS0)}; }   // too many topics for one screen: scroll
  let fs = Math.min(17, best.w / 11); while (fs > FS0 && needH(best.w, fs) > best.h) fs -= .25;   // the largest text at which a CH-character name still fits
  fs = Math.max(FS0, fs);
  g.style.gridTemplateColumns = `repeat(${best.c}, minmax(0, 1fr))`; g.style.gridAutoRows = Math.round(best.h) + 'px'; g.style.gap = G + 'px'; g.style.fontSize = fs.toFixed(1) + 'px';
  g.style.setProperty('--lines', Math.max(1, Math.floor((best.h - .9 * fs) / (1.25 * fs) + 1e-6)));   // + 1e-6: 3.0 must not round down to 2
}
function hideSqTip() { const tip = $('#sqTip'); if (tip) tip.hidden = true; }
function bindSquares() {
  if (state.sqBound) return; state.sqBound = true; const panel = $('#squaresPanel'), tip = $('#sqTip');
  panel.addEventListener('mousemove', e => { const i = e.target.closest('.sq-cells i, .sq-tile'); if (!i) { hideSqTip(); return; }
    const t = state.byId[i.dataset.id], cur = periodObj(), prev = sqPrev(cur), ok = sqCanCompare(cur), h = +i.dataset.h, hp = +i.dataset.hp, unit = state.heat === 'n' ? 'episodes' : 'audience points';
    let s = `<strong>${esc(t.name)}</strong>${fmt(h)} ${unit} in ${esc(cur.label)}`;
    if (ok) s += `<br>${fmt(hp)} in ${esc(prev.label)}` + (hp ? ` (${sqArrow(sqPct(h, hp))}${sqSigned(sqPct(h, hp))})` : '');
    tip.innerHTML = s; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - 320) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; });
  panel.addEventListener('mouseleave', hideSqTip);
  panel.addEventListener('click', e => {
    const i = e.target.closest('.sq-cells i, .sq-tile'); if (i) { selectTopic(i.dataset.id); return; }
    const sb = e.target.closest('.sq-sort button'); if (sb) { if (!sb.disabled) { state.sqSort = sb.dataset.s; renderSquares(); } return; }
    const nb = e.target.closest('.sq-name, .sq-back'); if (!nb) return;
    state.theme = state.theme === 'all' && nb.dataset.key ? nb.dataset.key : 'all'; $('#themeSelect').value = state.theme; updateScopeNote(); closeDetail(true);   // closeDetail redraws the squares
    if (panel.getBoundingClientRect().top < 60) window.scrollTo({top: window.scrollY + panel.getBoundingClientRect().top - 140, behavior: reduceMotion() ? 'auto' : 'smooth'}); });
}
