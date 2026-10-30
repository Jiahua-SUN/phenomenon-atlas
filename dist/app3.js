/* Phenomenon Atlas v2 — part 3: topic detail panel (questions, core vs peripheral papers), gap board (ranked list, static quadrant). */
'use strict';
/* ---------- detail panel ---------- */
// on stacked layouts (phones, narrow windows) the side panel sits far below the board, so a tapped topic opens its full page instead
const stackedLayout = () => matchMedia('(max-width: 980px)').matches;
async function selectTopic(id) {
  if (stackedLayout()) { state.selected = id; state.tab = 'questions'; hideTip(); if (typeof hideSqTip === 'function') hideSqTip(); openTopicPage(id); return; }
  const first = state.selected !== id; state.selected = id; state.tab = 'questions'; hideTip(); $('#detail').hidden = false; renderTime();
  if (state.board === 'map') { renderList(); if (state.view === 'map' && first) flyTo(state.byId[id]); else renderMap(); } else if (state.board === 'gap') renderRank();
  await renderDetail();
}
function closeDetail(noFly = false) {
  const had = state.selected != null; state.selected = null; $('#detail').hidden = true; if (!state.meta) return; renderTime();
  if (state.board === 'map') { renderList(); if (had && !noFly && state.view === 'map') flyHome(); else renderMap(); } else if (state.board === 'gap' && had) renderRank();
}
/* panel width (user 2026-10-24): wider by default; drag the left edge (or use the arrow keys on it) to change it, between 360 px and
   half the window; double-click resets it. The width is remembered in this browser only. */
const DETAIL_W = 540, DETAIL_MIN = 360;
const detailMax = () => Math.max(DETAIL_MIN, Math.floor(window.innerWidth / 2));
function setDetailW(w, save) { const v = Math.round(Math.max(DETAIL_MIN, Math.min(detailMax(), w))); document.documentElement.style.setProperty('--detail-w', v + 'px'); state.detailW = v;
  if (save) { try { localStorage.setItem('atlasDetailW', String(v)); } catch (e) {} } return v; }
function redrawAfterResize(quick) { if (state.board !== 'map') return; if (state.view === 'map') renderMap(quick ? {quick: true} : {}); else if (!quick) renderMap(); }   // the gap quadrant redraws itself (ResizeObserver)
function bindDetailResize() {
  let w0 = DETAIL_W; try { w0 = +localStorage.getItem('atlasDetailW') || DETAIL_W; } catch (e) {} setDetailW(w0, false);
  const h = $('#detailResize'); let drag = null, raf = null;
  h.addEventListener('pointerdown', e => { e.preventDefault(); h.setPointerCapture(e.pointerId); drag = {x: e.clientX, w: $('#detail').getBoundingClientRect().width}; document.body.classList.add('resizing'); });
  h.addEventListener('pointermove', e => { if (!drag) return; setDetailW(drag.w + (drag.x - e.clientX), false); if (!raf) raf = requestAnimationFrame(() => { raf = null; redrawAfterResize(true); }); });
  const end = () => { if (!drag) return; drag = null; document.body.classList.remove('resizing'); setDetailW(state.detailW, true); redrawAfterResize(false); };
  h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
  h.addEventListener('dblclick', () => { setDetailW(DETAIL_W, true); redrawAfterResize(false); });
  h.addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); setDetailW(state.detailW + (e.key === 'ArrowLeft' ? 20 : -20), true); redrawAfterResize(false); });
  window.addEventListener('resize', () => setDetailW(state.detailW, false));
}
async function topicFile(id) { if (state.topicFiles[id] !== undefined) return state.topicFiles[id]; try { const r = await fetch(`topics/${id}.json?v=d5`); /* bump v when the topic files are re-exported (d1: paper DOIs, 2026-10-23; d2: 17 misfiled papers removed, 2026-10-24; d3: rewritten paper notes, 2026-10-24) */ state.topicFiles[id] = r.ok ? await r.json() : null; } catch (e) { state.topicFiles[id] = null; } return state.topicFiles[id]; }
// every paper links out: its DOI page, or a Google Scholar search on the exact title when no DOI was found (user, 2026-10-23)
const paperUrl = p => p.doi ? 'https://doi.org/' + encodeURI(p.doi) : 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + p.title + '"');
// questions and papers start folded (user 2026-10-25): only the question, or the paper's title, journal and link, shows; "Details" opens
// the rest. open: start unfolded (the papers a paper chip opens, where the reader asked why they are linked)
const foldBtn = (open = false) => `<button type="button" class="fold-btn" aria-expanded="${open}">Details<i aria-hidden="true">↓</i></button>`;
document.addEventListener('click', e => { const b = e.target.closest('.fold-btn'); if (b) b.setAttribute('aria-expanded', b.closest('.fold').classList.toggle('open')); });
function paperItem(p, cls = '', open = false) { const u = esc(paperUrl(p)); return `<div class="paper fold ${open ? 'open' : ''} ${cls} ${p.relevance >= CORE_REL ? 'core' : 'peri'}"><span class="rel-badge">${p.relevance >= CORE_REL ? 'Core paper' : 'Loosely related'} · relevance ${p.relevance}</span><a class="paper-title" href="${u}" target="_blank" rel="noopener">${esc(p.title)}</a><small>${esc(p.journal.toUpperCase())} ${p.year} · <a href="${u}" target="_blank" rel="noopener">${p.doi ? 'Article ↗' : 'Google Scholar ↗'}</a>${foldBtn(open)}</small><div class="fold-body">${p.question ? '<small class="paper-q">Linked to the question “' + esc(p.question.length > 90 ? p.question.slice(0, 88) + '…' : p.question) + '”</small>' : ''}<p>${esc(p.connection)}</p></div></div>`; }
// the three parts of a topic (questions, papers, research fields) are built here once and used by the side panel and by the full page
const topicEyebrow = t => { const nf = Object.keys(t.labels).filter(k => k !== 'others').length;
  return `${t.id} · ${nf ? nf + (nf > 1 ? ' research fields' : ' research field') : 'no research field (Others)'}`; };
