'use strict';
(function () {
  const q = s => document.querySelector(s), qa = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US');
  // every paper links out: its DOI page, or a Google Scholar search on the exact title when no DOI was found (user, 2026-10-23)
  const paperUrl = p => p.doi ? 'https://doi.org/' + encodeURI(p.doi) : 'https://scholar.google.com/scholar?q=' + encodeURIComponent('"' + p.title + '"');
  // short topics with an idea in them (user 2026-10-25); each was checked to bring on-point quotes and papers
  const SEARCH_EX = [['Founder control after outside investment', 'Founder control after outside investment'], ['Trust versus contracts with suppliers', 'Trust versus contracts with suppliers'],
    ['Short-termism under shareholder pressure', 'Short-termism under shareholder pressure']];
  const ASSESS_EX = ['How do family firms decide when to bring in a non-family CEO?', 'How should firms stop employees from pasting confidential data into AI tools?', 'Why do mid-sized firms that adopt AI copilots fail to capture productivity gains?'];
  let mode = 'search', busy = false, ctl = null, assistant = {model: 'your model'};
  async function readJSON(r) {
    let j = null; try { j = await r.json(); } catch (e) { throw new Error(`The server answered HTTP ${r.status} without data. This page needs the Atlas server; try reloading in a moment.`); }
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  const post = window.atlasLocal.post;
  const clean = t => String(t ?? '').replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+/g, ' ').trim();   // some Crossref titles carry JATS tags (<scp>, <i>): shown without them
  const sim = (c, lo, hi) => `<span class="sim" title="Similarity to your question: ${(+c).toFixed(2)}"><i style="width:${Math.round(100 * Math.max(.04, Math.min(1, (c - lo) / (hi - lo))))}%"></i></span>`;

  function build() {
    const board = q('#askBoard'); if (!board) return; board.classList.add('ask3');
    board.innerHTML = `
      <div class="ask-guide" role="tablist" aria-label="Choose a function">
        <button type="button" role="tab" class="ask-card" data-mode="search" aria-selected="true"><span class="n">Search</span><b>The topics closest to what you are interested in.</b>
          <span>Enter a topic, research question or a few sentences. Search returns up to 10 of the Atlas's closest topics, each with its closest core question. Open a topic to inspect its podcast quotes and papers.</span>
          <small>Local search · no API key · podcasts from January to October 2026</small></button>
        <button type="button" role="tab" class="ask-card" data-mode="assess" aria-selected="false"><span class="n">AI assistant</span><b>Explore the potential of a research question.</b>
          <span>Enter one research question in English. The assistant summarizes how practitioners discuss the issue and how retrieved papers have studied it. Use the evidence and assessment to consider the question’s potential.</span>
          <small>OpenAI or Claude · API key or local CLI · internet required</small></button>
      </div>
      <div class="ask2-pane" id="paneSearch">
        <div class="ask-input"><label class="lab" for="askText">Enter a topic, research question or a few sentences</label>
          <textarea id="askText" rows="3" maxlength="4000" spellcheck="false" placeholder="${esc(SEARCH_EX[0][1])}"></textarea>
          <div class="ask-actions"><button id="askRun" class="primary-btn">Search</button><span id="askStatus" class="ask-status"></span></div>
          <div class="ask-examples"><span>Examples</span>${SEARCH_EX.map(e => `<button class="ask-ex" data-q="${esc(e[1])}">${esc(e[0])}</button>`).join('')}</div></div>
        <div id="askResults" hidden><p class="s-sum" id="sSum"></p><ol class="ts-list" id="tList"></ol>
          <p class="ask-foot">The bar beside each topic shows how close it is to your text. The list is ordered by text similarity and makes no judgment. Open a topic for its core questions, podcast quotes and papers. For an assessment based on quotes and papers, use the AI assistant.</p></div>
      </div>
      <div class="ask2-pane" id="paneAssess" hidden>
        <div class="chat-gate" id="assessGate" hidden></div>
        <div class="ask-input" id="assessCompose"><label class="lab" for="assessText">Enter one research question in English</label>
          <textarea id="assessText" rows="3" maxlength="1500" spellcheck="true" placeholder="${esc(ASSESS_EX[0])}"></textarea>
          <div class="ask-actions"><button id="assessRun" class="primary-btn">Assess</button><span id="assessStatus" class="ask-status"></span><span id="assessQuota" class="ask-status"></span></div>
          <div class="ask-examples"><span>Examples</span>${ASSESS_EX.map(e => `<button class="ask-ex" data-q="${esc(e)}">${esc(e.length > 64 ? e.slice(0, 62) + '…' : e)}</button>`).join('')}</div></div>
        <div id="assessResult"></div>
      </div>`;
    qa('.ask-card').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    q('#askRun').onclick = runSearch; q('#askText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runSearch(); });
    qa('#paneSearch .ask-ex').forEach(b => b.onclick = () => { q('#askText').value = b.dataset.q; runSearch(); });
    q('#tList').addEventListener('click', e => {   // a topic or a question opens its full page (app3.js)
      const t = e.target.closest('[data-topic]'), k = e.target.closest('[data-qid]');
      if (k) { e.preventDefault(); openQuestionPage(k.dataset.qid); } else if (t) { e.preventDefault(); openTopicPage(t.dataset.topic); } });
    q('#assessRun').onclick = runAssess; q('#assessText').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !busy) runAssess(); });
    qa('#paneAssess .ask-ex').forEach(b => b.onclick = () => { q('#assessText').value = b.dataset.q; q('#assessText').focus(); });
    if (window.atlasAuth) atlasAuth.onChange(() => { paintGate(); paintQuota(); });
    atlasLocal.mount(); paintGate(); paintQuota();
  }
  function setMode(m) {
    mode = m; qa('.ask-card').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
    q('#paneSearch').hidden = m !== 'search'; q('#paneAssess').hidden = m !== 'assess';
    if (m === 'assess') { paintGate(); setTimeout(() => q('#assessText')?.focus(), 30); }
    if (state.board === 'ask') paintHowto(m === 'assess' ? 'assess' : 'ask');   // the steps above follow the picked card (app.js)
  }

  /* ---------- readiness (app.js calls askStatus() when the board opens) ---------- */
  let poll = null;
  async function askStatus() {
    const el = q('#askStatus'); if (!el) return;
    try { const s = await readJSON(await fetch('api/status', {credentials: 'same-origin'})); el.classList.remove('err');
      if (s.assistant) { assistant = s.assistant; paintGate(); paintQuota(); }
      if (s.index.ready) { el.textContent = 'Ready.'; q('#askRun').disabled = false; }
      else { el.textContent = s.index.error ? 'The search index failed to load.' : 'Loading the search index…'; q('#askRun').disabled = true; clearTimeout(poll); if (!s.index.error) poll = setTimeout(askStatus, 3000); }
    } catch (e) { el.textContent = e.message.startsWith('The server answered') ? e.message : 'Server unreachable'; el.classList.add('err'); q('#askRun').disabled = false; }
  }
  window.askStatus = askStatus; window.askMode = () => mode;

  /* ---------- Search: the topics closest to the reader's text (user 2026-10-25); names and numbers come from the site data. The topic
     description is not shown in the list (user 2026-10-25); it is on the topic page ---------- */
  function topicItem(x, i, M, ML, weak) {
    const t = state.byId[x.topic_id]; if (!t) return '';
    return `<li class="ts-item"><div class="ts-head"><span class="ts-n">${String(i + 1).padStart(2, '0')}</span>
      <a class="ts-name" href="#topic/${esc(t.id)}" data-topic="${esc(t.id)}">${esc(t.name)}</a>${weak ? '<span class="ts-weak">Weak match</span>' : ''}${sim(x.score, .40, .75)}</div>
      ${x.question ? `<p class="ts-q"><span class="lab">Closest core question</span><a class="q-link" href="#question/${esc(x.question_id)}" data-qid="${esc(x.question_id)}">${esc(x.question)}</a></p>` : ''}
      <div class="ts-stats"><span><b>${fmt((t.heat[M] || [0, 0])[0])}</b> episodes in ${esc(ML)}</span><span><b>${fmt(t.episodes)}</b> episodes in all months</span><span><b>${fmt(t.papers || 0)}</b> related papers, ${fmt(t.papers_strict || 0)} core</span></div></li>`;
  }
  async function runSearch() {
    const text = q('#askText').value.trim(), st = q('#askStatus');
    if (text.length < 3) { st.textContent = 'Please type a topic.'; q('#askText').focus(); return; }
    q('#askRun').disabled = true; st.classList.remove('err'); st.textContent = 'Searching…'; const t0 = performance.now();
    try {
      const out = await post('api/search', {query: text}); q('#askResults').hidden = false;
      const M = state.meta.last_full_month, ML = (state.meta.periods.find(p => p.id === M) || {}).label || M, n = out.topics.length, cut = (+out.threshold).toFixed(2);
      q('#sSum').innerHTML = out.weak ? `No topic comes close to your text (score ${cut} or more). These are the ${n} closest of the Atlas's ${fmt(out.topics_total)} topics, shown as weak matches.`
        : out.passing > n ? `<b>${fmt(out.passing)}</b> of the Atlas's ${fmt(out.topics_total)} topics come close to your text (score ${cut} or more). The best ${n} are shown, best first.`
        : `<b>${n}</b> of the Atlas's ${fmt(out.topics_total)} topics ${n === 1 ? 'comes' : 'come'} close to your text (score ${cut} or more), best first.`;
      q('#tList').innerHTML = out.topics.map((x, i) => topicItem(x, i, M, ML, out.weak)).join('');
      st.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s. No assessment was generated.`;
      q('#askResults').scrollIntoView({block: 'start', behavior: 'smooth'});
    } catch (e) { st.textContent = e.message; st.classList.add('err'); }
    q('#askRun').disabled = false;
  }

  /* ---------- AI assistant ---------- */
  function paintGate() { const gate=q('#assessGate'); if(gate) gate.hidden=true; }
  function paintQuota() { const el=q('#assessQuota'); if(el) el.textContent='Your provider or CLI account limits apply.'; }
  async function runAssess() {
    if (busy) { stopAssess(); return; }   // while it runs, the button is Stop (user 2026-10-24)
    const text = q('#assessText').value.trim(), st = q('#assessStatus');
    if (text.length < 12) { st.textContent = 'Please write your question as at least a short sentence.'; return; }
    let provider; try { provider=atlasLocal.provider(); } catch(e) { st.textContent=e.message; st.classList.add('err'); return; }
    const request_id=atlasLocal.newRequest();
    const btn = q('#assessRun'); busy = true; ctl = new AbortController(); btn.textContent = 'Stop'; btn.classList.add('stop'); st.classList.remove('err'); const t0 = performance.now();
    const tick = setInterval(() => { st.textContent = `Assessing… ${Math.round((performance.now() - t0) / 1000)} s`; }, 500);
    q('#assessResult').innerHTML = '';
    try { const a = await post('api/assess', {question: text, provider, request_id}, ctl.signal); clearInterval(tick); st.textContent = '';
      renderAssessment(a); }
    catch (e) { clearInterval(tick);
      if (e.name === 'AbortError') st.textContent = 'Stopped. An API provider may still finish and charge for a request already sent. Wait briefly before trying again.';
      else { st.textContent = e.message; st.classList.add('err'); } }
    busy = false; ctl = null; btn.textContent = 'Assess'; btn.classList.remove('stop'); window.atlasAuth && atlasAuth.refresh();
  }
  function stopAssess() { if (!ctl) return; ctl.abort(); atlasLocal.stop().catch(() => {}); }
  // [E3] [P7] or [E3], [P7] (adjacent brackets form one group) -> "(quote 2, paper 1)", each a link to the listed item
  function cites(text, map) {
    return esc(text).replace(/\[[EP]\d+(?:\s*,\s*[EP]\d+)*\](?:\s*,?\s*\[[EP]\d+(?:\s*,\s*[EP]\d+)*\])*/g, grp => {
      const ids = (grp.match(/[EP]\d+/g) || []).filter(id => map[id]);
      return ids.length ? '(' + ids.map(id => `<a class="as-cite" href="#${map[id][0]}">${map[id][1]}</a>`).join(', ') + ')' : ''; });
  }
  const LV = {not: 0, rarely: 1, sometimes: 2, often: 3, most: 4};
  function renderAssessment(a) {
    const P = a.podcasts, R = a.research, map = {};
    P.quotes.forEach((x, i) => map[x.id] = ['as-q' + (i + 1), 'quote ' + (i + 1)]); R.papers.forEach((x, i) => map[x.id] = ['as-p' + (i + 1), 'paper ' + (i + 1)]);
    const topic = P.topic_id && typeof openTopicPage === 'function' ? `<a href="#topic/${esc(P.topic_id)}" class="as-topic" data-topic="${esc(P.topic_id)}">${esc(P.topic)}</a>` : esc(P.topic || '');
    const pnum = P.level === 'not' ? `No episode raises a problem closely related to your question (similarity 0.60 or more), out of ${fmt(P.episodes_total)}.`
      : P.level === 'rarely' ? `Raised directly in only ${fmt(P.episodes)} of ${fmt(P.episodes_total)} episodes, from ${fmt(P.programmes)} ${P.programmes === 1 ? 'show' : 'shows'}.`
      : `Raised directly in ${fmt(P.episodes)} of ${fmt(P.episodes_total)} episodes (${(100 * P.episodes / P.episodes_total).toFixed(1)}%), from ${fmt(P.programmes)} shows. Most of them fall under the topic ${topic}, which has more episodes than ${Math.round(P.topic_pct)}% of the Atlas's ${fmt(P.topics_total)} topics.`;
    const rs = R.reference_share, rref = rs ? ` For comparison, of the Atlas's ${fmt(R.reference_questions)} core questions, ${rs['0'] ?? 0}% have no paper rated 85 or more, ${rs['1'] ?? 0}% have one, ${rs['2'] ?? 0}% have two and ${(rs['3'] ?? 0) + (rs['4'] ?? 0)}% have three or more.` : '';
    const rnum = (R.related
      ? `${R.related} of the ${R.considered} papers closest to your question are related to it (rated 60 or more out of 100), and ${R.core} of them study the same question or mechanism (85 or more). ${R.related === 1 ? 'It is' : `All ${R.related} are`} listed below, highest rated first.`
      : `None of the ${R.considered} papers closest to your question is related to it (rated 60 or more out of 100).`) + ` The papers come from ${fmt(R.papers_total)} articles in seven journals.${rref}`;
    const qItem = (x, i) => `<li id="as-q${i + 1}"><span class="as-n">Quote ${i + 1}</span>${x.note ? `<p class="as-note">${esc(x.note)}</p>` : ''}<blockquote>“${esc(x.quote)}”</blockquote>
      <div class="s-src"><b>${esc(x.programme)}</b><small>${esc(x.date)}${x.views != null ? ' · ' + fmt(x.views) + ' views' : ''}</small></div>
      <div class="s-links"><a href="transcript/${esc(x.episode_id)}?seg=${x.segment_id}&p=${encodeURIComponent(x.problem_id)}" target="_blank" rel="noopener">Read in context ↗</a>${x.video_url ? `<a href="${esc(x.video_url)}" target="_blank" rel="noopener">YouTube ↗</a>` : ''}</div></li>`;
    const pItem = (p, i) => { const u = esc(paperUrl(p)); return `<li id="as-p${i + 1}"><span class="as-n">Paper ${i + 1} · ${p.relevance >= 85 ? 'core' : 'related'} · rated ${p.relevance}</span>
      <a class="s-title" href="${u}" target="_blank" rel="noopener">${esc(clean(p.title))}</a><div class="s-src"><small>${esc(p.journal)} ${p.year} · <a href="${u}" target="_blank" rel="noopener">${p.doi ? 'Article ↗' : 'Google Scholar ↗'}</a></small></div>${p.note ? `<p class="as-note">${esc(p.note)}</p>` : ''}</li>`; };
    q('#assessResult').innerHTML = `<div class="as-res">
      <div class="as-q"><span class="lab">Your question, as read</span><p>${esc(a.restated || a.question)}</p></div>
      <div class="pane-host">${paneTabs([['pod', 'In podcasts'], ['pap', 'In papers']].concat(a.overall ? [['ovr', 'Overall']] : []))}
      <div class="as-grid">
      <section class="as-block as-pod" data-pane-id="pod"><div class="as-head"><h3>In podcasts</h3><span class="as-verdict pv${LV[P.level]}">${esc(P.label)}</span></div><p class="as-num">${pnum}</p>${P.judgment ? `<p class="as-text">${cites(P.judgment, map)}</p>` : ''}
        ${P.quotes.length ? `<ol class="as-items">${P.quotes.map(qItem).join('')}</ol>` : ''}</section>
      <section class="as-block as-pap pane-off" data-pane-id="pap"><div class="as-head"><h3>In papers</h3><span class="as-verdict rv${R.level}">${esc(R.label)}</span></div><p class="as-num">${rnum}</p>${R.judgment ? `<p class="as-text">${cites(R.judgment, map)}</p>` : ''}
        ${R.papers.length ? `<ol class="as-items">${R.papers.map(pItem).join('')}</ol>` : ''}</section>
      ${a.overall ? `<section class="as-block as-overall pane-off" data-pane-id="ovr"><div class="as-head"><h3>Overall</h3></div><p class="as-text">${cites(a.overall, map)}</p></section>` : ''}</div></div>
      <p class="as-basis">Based on the ${P.considered} closest podcast quotes (January to October 2026) and the ${R.considered} closest papers (seven journals). Numbers are computed by the site, the judgments are written by ${esc(a.usage.model_label || a.usage.model)}${a.cached
        ? `. This answer was saved on this computer. No new model call was made.`
        : ` (${a.usage.seconds} s).`} Check the quotes and papers before you rely on them.</p></div>`;
    qa('#assessResult .as-topic').forEach(el => el.onclick = e => { e.preventDefault(); openTopicPage(el.dataset.topic); });
    // on phones the results are tabs (app3.js paneTabs): a citation first opens the tab that holds the quote or paper
    qa('#assessResult .as-cite').forEach(el => el.onclick = e => { e.preventDefault(); const t = q(el.getAttribute('href')); if (t) { const p = t.closest('[data-pane-id]'); if (p && p.classList.contains('pane-off')) showPane(t.closest('.pane-host'), p.dataset.paneId); t.scrollIntoView({block: 'center', behavior: 'smooth'}); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 1400); } });
    q('#assessResult').scrollIntoView({block: 'start', behavior: 'smooth'});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { build(); askStatus(); }); else { build(); askStatus(); }
})();
