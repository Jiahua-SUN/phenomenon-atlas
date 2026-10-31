"""User-owned OpenAI and Claude connections. Never persist credentials or log request bodies."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import time

API_BASES={'openai':'https://api.openai.com/v1','anthropic':'https://api.anthropic.com/v1'}

class ModelError(ValueError):pass
class Cancelled(ModelError):pass

def validate(settings):
    if not isinstance(settings,dict):raise ModelError('Choose a model connection first.')
    mode=settings.get('mode','api')
    if mode not in ('api','codex','claude'):raise ModelError('Unknown model connection.')
    model=str(settings.get('model') or '').strip()
    if model and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}',model):raise ModelError('Enter a valid model ID.')
    if mode in ('codex','claude'):return {'mode':mode,'model':model}
    base=str(settings.get('base_url') or '').strip().rstrip('/')
    provider=settings.get('provider') or next((p for p,u in API_BASES.items() if u==base),None)
    if provider not in API_BASES or base!=API_BASES[provider]:
        raise ModelError('Choose OpenAI or Claude. Atlas uses the official API address automatically.')
    key=str(settings.get('api_key') or '').strip()
    if not key or len(key)>4096 or any(c in key for c in '\r\n'):raise ModelError('Enter your API key.')
    if not model:raise ModelError('Enter the model ID supplied by your provider.')
    if provider=='anthropic' and not model.startswith('claude-'):raise ModelError('Copy a Claude API model ID from the official model list.')
    return {'mode':mode,'provider':provider,'base_url':base,'model':model,'api_key':key}

def claude_path():
    native=Path.home()/'.local/bin/claude.exe'
    if os.name=='nt' and native.is_file():return str(native)
    return shutil.which('claude.exe') or shutil.which('claude') or shutil.which('claude.cmd')

def claude_environment():
    env=os.environ.copy()
    for key in list(env):
        if key.endswith('API_KEY') or key.endswith('BASE_URL') or key.startswith('ANTHROPIC_') or key.startswith('CLAUDE_CODE_USE_') or key=='CLAUDE_CODE_OAUTH_TOKEN':
            env.pop(key,None)
    env['CLAUDE_CODE_SKIP_PROMPT_HISTORY']='1'
    return env

def claude_status():
    exe=claude_path()
    if not exe:return {'installed':False,'logged_in':False,'message':'Install Claude Code, run claude auth login, then check again.'}
    try:
        p=subprocess.run([exe,'--safe-mode','--setting-sources','','--settings','{"disableAllHooks":true}','auth','status'],env=claude_environment(),capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=12,**child_options())
        data=json.loads(p.stdout)
        logged=p.returncode==0 and data.get('loggedIn') is True
        subscription=data.get('authMethod')=='claude.ai'
        return {'installed':True,'logged_in':logged,'subscription_login':subscription,
                'message':('Connected with Claude. Your account limits apply.' if subscription else 'Connected. Billing follows your Claude Code sign-in method.') if logged else 'Run claude auth login in your terminal, then check again.'}
    except Exception:return {'installed':True,'logged_in':False,'message':'Claude status could not be checked. Update Claude Code and run claude auth status in a terminal.'}

def codex_path():
    # Prefer the native executable when installed through the npm distribution on Windows.
    if os.name=='nt':
        npm=Path(os.environ.get('APPDATA',''))/'npm/node_modules/@openai'
        for p in npm.glob('codex*/vendor/*/codex/codex.exe'):
            if p.is_file():return str(p)
        for p in npm.glob('codex/node_modules/@openai/codex*/vendor/*/bin/codex.exe'):
            if p.is_file():return str(p)
    return shutil.which('codex.exe') or shutil.which('codex') or shutil.which('codex.cmd')

def child_options():
    return {'creationflags':subprocess.CREATE_NO_WINDOW} if os.name=='nt' else {'start_new_session':True}

def codex_status():
    exe=codex_path()
    if not exe:return {'installed':False,'logged_in':False,'message':'Install Codex CLI, run codex login, then check again.'}
    try:
        p=subprocess.run([exe,'login','status'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=12,**child_options())
        text=(p.stdout+p.stderr).lower()
        return {'installed':True,'logged_in':p.returncode==0,'subscription_login':'chatgpt' in text,
                'message':('Connected with ChatGPT. Your account limits apply.' if 'chatgpt' in text else 'Connected. Billing follows your Codex sign-in method.') if p.returncode==0 else 'Run codex login in your terminal, then check again.'}
    except Exception:return {'installed':True,'logged_in':False,'message':'Codex status could not be checked. Try codex login status in a terminal.'}

def output_schema(user):
    def obj(props):return {'type':'object','properties':props,'required':list(props),'additionalProperties':False}
    string={'type':'string'}
    return obj({'restated':string,'podcast_picks':{'type':'array','items':obj({'id':{'type':'string','enum':[q['id'] for q in user['quotes']]},'note':string})},
        'podcast_judgment':string,'paper_ratings':{'type':'array','items':obj({'id':{'type':'string','enum':[p['id'] for p in user['papers']]},'relevance':{'type':'integer'},'note':string})},
        'research_judgment':string,'overall':string})

def stop_process(proc):
    if os.name=='nt':subprocess.run(['taskkill','/PID',str(proc.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,**child_options())
    else:
        import signal
        try:os.killpg(proc.pid,signal.SIGTERM)
        except ProcessLookupError:pass

def generate(system,user,settings,cancel=None):
    settings=validate(settings)
    cancel=cancel or threading.Event()
    if cancel.is_set():raise Cancelled('Stopped.')
    if settings['mode']=='codex':return _codex(system,user,settings,cancel)
    if settings['mode']=='claude':return _claude(system,user,settings,cancel)
    from openai import OpenAI
    model=settings['model']
    try:
        with OpenAI(api_key=settings['api_key'],base_url=settings['base_url'],timeout=180,max_retries=0) as client:
            kw={'model':model,'response_format':{'type':'json_object'},'messages':[{'role':'system','content':system},{'role':'user','content':json.dumps(user,ensure_ascii=False)}]}
            if settings['provider']=='anthropic':
                kw.update(max_tokens=6000,response_format={'type':'json_schema','json_schema':{'name':'atlas_assessment','strict':True,'schema':output_schema(user)}})
            else:kw['max_completion_tokens']=6000
            response=client.chat.completions.create(**kw)
    except Exception as e:
        # Provider exceptions may include request content. Never relay their text.
        code=getattr(e,'status_code',None)
        raise ModelError(f'The model provider rejected or could not complete the request (HTTP {code or "unavailable"}). Check your connection, model ID and key.') from None
    if cancel.is_set():raise Cancelled('Stopped. The provider may still charge for the completed request.')
    usage=response.usage
    return response.choices[0].message.content or '',{'model':model,'model_label':model,'billed':'your API account','tokens_in':usage.prompt_tokens if usage else None,'tokens_out':usage.completion_tokens if usage else None}

def _claude(system,user,settings,cancel):
    exe=claude_path()
    if not exe:raise ModelError('Claude Code was not found. Install it and run claude auth login first.')
    with tempfile.TemporaryDirectory(prefix='atlas-claude-') as work:
        cmd=[exe,'--print','--safe-mode','--output-format','json','--json-schema',json.dumps(output_schema(user)),
             '--tools','','--disallowedTools','mcp__*','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
             '--setting-sources','','--settings','{"disableAllHooks":true}',
             '--no-session-persistence','--no-chrome','--disable-slash-commands']
        if settings['model']:cmd+=['--model',settings['model']]
        prompt=system+'\n\nUse only the following evidence. Return the requested JSON.\n'+json.dumps(user,ensure_ascii=False)
        env=claude_environment()
        try:proc=subprocess.Popen(cmd,cwd=work,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**child_options())
        except OSError:raise ModelError('Claude Code could not start. Update its installation and try again.') from None
        result={}
        def communicate():
            try:result['io']=proc.communicate(prompt.encode('utf-8'))
            except Exception:result['error']=True
        worker=threading.Thread(target=communicate,daemon=True);worker.start();deadline=time.monotonic()+240
        while worker.is_alive():
            if cancel.is_set() or time.monotonic()>deadline:
                stop_process(proc);worker.join(5)
                raise Cancelled('Stopped.') if cancel.is_set() else ModelError('Claude Code did not finish within four minutes.')
            worker.join(.2)
        if cancel.is_set():raise Cancelled('Stopped.')
        if proc.returncode!=0 or 'io' not in result:
            raise ModelError('Claude Code could not complete the request. Check its version, sign-in and account limits.')
        try:
            data=json.loads(result['io'][0]); answer=data.get('structured_output')
            if data.get('is_error') or not isinstance(answer,dict):raise ValueError()
        except (ValueError,TypeError,AttributeError):raise ModelError('Claude Code did not return a complete structured assessment. Update it and try again.') from None
    usage=data.get('usage') or {}
    return json.dumps(answer,ensure_ascii=False),{'model':settings['model'] or 'Claude Code default','model_label':'Claude Code','billed':'your Claude Code account','tokens_in':usage.get('input_tokens'),'tokens_out':usage.get('output_tokens')}

def _codex(system,user,settings,cancel):
    exe=codex_path()
    if not exe:raise ModelError('Codex CLI was not found. Install it and run codex login first.')
    with tempfile.TemporaryDirectory(prefix='atlas-assessment-') as work:
        folder=Path(work); schema=folder/'response.schema.json'; output=folder/'assessment.json'
        schema.write_text(json.dumps(output_schema(user)),encoding='utf-8')
        cmd=[exe,'exec','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only',
             '--disable','shell_tool','--disable','web_search_request','--disable','web_search_cached',
             '--output-schema',str(schema),'--output-last-message',str(output),'--color','never','-']
        if settings['model']:cmd[2:2]=['--model',settings['model']]
        prompt=system+'\n\nUse only the following evidence. Do not use tools or inspect files. Return the requested JSON.\n'+json.dumps(user,ensure_ascii=False)
        env=os.environ.copy()
        for key in list(env):
            if key.endswith('API_KEY') or key in ('CODEX_API_KEY','OPENAI_BASE_URL'):env.pop(key,None)
        proc=subprocess.Popen(cmd,cwd=folder,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**child_options())
        result={}
        def communicate():
            try:result['io']=proc.communicate(prompt.encode('utf-8'))
            except Exception:result['error']=True
        worker=threading.Thread(target=communicate,daemon=True);worker.start();deadline=time.monotonic()+240
        while worker.is_alive():
            if cancel.is_set() or time.monotonic()>deadline:
                stop_process(proc);worker.join(5)
                raise Cancelled('Stopped.') if cancel.is_set() else ModelError('Codex did not finish within four minutes.')
            worker.join(.2)
        if proc.returncode!=0 or not output.is_file():
            raise ModelError('Codex could not complete the request. Check codex login status, account limits, and that Codex CLI is up to date.')
        raw=output.read_text(encoding='utf-8')
    return raw,{'model':settings['model'] or 'Codex CLI default','model_label':'Codex CLI'+(' ('+settings['model']+')' if settings['model'] else ''),'billed':'your Codex account','tokens_in':None,'tokens_out':None}
