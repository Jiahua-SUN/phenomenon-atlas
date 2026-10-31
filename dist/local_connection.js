/* The key stays in this tab. It is never placed in browser storage. */
'use strict';
window.atlasLocal = (() => {
  let token = '', requestId = '';
  const q = s => document.querySelector(s);
  const platforms = {
    openai: {name:'ChatGPT (OpenAI)',base:'https://api.openai.com/v1',example:'gpt-6-astra',models:'https://developers.openai.com/api/docs/models',keys:'https://platform.openai.com/api-keys',docs:'https://developers.openai.com/api/docs/quickstart',cli:'Codex CLI',mode:'codex',install:'https://developers.openai.com/codex/cli/',login:'codex login'},
    anthropic: {name:'Claude',base:'https://api.anthropic.com/v1',example:'claude-sonnet-5-5',models:'https://platform.claude.com/docs/en/models/overview',keys:'https://platform.claude.com/settings/keys',docs:'https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk',cli:'Claude Code',mode:'claude',install:'https://code.claude.com/docs/en/quickstart',login:'claude auth login'}
  };
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
      <p class="local-step">1. Choose your platform</p>
      <div class="tg" role="group" aria-label="AI platform"><button type="button" data-platform="openai" class="selected" aria-pressed="true">ChatGPT (OpenAI)</button><button type="button" data-platform="anthropic" aria-pressed="false">Claude</button></div>
      <p class="local-step">2. Choose how to connect</p>
      <div class="tg" role="group" aria-label="AI connection"><button type="button" data-local-mode="api" class="selected" aria-pressed="true">API key</button><button type="button" data-local-mode="cli" aria-pressed="false">Use local CLI</button></div>
      <div id="localApi"><div class="local-fields">
        <div><label for="localModel">Model ID</label><input id="localModel" aria-describedby="localModelHint" autocomplete="off" spellcheck="false"><p id="localModelHint" class="local-hint"></p></div>
        <div><label for="localKey">API key</label><input id="localKey" aria-describedby="localKeyHint" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your private API key"><p id="localKeyHint" class="local-hint"></p></div>
        <div class="local-wide"><label for="localBase">API base URL · filled automatically</label><input id="localBase" type="url" readonly aria-describedby="localBaseHint"><p id="localBaseHint" class="local-hint"></p></div></div>
        <button type="button" class="text-btn" id="localClear">Clear key</button>
        <p class="local-note">Your API key will not be published or saved by Atlas. It stays in this tab and is sent through the local server only to the selected official API when you click Assess. Your question and selected evidence are sent to that provider. API usage follows your API account's billing and credits.</p></div>
      <div id="localCli" hidden><p id="localCliIntro"></p>
        <ol class="local-cli-steps" id="localCliSteps"></ol>
        <button type="button" class="primary-btn" id="localCheck"></button><span id="localCliStatus" role="status"></span>
        <p class="local-note">No API key, API address or model ID is needed here. Atlas uses the CLI's default model. Usage and limits follow the account signed in to that CLI. Atlas does not install software or change your login.</p></div>
      <p class="local-note">Your model interprets the quotes and papers retrieved for your question. AI requires internet access. Results are saved only on this computer and reused for the same question and connection settings. Responses and paper ratings may differ across models. Search uses the included model and needs no API key.</p>`;
    q('#assessCompose').before(box);
    box.dataset.platform='openai';box.dataset.mode='api';
    const link=(url,text)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    function renderPlatform() {
      const p=platforms[box.dataset.platform];
      q('#localBase').value=p.base;q('#localModel').value='';q('#localKey').value='';
      q('#localModel').placeholder=`For example, ${p.example}`;
      q('#localModelHint').innerHTML=`Copy an API model ID from the ${link(p.models,'official model list')}, for example <code>${p.example}</code>. Use a text model available to your API account.`;
      q('#localKeyHint').innerHTML=`Create a key in your ${link(p.keys,box.dataset.platform==='anthropic'?'Claude Console workspace':'OpenAI API dashboard')}. This is an API key, not your chat password.`;
      q('#localBaseHint').innerHTML=`This is ${p.name}'s official API address. Atlas fills it in for you. See the ${link(p.docs,'official connection guide')}.`;
      q('#localCliIntro').textContent=`Use ${p.cli} installed and signed in on this computer.`;
      q('#localCliSteps').innerHTML=`<li>${link(p.install,`Install ${p.cli}`)} if needed.</li><li>Open a terminal and run <code>${p.login}</code>.</li><li>Return here and check the connection.</li>`;
      q('#localCheck').textContent=`Connect ${p.cli}`;q('#localCliStatus').textContent='';
      box.querySelectorAll('[data-platform]').forEach(b=>{const selected=b.dataset.platform===box.dataset.platform;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    }
    box.querySelectorAll('[data-platform]').forEach(b=>b.onclick=()=>{box.dataset.platform=b.dataset.platform;renderPlatform();});
    box.querySelectorAll('[data-local-mode]').forEach(b => b.onclick = () => {
      box.dataset.mode = b.dataset.localMode;
      box.querySelectorAll('[data-local-mode]').forEach(x => {x.classList.toggle('selected', x===b);x.setAttribute('aria-pressed',x===b);});
      q('#localApi').hidden = b.dataset.localMode !== 'api';q('#localCli').hidden = b.dataset.localMode !== 'cli';
    });
    renderPlatform();
    q('#localClear').onclick = () => {q('#localKey').value='';q('#localKey').focus();};
    q('#localCheck').onclick = async () => {
      q('#localCliStatus').textContent='Checking…';
      const platform=box.dataset.platform;
      try {const r=await fetch(`api/cli/status?provider=${platform}`);const s=await r.json();if(box.dataset.platform===platform)q('#localCliStatus').textContent=r.ok?s.message:(s.error||'Connection could not be checked.');}
      catch {if(box.dataset.platform===platform)q('#localCliStatus').textContent='The local server is unavailable.';}
    };
  }
  function provider() {
    const box=q('.local-connection'), platform=box.dataset.platform;
    if (box.dataset.mode === 'cli') return {mode:platforms[platform].mode,model:''};
    const p={mode:'api',provider:platform,base_url:platforms[platform].base,model:q('#localModel').value.trim(),api_key:q('#localKey').value.trim()};
    if (!p.api_key || !p.model) throw new Error('Enter your model ID and API key above, or choose Use local CLI.');
    return p;
  }
  return {mount,post,provider,newRequest(){return requestId=crypto.randomUUID();},stop(){return post('api/assess/stop',{request_id:requestId});}};
})();
