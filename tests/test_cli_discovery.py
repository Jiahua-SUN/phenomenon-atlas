"""Working directory, installation lookup and credential-store regression checks."""
from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import local_cli
import local_models


class DiscoveryTests(unittest.TestCase):
    def test_same_profile_from_different_directories(self):
        before=Path.cwd()
        with tempfile.TemporaryDirectory() as tmp:
            base=Path(tmp); a=base/'login folder'; b=base/'Atlas folder'; a.mkdir(); b.mkdir()
            try:
                with patch.dict(os.environ, {'ATLAS_CODEX_HOME':str(base/'profile'),'ATLAS_CLAUDE_HOME':str(base/'claude-profile')}):
                    os.chdir(a); first=[local_cli.environment(p) for p in ('codex','claude')]
                    os.chdir(b); second=[local_cli.environment(p) for p in ('codex','claude')]
                self.assertEqual(first,second)
            finally:os.chdir(before)

    def test_credential_store_preserved_without_tools(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/'config.toml').write_text('cli_auth_credentials_store = "keyring"\nmodel = "example-model"\n[mcp_servers.unwanted]\ncommand = "bad"\n',encoding='utf-8')
            with patch.dict(os.environ, {'ATLAS_CODEX_HOME':tmp}): options=local_cli.codex_options()
        self.assertIn('cli_auth_credentials_store="keyring"',options)
        self.assertIn('model="example-model"',options)
        self.assertNotIn('bad',str(options))

    def test_absolute_executable_override(self):
        with tempfile.TemporaryDirectory() as tmp:
            executable=Path(tmp)/'portable-codex.exe';executable.touch()
            with patch.dict(os.environ, {'ATLAS_CODEX_PATH':str(executable)}):
                self.assertEqual(Path(local_cli.executable('codex')),executable)

    def test_status_uses_the_same_profile_as_assessment(self):
        import subprocess
        with patch.object(local_models,'codex_path',return_value='codex'), patch.object(subprocess,'run',return_value=subprocess.CompletedProcess([],0,'Logged in using ChatGPT','')) as run:
            state=local_models.codex_status()
        self.assertTrue(state['logged_in'])
        self.assertEqual(run.call_args.kwargs['env']['CODEX_HOME'],local_cli.environment('codex')['CODEX_HOME'])
        self.assertEqual(run.call_args.kwargs['cwd'],str(Path.home()))

    def test_codex_assessment_preserves_profile_and_isolates_work(self):
        import json
        from unittest.mock import MagicMock
        answer={'restated':'test'}
        def process(args, **kwargs):
            self.assertEqual(args[1],'exec')
            self.assertIn('--ignore-user-config',args)
            self.assertIn('--ephemeral',args)
            self.assertIn('read-only',args)
            self.assertEqual(kwargs['env']['CODEX_HOME'],local_cli.environment('codex')['CODEX_HOME'])
            target=Path(args[args.index('--output-last-message')+1])
            target.write_text(json.dumps(answer),encoding='utf-8')
            proc=MagicMock(returncode=0)
            proc.communicate.return_value=(b'',b'')
            return proc
        with patch.object(local_models,'codex_path',return_value='codex'),patch.object(local_models.subprocess,'Popen',side_effect=process):
            result,_=local_models.generate('system',{'quotes':[{'id':'q1'}],'papers':[{'id':'p1'}]},{'mode':'codex'})
        self.assertEqual(json.loads(result),answer)


if __name__=='__main__':unittest.main(verbosity=2)
