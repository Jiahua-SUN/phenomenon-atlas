"""Start the isolated local application and open its browser page."""
from pathlib import Path
import argparse
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from prepare_runtime import ensure_runtime
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--port',type=int,default=18811)
    ap.add_argument('--no-browser',action='store_true')
    args=ap.parse_args()
    os.chdir(ROOT)
    if not 1024<=args.port<=65535: raise SystemExit('Choose a port between 1024 and 65535.')
    try:ensure_runtime()
    except Exception as exc:raise SystemExit(str(exc))
    with socket.socket() as sock:
        try:sock.bind(('127.0.0.1',args.port))
        except OSError:raise SystemExit(f'Port {args.port} is already in use. Close the earlier Atlas window or choose another port.')
    env=os.environ.copy()
    for key in list(env):
        if key.startswith('ATLAS_'):env.pop(key)
    env.update(ATLAS_EMBED_MODEL=str(ROOT/'models/bge-m3'),ATLAS_BUNDLE=str(ROOT/'bundle'),ATLAS_DEVICE='cpu',
               HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',DO_NOT_TRACK='1',
               HF_HOME=str(ROOT/'.runtime/huggingface'),PYTHONUTF8='1',TOKENIZERS_PARALLELISM='false')
    url=f'http://127.0.0.1:{args.port}/'
    def open_page():
        for _ in range(120):
            try:
                with urllib.request.urlopen(url,timeout=1) as r:
                    if r.status==200:webbrowser.open(url);return
            except Exception:time.sleep(1)
    proc=subprocess.Popen([sys.executable,'-X','utf8','-I',str(ROOT/'reviewer_server.py'),'--port',str(args.port)],env=env)
    print('Phenomenon Atlas local edition: '+url,flush=True)
    print('Keep this window open. Search becomes ready after the local model loads.',flush=True)
    if not args.no_browser:threading.Thread(target=open_page,daemon=True).start()
    try:raise SystemExit(proc.wait())
    except KeyboardInterrupt:
        proc.terminate()
        try:proc.wait(timeout=10)
        except subprocess.TimeoutExpired:proc.kill()
if __name__=='__main__':main()
