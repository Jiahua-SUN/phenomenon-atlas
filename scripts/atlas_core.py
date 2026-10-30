"""Atlas data layer over the deploy bundle (design: the original Atlas design).

Reads only the bundle (env ATLAS_BUNDLE, default deploy/bundle); runs on CPU or GPU (env ATLAS_DEVICE = auto | cpu | cuda).
site layer, full year : retrieve() for dialog A, excerpt() for the "Read in context" page (the verbatim quote + 200 words each side,
                        cut ends marked ……; only these excerpts exist in the bundle, never whole transcripts).
api layer, window     : meta(), search(), list_topics(), get_topic(), get_question(), get_episode() - the database behind /v1, /mcp
                        and dialog B (months 2026-07..2026-10; questions open with >= 2 in-window episodes from >= 2 programmes).
model-only extras     : papers_full() and corpus_signal() for dialog B. papers_full() is the only function that returns an abstract;
                        its output goes to the model, never to a browser or API client.
"""
import os, json, time, zlib, sqlite3, threading, hashlib, collections
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
BUNDLE = os.environ.get('ATLAS_BUNDLE', os.path.join(ROOT, 'bundle'))
EMBED_MODEL = os.environ.get('ATLAS_EMBED_MODEL', os.path.join(ROOT, 'models', 'bge-m3'))
DIRECT_COS = 0.60; BROAD_COS = 0.55        # same thresholds as atlas_rag.py (calibrated 2026-10-21 on four test questions)
TOP_PROBLEMS = 400; N_TOPICS = 8; N_EVIDENCE = 12; N_PAPERS = 10; N_QUESTIONS = 8
MAX_QUERY_CHARS = 4000; CPU_CHUNK = 65536
TOPIC_SCORE_MIN = 0.55; TOPICS_MAX = 10; TOPICS_WEAK = 3   # Search = topics (user 2026-10-25): score cutoff, most shown, shown when none passes
PAGE_N = 20; LISTS_CACHED = 200; RARELY_BELOW = 10; N_PAPERS_LIST = 100   # Search pages; cached queries; podcast heat: fewer direct episodes = rarely discussed
JOURNALS = {'amj': 'Academy of Management Journal', 'amr': 'Academy of Management Review', 'asq': 'Administrative Science Quarterly', 'smj': 'Strategic Management Journal',
            'os': 'Organization Science', 'jom': 'Journal of Management', 'ms': 'Management Science'}


class NotFound(KeyError): pass


class Vectors:
    """Cosine scores against L2-normalised rows. GPU: fp16 torch matmul (as in atlas_rag.py). CPU: the fp16 matrix is kept as is
    (half the memory) and converted to float32 chunk by chunk, because numpy has no fast fp16 matmul."""
    def __init__(self, arr, dev, torch):
        self.dev, self.torch, self.n = dev, torch, arr.shape[0]
        self.M = torch.from_numpy(np.ascontiguousarray(arr)).to('cuda').half() if dev == 'cuda' else np.ascontiguousarray(arr, dtype=np.float16)

    def scores(self, q):
        if self.dev == 'cuda':
            return (self.M @ self.torch.from_numpy(q).to('cuda').half()).float().cpu().numpy()
        out = np.empty(self.n, dtype=np.float32)
        for i in range(0, self.n, CPU_CHUNK): out[i:i + CPU_CHUNK] = self.M[i:i + CPU_CHUNK].astype(np.float32) @ q
        return out


def topk(s, k, mask=None):
    """Indices of the k largest scores (optionally among mask), best first."""
    if mask is not None:
        idx = np.flatnonzero(mask)
        if len(idx) == 0: return idx
        sub = s[idx]; k = min(k, len(idx)); part = np.argpartition(-sub, k - 1)[:k]
        return idx[part[np.argsort(-sub[part], kind='stable')]]
    k = min(k, len(s)); part = np.argpartition(-s, k - 1)[:k]
    return part[np.argsort(-s[part], kind='stable')]


def _int(x): return None if x is None or (isinstance(x, float) and np.isnan(x)) or pd.isna(x) else int(x)


