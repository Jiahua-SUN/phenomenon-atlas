const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const out = path.join(process.env.RUNNER_TEMP, 'atlas-public-evidence');
fs.mkdirSync(out, { recursive: true });
const report = {site: 'https://atlas.phenomenon.page/', started: new Date().toISOString(), assessment_requests: 0};
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/api/assess')) report.assessment_requests++; });
  const shot = name => page.screenshot({path: path.join(out, name+'.png'), fullPage: true});
  try {
    const trace = await (await context.request.get('https://www.cloudflare.com/cdn-cgi/trace')).text();
    report.cloudflare_country = trace.split('\n').find(x => x.startsWith('loc='))?.slice(4);
    try {
      const g = await (await context.request.get('https://ipapi.co/json/')).json();
      report.geolocation = {country: g.country_code, city: g.city, region: g.region, org: g.org};
    } catch(e) { report.geolocation_error = e.message; }
    assert.equal(report.cloudflare_country, 'US');
    if (report.geolocation?.country) assert.equal(report.geolocation.country, 'US');
    console.log('US exit confirmed', JSON.stringify(report.geolocation));
    let t = Date.now();
    const home = await page.goto(report.site, {waitUntil: 'networkidle', timeout: 90000});
    assert.equal(home.status(), 200);
    if (await page.locator('#tourNo').isVisible()) await page.locator('#tourNo').click();
    report.home = {status: home.status(), seconds: (Date.now()-t)/1000, title: await page.title()};
    await shot('home');
    const before = await (await context.request.get(report.site+'api/status')).json();
    assert.equal(before.assistant.login_required, false);
    assert.equal(before.assistant.daily_limit, 1000);
    assert(before.assistant.remaining > 0, 'Daily allowance exhausted');
    report.quota_before = before.assistant.remaining;
    await page.getByRole('button', {name: 'Ask', exact: true}).click();
    await page.locator('#askText').fill('Founder control after outside investment');
    t = Date.now();
    const pendingSearch = page.waitForResponse(r => r.url().endsWith('/api/search') && r.request().method()==='POST', {timeout: 180000});
    await page.locator('#askRun').click();
    const sr = await pendingSearch; const search = await sr.json();
    assert.equal(sr.status(), 200); assert.equal(search.topics.length, 10);
    await page.locator('#tList > li').last().waitFor();
    assert.equal(await page.locator('#tList > li').count(), 10);
    report.search = {status: sr.status(), seconds: (Date.now()-t)/1000, topics: search.topics.length, total: search.topics_total};
    await shot('search');
    await page.getByRole('tab', {name: /^AI assistant/}).click();
    assert.equal(await page.locator('#howto li').count(), 2);
    report.quota_visible_before = await page.locator('#assessQuota').innerText();
    const question = 'How do founders maintain strategic autonomy when bringing in minority equity investors?';
    await page.locator('#assessText').fill(question);
    t = Date.now();
    const pendingAnswer = page.waitForResponse(r => r.url().endsWith('/api/assess') && r.request().method()==='POST', {timeout: 600000});
    await page.locator('#assessRun').click();
    const ar = await pendingAnswer; const a = await ar.json();
    fs.writeFileSync(path.join(out, 'assessment.json'), JSON.stringify(a, null, 2));
    assert.equal(ar.status(), 200, JSON.stringify(a));
    assert.equal(a.research.rated, 20); assert(a.podcasts.quotes.length > 0); assert(a.overall.length > 20);
    await page.locator('#assessResult .as-res').waitFor();
    report.assistant = {status: ar.status(), seconds: (Date.now()-t)/1000, question, cached: !!a.cached, quotes: a.podcasts.quotes.length, papers_rated: a.research.rated, related_papers: a.research.related, usage: a.usage};
    report.quota_after = a.assistant.remaining;
    report.quota_visible_after = await page.locator('#assessQuota').innerText();
    await shot('assistant-quotes');
    const href = await page.locator('#assessResult a[href^="transcript/"]').first().getAttribute('href');
    const excerpt = await context.request.get(new URL(href, report.site).href);
    assert.equal(excerpt.status(), 200); assert((await excerpt.text()).length > 300);
    report.excerpt_status = excerpt.status();
    for (const [name, label] of [['papers','In papers'],['overall','Overall']]) {
      await page.locator('#assessResult').getByRole('tab', {name: label, exact: true}).click();
      await shot('assistant-'+name);
    }
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await shot('mobile');
    assert.equal(report.assessment_requests, 1);
    assert(report.quota_after <= report.quota_before-1);
    assert.deepEqual(errors, []);
    report.page_errors = errors; report.result = 'passed';
  } catch(e) {
    report.result = 'failed'; report.error = e.stack;
    await shot('failure').catch(() => {}); throw e;
  } finally {
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(e => {console.error(e); process.exit(1);});
