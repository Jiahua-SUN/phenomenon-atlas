/* Phenomenon Atlas — guided tour (user 2026-10-24). A small card offers it once on the first visit; the home page and Method start it again.
   The tour only points. It dims the page, lights up one place and shows a moving pointer there, and the reader clicks it; clicks anywhere
   else do nothing while a step is shown. Steps that only explain have a Next button, and a step the reader cannot do can be skipped.
   On stacked layouts (phones, narrow windows) a tapped topic opens its full page, so the side-panel steps are left out there.
   Loaded after app*.js, home.js and ask.js; uses their globals (state, $, setBoard, stackedLayout, pageFromHash, hideTopicPage, closeDetail). */
'use strict';
(function () {
  const SEEN = 'atlasTour1', PAD = 6;
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = () => matchMedia('(pointer: coarse)').matches;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // a step lights up one element or a group of them (their joint box)
  const list = x => (Array.isArray(x) ? x : x ? [x] : []);
  const shown = x => list(x).length > 0 && list(x).every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const boxOf = x => { const rs = list(x).map(e => e.getBoundingClientRect()), l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), r = Math.max(...rs.map(q => q.right)), b = Math.max(...rs.map(q => q.bottom));
    return {left: l, top: t, right: r, bottom: b, width: r - l, height: b - t}; };
  const visible = e => !!e && e.getBoundingClientRect().height > 0;
  const page = () => ($('#topicPage').hidden ? null : pageFromHash());
  const pane = m => { const e = $(m === 'assess' ? '#paneAssess' : '#paneSearch'); return !!e && !e.hidden; };
  const panelOpen = () => state.selected != null && !$('#detail').hidden;
  const nav = b => `.sw-nav [data-board="${b}"]`;
  const monthLabel = () => { const m = state.meta, M = m && m.last_full_month; return ((m && m.periods.find(p => p.id === M)) || {}).label || 'the last full month'; };
  let S0 = {};   // state when a step starts, for the steps that ask the reader to change something

  // t: the place to light up; point: where the pointer taps (default: the middle of t); act: the step is done when it returns true
  // (no act: an explaining step with Next); skip: leave the step out; init: runs before the step is shown
  const STEPS = [
    {t: '.home-lists', title: 'The month at a glance', text: () => `These lists show the ten topics raised in the most podcast episodes in ${esc(monthLabel())}, and the ten that grew fastest on the month before. Any topic on them opens with a click.`},
    {t: nav('map'), title: 'Open the map', text: 'The menu at the top switches between the boards. Click Map.', act: () => state.board === 'map'},
    {t: '#mapCanvas', title: 'The map', text: 'Each name is a topic, and topics with similar problems sit close together. Red areas were discussed in many podcast episodes in the period, dark blue areas in few. Zoom in to see more names.'},
    {t: '#timeLens', point: '#prevPeriod', title: 'Pick a period', text: 'Choose Month, Quarter or Whole year, step back and forth with the arrows, or click a bar in the chart. Pick another period now.',
      act: () => state.period !== S0.period || state.mode !== S0.mode},
    {t: () => $('.heat-switch') && $('.heat-switch').closest('.ctl'), title: 'Count', text: 'Episodes counts every episode once. Audience points give each episode 0 to 2 points by its views: 1 for a typical episode, up to 2 for a widely watched one.'},
    {t: '.scope-select', title: 'Research fields', text: 'Each topic is listed under the fields of strategy research its problems concern most, out of 17, or under Others. Pick a field here to see only its topics.'},
    {t: '#viewTrend', title: 'Four views', text: 'The same topics can be shown as a map, as squares, as a list or as trends over the months. Click Trend.', act: () => state.view === 'trend'},
    {t: () => $('#trendPanel .tr-sec:not([hidden]) .tr-grid'), title: 'Trend', text: 'Use the three buttons to switch between episodes per research field, the 20 most discussed topics of 2026, and papers per research field. Each episode counts once within a field each month. Paper counts are by journal issue year. Each card shows its latest value in large type. Point at a line to read another value.'},
    {t: '#viewSquares', title: 'Squares view', text: 'Click Squares to see each field as a row of topics.', act: () => state.view === 'squares'},
    {t: () => { const r = $('#squaresPanel .sq-row:not(.sq-headrow)'); return r ? [$('#squaresPanel .sq-headrow'), r].filter(visible) : null; },
      point: () => $('#squaresPanel .sq-row:not(.sq-headrow) .sq-cells i:last-child'), title: 'Squares',
      text: 'Each row is one research field, and each square one topic, from the least discussed in podcasts on the left to the most discussed on the right. The figures for each row compare the period with the one before. Click a square to open its topic.',
      act: () => (stackedLayout() ? (page() || {}).kind === 'topic' : panelOpen())},
    {t: '.detail-tabs [data-tab="papers"]', skip: stackedLayout, title: 'The topic panel', text: 'The panel lists the topic’s core questions: problems that practitioners raise, each checked against word-for-word quotes. Click Papers to see the journal papers linked to them.',
      act: () => state.tab === 'papers'},
    {t: '#detailTitle', skip: stackedLayout, title: 'Full page', text: 'You can drag the left edge of the panel to make it wider. Click the title to open the topic as a full page.', act: () => (page() || {}).kind === 'topic'},
    {t: '#tpQuestions .q-link', title: 'One page per question', text: 'Each core question has its own page with every quote and every linked paper. Click a question.', act: () => (page() || {}).kind === 'question'},
    {t: '#topicPage .tp-grid', title: 'Quotes and papers', text: 'Every quote links to its place in the transcript and to the YouTube video. Every paper links to the article.'},
    {t: nav('gap'), title: 'The gap board', text: 'Click Gap to compare how often podcasts raise a topic with how many papers study it.', act: () => state.board === 'gap' && $('#topicPage').hidden},
    {t: '.rank-tabs [data-rtab="quad"]', title: 'List or quadrant', text: 'The list ranks the topics by podcast episodes, by papers or by the gap between the two, and shows both counts. Click Quadrant to see both counts at once.', act: () => state.rtab === 'quad'},
    {t: '#rankQuad', title: 'The quadrant', text: 'Bottom right holds topics discussed a lot in podcasts but studied little in papers. Top left holds topics well studied in papers but rarely discussed in podcasts now. A circle opens its topic when clicked.'},
    {t: nav('ask'), title: 'Ask', text: 'The last board takes your own question. Click Ask.', act: () => state.board === 'ask'},
    {t: '#paneSearch .ask-ex', init: () => { if (!pane('search')) { const c = $('.ask-card[data-mode="search"]'); if (c) c.click(); } }, title: 'Search',
      text: 'Enter a topic, research question or a few sentences to find related topics. Search needs no account. Click an example to try it.',
      act: () => shown($('#askResults')) && !!$('#tList li')},
    {t: '#tList', title: 'Topics', text: 'Each result is a topic, with its closest core question and its numbers. A topic name opens the topic’s page with its quotes and papers.'},
    {t: '.ask-card[data-mode="assess"]', title: 'AI assistant', text: 'The AI assistant helps you examine how a research question relates to practitioner concerns and existing research. It summarizes retrieved quotes and papers to support an initial assessment of the question’s potential. Click its card.',
      act: () => pane('assess')},
    {t: '#paneAssess', title: 'Using the assistant', text: 'Choose OpenAI or Claude above the question, then connect with an API key or local CLI. AI needs internet access. While it works, the Assess button becomes Stop. The same question and connection settings reuse the answer saved on this computer. Responses and paper ratings may differ across models.'},
    {t: '#helpBtn', title: 'Help on every board', text: 'Each board has this link under its title. It explains what the figures on the board mean.'},
    {t: '#methodBtn', title: 'Method', text: 'Method explains how the Atlas was built. You can take this tour again from the home page or from Method.', last: true}];

  let on = false, k = -1, cur = null, el = null, raf = 0, poll = 0, wait = 0, glideT = 0, ui = null, lastKey = '';
  function build() {
    const r = document.createElement('div'); r.className = 'tour'; r.setAttribute('aria-hidden', 'false');
    r.innerHTML = `${['t', 'b', 'l', 'r'].map(s => `<div class="tour-shade" data-s="${s}"></div>`).join('')}<div class="tour-block"></div><div class="tour-ring"></div>
      <div class="tour-hand" aria-hidden="true"><i class="tour-ripple"></i><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 2 L5 19 L9.6 15 L12.6 21.6 L15.6 20.3 L12.6 13.8 L18.5 13.6 Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" tabindex="-1"><div class="tour-top"><span class="tour-n" id="tourN"></span><button type="button" class="tour-x" id="tourEnd">End tour ✕</button></div>
        <h3 id="tourTitle"></h3><p id="tourText"></p><div class="tour-bar"><i id="tourBar"></i></div>
        <div class="tour-acts"><button type="button" class="text-btn tour-skip" id="tourSkip">Skip this step</button><span class="tour-wait" id="tourWait"></span><button type="button" class="primary-btn" id="tourNext">Next</button></div></div>`;
    r.querySelectorAll('.tour-shade, .tour-block').forEach(s => ['click', 'mousedown', 'pointerdown', 'dblclick', 'contextmenu'].forEach(ev => s.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); nudge(); })));
    document.body.appendChild(r);
    r.querySelector('#tourEnd').onclick = end; r.querySelector('#tourNext').onclick = () => (cur && cur.last ? end() : go(k + 1)); r.querySelector('#tourSkip').onclick = skip;
    return r;
  }
  // Skip this step: the tour does the click itself, so the next steps find their places (user 2026-10-25: skipping "Click Map" left the
  // tour waiting for map controls that were never shown)
  function skip() {
    if (!cur || !cur.act) { go(k + 1); return; }
    const x = pointEl(cur) || list(target(cur))[0]; clearInterval(poll);
    if (x) x.click();
    go(k + 1);
  }
  // a click outside the lit place: the card and the pointer twitch so the reader sees where to look
  function nudge() { if (!ui || reduce()) return; const c = ui.querySelector('.tour-card'); c.classList.remove('nudge'); void c.offsetWidth; c.classList.add('nudge'); }
  const target = s => { const x = typeof s.t === 'function' ? s.t() : $(s.t); return x || null; };
  const pointEl = s => { if (!s.point) return null; return typeof s.point === 'function' ? s.point() : $(s.point); };

  function go(n) {
    clearInterval(poll); clearTimeout(wait); k = n; cur = STEPS[k];
    if (!cur) { end(); return; }
    if (cur.skip && cur.skip()) { go(k + 1); return; }
    if (cur.init) cur.init();
    const t0 = Date.now(); ui.classList.add('waiting'); ui.querySelector('#tourWait').textContent = '';
    poll = setInterval(() => {   // wait until the place to light up is on screen (boards and topic files load in their own time)
      const x = target(cur);
      if (shown(x)) { clearInterval(poll); show(x); return; }
      if (Date.now() - t0 > 1500) ui.querySelector('#tourWait').textContent = 'Loading…';
      if (Date.now() - t0 > 12000) { clearInterval(poll); go(k + 1); }
    }, 100);
  }
  function show(x) {
    el = x; S0 = {period: state.period, mode: state.mode, view: state.view, tab: state.tab, rtab: state.rtab};
    ui.classList.remove('waiting'); ui.classList.toggle('acting', !!cur.act); ui.querySelector('#tourWait').textContent = '';
    const steps = STEPS.filter(s => !(s.skip && s.skip())), n = steps.indexOf(cur) + 1;
    ui.querySelector('#tourN').textContent = `Step ${n} of ${steps.length}`; ui.querySelector('#tourBar').style.width = Math.round(100 * n / steps.length) + '%';
    ui.querySelector('#tourTitle').textContent = cur.title;
    let txt = typeof cur.text === 'function' ? cur.text() : esc(cur.text); if (touch()) txt = txt.replace(/\bClick\b/g, 'Tap').replace(/\bclicked\b/g, 'tapped').replace(/\bclick\b/g, 'tap');
    ui.querySelector('#tourText').innerHTML = txt;
    ui.querySelector('#tourNext').hidden = !!cur.act; ui.querySelector('#tourNext').textContent = cur.last ? 'Finish' : 'Next'; ui.querySelector('#tourSkip').hidden = !cur.act;
    // bring the place into view below the sticky header
    const r = boxOf(x), top = (document.querySelector('.sw-head') || {getBoundingClientRect: () => ({bottom: 0})}).getBoundingClientRect().bottom + 12;
    if (!list(x)[0].closest('.sw-head') && (r.top < top || r.bottom > innerHeight - 24)) window.scrollTo({top: Math.max(0, scrollY + r.top - (r.height > innerHeight - top - 200 ? top : (innerHeight - r.height) / 2)), behavior: reduce() ? 'auto' : 'smooth'});
    ui.classList.add('glide'); clearTimeout(glideT); glideT = setTimeout(() => ui && ui.classList.remove('glide'), 450);
    const card = ui.querySelector('.tour-card'); card.classList.remove('enter'); void card.offsetWidth; card.classList.add('enter');
    (cur.act ? card : ui.querySelector('#tourNext')).focus({preventScroll: true});
    if (cur.act) poll = setInterval(() => { if (cur && cur.act()) { clearInterval(poll); ui.classList.add('done'); wait = setTimeout(() => { ui && ui.classList.remove('done'); go(k + 1); }, 420); } }, 120);
  }
  // every frame: the lit place, the shades around it, the pointer and the card follow the target (scrolling, layout changes)
  function frame() {
    raf = requestAnimationFrame(frame); if (!el || !ui || ui.classList.contains('waiting')) return;
    if (!list(el).every(e => e.isConnected)) { const x = target(cur); if (!shown(x)) return; el = x; }   // the board drew the place again (new period, filter)
    const W = innerWidth, H = innerHeight, b = boxOf(el);
    const r = {l: Math.max(0, b.left - PAD), t: Math.max(0, b.top - PAD), r: Math.min(W, b.right + PAD), b: Math.min(H, b.bottom + PAD)};
    const p = pointEl(cur), pb = p && shown(p) ? p.getBoundingClientRect() : b, px = pb.left + Math.min(pb.width / 2, 40), py = pb.top + pb.height / 2;
    const card = ui.querySelector('.tour-card'), cw = card.offsetWidth, ch = card.offsetHeight;
    // the card goes next to the lit place: the first spot that leaves it uncovered, else the spot that covers least of it
    const cand = (W < 600 ? [[12, (r.t + r.b) / 2 > H * .55 ? 12 : H - ch - 12], [12, H - ch - 12], [12, 12]]
      : [[r.l, r.b + 14], [r.l, r.t - ch - 14], [r.r + 14, r.t], [r.l - cw - 14, r.t], [W - cw - 16, H - ch - 16], [16, H - ch - 16], [W - cw - 16, 16], [16, 16]])
      .map(([x, y]) => { x = Math.max(12, Math.min(W - cw - 12, x)); y = Math.max(12, Math.min(H - ch - 12, y));
        return [x, y, Math.max(0, Math.min(x + cw, r.r) - Math.max(x, r.l)) * Math.max(0, Math.min(y + ch, r.b) - Math.max(y, r.t))]; });
    const [cx, cy] = cand.find(c => c[2] === 0) || cand.reduce((a, c) => (c[2] < a[2] ? c : a));
    const key = [r.l, r.t, r.r, r.b, px, py, cx, cy, W, H].map(Math.round).join(','); if (key === lastKey) return; lastKey = key;
    const set = (q, x, y, w, h) => { const e = ui.querySelector(q); e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.width = Math.max(0, w) + 'px'; e.style.height = Math.max(0, h) + 'px'; };
    set('[data-s="t"]', 0, 0, W, r.t); set('[data-s="b"]', 0, r.b, W, H - r.b); set('[data-s="l"]', 0, r.t, r.l, r.b - r.t); set('[data-s="r"]', r.r, r.t, W - r.r, r.b - r.t);
    set('.tour-ring', r.l, r.t, r.r - r.l, r.b - r.t); set('.tour-block', r.l, r.t, r.r - r.l, r.b - r.t);
    const hand = ui.querySelector('.tour-hand'); hand.style.left = px + 'px'; hand.style.top = py + 'px';
    card.style.left = cx + 'px'; card.style.top = cy + 'px';
  }
  function onKey(e) {
    if (!on) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); end(); return; }
    if ((e.key === 'Enter' || e.key === 'ArrowRight') && cur && !cur.act && !e.target.closest('input, textarea, select')) { e.preventDefault(); e.stopImmediatePropagation(); cur.last ? end() : go(k + 1); }
  }
  // keyboard focus stays on the card or the lit place
  function onFocus(e) { if (!on || !ui) return; const c = ui.querySelector('.tour-card'); if (c.contains(e.target) || (el && cur && cur.act && list(el).some(x => x.contains(e.target)))) return; c.focus({preventScroll: true}); }
  function start() {
    hideOffer(); remember(); if (on) end();
    document.querySelectorAll('dialog[open]').forEach(d => d.close());
    if (!$('#topicPage').hidden) { history.replaceState(null, '', location.pathname + location.search); hideTopicPage(); }
    // the tour starts from the home page with the map view, the gap list and Search (it only resets what it then asks the reader to change)
    if (state.view !== 'map') $('#viewMap').click(); if (state.rtab === 'quad') state.rtab = 'list';
    window.setBoard('home');
    on = true; ui = build(); lastKey = ''; document.addEventListener('keydown', onKey, true); document.addEventListener('focusin', onFocus, true); raf = requestAnimationFrame(frame); go(0);
  }
  function end() {
    on = false; clearInterval(poll); clearTimeout(wait); clearTimeout(glideT); cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus, true);
    if (ui) ui.remove(); ui = null; el = null; cur = null; k = -1;
  }

  // ---------- first visit: a small card offers the tour once
  const remember = () => { try { localStorage.setItem(SEEN, '1'); } catch (e) {} };
  function hideOffer() { const o = $('#tourOffer'); if (o) o.remove(); }
  function offer() {
    let seen = true; try { seen = !!localStorage.getItem(SEEN); } catch (e) {}   // no storage (private mode): do not offer at every visit
    if (seen || on || $('#tourOffer')) return;
    const o = document.createElement('div'); o.className = 'tour-offer'; o.id = 'tourOffer'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-labelledby', 'tourOfferT');
    o.innerHTML = `<h3 id="tourOfferT">New here?</h3><p>A short tour shows each board and lets you try the main buttons yourself. It takes about three minutes.</p>
      <div class="tour-acts"><button type="button" class="text-btn" id="tourNo">No thanks</button><button type="button" class="primary-btn" id="tourGo">Start the tour</button></div>`;
    document.body.appendChild(o); o.querySelector('#tourNo').onclick = () => { remember(); hideOffer(); }; o.querySelector('#tourGo').onclick = start;
  }
  const ready = () => { if (state.meta && state.topics && state.topics.length) setTimeout(offer, 1200); else setTimeout(ready, 300); };
  ready();
  window.atlasTour = {start, end};
})();
