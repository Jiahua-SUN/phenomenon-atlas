"""Offline tests for credential handling and the local server boundary."""
from pathlib import Path
import sys, unittest, threading
from unittest.mock import patch, MagicMock
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
import local_models, reviewer_server
from starlette.testclient import TestClient

class LocalTests(unittest.TestCase):
    def test_provider_validation(self):
        for url in ['http://example.org/v1','https://user:pass@example.org/v1','https://example.org/v1?key=secret']:
            with self.assertRaises(local_models.ModelError):local_models.validate({'mode':'api','base_url':url,'model':'example','api_key':'test'})
        self.assertEqual(local_models.validate({'mode':'codex'})['model'],'')

    def test_api_request_and_usage(self):
        fake=MagicMock();fake.usage.prompt_tokens=100;fake.usage.completion_tokens=20
        fake.choices[0].message.content='{"test":true}'
        with patch('openai.OpenAI') as Client:
            Client.return_value.__enter__.return_value.chat.completions.create.return_value=fake
            raw,usage=local_models.generate('system',{'question':'Example'}, {'mode':'api','base_url':'https://example.org/v1','model':'example','api_key':'TEST-KEY'})
            self.assertEqual(Client.call_args.kwargs['api_key'],'TEST-KEY')
            self.assertEqual(usage['tokens_in'],100);self.assertNotIn('TEST-KEY',str(usage));self.assertEqual(raw,'{"test":true}')

    def test_provider_error_redacted(self):
        with patch('openai.OpenAI',side_effect=Exception('secret key TEST-KEY')):
            with self.assertRaises(local_models.ModelError) as result:local_models.generate('system',{}, {'mode':'api','base_url':'https://example.org/v1','model':'example','api_key':'TEST-KEY'})
        self.assertNotIn('TEST-KEY',str(result.exception))

    def test_cancel_before_provider_call(self):
        cancel=threading.Event();cancel.set()
        with self.assertRaises(local_models.Cancelled):local_models.generate('',{}, {'mode':'codex'},cancel)

    def test_local_boundary(self):
        client=TestClient(reviewer_server.app,base_url='http://127.0.0.1:18811')
        self.assertEqual(client.get('/api/status').status_code,200)
        self.assertEqual(client.get('/api/status',headers={'Host':'evil.example:18811'}).status_code,403)
        self.assertEqual(client.get('/api/status',headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(client.post('/api/search',json={'query':'test'}).status_code,403)
        self.assertEqual(client.post('/api/assess',json={},headers={'X-Atlas-Local':reviewer_server.TOKEN,'Origin':'https://evil.example'}).status_code,403)
        for path in ['/v1/meta','/mcp','/.runtime/answers.sqlite','/scripts/local_models.py','/bundle/meta.json']:
            self.assertEqual(client.get(path).status_code,404,path)

if __name__=='__main__':unittest.main(verbosity=2)
