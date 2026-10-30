"""Private, loopback-only reviewer edition. Never run behind a public tunnel."""
from pathlib import Path
import argparse, asyncio, hashlib, json, os, re, secrets, sqlite3, sys, threading
from contextlib import asynccontextmanager
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'scripts'))
os.environ.update(ATLAS_BUNDLE=str(ROOT/'bundle'),ATLAS_EMBED_MODEL=str(ROOT/'models/bge-m3'),ATLAS_DEVICE='cpu',HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1')
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.responses import JSONResponse
from starlette.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
import atlas_core, atlas_assess, local_models, excerpt_page

TOKEN=secrets.token_urlsafe(32)
ACTIVE={}
LOCK=threading.Lock()
INFERENCE=threading.Lock()
CACHE=ROOT/'.runtime/answers.sqlite'

def response(value,code=200):return JSONResponse(value,status_code=code)
def error(message,code=400):return response({'error':message},code)
def load_index():
    try:atlas_core.get();print('Local search index ready.',flush=True)
    except Exception:print('Local index failed to load. Verify assets and installed dependencies.',flush=True)

@asynccontextmanager
async def lifespan(app):
    CACHE.parent.mkdir(exist_ok=True)
    with sqlite3.connect(CACHE) as db:db.execute('CREATE TABLE IF NOT EXISTS answers (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    threading.Thread(target=load_index,daemon=True).start()
    yield
    for event in list(ACTIVE.values()):event.set()

async def status(request):
    st=atlas_core.status()
    # Internal exception messages can contain machine paths.
    st['error']='Local index failed to load.' if st['error'] else None
    return response({'index':st,'user':None,'api_enabled':False,'local':True,'local_token':TOKEN,'assistant':{'model':'your model'}})

async def body(request):
    raw=await request.body()
    if len(raw)>32768:raise ValueError('The request is too large.')
    try:b=json.loads(raw)
    except Exception:raise ValueError('Expected a JSON request.') from None
    if not isinstance(b,dict):raise ValueError('Expected a JSON object.')
    return b

def available():return atlas_core.ready()

async def search(request):
    if not available():return error('The local search index is still loading.',503)
    try:
        b=await body(request);q=str(b.get('query') or '').strip()
        if len(q)<3:raise ValueError('Please type a topic.')
        def work():
            with INFERENCE:return atlas_core.get().search_topics(q[:atlas_core.MAX_QUERY_CHARS])
        return response(await run_in_threadpool(work))
    except ValueError as e:return error(str(e))
    except Exception:return error('Search could not finish. Verify the local runtime assets.',500)

async def cli_status(request):return response(await run_in_threadpool(local_models.codex_status))

async def assess(request):
    if not available():return error('The local search index is still loading.',503)
    try:
        b=await body(request);question=str(b.get('question') or '').strip()
        if not 12<=len(question)<=1500:raise ValueError('Write an English question between 12 and 1500 characters.')
        if not atlas_assess.is_english(question):raise ValueError('Please type your question in English.')
        provider=local_models.validate(b.get('provider'))
        request_id=str(b.get('request_id') or '')
        if not re.fullmatch(r'[a-zA-Z0-9-]{16,80}',request_id):raise ValueError('Invalid request ID. Reload the page.')
        identity={k:v for k,v in provider.items() if k!='api_key'}
        key=hashlib.sha256((atlas_assess.cache_key(question)+json.dumps(identity,sort_keys=True)).encode()).hexdigest()
        with sqlite3.connect(CACHE) as db:row=db.execute('SELECT value FROM answers WHERE key=?',(key,)).fetchone()
        if row:return response(dict(json.loads(row[0]),cached=True))
        with LOCK:
            if ACTIVE:return error('An assessment is already running. Wait for it to finish or stop it.',409)
            cancel=threading.Event();ACTIVE[request_id]=cancel
        try:
            def work():
                with INFERENCE:return atlas_assess.assess(question,provider=provider,cancel=cancel)
            result=await run_in_threadpool(work)
            if cancel.is_set():raise local_models.Cancelled('Stopped. The provider may still charge for the request.')
            with sqlite3.connect(CACHE) as db:db.execute('INSERT OR IGNORE INTO answers VALUES (?,?)',(key,json.dumps(result,ensure_ascii=False)))
            return response(dict(result,cached=False))
        finally:
            with LOCK:ACTIVE.pop(request_id,None)
    except local_models.Cancelled as e:return error(str(e),409)
    except (ValueError,local_models.ModelError) as e:return error(str(e))
    except Exception:return error('The assessment could not be completed. No answer was saved. Check the model connection and try again.',502)

async def stop(request):
    try:b=await body(request)
    except ValueError as e:return error(str(e))
    with LOCK:
        event=ACTIVE.get(str(b.get('request_id') or ''))
        if event:event.set()
    return response({'stopped':event is not None})

async def transcript(request):
    if not available():return error('The local index is still loading.',503)
    try:return await excerpt_page.transcript(request)
    except Exception:return error('This excerpt could not be opened.',404)

app=Starlette(lifespan=lifespan,routes=[Route('/api/status',status),Route('/api/search',search,methods=['POST']),Route('/api/cli/status',cli_status),Route('/api/assess',assess,methods=['POST']),Route('/api/assess/stop',stop,methods=['POST']),Route('/transcript/{episode_id}',transcript),Mount('/',StaticFiles(directory=ROOT/'dist',html=True))])

async def local_guard(request,call_next):
    host=request.headers.get('host','')
    if not re.fullmatch(r'(127\.0\.0\.1|localhost):[0-9]{1,5}',host):return error('Only a local browser can access this edition.',403)
    origin=request.headers.get('origin')
    if origin and origin!='http://'+host:return error('Cross-origin requests are not allowed.',403)
    if request.method not in ('GET','HEAD'):
        if request.headers.get('x-atlas-local')!=TOKEN:return error('Reload the local Atlas page before sending a request.',403)
    result=await call_next(request)
    result.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'})
    return result

from starlette.middleware.base import BaseHTTPMiddleware
app.add_middleware(BaseHTTPMiddleware, dispatch=local_guard)

if __name__=='__main__':
    import uvicorn
    ap=argparse.ArgumentParser();ap.add_argument('--port',type=int,default=18811);args=ap.parse_args()
    uvicorn.run(app,host='127.0.0.1',port=args.port,access_log=False,log_level='warning')
