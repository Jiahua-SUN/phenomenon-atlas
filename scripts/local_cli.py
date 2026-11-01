"""Find a user's CLI independently of the Atlas working directory."""
import os
from pathlib import Path
import shutil
import tomllib


def search_path():
    paths = os.environ.get('PATH', '').split(os.pathsep)
    if os.name == 'nt':
        import winreg
        for hive, key in ((winreg.HKEY_CURRENT_USER, 'Environment'),
                          (winreg.HKEY_LOCAL_MACHINE, r'SYSTEM\CurrentControlSet\Control\Session Manager\Environment')):
            try:
                with winreg.OpenKey(hive, key) as reg:
                    paths.extend(os.path.expandvars(winreg.QueryValueEx(reg, 'Path')[0]).split(os.pathsep))
            except OSError:
                pass
    user = Path.home()
    paths.extend(str(user / p) for p in ('.local/bin', '.npm-global/bin', '.volta/bin', 'scoop/shims', '.bun/bin'))
    if os.environ.get('APPDATA'):
        paths.append(str(Path(os.environ['APPDATA']) / 'npm'))
    if os.name != 'nt':
        paths.extend(['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'])
    # Relative PATH entries must never turn the temporary assessment directory into a command source.
    return os.pathsep.join(dict.fromkeys(p for p in paths if p and Path(p).is_absolute()))


def executable(provider):
    name = 'codex' if provider == 'codex' else 'claude'
    override = os.environ.get('ATLAS_' + name.upper() + '_PATH')
    if override:
        p = Path(os.path.expandvars(override)).expanduser()
        return str(p.resolve()) if p.is_absolute() and p.is_file() else None
    found = shutil.which(name, path=search_path())
    if not found:
        return None
    path = Path(found)
    if os.name == 'nt' and name == 'codex' and path.suffix.lower() in ('.cmd', '.ps1'):
        # Use the native executable belonging to this npm shim, rather than an unrelated older installation.
        for base in (path.parent / 'node_modules/@openai', path.parent.parent / '@openai'):
            for pattern in ('codex*/vendor/*/codex/codex.exe', 'codex*/vendor/*/bin/codex.exe',
                            'codex/node_modules/@openai/codex*/vendor/*/codex/codex.exe',
                            'codex/node_modules/@openai/codex*/vendor/*/bin/codex.exe'):
                for native in sorted(base.glob(pattern)):
                    if native.is_file():
                        return str(native)
    return str(path)


def environment(provider):
    env = os.environ.copy()
    env['PATH'] = search_path()
    variable = 'CODEX_HOME' if provider == 'codex' else 'CLAUDE_CONFIG_DIR'
    override = env.get('ATLAS_CODEX_HOME' if provider == 'codex' else 'ATLAS_CLAUDE_HOME')
    home = override or env.get(variable)
    if home:
        env[variable] = str(Path(os.path.expandvars(home)).expanduser().resolve())
    elif provider == 'codex':
        env[variable] = str(Path.home() / '.codex')
    # Leave Claude's default unset: explicitly naming ~/.claude can select a
    # different account metadata location on some versions of the CLI.
    for key in list(env):
        if (key.endswith('API_KEY') or key.endswith('BASE_URL') or key.startswith('ANTHROPIC_')
                or key.startswith('CLAUDE_CODE_USE_') or key == 'CLAUDE_CODE_OAUTH_TOKEN'):
            env.pop(key, None)
    if provider == 'claude':
        env['CLAUDE_CODE_SKIP_PROMPT_HISTORY'] = '1'
    return env


def codex_options():
    """Preserve credential storage and model choice without loading project tools or hooks."""
    args = []
    config = Path(environment('codex')['CODEX_HOME']) / 'config.toml'
    try:
        with config.open('rb') as source:
            data = tomllib.load(source)
    except (OSError, ValueError):
        data = {}
    import json
    for key in ('cli_auth_credentials_store', 'model', 'model_reasoning_effort'):
        value = data.get(key)
        if isinstance(value, str) and len(value) < 160:
            args.extend(['-c', key + '=' + json.dumps(value)])
    return args
