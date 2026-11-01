# Phenomenon Atlas

This reviewer edition runs the website on your own computer. The repository contains the application. Its launcher downloads the pinned runtime data, transcript excerpts and BGE-M3 retrieval model from this repository's release assets. You do not need the public Atlas website or an Atlas account.

[Download the repository ZIP](https://github.com/Jiahua-SUN/phenomenon-atlas/archive/refs/heads/main.zip) · [Runtime release](https://github.com/Jiahua-SUN/phenomenon-atlas/releases/tag/v2.0.0) · [Public website](https://atlas.phenomenon.page/)

## Start on Windows

1. Download the repository ZIP using the link above or **Code → Download ZIP**. Extract it to a folder with at least 12 GB of free space. Do not run it inside the ZIP viewer.
2. Double-click **Open-Atlas-Windows.cmd**. Keep its window open.
3. Your browser opens at **http://127.0.0.1:18811/**. Wait for Search to show **Ready**.

The first start needs internet access to download an isolated Python installation, the locked dependencies and about 2.53 GB of runtime assets. The launcher checks their SHA-256 hashes before installation. Interrupted asset downloads can resume when you start it again. You do not need to install Python yourself. The installer writes only inside this folder. Later runs reuse this environment. Close the launcher with Ctrl+C when finished.

If port 18811 is occupied, use PowerShell in the extracted folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\Setup-Atlas-PowerShell.ps1 -Port 18813
```

## Start on macOS or Linux

Open a terminal in the extracted folder and run:

```sh
sh Run-Atlas-Unix.command
```

The launcher follows the same steps. The Windows path was tested in a fresh environment. The macOS and Linux launchers are provided but have not been tested on those operating systems. Dependencies require a supported 64-bit operating system. Allow about 8 GB of available RAM for the local model and data; more memory is helpful on machines running other applications.

## What works locally

Home, Map, Squares, List, Trend, Gap, topic pages, question pages, paper lists, tables, theme selection, the guided tour, Search, and **Read in context** use the included files. Search uses the included BGE-M3 model on the CPU. No model service or API key is needed for Search. Search speed depends on your computer.

The AI assistant needs internet access and your own model connection. Links to YouTube, podcast sites, DOI pages and Google Scholar open external websites and need internet access. The package contains excerpts, not full podcast media, full transcripts or publisher PDFs. This is the same scope shown by the website.

## AI assistant

For an easier start, use the [AI assistant on the public website](https://atlas.phenomenon.page/). No sign-in, AI account or API key is needed. Everyone shares an allowance of 1,000 questions per day. The website displays the remaining allowance and pauses the assistant when it is used up. The allowance resets at midnight, Singapore time.

The AI assistant helps researchers examine how their own research questions relate to practitioner concerns and existing research. For one English question, it summarizes how practitioners discuss the issue in retrieved podcast quotes and how retrieved papers have studied it. The assessment brings both sources together and links to the supporting evidence. Use it as a starting point for assessing the question’s practical relevance and potential, and for identifying practitioner problems related to your interests.

Retrieval and assessment follow a predefined workflow and response structure within the Atlas. The CLI connections run this workflow. They do not provide an interface for an external agent to explore the Atlas independently.

Open **Ask → AI assistant → Your AI connection**. Choose **ChatGPT (OpenAI)** or **Claude**, then **API key** or **Use local CLI**. Only these two platforms are supported.

**API key.** Enter a text model ID available to your API account and your API key. The official API address is filled automatically and cannot be edited. OpenAI uses `https://api.openai.com/v1`; Claude uses `https://api.anthropic.com/v1`. Links beside each field show where to find the values. Then enter an English research question and click **Assess**. Usage follows the API account's billing and credits.

For OpenAI, create a key in the [API dashboard](https://platform.openai.com/api-keys) and copy an API model ID from the [official model list](https://developers.openai.com/api/docs/models). For Claude, create a workspace API key in [Claude Console](https://platform.claude.com/settings/keys) and copy the Claude API ID from the [official model list](https://platform.claude.com/docs/en/models/overview). The examples in the form are examples, not automatic model selections. The selected model must support the request format: Chat Completions with JSON output for OpenAI, and strict JSON schema output through Anthropic's [OpenAI SDK compatibility endpoint](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk) for Claude. Cloud gateways and unscoped Anthropic personal or service account keys are not supported by this form.

**Use local CLI.** For ChatGPT, install [Codex CLI](https://developers.openai.com/codex/cli/) and run `codex login` in any terminal folder. For Claude, install [Claude Code](https://code.claude.com/docs/en/quickstart) and run `claude auth login` in any terminal folder. Select the platform in Atlas and click **Connect Codex CLI** or **Connect Claude Code**. No API key, address or model ID is needed in the form. Atlas uses the CLI's default model. Subscription allowance or API billing follows the CLI's sign-in method and account limits. Atlas does not install software or change your login.

Atlas finds the CLI through your PATH and common user installation folders. On Windows it also reads the current user and system PATH, so installations made after Atlas started can be found. Sign in under the same operating-system account that runs Atlas. Your terminal does not need to be in the Atlas folder.

For a portable installation or a separate CLI profile, set `ATLAS_CODEX_PATH` or `ATLAS_CLAUDE_PATH` to the executable's absolute path before starting Atlas. Set `ATLAS_CODEX_HOME` or `ATLAS_CLAUDE_HOME` to the corresponding configuration folder if needed. Existing `CODEX_HOME` and `CLAUDE_CONFIG_DIR` settings are also respected. These settings identify an installation and profile; Atlas does not search other users' files or copy credentials.

Both CLI adapters receive the selected evidence and assessment prompt in a temporary working folder and request structured output without saving a CLI conversation. Codex uses a read-only sandbox with shell and web search disabled. It preserves the configured credential store and model selection while ignoring other user and project configuration. Claude Code disables built-in tools, MCP tools, hooks and slash commands, and does not load user or project settings. Update the CLI if it does not support the required options. CLI authentication uses the existing installation; API keys and alternate provider URLs from the Atlas server environment are not passed to the Claude Code assessment process.

Assessments compare 30 retrieved podcast quotes and 20 retrieved papers. The numerical calculations and thresholds are unchanged from the website. Different models can produce different judgments and paper ratings. An incomplete set of paper ratings is rejected rather than displayed as a zero count.

## Privacy and local state

- Your API key is not written to disk, browser storage, result caches or logs by Atlas. It remains in the current tab and is sent through the local server to the provider you selected when you click Assess. **Clear key** removes it from the field. Reloading the page clears it too.
- The selected provider receives your question, selected quotes and paper abstracts. Its own retention and billing policies apply.
- Each CLI uses credentials managed by its existing installation. Atlas does not copy them. The CLI sends the selected evidence to its service.
- Completed assessments are stored in `.runtime/answers.sqlite` on your computer. The same question and connection settings reuse a saved result. The API key is excluded from the cache key and the stored answer. Clear this database after stopping Atlas if you want fresh assessments or want to remove your question history.
- The server listens only on `127.0.0.1`. It rejects other Host headers and cross-origin requests. It is intended for your local browser. Do not publish it through a tunnel or change it into a public server.
- The website's hosted accounts, passwords, provider credentials and private server settings are not included. Public API and MCP endpoints remain unavailable.

## Contents and verification

`dist/` contains the interface and rendered topic data. `bundle/` contains the runtime database and vectors. `models/bge-m3/` contains the exact retrieval model snapshot used for this edition. `scripts/` contains retrieval and assessment code. `uv.lock` records dependency versions. `assets-manifest.json` records the size and SHA-256 of every data and model file.

Run the full asset check after extracting:

```powershell
.\.venv\Scripts\python.exe -I verify_assets.py
```

On macOS or Linux, use `.venv/bin/python -I verify_assets.py`. Run all offline connection, server-boundary and installer tests with the same Python executable and `-I -m unittest discover -s tests -v`.

Installed data and model files occupy about 3.6 GB, plus the environment and retained download cache. Runtime ZIPs are also available on the release page. If automatic downloads are unavailable, place both runtime ZIPs in one folder and run the installed Python with `-I prepare_runtime.py --asset-dir "PATH_TO_THAT_FOLDER"`. You do not need to extract those two ZIPs manually. The model snapshot is `BAAI/bge-m3`, revision `5617a9f61b028005a4858fdac845db406aefb181`. Runtime data were copied unchanged from website release `20261030_190724`. Trend now always uses a shared scale within each series.

## Source and runtime assets

The application code is tracked in this repository. Large runtime files are published separately in release `v2.0.0`: `site-data-20261030.zip` and `retrieval-model-20261030.zip`. `runtime-downloads.json` pins each URL, byte count and SHA-256 hash. Each archive is below GitHub's 2 GiB per-file limit. Source archives generated by GitHub work with the same automatic installer.

Local environments, downloaded assets, credentials and assessment histories are excluded by `.gitignore`. Never commit `.runtime`, `.venv`, API keys or personal results.

See `THIRD_PARTY_NOTICES.md` for the scope of third-party content and the model notice, and `VALIDATION.md` for the checks actually performed.

## License

The original Atlas application code is licensed under the GNU General Public License, version 3 (GPL-3.0-only). See [LICENSE](LICENSE) for the full terms. Third-party software, the retrieval model, podcast excerpts and paper content retain their respective licenses and rights. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
