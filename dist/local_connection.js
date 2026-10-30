/* The key stays in this tab. It is never placed in browser storage. */
'use strict';
window.atlasLocal = (() => {
  let token = '', requestId = '';
  const q = s => document.querySelector(s);
  async function post(url, body, signal) {
    if (!token) token = (await (await fetch('api/status')).json()).local_token;
    const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Atlas-Local': token}, body: JSON.stringify(body), signal});
    let data; try { data = await r.json(); } catch { throw new Error('The local server did not return data. Keep the launcher window open.'); }
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  }
  function mount() {
    const box = document.createElement('section'); box.className = 'local-connection';
    box.innerHTML = `<h3>Your AI connection</h3>
      <div class="tg" role="group" aria-label="AI connection"><button type="button" data-local-mode="api" class="selected" aria-pressed="true">API key</button><button type="button" data-local-mode="codex" aria-pressed="false">Codex CLI</button></div>
      <div id="localApi"><div class="local-fields">
        <label>Provider<select id="localPreset"><option value="openai">OpenAI</option><option value="zai">Z.ai</option><option value="deepseek">DeepSeek</option><option value="custom">Other compatible provider</option></select></label>
        <label>API base URL<input id="localBase" type="url" value="https://api.openai.com/v1" autocomplete="off" spellcheck="false"></label>
        <label>Model ID<input id="localModel" placeholder="Enter your model ID" autocomplete="off" spellcheck="false"></label>
        <label>API key<input id="localKey" type="password" autocomplete="off" spellcheck="false" placeholder="Your private API key"></label></div>
        <button type="button" class="text-btn" id="localClear">Clear key</button>
        <p class="local-note">Your API key will not be published or saved by Atlas. It stays in this tab and passes through the local server only to the provider URL above when you click Assess. Your question and selected quotes and paper abstracts are sent to that provider. API usage is billed to your account.</p></div>
      <div id="localCodex" hidden><p>Use Codex CLI installed and signed in on this computer. ChatGPT sign-in uses your plan's available Codex allowance. API sign-in follows API billing. A subscription to another agent is not connected here.</p>
        <button type="button" class="primary-btn" id="localCheck">Connect installed Codex CLI</button> <span id="localCliStatus" role="status"></span>
        <p class="local-note">If needed, <a href="https://developers.openai.com/codex/cli/" target="_blank" rel="noopener">install Codex CLI</a>, run <code>codex login</code> in a terminal, then connect here. Atlas sends the question and selected evidence through your CLI. It does not copy your credentials. Each assessment runs in a temporary folder with shell tools disabled.</p></div>
      <p class="local-note">AI requires internet access. Results are saved only on this computer and reused for the same question and connection. Search uses the included model and needs no API key.</p>`;
    q('#assessCompose').before(box);
    box.querySelectorAll('[data-local-mode]').forEach(b => b.onclick = () => {
      box.dataset.mode = b.dataset.localMode;
      box.querySelectorAll('[data-local-mode]').forEach(x => {x.classList.toggle('selected', x===b);x.setAttribute('aria-pressed',x===b);});
      q('#localApi').hidden = b.dataset.localMode !== 'api';q('#localCodex').hidden = b.dataset.localMode !== 'codex';
    });
    q('#localPreset').onchange = () => {
      const p = {openai:['https://api.openai.com/v1',''],zai:['https://api.z.ai/api/paas/v4','glm-5.3-flash'],deepseek:['https://api.deepseek.com','deepseek-chat'],custom:['','']}[q('#localPreset').value];
      q('#localBase').value=p[0];q('#localModel').value=p[1];q('#localKey').value='';
    };
    q('#localClear').onclick = () => {q('#localKey').value='';q('#localKey').focus();};
    q('#localCheck').onclick = async () => {
      q('#localCliStatus').textContent='Checking…';
      try {const s=await (await fetch('api/cli/status')).json();q('#localCliStatus').textContent=s.message;}
      catch {q('#localCliStatus').textContent='The local server is unavailable.';}
    };
  }
  function provider() {
    if (q('.local-connection').dataset.mode === 'codex') return {mode:'codex',model:''};
    const p={mode:'api',base_url:q('#localBase').value.trim(),model:q('#localModel').value.trim(),api_key:q('#localKey').value.trim()};
    if (!p.api_key || !p.model || !p.base_url) throw new Error('Enter your provider URL, model ID and API key above, or choose Codex CLI.');
    return p;
  }
  return {mount,post,provider,newRequest(){return requestId=crypto.randomUUID();},stop(){return post('api/assess/stop',{request_id:requestId});}};
})();
