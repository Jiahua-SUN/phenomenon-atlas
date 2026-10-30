/* Trend cards: monthly distinct episodes by field, top topics, and papers by issue year. */
'use strict';
let TREND = null, trendLoad = null;
function loadTrend() { return trendLoad || (trendLoad = fetch('data/trend.json?v=tr3').then(r => r.json()).then(j => { TREND = j; return j; })); }
const trMonth = (m, len = 'short') => new Date(m + '-01T00:00:00').toLocaleString('en-US', {month: len});

// one card: rank, name, note (right), big latest value with its unit and the change since the first point, area line, axis
function trCard({rank, title, note, vals, xs, xl, unit, max, cold, on, top, topic}) {
  const W = 300, H = 64, n = vals.length, X = i => n > 1 ? i * W / (n - 1) : W / 2, Y = v => H - (max ? v / max : 0) * H;
  const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), last = vals[n - 1], d = last - vals[0];
  const ch = d > 0 ? `▲ ${fmt(d)}` : d < 0 ? `▼ ${fmt(-d)}` : '= 0';
  const axis = n > 12 ? [0, Math.floor((n - 1) / 2), n - 1].map(i => `<span>${esc(xs[i])}</span>`).join('') : xs.map(x => `<span>${esc(x[0])}</span>`).join('');
  const desc = `${title}: ` + vals.map((v, i) => `${xl[i]} ${fmt(v)}`).join(', ');
  return `<div class="tr-card${top ? ' top' : ''}${on ? ' on' : ''}${topic ? ' tr-topic' : ''}" ${topic ? `data-id="${topic}" role="button" tabindex="0"` : ''}>
    <div class="tr-rankrow"><span class="tr-rank">${String(rank).padStart(2, '0')}</span><span class="tr-note">${note}</span></div>
    <div class="tr-name">${esc(title)}</div>
    <div class="tr-fig"><b data-last="${fmt(last)}">${fmt(last)}</b><span><span class="tr-unit" data-unit="${esc(unit)}">${esc(unit)}</span><br><span class="tr-ch"><em>${ch}</em> since ${esc(xl[0])}</span></span></div>
    <div class="tr-plot${cold ? ' cold' : ''}" data-v="${vals.join(',')}" data-x="${xl.join('|')}" data-max="${max}" role="img" aria-label="${esc(desc)}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><line class="tr-rule" x1="0" y1="${H}" x2="${W}" y2="${H}"/><line class="tr-rule half" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/>
        <polygon class="tr-area" points="0,${H} ${pts} ${W},${H}"/><polyline class="tr-line" points="${pts}"/></svg>
      <i class="tr-x" hidden></i><i class="tr-dot" hidden></i></div>
    <div class="tr-axis">${axis}</div></div>`;
}
function trTable(head, rows) {
  return `<details class="tr-table"><summary>Show the numbers</summary><div class="tr-tw"><table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => i ? `<td>${fmt(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function renderTrend() {
  const panel = $('#trendPanel'); if (state.view !== 'trend' || state.board !== 'map' || !panel) return;
  if (!TREND) { panel.innerHTML = '<p class="pending">Loading the charts…</p>'; loadTrend().then(renderTrend).catch(e => { panel.innerHTML = '<p class="pending">The charts could not be loaded.</p>'; console.error(e); }); return; }
  const T = TREND, pick = state.theme, series = state.trendSeries || 'episodes', labs = state.meta.labels.filter(l => l.id !== 'others');
  const ms = T.months.map(m => trMonth(m)), mL = T.months.map(m => trMonth(m, 'long')), yrs = T.years.map(String);
  const mlab = `${mL[0]} to ${mL[mL.length - 1]} 2026`, lastM = mL[mL.length - 1], lastY = yrs[yrs.length - 1];
  const peak = arr => Math.max(1, ...arr), byLast = k => (a, b) => b[k][b[k].length - 1] - a[k][a[k].length - 1] || a.name.localeCompare(b.name);
  // Use the existing Squares counts, deduplicated within each field and month.
  const f1 = labs.map(l => ({id: l.id, name: l.name, v: T.months.map(m => state.rowHeat.rows.academic[l.id][m][0])})).sort(byLast('v')), max1 = peak(f1.flatMap(x => x.v));
  const s1 = f1.map((x, i) => trCard({rank: i + 1, title: x.name, note: 'Jan to Sep 2026', vals: x.v, xs: ms, xl: mL, unit: `episodes in ${lastM}`, max: max1, on: x.id === pick, top: i < 4})).join('');
  // 2. top 20 topics of 2026 (of the picked field when one is picked), ranked by the 2026 total
  const tl = T.top[pick] || T.top.all, pname = (state.meta.labels.find(l => l.id === pick) || {}).name, max2 = peak(tl.flatMap(x => x.series));
  const s2 = tl.map((x, i) => trCard({rank: i + 1, title: state.byId[x.id].name, note: `${fmt(x.total)} in 2026`, vals: x.series, xs: ms, xl: mL, unit: `episodes in ${lastM}`, max: max2, topic: x.id, on: state.selected === x.id, top: i < 4})).join('');
  // 3. papers per issue year (the year of the journal issue, p7f), fields ranked by the last year
  const f3 = labs.map(l => ({id: l.id, name: l.name, v: T.papers[l.id]})).sort(byLast('v')), max3 = peak(f3.flatMap(x => x.v));
  const s3 = f3.map((x, i) => trCard({rank: i + 1, title: x.name, note: `${fmt(x.v.reduce((s, y) => s + y, 0))} papers in all`, vals: x.v, xs: yrs, xl: yrs, unit: `papers in ${lastY}`, max: max3, cold: true, on: x.id === pick, top: i < 4})).join('');
  panel.innerHTML = `<div class="tg tr-series" role="group" aria-label="Trend series">
      ${[['episodes', 'Episodes per research field'], ['topics', 'Top 20 topics'], ['papers', 'Papers per research field']].map(([id, title]) => `<button type="button" data-series="${id}" class="${series === id ? 'selected' : ''}" aria-pressed="${series === id}">${title}</button>`).join('')}
    </div><div class="tr-bar">
      <p class="tr-hint">All cards in a set share one scale, so their heights can be compared. Point at a line, or tap it, to read a ${series === 'papers' ? 'year' : 'month'}.${pname ? ` The field you picked, ${esc(pname)}, has a red rule.` : ''}</p></div>
    <section class="tr-sec" ${series === 'episodes' ? '' : 'hidden'}><h2>Episodes per research field</h2><p class="tr-sub">Distinct podcast episodes per month, ${esc(mlab)}. Each episode counts once per field. Fields are ranked by ${esc(lastM)}.</p>
      <div class="tr-grid">${s1}</div>${trTable(['Field', ...ms], f1.map(x => [x.name, ...x.v]))}</section>
    <section class="tr-sec" ${series === 'topics' ? '' : 'hidden'}><h2>The 20 most discussed topics of 2026${pname ? ` in ${esc(pname)}` : ''}</h2><p class="tr-sub">Podcast episodes per month, ${esc(mlab)}. The topics are ranked by episodes from 1 January to 6 October 2026${pname ? ', counting only episodes whose problems belong to the field' : ''}. Click a card to open the topic.</p>
      <div class="tr-grid">${s2}</div>${trTable(['Topic', ...ms], tl.map(x => [state.byId[x.id].name, ...x.series]))}</section>
    <section class="tr-sec" ${series === 'papers' ? '' : 'hidden'}><h2>Papers per research field</h2><p class="tr-sub">Journal papers in the index per year, 2006 to 2025, dated by the journal issue they appear in. A paper in several fields counts in each. Fields are ranked by ${esc(lastY)}.</p>
      <div class="tr-grid">${s3}</div>${trTable(['Field', ...yrs], f3.map(x => [x.name, ...x.v]))}</section>`;
  bindTrend(panel);
}
function bindTrend(panel) {
  panel.querySelectorAll('[data-series]').forEach(b => b.onclick = () => {
    state.trendSeries = b.dataset.series;
    renderTrend();
    panel.querySelector(`[data-series="${state.trendSeries}"]`).focus({preventScroll: true});
  });
  // on a touch screen a tap on the line only reads a value; a tap elsewhere on a topic card opens the topic
  let touch = false; panel.onpointerdown = e => { touch = e.pointerType === 'touch'; };
  panel.querySelectorAll('.tr-topic').forEach(c => { c.onclick = e => { if (touch && e.target.closest('.tr-plot')) return; selectTopic(c.dataset.id); };
    c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTopic(c.dataset.id); } }; });
  // pointing: nearest point, crosshair and dot (>= 8 px); the big figure shows that point's value and the unit names its month or year
  const read = (plot, clientX) => {
    const v = plot.dataset.v.split(',').map(Number), xs = plot.dataset.x.split('|'), max = +plot.dataset.max, box = plot.getBoundingClientRect(), n = v.length;
    const i = Math.max(0, Math.min(n - 1, Math.round((clientX - box.left) / box.width * (n - 1)))), x = n > 1 ? i / (n - 1) * box.width : box.width / 2, y = box.height - (max ? v[i] / max : 0) * box.height;
    const cx = plot.querySelector('.tr-x'), dot = plot.querySelector('.tr-dot'); cx.hidden = dot.hidden = false; cx.style.left = x + 'px'; dot.style.left = x + 'px'; dot.style.top = y + 'px';
    const card = plot.closest('.tr-card'), u = card.querySelector('.tr-unit');
    card.querySelector('.tr-fig b').textContent = fmt(v[i]); u.textContent = u.dataset.unit.replace(/ in .+$/, ' in ' + xs[i]); card.classList.add('reading');
  };
  const clear = plot => { const card = plot.closest('.tr-card'), b = card.querySelector('.tr-fig b'), u = card.querySelector('.tr-unit');
    plot.querySelector('.tr-x').hidden = plot.querySelector('.tr-dot').hidden = true; b.textContent = b.dataset.last; u.textContent = u.dataset.unit; card.classList.remove('reading'); };
  panel.querySelectorAll('.tr-plot').forEach(p => { p.addEventListener('pointermove', e => read(p, e.clientX)); p.addEventListener('pointerdown', e => read(p, e.clientX)); p.addEventListener('pointerleave', () => clear(p)); });
}
