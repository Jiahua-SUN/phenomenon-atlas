"""Cold public-download smoke test for disposable GitHub-hosted machines."""
from pathlib import Path
import hashlib, json, os, platform, shutil, signal, subprocess, sys, time, urllib.request, zipfile

TEMP = Path(os.environ['RUNNER_TEMP']).resolve()
WORK = TEMP / 'atlas-check'
OUT = TEMP / 'atlas-evidence'
REPORT = {'platform': platform.platform(), 'architecture': platform.machine(), 'steps': {}}
BASE = 'http://127.0.0.1:18811'
PROC = None

def save():
    OUT.mkdir(exist_ok=True)
    (OUT/'result.json').write_text(json.dumps(REPORT, indent=2), encoding='utf-8')

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Atlas-install-check/1.0'})
    return urllib.request.urlopen(req, timeout=45).read()

def run(args, cwd, name, timeout=600, env=None):
    started = time.monotonic()
    with (OUT/(name+'.log')).open('w', encoding='utf-8') as log:
        result = subprocess.run(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, timeout=timeout, env=env)
    REPORT['steps'][name] = {'exit_code': result.returncode, 'seconds': round(time.monotonic()-started,1)}
    save()
    if result.returncode:
        print((OUT/(name+'.log')).read_text(encoding='utf-8',errors='replace')[-14000:], flush=True)
        raise RuntimeError(name+' failed')

