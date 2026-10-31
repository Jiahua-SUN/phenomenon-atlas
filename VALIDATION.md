# Validation record

Date: 30 October 2026. Platform: Windows x64. Website source release: 20261030_190724.

## Fresh runtime

The launcher downloaded uv 0.13.6 and managed CPython 3.13.18 into the package's own runtime directory. It created a new virtual environment and installed 54 packages from `uv.lock`. It used the CPU build of PyTorch and the included BGE-M3 snapshot. Search reported ready after 9.4 seconds on the test computer.

## Data integrity

The package contains 1,082 data and model files, totalling 3,596,891,861 bytes. Every file matched the source SHA-256. The verifier was run again after configuration and reported zero mismatches. No research data were modified, merged or dropped.

The full site runtime includes 43,830 episodes, 303,049 extracted problems, 1,043 topics, 6,895 core questions and 10,470 papers. Counts come from the copied Parquet files. The separate API-window tables are retained as internal dependencies of the original retrieval module. They are not exposed through public API or MCP routes.

## Browser checks

Desktop (1440 × 1000) and mobile (390 × 844) checks passed for all three Trend series. They displayed 17 field cards, 20 topic cards and 17 paper-field cards. All cards within each series used one scale. The scale maxima for the default scope were 2,043, 87 and 125. The independent-scale option was absent. No horizontal overflow or JavaScript errors were found.

The browser test blocked non-local resource requests. Home, Trend, connection settings, Search, topic detail, question detail and excerpt requests completed without attempting any external resource request. A founder-control search returned 10 topics. A repeat query reported 0.09 seconds from the search cache. This is not a benchmark for other computers. The excerpt response was HTTP 200 and included highlighted context. The selected question page included four excerpt links.

Both connection modes and light/dark themes were checked. A synthetic key was absent from localStorage and sessionStorage, and Clear key emptied the field.

## AI assessment

One real Codex CLI call used the existing ChatGPT sign-in. The question was “How do family firms decide when to bring in a non-family CEO?” It completed in 30.4 seconds, returned five podcast quotes, and rated all 20 candidate papers. That run classified one paper as core and nine as related, including the core paper. These are results of that test model call, not fixed reference answers for other models.

The answer rendered on desktop and mobile, including the papers and overall tabs. Its quote-context link returned HTTP 200. Repeating the same request returned the saved local answer with `cached: true`, without a second model call. The test answer and account credentials are excluded from the distributable package.

The API-key adapter was tested with a mocked provider response. No reviewer API key was supplied, so a live paid API call was not performed. Compatibility with every provider and model is not claimed.

## Local boundary checks

Five offline unit tests passed. They covered provider validation, request construction and usage metadata, provider error redaction, cancellation before a request, and local HTTP access controls. Requests with an untrusted Host or Origin and requests without the local request token were rejected. Runtime files, application scripts, API and MCP routes were not publicly served.

## Limits

Windows was tested directly. macOS and Linux launcher files have not been executed on those systems. AI and outbound article/media links require internet access. The package does not include full podcast media, full transcripts or publisher PDFs. Initial dependency installation also requires internet access.

The complete 24-step guided tour also passed, including its Search example and the revised local AI instructions.

Additional navigation checks passed for map zoom and reset, all three period modes, episode/audience counting, Squares, the 1,043-topic List, research-field filtering, Gap list/quadrant, paper-scope and ranking selectors, Method, and the anonymous homepage. No JavaScript errors were observed.

## Repository runtime installer

The two release archives were built from the same 1,082 verified files. They passed ZIP CRC checks. The installer installed both local release archives into the separate source checkout, verified every SHA-256, and started the local application successfully. Search returned 10 topics. Four installer tests passed for resume, cached download reuse, checksum verification, rejecting unexpected paths, preserving changed existing files, and startup with existing assets without network access. Live GitHub download verification is recorded separately after publication.

## OpenAI and Claude connections, 31 October 2026

The connection form now offers only ChatGPT (OpenAI) and Claude, each with API key and local CLI options. Official API addresses are filled automatically and validated on the server. Model IDs remain user choices; the form links to the official model catalogs and key dashboards. Claude API requests use strict JSON schema through Anthropic's OpenAI SDK compatibility endpoint. Claude Code requests use structured output, a temporary working directory, safe mode, disabled tools and hooks, and no session persistence.

All 17 offline tests passed. Eight additional connection tests cover the endpoint allowlist and platform mismatch, Claude request construction, status redaction, missing and logged-out CLI states, process isolation and environment filtering, malformed and failed CLI output, cancellation before launch, and status routing. The existing nine credential, server-boundary and runtime-installer tests also passed. JavaScript syntax checks passed.

No paid model request was made for this update. OpenAI and Claude API requests were tested with mocks. Claude Code process output was tested with mocks. This computer has Claude Code 2.1.312, whose help confirms the required flags. The isolated Claude authentication check asks the user to run claude auth login. The Codex authentication check reports a ChatGPT connection. These checks do not establish a successful live Claude assessment. The previous real Codex assessment is documented above.

Browser checks passed for both platforms and both connection modes. Switching platforms clears the key. The API address is read-only and the help links change with the platform. The 390-pixel viewport displayed a single-column API form and CLI setup instructions without horizontal overflow (clientWidth and scrollWidth both 375). The Codex status button confirmed ChatGPT login; the isolated Claude status button requested login. No browser console errors were recorded.
