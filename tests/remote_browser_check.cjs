const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const out = process.env.ATLAS_EVIDENCE;
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  const origin='http://127.0.0.1:18811';
  try {
    await page.goto(origin,{waitUntil:'networkidle'});
    if(await page.locator('#tourNo').isVisible()) await page.locator('#tourNo').click();
    await page.getByRole('button',{name:'Ask',exact:true}).click();
    await page.locator('#askText').fill('Founder control after outside investment');
    await page.locator('#askRun').click();
    await page.locator('#tList [data-topic]').first().waitFor({timeout:180000});
    assert.equal(await page.locator('#tList > li').count(),10);
    await page.screenshot({path:path.join(out,'search.png'),fullPage:true});
    await page.locator('#tList [data-topic]').first().click();
    await page.locator('#topicPage').waitFor();
    assert((await page.locator('#topicPage').innerText()).length>500);
    await page.screenshot({path:path.join(out,'topic.png'),fullPage:true});
    const contextLink=page.locator('a[href^="transcript/"]').first();
    if(await contextLink.count()) {
      const response=await page.request.get(new URL(await contextLink.getAttribute('href'),origin).href);
      assert.equal(response.status(),200);
      assert((await response.text()).length>300);
    } else {
      const questionLink=page.locator('#topicPage [data-qid]').first();
      assert(await questionLink.count(),'Expected a core question link');
      await questionLink.click();
      const quote=page.locator('a[href^="transcript/"]').first();
      await quote.waitFor();
      const response=await page.request.get(new URL(await quote.getAttribute('href'),origin).href);
      assert.equal(response.status(),200);
    }
    await page.getByRole('button',{name:'Ask',exact:true}).click();
    await page.getByRole('tab',{name:/^AI assistant/}).click();
    await page.locator('#localModel').waitFor();
    assert(await page.locator('#localKey').isVisible());
    assert.equal(await page.locator('#howto li').count(),3);
    await page.screenshot({path:path.join(out,'connection.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
    await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({search_topics:10,topic:true,excerpt:true,ai_connection_form:true,mobile:true,page_errors:errors,paid_ai_call:false}));
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
