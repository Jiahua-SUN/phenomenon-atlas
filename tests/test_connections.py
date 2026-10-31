"""Offline adapter contract tests. No API calls or account usage."""
from pathlib import Path
import json, sys, threading, unittest
from unittest.mock import MagicMock, patch
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
import local_models, reviewer_server
from starlette.testclient import TestClient

EVIDENCE={'quotes':[{'id':'q1','text':'Evidence'}],'papers':[{'id':'p1','title':'Paper'}]}
ANSWER={'restated':'Question','podcast_picks':[{'id':'q1','note':'Evidence'}],'podcast_judgment':'Discussion','paper_ratings':[{'id':'p1','relevance':80,'note':'Related'}],'research_judgment':'Research','overall':'Assessment'}

class ConnectionTests(unittest.TestCase):
    def test_only_official_providers(self):
        for base in ['https://example.org/v1','https://api.openai.com.evil.test/v1','https://api.openai.com/v1?key=x','https://api.anthropic.com/v1/messages','http://api.openai.com/v1']:
            with self.subTest(base=base),self.assertRaises(local_models.ModelError):
                local_models.validate({'mode':'api','base_url':base,'model':'example','api_key':'TEST'})
        with self.assertRaises(local_models.ModelError):
            local_models.validate({'mode':'api','provider':'openai','base_url':local_models.API_BASES['anthropic'],'model':'claude-sonnet-5-5','api_key':'TEST'})
        self.assertEqual(local_models.validate({'mode':'claude'}),{'mode':'claude','model':''})

    def test_claude_api_structured_output(self):
        fake=MagicMock();fake.usage.prompt_tokens=12;fake.usage.completion_tokens=5;fake.choices[0].message.content=json.dumps(ANSWER)
        with patch('openai.OpenAI') as client:
            create=client.return_value.__enter__.return_value.chat.completions.create;create.return_value=fake
            raw,usage=local_models.generate('system',EVIDENCE,{'mode':'api','provider':'anthropic','base_url':local_models.API_BASES['anthropic'],'model':'claude-sonnet-5-5','api_key':'TEST'})
            self.assertEqual(client.call_args.kwargs['base_url'],'https://api.anthropic.com/v1')
            self.assertEqual(create.call_args.kwargs['response_format']['type'],'json_schema')
            self.assertTrue(create.call_args.kwargs['response_format']['json_schema']['strict'])
            self.assertEqual(json.loads(raw),ANSWER);self.assertEqual(usage['tokens_in'],12)

    def test_claude_status_redacts_identity(self):
        fake=MagicMock(returncode=0,stdout=json.dumps({'loggedIn':True,'authMethod':'claude.ai','email':'private@example.test','token':'SECRET'}))
        with patch.object(local_models,'claude_path',return_value='claude'),patch.object(local_models.subprocess,'run',return_value=fake):
            result=local_models.claude_status()
        self.assertTrue(result['logged_in']);self.assertTrue(result['subscription_login'])
        self.assertNotIn('SECRET',str(result));self.assertNotIn('private@',str(result))

    def test_claude_missing_and_logged_out(self):
        with patch.object(local_models,'claude_path',return_value=None):self.assertFalse(local_models.claude_status()['installed'])
        fake=MagicMock(returncode=1,stdout='{"loggedIn":false}')
        with patch.object(local_models,'claude_path',return_value='claude'),patch.object(local_models.subprocess,'run',return_value=fake):self.assertFalse(local_models.claude_status()['logged_in'])

    def test_claude_cli_request_is_isolated(self):
        proc=MagicMock(returncode=0);proc.communicate.return_value=(json.dumps({'structured_output':ANSWER,'is_error':False,'usage':{'input_tokens':12,'output_tokens':5}}).encode(),b'')
        with patch.object(local_models,'claude_path',return_value='claude'),patch.object(local_models.subprocess,'Popen',return_value=proc) as popen,patch.dict(local_models.os.environ,{'ANTHROPIC_API_KEY':'SECRET','ANTHROPIC_BASE_URL':'https://evil.test'}):
            raw,usage=local_models.generate('system',EVIDENCE,{'mode':'claude'})
        args=popen.call_args.args[0];opts=popen.call_args.kwargs
        self.assertEqual(args[args.index('--tools')+1],'');self.assertIn('--no-session-persistence',args)
        self.assertIn('--strict-mcp-config',args);self.assertIn('--disable-slash-commands',args)
        self.assertIn('--safe-mode',args)
        self.assertEqual(args[args.index('--setting-sources')+1],'')
        self.assertEqual(json.loads(args[args.index('--settings')+1]),{'disableAllHooks':True})
        self.assertNotIn('ANTHROPIC_API_KEY',opts['env']);self.assertNotIn('ANTHROPIC_BASE_URL',opts['env'])
        self.assertFalse(Path(opts['cwd']).exists());self.assertEqual(json.loads(raw),ANSWER)
        self.assertEqual(usage['tokens_in'],12);self.assertIn(b'Evidence',proc.communicate.call_args.args[0])

    def test_claude_cli_errors_are_redacted(self):
        for code,body in [(1,b'SECRET'),(0,b'SECRET'),(0,b'{"is_error":true,"result":"SECRET"}'),(0,b'{"result":"unstructured"}')]:
            proc=MagicMock(returncode=code);proc.communicate.return_value=(body,b'SECRET')
            with self.subTest(code=code,body=body),patch.object(local_models,'claude_path',return_value='claude'),patch.object(local_models.subprocess,'Popen',return_value=proc):
                with self.assertRaises(local_models.ModelError) as caught:local_models.generate('system',EVIDENCE,{'mode':'claude'})
                self.assertNotIn('SECRET',str(caught.exception))

    def test_cancel_before_claude_start(self):
        cancel=threading.Event();cancel.set()
        with patch.object(local_models.subprocess,'Popen') as popen,self.assertRaises(local_models.Cancelled):
            local_models.generate('system',EVIDENCE,{'mode':'claude'},cancel)
        popen.assert_not_called()

    def test_status_routes_to_selected_cli(self):
        client=TestClient(reviewer_server.app,base_url='http://127.0.0.1:18811')
        with patch.object(local_models,'claude_status',return_value={'message':'Claude checked'}) as claude,patch.object(local_models,'codex_status',return_value={'message':'Codex checked'}) as codex:
            self.assertEqual(client.get('/api/cli/status?provider=anthropic').json()['message'],'Claude checked')
            self.assertEqual(client.get('/api/cli/status?provider=openai').json()['message'],'Codex checked')
            self.assertEqual(client.get('/api/cli/status?provider=other').status_code,400)
            claude.assert_called_once();codex.assert_called_once()

if __name__=='__main__':unittest.main(verbosity=2)
