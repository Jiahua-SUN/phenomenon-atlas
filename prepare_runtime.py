"""Download pinned public runtime assets, verify them, and install missing files."""
from pathlib import Path, PurePosixPath
import argparse, hashlib, json, os, shutil, sys, tempfile, time, urllib.error, urllib.request, zipfile
ROOT=Path(__file__).resolve().parent

def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(8*1024*1024),b''):h.update(block)
    return h.hexdigest()

def download(asset, cache):
    target=cache/asset['name'];part=cache/(asset['name']+'.part')
    if target.is_file():
        if target.stat().st_size==asset['bytes'] and digest(target)==asset['sha256']:return target
        raise RuntimeError('A cached download failed verification. Remove only '+str(target)+' and retry.')
    for attempt in range(3):
        start=part.stat().st_size if part.exists() else 0
        if start==asset['bytes']:break
        if start>asset['bytes']:raise RuntimeError('Partial download is too large: '+str(part))
        headers={'User-Agent':'PhenomenonAtlas/2.0','Accept':'application/octet-stream'}
        if start:headers['Range']='bytes=%d-'%start
        try:
            with urllib.request.urlopen(urllib.request.Request(asset['url'],headers=headers),timeout=60) as r:
                if start and r.status==206:
                    if not r.headers.get('Content-Range','').startswith('bytes %d-'%start):raise RuntimeError('Invalid download range.')
                else:start=0
                written=start;last=-1
                with part.open('ab' if start else 'wb') as f:
                    while True:
                        block=r.read(1024*1024)
                        if not block:break
                        f.write(block);written+=len(block)
                        if written>asset['bytes']:raise RuntimeError('Download exceeded the expected size.')
                        pct=int(written*100/asset['bytes'])
                        if pct//10>last:
                            print('%s: %d%%'%(asset['name'],pct),flush=True);last=pct//10
            if written!=asset['bytes']:raise OSError('Incomplete download.')
            break
        except (OSError,urllib.error.URLError) as exc:
            if attempt==2:raise RuntimeError('Download could not finish. Check your internet connection and run the launcher again. Partial downloads are kept.') from exc
            print('Connection interrupted; resuming download...',flush=True);time.sleep(1)
    if part.stat().st_size!=asset['bytes'] or digest(part)!=asset['sha256']:
        raise RuntimeError('Download checksum did not match. Remove only '+str(part)+' and retry.')
    part.replace(target);return target

def install(archive, root, expected):
    with tempfile.TemporaryDirectory(prefix='atlas-assets-',dir=root/'.runtime') as temp:
        stage=Path(temp)
        with zipfile.ZipFile(archive) as z:
            names=z.namelist()
            if len(names)!=len(set(names)) or set(names)!=set(expected):raise RuntimeError('Unexpected files in runtime archive.')
            for info in z.infolist():
                pure=PurePosixPath(info.filename)
                if pure.is_absolute() or '..' in pure.parts or '\\' in info.filename:raise RuntimeError('Unsafe archive path.')
                if info.file_size!=expected[info.filename]['bytes']:raise RuntimeError('Unexpected asset size.')
            z.extractall(stage)
        for name,item in expected.items():
            p=stage/name
            if digest(p)!=item['sha256']:raise RuntimeError('Asset checksum did not match: '+name)
            destination=root/name
            if destination.exists() and (destination.stat().st_size!=item['bytes'] or digest(destination)!=item['sha256']):
                raise RuntimeError('An existing runtime file differs. Move it aside before reinstalling: '+name)
        for name in expected:
            destination=root/name
            if not destination.exists():
                destination.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(stage/name),destination)

def ensure_runtime(root=ROOT,asset_dir=None):
    root=Path(root);manifest_path=root/'assets-manifest.json'
    manifest=json.loads(manifest_path.read_text(encoding='utf-8'));expected={x['path']:x for x in manifest['files']}
    stamp=digest(manifest_path);runtime=root/'.runtime';runtime.mkdir(exist_ok=True)
    ready=runtime/'assets-ready.txt'
    complete=all((root/n).is_file() and (root/n).stat().st_size==x['bytes'] for n,x in expected.items())
    if complete and ready.exists() and ready.read_text().strip()==stamp:return
    if not complete:
        downloads=json.loads((root/'runtime-downloads.json').read_text(encoding='utf-8'))['assets']
        cache=runtime/'downloads';cache.mkdir(exist_ok=True)
        print('Installing local data and retrieval model. First start downloads about 2.53 GB.',flush=True)
        for asset in downloads:
            model=asset['name'].startswith('retrieval-model')
            subset={n:x for n,x in expected.items() if n.startswith('models/')==model}
            if all((root/n).is_file() and (root/n).stat().st_size==x['bytes'] for n,x in subset.items()):continue
            source=Path(asset_dir)/asset['name'] if asset_dir else download(asset,cache)
            if not source.exists() or source.stat().st_size!=asset['bytes'] or digest(source)!=asset['sha256']:raise RuntimeError('Runtime archive verification failed: '+asset['name'])
            install(source,root,subset)
    print('Verifying all %d runtime files...'%len(expected),flush=True)
    for name,item in expected.items():
        p=root/name
        if not p.is_file() or p.stat().st_size!=item['bytes'] or digest(p)!=item['sha256']:raise RuntimeError('Runtime asset verification failed: '+name)
    ready.write_text(stamp+'\n',encoding='ascii')
    print('Runtime assets ready. Verified %d files; no mismatches.'%len(expected),flush=True)

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--asset-dir',type=Path);args=ap.parse_args()
    try:ensure_runtime(asset_dir=args.asset_dir)
    except Exception as exc:raise SystemExit(str(exc))