class Atlas:
    def __init__(self):
        import torch
        t0 = time.time(); dev = os.environ.get('ATLAS_DEVICE', 'auto')
        self.dev = ('cuda' if torch.cuda.is_available() else 'cpu') if dev == 'auto' else dev
        S, A = BUNDLE + '/site', BUNDLE + '/api'
        self.info = json.load(open(BUNDLE + '/meta.json', encoding='utf-8')); self.window = self.info['window']['months']
        # ---------- site layer (full year) ----------
        self.ep = pd.read_parquet(S + '/episodes.parquet').set_index('episode_id')
        pb = pd.read_parquet(S + '/problems.parquet'); self.pb = pb
        self.p_topic = pb.topic_id.values; self.p_episode = pb.episode_id.values; self.p_prog = pb.programme_id.values
        self.p_month = pb.episode_id.map(self.ep.p_month).fillna('').values; self.p_w = pb.episode_id.map(self.ep.w).fillna(0).values
        self.P = Vectors(np.load(S + '/problems_emb.npy'), self.dev, torch)
        self.topics = pd.read_parquet(S + '/topics.parquet').set_index('topic_id')
        heat = pd.read_parquet(S + '/heat_month.parquet'); self.months = sorted(heat.period.unique())
        self.topic_months = {k: dict(zip(g.period, g.n_episodes)) for k, g in heat.groupby('topic_id')}
        self.labels = {l['label']: l['name'] for l in json.load(open(S + '/labels.json', encoding='utf-8'))}
        self.themes = {t['theme_id']: t['name'] for t in json.load(open(S + '/themes.json', encoding='utf-8'))}
        self.q_all = pd.read_parquet(S + '/questions.parquet'); self.Q = Vectors(np.load(S + '/questions_emb.npy'), self.dev, torch)
        self.papers = pd.read_parquet(S + '/papers.parquet'); self.A = Vectors(np.load(S + '/papers_emb.npy'), self.dev, torch)
        self.n_episodes = len(self.ep); self.n_programmes = int(pb.programme_id.nunique())
        self.ex_db = S + '/excerpts.sqlite'; self._ex_local = threading.local()
        self._lists = collections.OrderedDict(); self._lists_lock = threading.Lock()   # Search lists per query (key = hash of the text)
        self.topic_eps = self.topics.n_episodes.values   # for the rank of a topic among all topics (podcast heat)
        hr = S + '/heat_reference.json'; self.heat_ref = json.load(open(hr, encoding='utf-8')) if os.path.exists(hr) else None   # p8a, research reference
        # ---------- api layer (window) ----------
        self.at = pd.read_parquet(A + '/topics.parquet').set_index('topic_id')
        self.at['monthly_episodes'] = self.at.monthly_episodes.apply(json.loads); self.at['monthly_weighted'] = self.at.monthly_weighted.apply(json.loads)
        self.aq = pd.read_parquet(A + '/questions.parquet').set_index('question_id')
        self.aev = pd.read_parquet(A + '/evidence.parquet'); self.aep = pd.read_parquet(A + '/episodes.parquet').set_index('episode_id')
        self.apl = pd.read_parquet(A + '/papers.parquet')
        self.AQ = Vectors(np.load(A + '/questions_emb.npy'), self.dev, torch); self.aq_ids = self.aq.index.values
        self.AE = Vectors(np.load(A + '/evidence_emb.npy'), self.dev, torch)
        self.AT = Vectors(np.load(A + '/topics_emb.npy'), self.dev, torch); self.at_ids = self.at.index.values
        self.ev_by_q = {k: g for k, g in self.aev.groupby('question_id')}; self.ev_by_e = {k: g for k, g in self.aev.groupby('episode_id')}
        self.pl_by_q = {k: g.sort_values('relevance', ascending=False) for k, g in self.apl.groupby('question_id')}
        self.q_by_t = {k: g.sort_values('rank_in_topic') for k, g in self.aq.reset_index().groupby('topic_id')}
        self.win_mask_p = np.isin(self.p_month, self.window)
        self.n_window_episodes = int(self.ep.p_month.isin(self.window).sum())
        # ---------- query encoder ----------
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(EMBED_MODEL, device=self.dev); self.model.max_seq_length = 1024
        self._enc_lock = threading.Lock(); self.embed('warm-up')
        self.load_seconds = round(time.time() - t0, 1)

    # ---------- helpers ----------
    def embed(self, text):
        with self._enc_lock:
            return self.model.encode([text[:MAX_QUERY_CHARS]], normalize_embeddings=True, convert_to_numpy=True)[0].astype(np.float32)

    def _ex(self):
        c = getattr(self._ex_local, 'con', None)
        if c is None: c = self._ex_local.con = sqlite3.connect('file:%s?mode=ro' % self.ex_db, uri=True, check_same_thread=False)
        return c

    def _topic_brief(self, tid):
        t = self.at.loc[tid]
        return {'topic_id': tid, 'name': t['name'], 'description': t['description'], 'window_episodes': int(t.window_episodes), 'window_programmes': int(t.window_programmes),
                'window_weighted': float(t.window_weighted), 'rank_episodes': int(t.rank_episodes), 'open_questions': int(t.open_questions)}

    def _labels_of(self, t): return [{'label': l, 'name': self.labels.get(l, l)} for l in t['labels']]
    def _themes_of(self, t): return [{'theme_id': x, 'name': self.themes.get(x, x)} for x in t['themes']]

    def _episode_brief(self, eid):
        e = self.aep.loc[eid]
        return {'episode_id': eid, 'programme': e.programme_title, 'title': e.episode_title, 'upload_date': str(e.upload_date), 'month': e.p_month, 'views': _int(e.views),
                'video_url': e.video_url, 'podcast_url': e.podcast_url, 'podcast_url_kind': e.podcast_url_kind}

    def _paper_link(self, l):
        return {'paper_id': l.paper_id, 'title': l.title, 'journal': JOURNALS.get(l.journal, l.journal), 'journal_code': l.journal, 'year': int(l.year),
                'doi': l.doi if isinstance(l.doi, str) else None, 'relevance': int(l.relevance), 'tier': l.tier, 'connection': l.connection}

    # ---------- site: dialog A (full year; same logic as atlas_rag.retrieve, without abstracts) ----------
    def retrieve(self, query):
        t0 = time.time(); q = self.embed(query); sims = self.P.scores(q)
        top_i = topk(sims, TOP_PROBLEMS); top_v = sims[top_i]
        hit = np.flatnonzero(sims >= DIRECT_COS); broad = np.flatnonzero(sims >= BROAD_COS)
        hm = pd.DataFrame({'e': self.p_episode[hit], 'm': self.p_month[hit], 'w': self.p_w[hit]}).drop_duplicates('e')
        by_month = hm.groupby('m').agg(n=('e', 'size'), w=('w', 'sum'))
        coverage = {'threshold': DIRECT_COS, 'problems': int(len(hit)), 'episodes': int(pd.Series(self.p_episode[hit]).nunique()), 'programmes': int(pd.Series(self.p_prog[hit]).nunique()),
                    'broad_threshold': BROAD_COS, 'broad_problems': int(len(broad)), 'broad_episodes': int(pd.Series(self.p_episode[broad]).nunique()), 'broad_programmes': int(pd.Series(self.p_prog[broad]).nunique()),
                    'episodes_total': self.n_episodes, 'programmes_total': self.n_programmes, 'months': self.months,
                    'by_month': [int(by_month.n.get(m, 0)) for m in self.months], 'by_month_w': [round(float(by_month.w.get(m, 0)), 1) for m in self.months]}
        df = pd.DataFrame({'i': top_i, 'cos': top_v, 'topic': self.p_topic[top_i], 'episode': self.p_episode[top_i]})
        df['gain'] = (df.cos - 0.4).clip(lower=0)
        tg = df.groupby('topic').agg(score=('gain', 'sum'), n=('i', 'size'), eps=('episode', 'nunique'), best=('cos', 'max')).sort_values('score', ascending=False).head(N_TOPICS)
        topics = []
        for tid, r in tg.iterrows():
            t = self.topics.loc[tid]
            topics.append({'topic_id': tid, 'name': t['name'], 'description': t['description'], 'episodes': int(t['n_episodes']), 'programmes': int(t['n_programmes']), 'weighted': round(float(t['w_sum']), 1),
                           'hits': int(r.n), 'hit_episodes': int(r.eps), 'best_cos': round(float(r.best), 3), 'score': round(float(r.score), 3),
                           'by_month': [int(self.topic_months.get(tid, {}).get(m, 0)) for m in self.months],
                           'labels': [self.labels.get(l, l) for l in t['labels']], 'themes': [self.themes.get(x, x) for x in t['themes']]})
        ev = []; seen_e = set(); seen_p = {}
        for i, c in zip(top_i, top_v):
            e = self.p_episode[i]; pg = self.p_prog[i]
            if e in seen_e or seen_p.get(pg, 0) >= 2: continue
            seen_e.add(e); seen_p[pg] = seen_p.get(pg, 0) + 1
            row = self.pb.iloc[i]; em = self.ep.loc[e]
            ev.append({'id': 'E%d' % (len(ev) + 1), 'problem_id': row.problem_id, 'episode_id': e, 'programme': em.programme_title, 'title': em.episode_title, 'date': str(em.upload_date), 'views': _int(em.views),
                       'video_url': em.video_url, 'segment_id': int(row.segment_id), 'who': row.who, 'question': row.question, 'quote': row.quote, 'cos': round(float(c), 3), 'topic_id': row.topic_id, 'topic': self.topics.loc[row.topic_id, 'name']})
            if len(ev) >= N_EVIDENCE: break
        ps = self.A.scores(q); papers = []
        for i in topk(ps, N_PAPERS):
            p = self.papers.iloc[int(i)]
            papers.append({'id': 'P%d' % (len(papers) + 1), 'paper_id': p.paper_id, 'title': p.title, 'journal': p.journal.upper(), 'year': int(p.year), 'doi': p.doi if isinstance(p.doi, str) else None, 'cos': round(float(ps[i]), 3)})
        qs = self.Q.scores(q); questions = []
        for i in topk(qs, N_QUESTIONS):
            r = self.q_all.iloc[int(i)]
            questions.append({'id': 'Q%d' % (len(questions) + 1), 'question_id': r.question_id, 'topic_id': r.topic_id, 'topic': self.topics.loc[r.topic_id, 'name'], 'question': r.question, 'who': r.who,
                              'episodes': int(r.n_evidence_episodes), 'programmes': int(r.n_evidence_programmes), 'cos': round(float(qs[i]), 3)})
        return {'coverage': coverage, 'topics': topics, 'evidence': ev, 'papers': papers, 'questions': questions, 'seconds': round(time.time() - t0, 2)}

    # ---------- site: Search (user 2026-10-25): the topics closest to the reader's text ----------
    def search_topics(self, query):
        """Score of a topic = the mean of the text's similarity to the topic's description and to the topic's closest core question (full
        year); a topic without core questions keeps its description similarity. Topics at TOPIC_SCORE_MIN or more, best first, at most
        TOPICS_MAX; when none reaches it, the TOPICS_WEAK closest, marked weak. Chosen on test inputs: description alone drifts to other
        industries, counts of matching quotes favour big topics, the closest question alone sometimes drifts."""
        t0 = time.time(); q = self.embed(query)
        d = pd.Series(self.AT.scores(q), index=self.at_ids)
        qd = pd.DataFrame({'t': self.q_all.topic_id.values, 'c': self.Q.scores(q)}); best = qd.loc[qd.groupby('t').c.idxmax()]
        best = best.assign(i=best.index).set_index('t'); c = best.c.reindex(d.index)   # i = row of the closest question in q_all
        score = ((d + c) / 2).where(c.notna(), d).sort_values(ascending=False, kind='stable')
        passing = score[score >= TOPIC_SCORE_MIN]; weak = passing.empty; top = score.head(TOPICS_WEAK) if weak else passing.head(TOPICS_MAX)
        items = []
        for t, sc in top.items():
            it = {'topic_id': t, 'score': round(float(sc), 3), 'description_cos': round(float(d[t]), 3)}
            if t in best.index:
                r = self.q_all.iloc[int(best.at[t, 'i'])]
                it.update(question_id=r.question_id, question=r.question, question_cos=round(float(best.loc[t, 'c']), 3))
            items.append(it)
        return {'topics': items, 'weak': bool(weak), 'passing': int(len(passing)), 'threshold': TOPIC_SCORE_MIN, 'max': TOPICS_MAX,
                'topics_total': int(len(d)), 'seconds': round(time.time() - t0, 2)}

    # ---------- site: Search lists (user 2026-10-24; not used by the site since 2026-10-25, when Search moved to topics) ----------
    def search_lists(self, query, n=PAGE_N):
        t0 = time.time(); key = hashlib.sha1(query.encode('utf-8')).hexdigest()[:16]; q = self.embed(query)
        s = self.P.scores(q); qi = np.flatnonzero(s >= BROAD_COS); qi = qi[np.argsort(-s[qi], kind='stable')]
        ps = self.A.scores(q); pi = topk(ps, N_PAPERS_LIST)   # papers: the closest N_PAPERS_LIST, no threshold (user 2026-10-24: paper cosines run lower, 0.55 often left none)
        with self._lists_lock:
            self._lists[key] = (qi, s[qi], pi, ps[pi]); self._lists.move_to_end(key)
            while len(self._lists) > LISTS_CACHED: self._lists.popitem(last=False)
        totals = {'quotes': int(len(qi)), 'episodes': int(pd.Series(self.p_episode[qi]).nunique()), 'programmes': int(pd.Series(self.p_prog[qi]).nunique()),
                  'papers': int(len(pi)), 'papers_total': int(len(self.papers)), 'episodes_total': self.n_episodes, 'threshold': BROAD_COS, 'papers_rule': 'closest %d' % N_PAPERS_LIST}
        return {'qid': key, 'totals': totals, 'quotes': self.list_page(key, 'quotes', 0, n), 'papers': self.list_page(key, 'papers', 0, n), 'seconds': round(time.time() - t0, 2)}

    def list_page(self, key, kind, offset=0, n=PAGE_N):
        with self._lists_lock:
            if key not in self._lists: raise NotFound('this search has expired; please search again')
            qi, qv, pi, pv = self._lists[key]
        offset = max(0, int(offset)); n = max(1, min(50, int(n)))
        if kind == 'quotes':
            items = []
            for i, c in zip(qi[offset:offset + n], qv[offset:offset + n]):
                row = self.pb.iloc[int(i)]; e = row.episode_id; em = self.ep.loc[e]
                items.append({'problem_id': row.problem_id, 'episode_id': e, 'programme': em.programme_title, 'title': em.episode_title, 'date': str(em.upload_date), 'views': _int(em.views),
                              'video_url': em.video_url if isinstance(em.video_url, str) else None, 'segment_id': int(row.segment_id), 'who': row.who, 'quote': row.quote, 'cos': round(float(c), 3)})
            return {'offset': offset, 'items': items, 'more': offset + len(items) < len(qi)}
        items = []
        for i, c in zip(pi[offset:offset + n], pv[offset:offset + n]):
            pp = self.papers.iloc[int(i)]
            items.append({'paper_id': pp.paper_id, 'title': pp.title, 'journal': JOURNALS.get(pp.journal, pp.journal.upper()), 'journal_code': pp.journal, 'year': int(pp.year), 'doi': pp.doi if isinstance(pp.doi, str) else None, 'cos': round(float(c), 3)})
        return {'offset': offset, 'items': items, 'more': offset + len(items) < len(pi)}

    # ---------- AI assistant: podcast heat of an asked question (user's definition, 2026-10-24) ----------
    def podcast_heat(self, q):
        """Direct matches = episodes with a problem at cos >= DIRECT_COS. 0 = not discussed, fewer than RARELY_BELOW = rarely; otherwise the
        topic holding most of those episodes is ranked among all topics by its episodes in the year. Returns (heat dict, problem scores)."""
        s = self.P.scores(q); hit = np.flatnonzero(s >= DIRECT_COS)
        d = pd.DataFrame({'e': self.p_episode[hit], 't': self.p_topic[hit], 'g': self.p_prog[hit]})
        n_ep, n_pg = int(d.e.nunique()), int(d.g.nunique())
        h = {'episodes': n_ep, 'programmes': n_pg, 'episodes_total': self.n_episodes, 'threshold': DIRECT_COS, 'rarely_below': RARELY_BELOW, 'topics_total': int(len(self.topic_eps))}
        if n_ep == 0: h['level'] = 'not'
        elif n_ep < RARELY_BELOW: h['level'] = 'rarely'
        else:
            main = d.drop_duplicates(['e', 't']).groupby('t').e.nunique().sort_values(ascending=False, kind='stable'); tid = main.index[0]; te = int(self.topics.loc[tid, 'n_episodes'])
            pct = 100.0 * float((self.topic_eps < te).mean())
            h.update({'topic_id': tid, 'topic': self.topics.loc[tid, 'name'], 'topic_episodes': te, 'topic_pct': round(pct, 1), 'episodes_in_topic': int(main.iloc[0]),
                      'level': 'most' if pct >= 90 else 'often' if pct >= 50 else 'sometimes'})
        return h, s

    def excerpt(self, episode_id, seg, problem_id=None):
        """"Read in context": the stored excerpt of one problem (problem_id), or of every problem cited at that segment."""
        if episode_id not in self.ep.index: raise NotFound('unknown episode')
        e = self.ep.loc[episode_id]; c = self._ex()
        rows = c.execute('SELECT problem_id, z, q_start, q_end FROM excerpt WHERE problem_id = ? AND episode_id = ?', (problem_id, episode_id)).fetchall() if problem_id else []
        if not rows: rows = c.execute('SELECT problem_id, z, q_start, q_end FROM excerpt WHERE episode_id = ? AND segment_id = ? ORDER BY problem_id', (episode_id, seg)).fetchall()
        out, seen = [], set()
        for pid, z, qs, qe in rows:
            t = zlib.decompress(z).decode('utf-8')
            if t in seen: continue
            seen.add(t); out.append({'problem_id': pid, 'text': t, 'q_start': qs, 'q_end': qe})
        return {'episode_id': episode_id, 'programme': e.programme_title, 'title': e.episode_title, 'upload_date': str(e.upload_date), 'source_type': e.source_type,
                'video_url': e.video_url, 'podcast_url': e.podcast_url, 'podcast_url_kind': e.podcast_url_kind, 'segment_id': seg, 'excerpts': out}

    # ---------- api layer (window) ----------
    def meta(self):
        lab_n = {}; th_n = {}
        for t in self.at.itertuples():
            for l in t.labels: lab_n[l] = lab_n.get(l, 0) + 1
            for x in t.themes: th_n[x] = th_n.get(x, 0) + 1
        return {'name': 'Phenomenon Atlas', 'version': self.info['version'], 'built': self.info['built'],
                'scope': 'Strategic problems practitioners raise in 2026 business podcasts (YouTube-matched), the core questions distilled from them, verbatim evidence, and linked papers from AMJ, AMR, ASQ, SMJ, Organization Science, Journal of Management and Management Science.',
                'window': {'months': self.window, 'partial_months': self.info['window']['partial'], 'date_rule': self.info['window']['date_rule'], 'question_rule': self.info['window']['question_rule']},
                'counts': {'topics': len(self.at), 'topics_with_questions': int((self.at.open_questions > 0).sum()), 'questions': len(self.aq), 'evidence': len(self.aev), 'episodes': len(self.aep),
                           'paper_links': len(self.apl), 'papers': int(self.apl.paper_id.nunique()), 'window_episodes_in_corpus': self.n_window_episodes},
                'heat': {'window_episodes': 'distinct episodes in the window with at least one verified problem in the topic',
                         'window_weighted': 'the same episodes weighted 0-2 by the percentile of their YouTube views among uploads of the same ISO week (median 1)'},
                'paper_tiers': self.info['paper_tiers'],
                'labels': [{'label': k, 'name': v, 'topics': lab_n.get(k, 0)} for k, v in self.labels.items()],
                'themes': [{'theme_id': k, 'name': v, 'topics': th_n.get(k, 0)} for k, v in self.themes.items()],
                'excerpts': 'Each evidence item has the verbatim quote and an excerpt: the quote plus up to 200 words before and after it, cut ends marked ……; quote_start/quote_end locate the quote inside the excerpt. Excerpts only, for copyright reasons; listen to the full episode via podcast_url or video_url.',
                'citation': 'Cite episodes by programme, title and podcast or YouTube URL; cite papers by DOI. Quotes are verbatim from automatic or published transcripts.'}

    def _check_filters(self, label, theme):
        if label and label not in self.labels: raise ValueError('unknown label %r; see meta() for the list' % label)
        if theme and theme not in self.themes: raise ValueError('unknown theme %r; see meta() for the list' % theme)

    def _topic_mask(self, tids, label=None, theme=None, topic_id=None):
        m = np.ones(len(tids), dtype=bool)
        if topic_id: m &= (tids == topic_id)
        if label: ok = set(self.at.index[self.at.labels.apply(lambda x: label in x)]); m &= np.isin(tids, list(ok))
        if theme: ok = set(self.at.index[self.at.themes.apply(lambda x: theme in x)]); m &= np.isin(tids, list(ok))
        return m

    def search(self, query, type='question', k=10, label=None, theme=None, topic_id=None):
        query = (query or '').strip()
        if len(query) < 3: raise ValueError('query too short')
        if type not in ('question', 'topic', 'evidence'): raise ValueError("type must be 'question', 'topic' or 'evidence'")
        self._check_filters(label, theme); k = max(1, min(int(k), 25)); q = self.embed(query); out = []
        if type == 'question':
            tids = self.aq.topic_id.values; s = self.AQ.scores(q)
            for i in topk(s, k, self._topic_mask(tids, label, theme, topic_id) if (label or theme or topic_id) else None):
                r = self.aq.iloc[int(i)]
                out.append({'question_id': self.aq_ids[i], 'question': r.question, 'who': r.who, 'topic_id': r.topic_id, 'topic': self.at.loc[r.topic_id, 'name'],
                            'window_episodes': int(r.n_window_episodes), 'window_programmes': int(r.n_window_programmes), 'score': round(float(s[i]), 3)})
        elif type == 'topic':
            s = self.AT.scores(q)
            for i in topk(s, k, self._topic_mask(self.at_ids, label, theme, topic_id) if (label or theme or topic_id) else None):
                out.append(dict(self._topic_brief(self.at_ids[i]), score=round(float(s[i]), 3)))
        else:
            tids = self.aev.question_id.map(self.aq.topic_id).values; s = self.AE.scores(q)
            for i in topk(s, k, self._topic_mask(tids, label, theme, topic_id) if (label or theme or topic_id) else None):
                r = self.aev.iloc[int(i)]
                out.append(dict(self._episode_brief(r.episode_id), question_id=r.question_id, question=self.aq.loc[r.question_id, 'question'], problem_id=r.problem_id, segment_id=int(r.segment_id),
                                who=r.who, quote=r.quote, score=round(float(s[i]), 3)))
        return {'query': query, 'type': type, 'window': self.window, 'results': out}

    def list_topics(self, label=None, theme=None, sort='episodes', k=20, offset=0):
        self._check_filters(label, theme)
        if sort not in ('episodes', 'weighted'): raise ValueError("sort must be 'episodes' or 'weighted'")
        t = self.at
        if label: t = t[t.labels.apply(lambda x: label in x)]
        if theme: t = t[t.themes.apply(lambda x: theme in x)]
        t = t.sort_values('window_episodes' if sort == 'episodes' else 'window_weighted', ascending=False)
        k = max(1, min(int(k), 100)); offset = max(0, int(offset)); page = t.iloc[offset:offset + k]
        return {'window': self.window, 'filter': {'label': label, 'theme': theme}, 'sort': sort, 'total': len(t), 'offset': offset,
                'topics': [dict(self._topic_brief(tid), monthly_episodes=r.monthly_episodes) for tid, r in page.iterrows()]}

    def get_topic(self, topic_id):
        if topic_id not in self.at.index: raise NotFound('unknown topic %r' % topic_id)
        t = self.at.loc[topic_id]; qs = self.q_by_t.get(topic_id)
        questions = [] if qs is None else [{'question_id': r.question_id, 'question': r.question, 'who': r.who, 'window_episodes': int(r.n_window_episodes), 'window_programmes': int(r.n_window_programmes)} for r in qs.itertuples()]
        best = {}
        for qid in ([] if qs is None else qs.question_id):
            for l in (self.pl_by_q[qid].itertuples() if qid in self.pl_by_q else []):
                if l.paper_id not in best or best[l.paper_id]['relevance'] < l.relevance: best[l.paper_id] = dict(self._paper_link(l), question_id=qid)
        papers = sorted(best.values(), key=lambda p: -p['relevance'])
        return dict(self._topic_brief(topic_id), window=self.window, monthly_episodes=t.monthly_episodes, monthly_weighted=t.monthly_weighted, rank_weighted=int(t.rank_weighted),
                    labels=self._labels_of(t), themes=self._themes_of(t), questions=questions, papers=papers[:15], papers_total=len(papers))

    def get_question(self, question_id):
        if question_id not in self.aq.index: raise NotFound('unknown or not open question %r' % question_id)
        r = self.aq.loc[question_id]; ev = self.ev_by_q[question_id].copy()
        ev['_d'] = ev.episode_id.map(self.aep.upload_date); ev = ev.sort_values('_d', ascending=False)
        evidence = [dict(self._episode_brief(e.episode_id), problem_id=e.problem_id, segment_id=int(e.segment_id), who=e.who, quote=e.quote, excerpt=e.excerpt, quote_start=int(e.q_start), quote_end=int(e.q_end)) for e in ev.itertuples()]
        papers = [self._paper_link(l) for l in self.pl_by_q[question_id].itertuples()] if question_id in self.pl_by_q else []
        return {'question_id': question_id, 'question': r.question, 'who': r.who, 'topic_id': r.topic_id, 'topic': self.at.loc[r.topic_id, 'name'], 'window': self.window,
                'window_episodes': int(r.n_window_episodes), 'window_programmes': int(r.n_window_programmes), 'confidence': r.confidence if isinstance(r.confidence, str) else _int(r.confidence),
                'evidence': evidence, 'papers': papers}

    def get_episode(self, episode_id):
        if episode_id not in self.aep.index: raise NotFound('unknown episode %r, or not cited by an open question in the window' % episode_id)
        ev = self.ev_by_e[episode_id]
        return dict(self._episode_brief(episode_id), evidence=[{'question_id': e.question_id, 'question': self.aq.loc[e.question_id, 'question'], 'topic_id': self.aq.loc[e.question_id, 'topic_id'],
                                                                 'problem_id': e.problem_id, 'segment_id': int(e.segment_id), 'who': e.who, 'quote': e.quote, 'excerpt': e.excerpt,
                                                                 'quote_start': int(e.q_start), 'quote_end': int(e.q_end)} for e in ev.itertuples()])

    # ---------- dialog B extras (model only) ----------
    def papers_full(self, query, k=8, journals=None, year_from=None, year_to=None):
        k = max(1, min(int(k), 10)); s = self.A.scores(self.embed(query)); m = None
        if journals or year_from or year_to:
            m = np.ones(len(self.papers), dtype=bool)
            if journals: m &= self.papers.journal.isin([j.lower() for j in journals]).values
            if year_from: m &= (self.papers.year >= int(year_from)).values
            if year_to: m &= (self.papers.year <= int(year_to)).values
        out = []
        for i in topk(s, k, m):
            p = self.papers.iloc[int(i)]; ab = p.abstract if isinstance(p.abstract, str) else ''
            out.append({'paper_id': p.paper_id, 'title': p.title, 'journal': JOURNALS.get(p.journal, p.journal), 'year': int(p.year), 'doi': p.doi if isinstance(p.doi, str) else None,
                        'keywords': list(p.author_keywords)[:8] if p.author_keywords is not None else [], 'abstract_for_model_only': ab[:900], 'score': round(float(s[i]), 3)})
        return {'query': query, 'results': out}

    def corpus_signal(self, query):
        s = self.P.scores(self.embed(query)); res = {'window': self.window, 'window_episodes_total': self.n_window_episodes}
        for name, thr in (('closely_related', DIRECT_COS), ('same_broad_area', BROAD_COS)):
            h = np.flatnonzero((s >= thr) & self.win_mask_p); eps = pd.Series(self.p_episode[h]).drop_duplicates()
            bm = pd.Series(self.p_month[h], index=self.p_episode[h]); bm = bm[~bm.index.duplicated()]
            res[name] = {'cosine_threshold': thr, 'problems': int(len(h)), 'episodes': int(len(eps)), 'programmes': int(pd.Series(self.p_prog[h]).nunique()),
                         'share_of_window_episodes': round(len(eps) / max(self.n_window_episodes, 1), 4), 'episodes_by_month': {m: int((bm == m).sum()) for m in self.window}}
        return res


_atlas = None; _lock = threading.Lock(); _error = None
def get():
    global _atlas, _error
    with _lock:
        if _atlas is None:
            try: _atlas = Atlas(); _error = None
            except Exception as e: _error = '%s: %s' % (type(e).__name__, e); raise
    return _atlas

def ready(): return _atlas is not None
def status(): return {'ready': _atlas is not None, 'error': _error, 'device': None if _atlas is None else _atlas.dev, 'load_seconds': None if _atlas is None else _atlas.load_seconds}
