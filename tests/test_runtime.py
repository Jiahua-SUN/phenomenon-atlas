"""Verify archive boundaries, corruption detection and offline re-use."""
from pathlib import Path
import hashlib,io,json,sys,tempfile,unittest,zipfile
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import prepare_runtime as runtime

class RuntimeTests(unittest.TestCase):
    def test_resumed_progress_counts_only_new_bytes_in_speed(self):
        stream=io.StringIO(); now=[100.0]
        progress=runtime.DownloadProgress(100_000_000,50_000_000,stream=stream,clock=lambda:now[0])
        now[0]=105.0
        progress.update(60_000_000)
        progress.close()
        output=stream.getvalue()
        self.assertIn('60.0%',output)
        self.assertIn('60.0 MB/100.0 MB',output)
        self.assertIn('2.0 MB/s | ETA 00:20',output)
        self.assertNotIn('\r',output)

    def test_progress_handles_zero_elapsed_and_log_throttling(self):
        stream=io.StringIO(); now=[0.0]
        progress=runtime.DownloadProgress(10_000_000,stream=stream,clock=lambda:now[0])
        for i in range(1,40):
            now[0]=i/10
            progress.update(i*100_000)
        self.assertEqual(len(stream.getvalue().splitlines()),1)
        self.assertIn('ETA --:--',stream.getvalue())
        now[0]=4.0
        progress.update(10_000_000,force=True)
        self.assertIn('100.0%',stream.getvalue())
        self.assertIn('ETA 00:00',stream.getvalue())
        self.assertEqual(len(stream.getvalue().splitlines()),2)

    def test_terminal_progress_closes_line_on_interruption(self):
        class Terminal(io.StringIO):
            def isatty(self):return True
        stream=Terminal(); now=[0.0]
        progress=runtime.DownloadProgress(10_000_000,stream=stream,clock=lambda:now[0])
        now[0]=1.0;progress.update(1_000_000)
        progress.close();progress.close()
        self.assertEqual(stream.getvalue().count('\r'),2)
        self.assertEqual(stream.getvalue().count('\n'),1)
        self.assertTrue(stream.getvalue().endswith('\n'))

    def test_download_restarts_progress_when_server_ignores_range(self):
        with tempfile.TemporaryDirectory() as temp:
            cache=Path(temp);payload=b'abcdef';(cache/'asset.zip.part').write_bytes(payload[:3])
            asset={'name':'asset.zip','bytes':6,'sha256':hashlib.sha256(payload).hexdigest(),'url':'https://example.org/asset.zip'}
            class Response(io.BytesIO):
                status=200
            output=io.StringIO()
            with patch.object(runtime.urllib.request,'urlopen',return_value=Response(payload)),patch.object(runtime.sys,'stdout',output):
                result=runtime.download(asset,cache)
            self.assertEqual(result.read_bytes(),payload)
            self.assertIn('0.0 B/6.0 B',output.getvalue())
            self.assertIn('100.0%',output.getvalue())

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