function questionsHTML(f) {
  return (f.questions || []).map((q, qi) => { const core = (q.papers || []).filter(p => p.relevance >= CORE_REL), peri = (q.papers || []).length - core.length;
    return `<div class="q-item fold"><h3><a class="q-link" href="#question/${q.question_id}" data-qid="${q.question_id}" title="Open this question as a full page">${esc(q.question)}<span class="full-ic" aria-hidden="true"> ⤢</span></a>${foldBtn()}</h3><div class="fold-body"><div class="who">${esc(q.who || '')}</div><p class="q-meta">Raised in ${q.evidence.length} episodes from ${q.programmes} different shows. Every part of the question was checked against these quotes.</p><ul class="q-evidence" data-q="${qi}">${q.evidence.slice(0, 3).map(ev => evidenceItem(ev)).join('')}</ul>${q.evidence.length > 3 ? `<button class="show-all" data-q="${qi}">Show all ${q.evidence.length} quotes ↓</button>` : ''}
      ${core.length || peri ? `<div class="q-papers" data-q="${qi}"><span class="q-meta">Papers</span>${core.map(p => `<button type="button" class="paper-chip core" title="${esc(p.connection)}">${esc(p.journal.toUpperCase())} ${p.year} · ${esc(p.title.length > 60 ? p.title.slice(0, 58) + '…' : p.title)}<b>${p.relevance}</b></button>`).join('')}${peri ? `<button type="button" class="paper-chip peri">+${peri} loosely related</button>` : ''}<span class="q-papers-hint">Click a paper to see why it is linked</span></div><div class="q-paper-list" data-q="${qi}" hidden></div>` : ''}</div></div>`; }).join('') || '<p class="pending">This topic has no core questions.</p>';
}
function bindQuestions(root, f) {
  // a paper chip opens the question's papers below it: core first, then peripheral; a second click closes them
  root.querySelectorAll('.q-papers .paper-chip').forEach(b => b.onclick = () => { const qi = b.parentElement.dataset.q, box = root.querySelector(`.q-paper-list[data-q="${qi}"]`), q = f.questions[+qi]; if (!box.hidden) { box.hidden = true; return; }
    const ps = (q.papers || []).slice().sort((a, b) => b.relevance - a.relevance); box.innerHTML = ps.map(p => paperItem(p, '', true)).join(''); box.hidden = false; });
  root.querySelectorAll('.show-all').forEach(b => b.onclick = () => { const q = f.questions[+b.dataset.q]; root.querySelector(`.q-evidence[data-q="${b.dataset.q}"]`).innerHTML = q.evidence.map(ev => evidenceItem(ev)).join(''); b.remove(); bindQuotes(root); });
  bindQuotes(root); bindQLinks(root);
}
function bindQLinks(root) { root.querySelectorAll('.q-link[data-qid]').forEach(a => a.onclick = e => { if (e.button || e.ctrlKey || e.metaKey || e.shiftKey) return; e.preventDefault(); openQuestionPage(a.dataset.qid); }); }
function bindQuotes(root) { root.querySelectorAll('.q-evidence li').forEach(li => li.onclick = e => { if (!e.target.closest('a')) li.classList.toggle('open'); }); }
function papersHTML(list, one = false) {   // one: the papers of a single question
  const core = (list || []).filter(p => p.relevance >= CORE_REL), peri = (list || []).filter(p => p.relevance < CORE_REL).sort((a, b) => b.relevance - a.relevance); core.sort((a, b) => b.relevance - a.relevance);
  return (core.length ? `<p class="q-meta">Core papers (${core.length}): they study the same question or mechanism. Relevance ${CORE_REL} or more out of 100.</p>` + core.map(p => paperItem(p)).join('') : `<p class="pending">No core papers. None of the papers in the index studies ${one ? 'this question' : 'these questions'} directly.</p>`)
    + (peri.length ? `<p class="q-meta" style="margin-top:18px">Loosely related papers (${peri.length}): they study a neighbouring question. Relevance 60 to ${CORE_REL - 1}.</p>` + peri.map(p => paperItem(p)).join('') : '');
}
function membersHTML(t) {
  const names = Object.fromEntries(state.meta.labels.map(l => [l.id, l.name]));
  return '<p class="q-meta">Research fields, with the share of this topic\'s problems that concern each field</p>' + Object.entries(t.labels).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="member-row">${esc(names[k] || k)}<span>${k === 'others' ? '—' : Math.round(100 * v) + '%'}</span></div>`).join('');
}
const PTS_NOTE = ['Each episode counts once', 'A typical episode earns 1, a widely watched one up to 2'];
const PTS_TITLE = 'Each episode in the period earns 0 to 2 points by how its YouTube views rank among videos uploaded in the same week; the median episode earns 1. A topic whose episodes are watched more than usual has more points than episodes.';
async function renderDetail() {
  const t = state.byId[state.selected]; if (!t) return;
  $('#detailEyebrow').textContent = topicEyebrow(t); $('#detailTitle').innerHTML = `${esc(t.name)}<span class="full-ic" aria-hidden="true"> ⤢</span>`; $('#detailDesc').textContent = t.description;
  const h = t.heat[state.period] || [0, 0];
  // the two podcast figures say how each is counted, so more audience points than episodes reads as expected (user feedback 2026-10-25)
  $('#detailStats').innerHTML = `<div title="Podcast episodes in ${esc(periodObj().label)} that raise at least one problem of this topic"><b>${fmt(h[0])}</b><span>Episodes in period</span><small>${PTS_NOTE[0]}</small></div><div title="${PTS_TITLE}"><b>${h[1].toFixed(0)}</b><span>Audience points</span><small>${PTS_NOTE[1]}</small></div><div title="Papers linked to the topic's core questions (relevance 60 or more out of 100); core papers study the same question or mechanism (85 or more)"><b>${fmt(t.papers || 0)}</b><span>Related papers</span><small>${fmt(t.papers_strict || 0)} of them core papers</small></div>`;
  $$('.detail-tabs button').forEach(b => b.classList.toggle('selected', b.dataset.tab === state.tab));
  const body = $('#detailBody'); body.innerHTML = '<p class="pending">Loading…</p>';
  const f = await topicFile(t.id);
  if (state.tab === 'members') { body.innerHTML = membersHTML(t); return; }
  if (!f) { body.innerHTML = `<p class="pending">${state.tab === 'questions' ? 'This topic has no core questions yet.' : 'This topic has no linked papers yet.'}</p>`; return; }
  if (state.tab === 'questions') { body.innerHTML = questionsHTML(f); bindQuestions(body, f); }
  else body.innerHTML = papersHTML(f.papers);
}

/* ---------- full pages (user 2026-10-24): one topic (#topic/<id>, from the panel title) or one core question (#question/<id>, from a
   question's title). The browser's Back button and Esc return to where the reader was, and the address can be shared. ---------- */
const TP_HIDE = ['#homeBoard', '.intro', '#howto', '#timeLens', '#scopeRow', '#workspace', '#gapBoard', '#askBoard'];
const BOARD_NAME = {map: 'the map', gap: 'the gap board', ask: 'the ask board'};
function pageFromHash() { const m = location.hash.match(/^#(topic|question)\/(t\d+(?:_q\d+)?)$/); if (!m) return null;
  const p = {kind: m[1], id: m[2]}; return state.byId[p.id.split('_')[0]] && (p.kind === 'question') === p.id.includes('_') ? p : null; }
function openPage(kind, id) { const cur = $('#topicPage').hidden ? null : pageFromHash(), from = cur ? (cur.kind === 'topic' ? 'the topic' : 'the question') : null;
  if (location.hash !== `#${kind}/${id}`) history.pushState({topicPage: id, kind, from}, '', `#${kind}/${id}`); showPage({kind, id}); }
function openTopicPage(id) { if (state.byId[id]) openPage('topic', id); }
function openQuestionPage(qid) { if (qid && state.byId[String(qid).split('_')[0]]) openPage('question', qid); }
function showPage(p) { return p.kind === 'topic' ? showTopicPage(p.id) : showQuestionPage(p.id); }
function openFromHash() { const p = pageFromHash(); if (p) showPage(p); }
function leaveTopicPage() { if (history.state && history.state.topicPage) history.back(); else { history.replaceState(null, '', location.pathname + location.search); hideTopicPage(); } }
// hides the boards (remembering what was shown and the scroll position) and returns the page's top bar
function enterPage(id, title) {
  if (!state.tpPrev) state.tpPrev = {y: window.scrollY, hidden: TP_HIDE.map(s => [s, $(s) ? $(s).hidden : true])};
  TP_HIDE.forEach(s => { const e = $(s); if (e) e.hidden = true; }); hideTip(); if (typeof hideSqTip === 'function') hideSqTip();
  state.pageToken = id; document.title = title + ' · Phenomenon Atlas'; $('#topicPage').hidden = false; window.scrollTo(0, 0);
  const back = (history.state && history.state.from) || (state.tpPrev.hidden.find(([s]) => s === '#homeBoard')[1] === false ? 'the home page' : BOARD_NAME[state.board] || 'the board');
  return `<div class="tp-top"><button type="button" class="tp-back" id="tpBack">← Back to ${back}</button><span class="tp-hint">Esc or your browser's Back button also returns.</span></div>`;
}
/* on phones and narrow windows (the stacked layout) sections that sit side by side on a wide screen become tabs, so papers and research
   fields are one tap away instead of at the bottom of a long page (user 2026-10-25). Markup: a .pane-host holds the tabs and the panes
   ([data-pane-id]); a pane that is not picked carries .pane-off, which only the narrow-screen CSS hides. Also used by ask.js. */
const headH = () => ($('.sw-head') || {offsetHeight: 0}).offsetHeight;
function setHeadVar() { document.documentElement.style.setProperty('--head-h', headH() + 'px'); }   // the tabs stick under the header
window.addEventListener('resize', setHeadVar); setHeadVar();
function paneTabs(panes) { return `<div class="tg pane-tabs" role="tablist">${panes.map(([id, label], i) => `<button type="button" role="tab" data-pane="${id}" class="${i ? '' : 'selected'}" aria-selected="${!i}">${label}</button>`).join('')}</div>`; }
function showPane(host, id) {
  host.querySelectorAll('.pane-tabs [data-pane]').forEach(b => { b.classList.toggle('selected', b.dataset.pane === id); b.setAttribute('aria-selected', b.dataset.pane === id); });
  host.querySelectorAll('[data-pane-id]').forEach(p => p.classList.toggle('pane-off', p.dataset.paneId !== id));
}
document.addEventListener('click', e => { const b = e.target.closest('.pane-tabs [data-pane]'); if (!b) return; const host = b.closest('.pane-host'); showPane(host, b.dataset.pane);
  const y = host.getBoundingClientRect().top + window.scrollY - headH(); if (window.scrollY > y) window.scrollTo(0, y); });   // a new pane starts at its top
const paneLabel = (name, n) => `${name}<b>${fmt(n)}</b>`;
function monthBars(vals, on, unit) { const ms = state.meta.months, mx = Math.max(1, ...vals);
  return `<div class="tp-bars">${ms.map((m, i) => `<div class="${on.has(m) ? 'on' : ''}" title="${esc((state.meta.periods.find(p => p.id === m) || {}).label || m)}: ${fmt(vals[i])} ${unit}"><small>${vals[i] ? fmt(vals[i]) : ''}</small><i style="height:${vals[i] ? Math.max(4, Math.round(90 * vals[i] / mx)) : 2}px"></i><span>${shortMonth(m)}</span></div>`).join('')}</div>`; }
async function showTopicPage(id) {
  const t = state.byId[id]; if (!t) return; const top = enterPage(id, t.name), pg = $('#topicPage'), per = periodObj(), h = t.heat[state.period] || [0, 0];
  const ms = state.meta.months, inPer = new Set(periodMonths().map(i => ms[i])), on = inPer.size < ms.length ? inPer : new Set();
  pg.innerHTML = `${top}
    <p class="eyebrow">${esc(topicEyebrow(t))}</p><h1 class="tp-title">${esc(t.name)}</h1><p class="tp-desc">${esc(t.description)}</p>
    <div class="tp-stats"><div><b>${fmt(h[0])}</b><span>Episodes in ${esc(per.label)}</span><small>${PTS_NOTE[0]}</small></div><div title="${PTS_TITLE}"><b>${h[1].toFixed(0)}</b><span>Audience points, ${esc(per.label)}</span><small>${PTS_NOTE[1]}</small></div><div><b>${fmt(t.episodes)}</b><span>Episodes in all months</span></div><div><b>${fmt(t.papers_strict || 0)}</b><span>Core papers</span></div><div><b>${fmt(t.papers || 0)}</b><span>All related papers</span></div></div>
    <div class="tp-months"><span class="lab">Episodes per month on this topic${on.size ? ' (the period you picked is in red)' : ''}</span>${monthBars(ms.map(m => (t.heat[m] || [0, 0])[0]), on, 'episodes')}</div>
    <div class="pane-host">${paneTabs([['questions', 'Questions'], ['papers', paneLabel('Papers', t.papers || 0)], ['fields', paneLabel('Research fields', Object.keys(t.labels).length)]])}
    <div class="tp-grid"><section class="tp-main" data-pane-id="questions"><h2>Core questions</h2><div id="tpQuestions"><p class="pending">Loading…</p></div></section>
      <aside class="tp-side"><section class="pane-off" data-pane-id="papers"><h2>Papers</h2><div id="tpPapers"><p class="pending">Loading…</p></div></section>
        <section class="pane-off" data-pane-id="fields"><h2>Research fields</h2><div>${membersHTML(t)}</div></section></aside></div></div>`;
  $('#tpBack').onclick = leaveTopicPage; setHeadVar();
  const f = await topicFile(id); if (state.pageToken !== id || pg.hidden) return;
  if (!f) { $('#tpQuestions').innerHTML = '<p class="pending">This topic has no core questions yet.</p>'; $('#tpPapers').innerHTML = '<p class="pending">This topic has no linked papers yet.</p>'; return; }
  $('#tpQuestions').innerHTML = questionsHTML(f); bindQuestions($('#tpQuestions'), f); $('#tpPapers').innerHTML = papersHTML(f.papers);
  pg.querySelector('.pane-tabs [data-pane=questions]').innerHTML = paneLabel('Questions', (f.questions || []).length);
  pg.querySelector('.pane-tabs [data-pane=papers]').innerHTML = paneLabel('Papers', (f.papers || []).length);
}
// one core question with everything the atlas has on it: who asks it, its topic, the episodes per month, every quote, every linked paper and
// the other questions of the topic
async function showQuestionPage(qid) {
  const tid = qid.split('_')[0], t = state.byId[tid]; if (!t) return; const top = enterPage(qid, 'Core question'), pg = $('#topicPage');
  pg.innerHTML = top + '<p class="pending">Loading…</p>'; $('#tpBack').onclick = leaveTopicPage;
  const f = await topicFile(tid); if (state.pageToken !== qid || pg.hidden) return;
  const q = f && (f.questions || []).find(x => x.question_id === qid);
  if (!q) { pg.innerHTML = top + '<p class="pending">This question is not in the atlas.</p>'; $('#tpBack').onclick = leaveTopicPage; return; }
  document.title = (q.question.length > 70 ? q.question.slice(0, 68) + '…' : q.question) + ' · Phenomenon Atlas';
  const ev = q.evidence || [], ps = q.papers || [], core = ps.filter(p => p.relevance >= CORE_REL).length, others = (f.questions || []).filter(x => x.question_id !== qid);
  const perMonth = state.meta.months.map(m => ev.filter(e => String(e.date || '').slice(0, 7) === m).length);
  pg.innerHTML = `${top}
    <p class="eyebrow">Core question · topic <button type="button" class="tp-crumb" id="tqTopic">${esc(t.name)}</button></p>
    <h1 class="tp-title tq-title">${esc(q.question)}</h1>${q.who ? `<p class="tp-desc">Asked by ${esc(q.who)}.</p>` : ''}
    <div class="tp-stats"><div><b>${fmt(ev.length)}</b><span>Episodes that raise it</span></div><div><b>${fmt(q.programmes)}</b><span>Different shows</span></div><div><b>${fmt(core)}</b><span>Core papers</span></div><div><b>${fmt(ps.length)}</b><span>All related papers</span></div></div>
    <p class="tq-check">Every part of the question was checked against the quotes below.</p>
    <div class="tp-months"><span class="lab">Episodes per month that raise this question (by upload date)</span>${monthBars(perMonth, new Set(), 'episodes')}</div>
    <div class="pane-host">${paneTabs([['quotes', paneLabel('Quotes', ev.length)], ['papers', paneLabel('Papers', ps.length)]].concat(others.length ? [['others', paneLabel('Other questions', others.length)]] : []))}
    <div class="tp-grid"><section class="tp-main" data-pane-id="quotes"><h2>Quotes (${fmt(ev.length)})</h2><ul class="q-evidence">${ev.map(e => evidenceItem(e)).join('')}</ul></section>
      <aside class="tp-side"><section class="pane-off" data-pane-id="papers"><h2>Papers</h2>${ps.length ? papersHTML(ps, true) : '<p class="pending">No papers are linked to this question.</p>'}</section>
        ${others.length ? `<section class="pane-off" data-pane-id="others"><h2>Other questions in this topic</h2><ul class="tq-others">${others.map(x => `<li><a class="q-link" href="#question/${x.question_id}" data-qid="${x.question_id}">${esc(x.question)}</a><small>${fmt(x.evidence.length)} episodes from ${fmt(x.programmes)} shows</small></li>`).join('')}</ul></section>` : ''}</aside></div></div>`;
  $('#tpBack').onclick = leaveTopicPage; setHeadVar(); $('#tqTopic').onclick = () => openTopicPage(tid); bindQLinks(pg); bindQuotes(pg);
}
function hideTopicPage() {
  if (!state.tpPrev) return; const prev = state.tpPrev; state.tpPrev = null; state.pageToken = null; $('#topicPage').hidden = true; $('#topicPage').innerHTML = ''; document.title = 'Phenomenon Atlas';
  prev.hidden.forEach(([s, hd]) => { const e = $(s); if (e) e.hidden = hd; });
  if (state.board === 'map') { renderMap(); renderList(); } else if (state.board === 'gap') renderRank();
  window.scrollTo(0, prev.y);
}
function bindTopicPage() {
  const ttl = $('#detailTitle'); ttl.tabIndex = 0; ttl.setAttribute('role', 'link'); ttl.title = 'Open this topic as a full page';
  ttl.onclick = () => openTopicPage(state.selected); ttl.onkeydown = e => { if (e.key === 'Enter') openTopicPage(state.selected); };
  window.addEventListener('popstate', () => { const p = pageFromHash(); if (p) showPage(p); else hideTopicPage(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#topicPage').hidden && !document.querySelector('dialog[open]')) leaveTopicPage(); });
  const base = window.setBoard;   // wraps the home page's wrapper too (home.js runs before bind())
  window.setBoard = function (b) { if (state.tpPrev) { state.tpPrev = null; state.pageToken = null; $('#topicPage').hidden = true; $('#topicPage').innerHTML = ''; document.title = 'Phenomenon Atlas'; if (/^#(topic|question)\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } return base(b); };
}
function evidenceItem(ev) { return `<li><div class="src">${esc(ev.programme)}<small>${esc(ev.date)} · ${fmt(ev.views)} views</small><a href="transcript/${ev.episode_id}?seg=${ev.segment_id}" target="_blank" rel="noopener">Read in context ↗</a></div><blockquote>“${esc(ev.quote)}”</blockquote></li>`; }

/* ---------- gap board ---------- */
function fillRankTheme() { $('#rankTheme').innerHTML = '<option value="all">All fields</option>' + state.meta.labels.map(it => `<option value="${it.id}">${esc(it.name)}</option>`).join(''); $('#rankTheme').value = state.rankTheme; }
function rankTopics() { return state.topics.filter(t => state.rankTheme === 'all' || t.labels[state.rankTheme] != null); }
const acadOf = t => state.acad === 'strict' ? (t.papers_strict || 0) : (t.papers || 0);
// percentile of each value among the listed topics (0 = fewest, 100 = most); tied values share their middle rank
function midPct(vals) { const s = vals.slice().sort((a, b) => a - b), n = s.length, m = new Map(); for (let i = 0; i < n;) { let j = i; while (j + 1 < n && s[j + 1] === s[i]) j++; m.set(s[i], n > 1 ? 100 * (i + j) / 2 / (n - 1) : 50); i = j + 1; } return m; }
// list order (user 2026-10-29): podcasts, papers, or the gap = podcast percentile minus paper percentile, in either direction
const RANK_BY = {pod: [(a, b) => b.p - a.p || b.a - a.a, 'Ranked by podcasts, most first.'], pap: [(a, b) => b.a - a.a || b.p - a.p, 'Ranked by papers, most first.'],
  gp: [(a, b) => b.g - a.g || b.p - a.p, 'Ranked by gap, many podcasts and few papers first.'], ga: [(a, b) => a.g - b.g || b.a - a.a, 'Ranked by gap, many papers and few podcasts first.']};
function renderRank() {
  if (state.board !== 'gap') return;
  $$('.rank-tabs button').forEach(b => b.classList.toggle('selected', b.dataset.rtab === state.rtab)); $('#rankList').hidden = state.rtab !== 'list'; $('#rankQuad').hidden = state.rtab !== 'quad'; $('#rankByCtl').hidden = state.rtab !== 'list';
  const ts = rankTopics().map(t => ({t, p: heatOf(t), a: acadOf(t)})); const mp = Math.max(1, ...ts.map(x => x.p)), ma = Math.max(1, ...ts.map(x => x.a));
  const pp = midPct(ts.map(x => x.p)), pa = midPct(ts.map(x => x.a)); ts.forEach(x => { x.g = Math.round(pp.get(x.p) - pa.get(x.a)); });
  const [cmp, how] = RANK_BY[state.rankBy] || RANK_BY.pod; ts.sort(cmp); const gapMode = state.rankBy === 'gp' || state.rankBy === 'ga';
  $('#rankNote').textContent = `${fmt(ts.length)} topics. Podcasts: ${state.heat === 'n' ? 'episodes' : 'audience points'} in ${periodObj().label}. Papers: ${state.acad === 'strict' ? 'core papers only' : 'all related papers'}.${state.rtab === 'list' ? ` ${how}${gapMode ? ' Gap = podcast percentile minus paper percentile, from −100 to 100.' : ''} The list shows the top 50.` : ''}`;
  if (state.rtab === 'list') {
    $('#rankList').innerHTML = ts.slice(0, 50).map((x, i) => `<button class="rank-row ${state.selected === x.t.id ? 'selected' : ''}" data-id="${x.t.id}" style="animation-delay:${Math.min(i, 30) * 16}ms"><span class="num">${String(i + 1).padStart(2, '0')}</span><span class="title">${esc(x.t.name)}<small>${gapMode ? `<b class="gap-tag">Gap ${x.g > 0 ? '+' : ''}${x.g}</b>` : ''}${esc(x.t.description)}</small></span><span class="meter practical"><span>${state.heat === 'n' ? 'Episodes' : 'Audience points'}<b>${fmt(x.p)}</b></span><i><b data-w="${100 * x.p / mp}" style="width:0"></b></i></span><span class="meter academic"><span>${state.acad === 'strict' ? 'Core papers' : 'Papers'}<b>${fmt(x.a)}</b></span><i><b data-w="${100 * x.a / ma}" style="width:0"></b></i></span></button>`).join('');
    requestAnimationFrame(() => $$('#rankList .meter i b').forEach(el => el.style.width = el.dataset.w + '%'));
    $$('.rank-row').forEach(b => b.onclick = () => selectTopic(b.dataset.id));
  } else renderQuad(ts);
}
/* quadrant: a static chart. Both axes are rank positions (ties broken by the other measure and the id, plus a small deterministic
   jitter), so the cloud of all topics fills the square evenly; the axes cross at the medians. In every quadrant the REPS most typical
   topics (furthest from the centre towards that corner, weighted by practical heat) are drawn large and labelled, the rest form a
   faint cloud. Colour = quadrant. */
function hash01(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 10007) / 10007; }
// corner titles say only what the two counts show, not which side is ahead (user 2026-10-25)
const QUAD = {3: ['gold', 'Many podcasts, many papers', ''], 2: ['hot', 'Many podcasts, few papers', ''], 1: ['acad', 'Few podcasts, many papers', ''], 0: ['slate', 'Few podcasts, few papers', '']};
const REPS = 12;
function renderQuad(ts) {
  const svg = $('#quadSvg'); const W = svg.clientWidth || 900, H = svg.clientHeight || 560; const pad = {l: 56, r: 28, t: 30, b: 44}; svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = ''; const n = ts.length; if (!n) return;
  const mk = (tag, attrs, txt, parent = svg) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (txt != null) e.textContent = txt; parent.appendChild(e); return e; };
  const X = px => pad.l + px * (W - pad.l - pad.r), Y = py => H - pad.b - py * (H - pad.t - pad.b);
  const byX = ts.slice().sort((a, b) => a.p - b.p || a.a - b.a || (a.t.id < b.t.id ? -1 : 1)), byY = ts.slice().sort((a, b) => a.a - b.a || a.p - b.p || (a.t.id < b.t.id ? -1 : 1));
  const xi = new Map(byX.map((x, i) => [x.t.id, i])), yi = new Map(byY.map((x, i) => [x.t.id, i])); const medP = byX[Math.floor(n / 2)].p, medA = byY[Math.floor(n / 2)].a;
  const items = ts.map(x => { const px = Math.max(.012, Math.min(.988, (n > 1 ? xi.get(x.t.id) / (n - 1) : .5) * .96 + .02 + (hash01(x.t.id + 'x') - .5) * .035)), py = Math.max(.012, Math.min(.988, (n > 1 ? yi.get(x.t.id) / (n - 1) : .5) * .96 + .02 + (hash01(x.t.id + 'y') - .5) * .035));
    const quad = (px > .5 ? 2 : 0) + (py > .5 ? 1 : 0); return {...x, px, py, quad, sx: X(px), sy: Y(py), r: 7, typ: hash01(x.t.id + 'r')}; });
  // quadrant grounds and titles
  [[0, 1, 1], [.5, 1, 3], [0, .5, 0], [.5, .5, 2]].forEach(([qx, qy, q]) => mk('rect', {x: X(qx), y: Y(qy), width: X(qx + .5) - X(qx), height: Y(qy - .5) - Y(qy), class: 'qtint ' + QUAD[q][0]}));
  // corner titles scale with the quadrant width so the two bottom ones never meet; on a narrow screen (phone) they are smaller, the
  // subtitles are left out and fewer topics are drawn large (user 2026-10-24)
  const narrowQ = W < 600, nRep = narrowQ ? 6 : REPS;
  const fixed = []; const tsz = narrowQ ? Math.max(11, Math.min(16, W / 30)) : Math.max(18, Math.min(28, W / 24));
  [[3, X(.985), Y(.965), 'end'], [2, X(.985), Y(.03) - 12, 'end'], [1, X(.015), Y(.965), 'start'], [0, X(.015), Y(.03) - 12, 'start']].forEach(([q, x, y, anc]) => { const t = mk('text', {x, y, class: 'qtitle ' + QUAD[q][0], 'text-anchor': anc, style: `font-size:${tsz}px`}, QUAD[q][1]); fixed.push(t); if (QUAD[q][2] && !narrowQ) fixed.push(mk('text', {x, y: y + tsz * .78, class: 'qsub', 'text-anchor': anc}, QUAD[q][2])); });
  mk('line', {x1: X(.5), y1: Y(1) - 6, x2: X(.5), y2: Y(0) + 6, class: 'axis'}); mk('line', {x1: X(0) - 6, y1: Y(.5), x2: X(1) + 6, y2: Y(.5), class: 'axis'});
  fixed.push(mk('text', {x: X(.5) + 6, y: Y(0) + 16, class: 'axis-cap', 'text-anchor': 'start'}, 'median'), mk('text', {x: X(0) + 6, y: Y(.5) - 6, class: 'axis-cap', 'text-anchor': 'start'}, 'median'));
  mk('text', {x: X(.5), y: H - 8, class: 'axis-cap', 'text-anchor': 'middle'}, 'Podcast episodes (rank: fewer → more)');
  mk('text', {x: 16, y: (Y(0) + Y(1)) / 2, class: 'axis-cap', 'text-anchor': 'middle', transform: `rotate(-90 16 ${(Y(0) + Y(1)) / 2})`}, 'Papers (rank: fewer → more)');
  // the full cloud, faint
  items.forEach(x => mk('circle', {cx: x.sx, cy: x.sy, r: 1.8, class: 'qbg ' + QUAD[x.quad][0]}));
  // representatives per quadrant, labels placed where they fit (right, left, above, below), leader line when offset
  // representatives: a stable random sample per quadrant (ordered by a hash of the id), at least MINGAP px apart and away from
  // the median axes, so they scatter through the whole quadrant instead of crowding its corner
  const MINGAP = narrowQ ? 34 : 46; const reps = []; const axisGap = narrowQ ? 16 : 22;
  const tb = fixed.map(t => t.getBBox()), onTitle = x => tb.some(b => x.sx > b.x - 10 && x.sx < b.x + b.width + 10 && x.sy > b.y - 10 && x.sy < b.y + b.height + 10);   // no large circle on a corner title
  for (let q = 0; q < 4; q++) { let k = 0; for (const x of items.filter(x => x.quad === q).sort((a, b) => b.typ - a.typ)) { if (k >= nRep) break; if (Math.abs(x.sx - X(.5)) < axisGap || Math.abs(x.sy - Y(.5)) < axisGap || onTitle(x)) continue; if (reps.some(o => Math.hypot(o.sx - x.sx, o.sy - x.sy) < MINGAP)) continue; reps.push(x); k++; } }
  const boxes = []; const fits = b => b.x >= 8 && b.x + b.w <= W - 8 && b.y >= pad.t - 6 && b.y + b.h <= H - pad.b + 10 && !boxes.some(o => b.x < o.x + o.w + 4 && b.x + b.w + 4 > o.x && b.y < o.y + o.h + 2 && b.y + b.h + 2 > o.y);
  reps.forEach(x => boxes.push({x: x.sx - x.r, y: x.sy - x.r, w: 2 * x.r, h: 2 * x.r, dot: true}));
  fixed.forEach(t => { const b = t.getBBox(); boxes.push({x: b.x - 2, y: b.y - 1, w: b.width + 4, h: b.height + 2}); }); // measured titles, subtitles and axis captions
  const probe = mk('text', {class: 'qname', visibility: 'hidden'}, ''); const nameW = s => { probe.textContent = s; return probe.getBBox().width; };
  reps.sort((a, b) => b.r - a.r).forEach(x => { const c = mk('circle', {cx: x.sx, cy: x.sy, r: x.r, class: 'qdot ' + QUAD[x.quad][0] + (state.selected === x.t.id ? ' selected' : '')}); c.onclick = () => selectTopic(x.t.id); mk('title', {}, `${x.t.name} · ${fmt(x.p)} episodes · ${fmt(x.a)} papers · ${QUAD[x.quad][1].toLowerCase()}`, c); });
  let labelled = 0;
  reps.sort((a, b) => b.typ - a.typ).forEach(x => { const w = nameW(x.t.name), h = 15; const cands = [{x: x.sx + x.r + 6, y: x.sy - h / 2, anc: 'start'}, {x: x.sx - x.r - 6 - w, y: x.sy - h / 2, anc: 'end'}, {x: x.sx - w / 2, y: x.sy - x.r - 6 - h, anc: 'middle'}, {x: x.sx - w / 2, y: x.sy + x.r + 6, anc: 'middle'}, {x: x.sx + x.r + 4, y: x.sy - x.r - h, anc: 'start'}, {x: x.sx + x.r + 4, y: x.sy + x.r, anc: 'start'}, {x: x.sx - x.r - 4 - w, y: x.sy - x.r - h, anc: 'end'}, {x: x.sx - x.r - 4 - w, y: x.sy + x.r, anc: 'end'}];
    for (const cnd of cands) { const b = {x: cnd.x, y: cnd.y, w, h}; if (!fits(b)) continue; boxes.push(b); labelled++; const tx = mk('text', {x: cnd.anc === 'start' ? b.x : cnd.anc === 'end' ? b.x + w : b.x + w / 2, y: b.y + 11.5, class: 'qname ' + QUAD[x.quad][0], 'text-anchor': cnd.anc}, x.t.name); tx.onclick = () => selectTopic(x.t.id); break; } });
  probe.remove();
  // the quadrant is laid out in pixels of the moment it is drawn; redraw when the board settles to another size
  if (!svg._ro && window.ResizeObserver) { svg._ro = new ResizeObserver(() => { const vb = svg.viewBox.baseVal; if (state.board === 'gap' && state.rtab === 'quad' && svg.clientWidth && (Math.abs(svg.clientWidth - vb.width) > 2 || Math.abs(svg.clientHeight - vb.height) > 2)) renderRank(); }); svg._ro.observe(svg); }
  $('.quad-legend span').innerHTML = Object.entries(QUAD).sort((a, b) => b[0] - a[0]).map(([q, [cls, name]]) => `<i class="qchip ${cls}"></i>${name}`).join(' · ') + `. Small dots: every topic in the group. Large circles: ${nRep} topics picked at random in each quadrant, ${labelled} of them named. Click a circle or a name to open the topic.`;
}
