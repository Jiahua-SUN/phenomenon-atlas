/* Phenomenon Atlas v2 — home page (board 00), Swiss template (2026-10-23), light and dark mode. Self-contained: it wraps setBoard() so
   the first view after loading is the home page, keeps the mode button label in step and rewrites the footer note.
   Data are live: the latest full month (meta.last_full_month), heat = distinct episodes. Loaded after app*.js. */
'use strict';
(function () {
  // entry cards (UI round 2026-10-24): the whole card is a button; titles say what the board does, not a question
  const PARTS = [['map', 'Map', 'See which topics were discussed most in podcasts each month, grouped by research field.', 'Open the map →'],
                 ['gap', 'Gap', 'Compare how often a topic comes up in podcasts with how many journal papers study it.', 'Compare practice and research →'],
                 ['ask', 'Ask', 'Find the topics closest to what you are interested in, or ask the AI assistant for a judgment on one question.', 'Ask a question →']];
  const LEGAL = [['Third-party material', 'Podcast transcripts and quotations remain the property of their creators and publishers; the atlas shows short, attributed excerpts for non-commercial academic research and commentary, and full transcripts are accessible only inside the authors’ research environment. Article titles, abstracts and bibliographic records remain the property of their publishers (Academy of Management; SAGE Publications; Wiley on behalf of the Strategic Management Society; INFORMS). Audience figures are retrieved through the YouTube Data API.'],
                 ['Machine-generated content', 'Topic names, problem statements, core questions and assessments are produced with language models and checked against verbatim quotes, but may contain errors; they are not statements by the podcast guests or by the authors of the cited articles.'],
                 ['Corrections and removal', 'Rights holders who wish material to be corrected or removed may contact the authors.']];

  // ---------- board switching: the home page is board 'home'; the first board request after loading opens it instead of the map
  const baseSetBoard = window.setBoard; let shown = false;
  window.setBoard = function (b) {
    label();
    if ((!shown && b === 'map' && state.meta) || b === 'home') { shown = true; showHome(); return; }
    shown = true; document.body.classList.remove('on-home'); $('#homeBoard').hidden = true; $('.intro').hidden = false; $('#howto').hidden = false; baseSetBoard(b);
  };
  function showHome() {
    state.board = 'home'; $$('.rail-btn').forEach(x => x.classList.toggle('active', x.dataset.board === 'home'));
    ['#timeLens', '#scopeRow', '#workspace', '#gapBoard', '#askBoard', '#howto'].forEach(s => { const e = $(s); if (e) e.hidden = true; }); $('.intro').hidden = true;
    if (typeof closeDetail === 'function') closeDetail(true);
    const h = $('#homeBoard'); h.hidden = false; document.body.classList.add('on-home'); renderHome(); enter(h); window.scrollTo(0, 0); fixFooter();   // on-home: the page fills the screen, notice and footer at the bottom
  }
  // a top-10 topic: on a phone (stacked layout) its full page opens over the home page, so Back returns here (app3.js)
  const go = (b, topicId) => { if (topicId) { state.mode = 'month'; state.period = state.meta.last_full_month; if (stackedLayout()) { openTopicPage(topicId); return; } } window.setBoard(b); if (topicId) setTimeout(() => selectTopic(topicId), 60); };

  // ---------- content
  function renderHome() {
    const h = $('#homeBoard'); if (!h || !state.meta) return; const m = state.meta, M = m.last_full_month, mlabel = (m.periods.find(p => p.id === M) || {}).label || M;
    const hot = state.topics.map(t => ({t, h: (t.heat[M] || [0, 0])[0]})).sort((a, b) => b.h - a.h || b.t.episodes - a.t.episodes).slice(0, 10);
    const lo = 'blue', hi = 'red';

    // rising fastest (user 2026-10-24): largest rise on the month before, among topics raised in at least RISE_MIN episodes this month
    const RISE_MIN = 20, P = m.months[m.months.indexOf(M) - 1], plabel = P ? (m.periods.find(p => p.id === P) || {}).label || P : '';
    const rise = P ? state.topics.map(t => ({t, a: (t.heat[P] || [0, 0])[0], h: (t.heat[M] || [0, 0])[0]})).filter(x => x.h >= RISE_MIN && x.a > 0).map(x => ({...x, c: (x.h - x.a) / x.a})).sort((x, y) => y.c - x.c || y.h - x.h).slice(0, 10) : [];
    const pshort = P ? plabel.replace(/ \d{4}$/, '') : '';   // "August"
    const row = (x, i) => `<li><button type="button" data-topic="${x.t.id}"><span class="hn">${String(i + 1).padStart(2, '0')}</span><span class="ht">${esc(x.t.name)}</span><span class="hv">${fmt(x.h)}${P ? `<small>${fmt((x.t.heat[P] || [0, 0])[0])} in ${esc(pshort)}</small>` : ''}</span></button></li>`;
    const rrow = (x, i) => `<li><button type="button" data-topic="${x.t.id}"><span class="hn">${String(i + 1).padStart(2, '0')}</span><span class="ht">${esc(x.t.name)}</span><span class="hv">▲ +${Math.round(100 * x.c)}%<small>${fmt(x.a)} → ${fmt(x.h)}</small></span></button></li>`;
    const hd = (a, b) => `<li class="hhead"><span></span><span class="k">${a}</span><span class="k">${b}</span></li>`;
    h.innerHTML = `<div class="home-wrap">
      <section class="home-top">
        <h1 class="mega">Phenomenon<br>Atlas</h1>
        <div class="home-side"><i class="red-sq" aria-hidden="true"></i>
          <p class="home-sub">A survey of what practitioners talk about, month by month, and of what three decades of research have said about it.</p>
          <button type="button" class="text-btn home-tour" data-act="tour">New here? Take the tour →</button></div>
      </section>
      <section class="home-nums">
        <div class="num">${fmt(m.episodes)}<small>Podcasts</small></div><div class="num">${fmt(m.topics)}<small>Topics</small></div><div class="num" title="AMJ, AMR, ASQ, SMJ, OS and JOM in issues from 1996 to 2026, the strategy departments of Management Science from 2003, and papers added in 2026">${fmt(PAPER_LIBRARY)}<small>Papers</small></div>
        <div class="home-specw"><canvas class="home-spec" id="homeSpec" aria-label="All topics of the month from the coldest to the hottest"></canvas><i class="home-specmark" id="homeSpecMark" hidden></i><div class="home-spectip" id="homeSpecTip" hidden></div><div class="home-speclab">Each line is one topic in ${esc(mlabel)}, from the least discussed in podcasts (${lo}) to the most discussed (${hi}). Taller lines had more episodes. Point at a line, or tap it, to see its topic.</div></div>
      </section>
      <section class="home-parts">${PARTS.map(([b, k, p, go], i) => `<button type="button" class="home-part" data-go="${b}"><span class="n">${String(i + 1).padStart(2, '0')}</span><h3>${k}</h3><p>${p}</p><span class="go">${go}</span></button>`).join('')}</section>
      <section class="home-lists">
        <div class="home-list"><h2>Most discussed in podcasts, ${esc(mlabel)}</h2><p class="home-list-sub">The ten topics raised in the most podcast episodes. Click one to open it.</p><ol>${hd('Topic', 'Episodes')}${hot.map(row).join('')}</ol></div>
        ${rise.length ? `<div class="home-list"><h2>Rising fastest in podcasts, ${esc(mlabel)}</h2><p class="home-list-sub">The largest rise on ${esc(plabel)}, among topics raised in at least ${RISE_MIN} episodes in ${esc(mlabel)}. Click one to open it.</p><ol>${hd('Topic', 'Change in episodes')}${rise.map(rrow).join('')}</ol></div>` : ''}</section>
      <section class="home-notice">${LEGAL.map(([k, v]) => `<p><b>${k}.</b> ${v}</p>`).join('')}<p><button type="button" class="text-btn" data-act="method">How the atlas was built →</button></p></section>
    </div>`;
    const cv = h.querySelector('#homeSpec'); if (cv) { drawSpec(cv, M); bindSpec(cv, mlabel); } // drawn at once (reading clientWidth lays the page out), so it also appears in a background tab
    h.querySelectorAll('[data-go]').forEach(e => { e.onclick = () => go(e.dataset.go); });
    h.querySelectorAll('[data-topic]').forEach(e => e.onclick = () => go('map', e.dataset.topic));
    h.querySelector('[data-act=method]').onclick = () => openMethod();
    h.querySelector('[data-act=tour]').onclick = () => window.atlasTour && atlasTour.start();   // tour.js
  }
  // the month in one line: every topic from the coldest to the hottest; height = distinct episodes (square root), colour = heat rank
  function drawSpec(cv, M) {
    const r = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return; cv.width = W * r; cv.height = H * r; const x = cv.getContext('2d'); x.setTransform(r, 0, 0, r, 0, 0);
    const v = state.topics.map(t => [(t.heat[M] || [0, 0])[0], t.episodes, t]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); const n = v.length, mx = Math.max(1, ...v.map(a => a[0])), bw = W / n;
    v.forEach(([hh], i) => { const bh = 3 + (H - 5) * Math.sqrt(hh / mx), c = colorRGB(i / (n - 1)); x.fillStyle = `rgb(${c})`; x.fillRect(i * bw, H - bh, Math.max(.6, bw * .9), bh); });
    cv._spec = {v, bw};   // for bindSpec: which topic sits under the pointer
  }
  // pointing at (or tapping) a line shows its topic, its episodes in the month and a marker on the line (user 2026-10-25)
  function bindSpec(cv, mlabel) {
    const tip = $('#homeSpecTip'), mark = $('#homeSpecMark'); if (!tip || !mark) return;
    const show = e => { const s = cv._spec; if (!s || !s.v.length) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      const i = Math.max(0, Math.min(s.v.length - 1, Math.floor(x / s.bw))), [hh, , t] = s.v[i];
      tip.innerHTML = `<b>${esc(t.name)}</b>${fmt(hh)} episodes in ${esc(mlabel)}`; tip.hidden = false; mark.hidden = false;
      const left = cv.offsetLeft + (i + .5) * s.bw; mark.style.left = left + 'px'; mark.style.top = cv.offsetTop + 'px'; mark.style.height = cv.offsetHeight + 'px';
      tip.style.left = Math.max(0, Math.min(cv.offsetLeft + cv.offsetWidth - tip.offsetWidth, left - tip.offsetWidth / 2)) + 'px'; tip.style.top = (cv.offsetTop - tip.offsetHeight - 8) + 'px'; };
    const hide = () => { tip.hidden = true; mark.hidden = true; };
    cv.addEventListener('pointermove', show); cv.addEventListener('pointerdown', show); cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
    document.addEventListener('pointerdown', e => { if (e.target !== cv) hide(); });
  }
  // footer: no show count, plus the copyright line on every board
  function fixFooter() { const f = $('#footNote'), m = state.meta; if (!f || !m || f.dataset.home) return; f.dataset.home = '1';
    f.textContent = footText(m); }   // footText: app.js
  // mode button label and a fresh home page when the mode changes
  const label = () => { const e = $('#themeLabel'); if (e) e.textContent = isLight() ? 'Dark' : 'Light'; };
  new MutationObserver(() => { label(); if (state.board === 'home') renderHome(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  window.addEventListener('resize', () => { const cv = $('#homeSpec'); if (cv && state.board === 'home') drawSpec(cv, state.meta.last_full_month); });
  document.addEventListener('DOMContentLoaded', label); setTimeout(label, 0);
  if (state.meta && !shown) { shown = true; showHome(); }
})();
