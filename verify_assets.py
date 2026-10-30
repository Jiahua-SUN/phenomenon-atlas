"""Check the copied model and data without importing any application dependency."""
from pathlib import Path
import hashlib,json,sys
ROOT=Path(__file__).resolve().parent
manifest=json.loads((ROOT/'assets-manifest.json').read_text(encoding='utf-8'))
print('INPUT manifest files:',len(manifest['files']))
failed=[];total=0
for item in manifest['files']:
    path=ROOT/item['path'];h=hashlib.sha256()
    if not path.is_file():failed.append(item['path']);continue
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):h.update(block)
    total+=path.stat().st_size
    if path.stat().st_size!=item['bytes'] or h.hexdigest()!=item['sha256']:failed.append(item['path'])
print('OUTPUT checked files:',len(manifest['files']),'bytes:',total,'mismatches:',len(failed))
for item in failed:print('MISMATCH',item)
sys.exit(1 if failed else 0)
