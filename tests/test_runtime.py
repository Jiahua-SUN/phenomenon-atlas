"""Verify archive boundaries, corruption detection and offline re-use."""
from pathlib import Path
import hashlib,io,json,sys,tempfile,unittest,zipfile
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import prepare_runtime as runtime

class RuntimeTests(unittest.TestCase):
    def test_download_resumes_and_verifies(self):
        with tempfile.TemporaryDirectory() as temp:
            cache=Path(temp);payload=b'abcdef';(cache/'asset.zip.part').write_bytes(payload[:3])
            asset={'name':'asset.zip','bytes':6,'sha256':hashlib.sha256(payload).hexdigest(),'url':'https://example.org/asset.zip'}
            class Response(io.BytesIO):
                status=206
                headers={'Content-Range':'bytes 3-5/6'}
            with patch.object(runtime.urllib.request,'urlopen',return_value=Response(payload[3:])) as open_url:
                path=runtime.download(asset,cache)
            self.assertEqual(open_url.call_args.args[0].get_header('Range'),'bytes=3-')
            self.assertEqual(path.read_bytes(),payload)
            with patch.object(runtime.urllib.request,'urlopen',side_effect=AssertionError('No network expected')):
                self.assertEqual(runtime.download(asset,cache),path)

    def test_verified_install_and_existing_file(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'.runtime').mkdir();zpath=root/'asset.zip'
            data=b'example data';record={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
            with zipfile.ZipFile(zpath,'w') as z:z.writestr('bundle/example',data)
            runtime.install(zpath,root,{'bundle/example':record})
            self.assertEqual((root/'bundle/example').read_bytes(),data)
            (root/'bundle/example').write_bytes(b'user change')
            with self.assertRaises(RuntimeError):runtime.install(zpath,root,{'bundle/example':record})
            self.assertEqual((root/'bundle/example').read_bytes(),b'user change')

    def test_unexpected_archive_member(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'.runtime').mkdir();zpath=root/'asset.zip'
            with zipfile.ZipFile(zpath,'w') as z:z.writestr('../outside',b'bad')
            with self.assertRaises(RuntimeError):runtime.install(zpath,root,{})

    def test_complete_assets_need_no_network(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);data=b'example';(root/'sample').write_bytes(data)
            record={'path':'sample','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
            (root/'assets-manifest.json').write_text(json.dumps({'files':[record]}))
            runtime.ensure_runtime(root)
            runtime.ensure_runtime(root)
            self.assertTrue((root/'.runtime/assets-ready.txt').exists())

if __name__=='__main__':unittest.main(verbosity=2)
