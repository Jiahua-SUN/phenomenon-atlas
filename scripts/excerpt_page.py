import html
from starlette.responses import HTMLResponse
from starlette.concurrency import run_in_threadpool
import atlas_core
def need_core(): return atlas_core.get()

PAGE = """<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>%(title)s · Phenomenon Atlas</title>

<script>try{if(localStorage.getItem('atlasTheme3')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}</script>
<style>:root{--bg:#fff;--text:#000;--text2:#222;--muted:#6b6b6b;--line:#000;--line2:#e3e3e3;--accent:#e30613;--mark:#e306131f}
:root[data-theme=dark]{--bg:#000;--text:#fff;--text2:#ddd;--muted:#8a8a8a;--line:#fff;--line2:#262626;--accent:#ff2a2a;--mark:#ff2a2a38}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.75 Inter,Arial,sans-serif}
header{border-bottom:3px solid var(--line)}header div{max-width:1400px;margin:0 auto;padding:16px 40px}
.logo{font:800 19px "Inter Tight",Inter,Arial,sans-serif;letter-spacing:-.5px;color:var(--text);text-decoration:none}.logo i{font-style:normal;color:var(--accent)}
main{max-width:820px;margin:0 auto;padding:36px 40px 64px}
.eyebrow{font:700 11px Inter,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:var(--accent);margin:0 0 10px}
h1{font:800 30px/1.15 "Inter Tight",Inter,Arial,sans-serif;letter-spacing:-.5px;margin:0 0 10px}
.meta{font:500 13px Inter,Arial,sans-serif;color:var(--muted);margin:0 0 20px}
.links{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 26px}
.links a{font:700 13px Inter,Arial,sans-serif;color:var(--text);border:2px solid var(--line);padding:8px 14px;text-decoration:none}.links a:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.excerpt{border-left:3px solid var(--accent);padding:2px 0 2px 22px;margin:0 0 18px;color:var(--text2)}.excerpt mark{background:var(--mark);color:var(--text);font-weight:600;padding:1px 0}
.note{font:400 12.5px/1.6 Inter,Arial,sans-serif;color:var(--muted);border-top:1px solid var(--line2);padding-top:14px;margin-top:26px}
@media (max-width:600px){header div{padding:14px 16px}main{padding:24px 16px 48px}h1{font-size:24px}}</style></head><body>
<header><div><a class="logo" href="../">Phenomenon <i>Atlas</i></a></div></header><main>
<p class="eyebrow">Read in context · Excerpt</p><h1>%(etitle)s</h1><p class="meta">%(programme)s · %(date)s · %(source)s</p>
<div class="links">%(links)s</div>%(body)s
<p class="note">This is an excerpt: the quoted passage with up to 200 words before and after it. …… marks where the transcript continues. Out of respect for the creators' copyright, the full transcript is not shown here. Listen to or watch the whole episode through the links above.</p></main>
<script>document.querySelector('mark')?.scrollIntoView({block:'center'})</script></body></html>"""

def excerpt_html(x):
    t, a, b = x['text'], x['q_start'], x['q_end']
    if a is None or a < 0: return '<div class="excerpt">%s</div>' % html.escape(t)
    return '<div class="excerpt">%s<mark>%s</mark>%s</div>' % (html.escape(t[:a]), html.escape(t[a:b]), html.escape(t[b:]))

async def transcript(request):
    eid = request.path_params['episode_id']
    try: seg = int(request.query_params.get('seg', '-1'))
    except ValueError: seg = -1
    A = need_core(); x = await run_in_threadpool(A.excerpt, eid, seg, request.query_params.get('p'))
    links = []
    if x['podcast_url']: links.append('<a href="%s" target="_blank" rel="noopener">%s ↗</a>' % (html.escape(x['podcast_url']), 'Listen on the podcast' if x['podcast_url_kind'] == 'episode page' else 'Podcast audio'))
    if x['video_url']: links.append('<a href="%s" target="_blank" rel="noopener">Watch on YouTube ↗</a>' % html.escape(x['video_url']))
    body = ''.join(excerpt_html(e) for e in x['excerpts']) or '<div class="excerpt">No excerpt is stored for this position.</div>'
    page = PAGE % {'title': html.escape(x['title']), 'etitle': html.escape(x['title']), 'programme': html.escape(x['programme']), 'date': html.escape(x['upload_date']),
                   'source': 'automatic transcript' if x['source_type'] == 'asr' else 'published transcript', 'links': ''.join(links), 'body': body}
    return HTMLResponse(page, headers={'Cache-Control': 'no-store'})