def stop():
    global PROC
    if PROC is None:
        return
    if os.name == 'nt':
        subprocess.run(['taskkill','/PID',str(PROC.pid),'/T','/F'], capture_output=True)
    else:
        # uv may place Python in a separate process group. Stop only descendants
        # of our launcher, then wait for their listening socket to close.
        rows=subprocess.check_output(['ps','-axo','pid=,ppid='],text=True).splitlines()
        parents={int(row.split()[0]):int(row.split()[1]) for row in rows}
        owned={PROC.pid}
        while True:
            expanded=owned | {pid for pid,ppid in parents.items() if ppid in owned}
            if expanded==owned: break
            owned=expanded
        for pid in sorted(owned,reverse=True):
            try: os.kill(pid,signal.SIGTERM)
            except ProcessLookupError: pass
        for _ in range(50):
            remaining=[]
            for pid in owned-{PROC.pid}:
                try: os.kill(pid,0);remaining.append(pid)
                except ProcessLookupError: pass
            if not remaining: break
            time.sleep(0.1)
        for pid in remaining:
            try: os.kill(pid,signal.SIGKILL)
            except ProcessLookupError: pass
    try: PROC.wait(timeout=15)
    except subprocess.TimeoutExpired:
        if os.name != 'nt':
            try: os.killpg(PROC.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        else: PROC.kill()
    PROC = None

def main():
    global PROC
    assert not WORK.exists(), 'Cold-install directory must not exist'
    WORK.mkdir()
    OUT.mkdir(exist_ok=True)
    REPORT['free_gb'] = round(shutil.disk_usage(WORK).free/1e9,2)
    countries=[]
    try:
        trace=dict(line.split('=',1) for line in fetch('https://www.cloudflare.com/cdn-cgi/trace').decode().splitlines() if '=' in line)
        REPORT['cloudflare_country']=trace.get('loc')
        if trace.get('loc'): countries.append(trace['loc'])
    except Exception as exc: REPORT['cloudflare_error']=str(exc)
    try:
        geo=json.loads(fetch('https://ipapi.co/json/'))
        REPORT['ip_geolocation']={k:geo.get(k) for k in ('country_code','city','region','org')}
        if geo.get('country_code'): countries.append(geo['country_code'])
    except Exception as exc: REPORT['geolocation_error']=str(exc)
    REPORT['us_confirmed']=bool(countries) and all(c=='US' for c in countries)
    REPORT['commit']=os.environ['GITHUB_SHA']
    print(json.dumps(REPORT),flush=True)
    save()
    url='https://github.com/'+os.environ['GITHUB_REPOSITORY']+'/archive/'+REPORT['commit']+'.zip'
    started=time.monotonic()
    archive=WORK/'source.zip'
    archive.write_bytes(fetch(url))
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            assert (WORK/info.filename).resolve().is_relative_to(WORK)
        z.extractall(WORK)
    roots=[p for p in WORK.iterdir() if p.is_dir()]
    assert len(roots)==1
    root=roots[0]
    REPORT['steps']['source_download']={'seconds':round(time.monotonic()-started,1),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
    assert not (root/'.venv').exists() and not (root/'bundle').exists() and not (root/'models').exists()
    cmd=['cmd.exe','/d','/c',str(root/'Open-Atlas-Windows.cmd')] if os.name=='nt' else ['sh',str(root/'Run-Atlas-Unix.command'),'--no-browser']
    env=os.environ.copy()
    env.update(OMP_NUM_THREADS='2',MKL_NUM_THREADS='2',TOKENIZERS_PARALLELISM='false',PYTHONUNBUFFERED='1')
    started=time.monotonic()
    with (OUT/'launcher.log').open('w',encoding='utf-8') as log:
        PROC=subprocess.Popen(cmd,cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,env=env,start_new_session=os.name!='nt')
        ready=None
        while time.monotonic()-started < 1800:
            if PROC.poll() is not None:
                raise RuntimeError('Launcher exited with '+str(PROC.returncode))
            try:
                st=json.loads(fetch(BASE+'/api/status'))
                if st['index'].get('error'): raise RuntimeError(st['index']['error'])
                if st['index']['ready']:
                    ready=st
                    break
            except (urllib.error.URLError,TimeoutError,ConnectionError): pass
            time.sleep(5)
        assert ready, 'Installation or model loading exceeded 30 minutes'
        REPORT['steps']['cold_install_ready']={'seconds':round(time.monotonic()-started,1),'index':ready['index']}
        save()
        python=root/('.venv/Scripts/python.exe' if os.name=='nt' else '.runtime/intel-env/bin/python' if platform.system()=='Darwin' and platform.machine()=='x86_64' else '.venv/bin/python')
        run([str(python),'-X','utf8','-I','verify_assets.py'],root,'asset_verification')
        run([str(python),'-X','utf8','-I','-m','unittest','discover','-s','tests','-p','test_*.py','-v'],root,'unit_tests')
        body=json.dumps({'query':'Founder control after outside investment'}).encode()
        req=urllib.request.Request(BASE+'/api/search',data=body,headers={'Content-Type':'application/json','X-Atlas-Local':ready['local_token'],'Origin':BASE})
        with urllib.request.urlopen(req,timeout=300) as response: result=json.load(response)
        assert len(result['topics'])==10 and result['topics_total']==1043, result
        (OUT/'search.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
        REPORT['steps']['real_search']={'topics':len(result['topics']),'seconds':result['seconds']}
        tools=WORK/'browser-tools';tools.mkdir()
        npm=shutil.which('npm.cmd' if os.name=='nt' else 'npm')
        browser_env=env.copy()
        browser_env.update(PLAYWRIGHT_BROWSERS_PATH=str(WORK/'browser-binaries'),npm_config_cache=str(WORK/'npm-cache'),ATLAS_EVIDENCE=str(OUT))
        run([npm,'install','--prefix',str(tools),'--no-audit','--no-fund','playwright@1.64.1'],tools,'browser_install',env=browser_env)
        run(['node',str(tools/'node_modules/playwright/cli.js'),'install','chromium'],tools,'browser_download',env=browser_env)
        browser_env['NODE_PATH']=str(tools/'node_modules')
        run(['node',str(root/'tests/remote_browser_check.cjs')],root,'browser_checks',timeout=600,env=browser_env)
        stop()
        # Relaunch offline and confirm the already installed files are reused.
        uv=root/('.runtime/tools/uv.exe' if os.name=='nt' else '.runtime/tools/uv')
        with (OUT/'restart.log').open('w',encoding='utf-8') as restart_log:
            env.update(UV_OFFLINE='1',UV_CACHE_DIR=str(root/'.runtime/uv-cache'),UV_PYTHON_INSTALL_DIR=str(root/'.runtime/python'))
            restart_cmd=[str(uv),'run','--locked','--offline','python','-X','utf8','-I','launch.py','--no-browser'] if os.name=='nt' else ['sh',str(root/'Run-Atlas-Unix.command'),'--no-browser']
            PROC=subprocess.Popen(restart_cmd,cwd=root,stdout=restart_log,stderr=subprocess.STDOUT,env=env,start_new_session=os.name!='nt')
            started=time.monotonic()
            while time.monotonic()-started<240:
                if PROC.poll() is not None: raise RuntimeError('Offline restart failed')
                try:
                    state=json.loads(fetch(BASE+'/api/status'))
                    if state['index']['ready']: break
                except (urllib.error.URLError,TimeoutError,ConnectionError): pass
                time.sleep(3)
            else: raise RuntimeError('Offline restart readiness timed out')
            REPORT['steps']['offline_restart']={'ready':True,'seconds':round(time.monotonic()-started,1)}
        REPORT['functional_pass']=True
        assert REPORT['us_confirmed'], 'Functional checks passed, but US location was not confirmed'
        REPORT['result']='passed'

if __name__=='__main__':
    failure=None
    try: main()
    except BaseException as exc:
        failure=exc
        REPORT.update(result='failed',error=str(exc))
        print('TEST FAILED:',str(exc),flush=True)
        for name in ('launcher.log','restart.log'):
            p=OUT/name
            if p.exists(): print(p.read_text(encoding='utf-8',errors='replace')[-14000:],flush=True)
    finally:
        stop()
        assert WORK.parent==TEMP and WORK.name=='atlas-check'
        if WORK.exists(): shutil.rmtree(WORK)
        REPORT['test_files_deleted']=not WORK.exists()
        save()
        print(json.dumps(REPORT,indent=2),flush=True)
    if failure: sys.exit(1)
