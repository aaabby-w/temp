/* UI regression check; uses an existing Playwright installation, not a site dependency. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const base = process.env.ATLAS_URL || 'http://127.0.0.1:5174/';
const out = path.join(os.tmpdir(), 'atlas-node-qa');
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const errors = [];
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  const page = await desktop.newPage();
  const track = p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  };
  track(page);
  const ready = async p => { await p.waitForSelector('#scene[data-vector-regions]'); await p.waitForTimeout(1000); };
  const labelsClear = async p => p.evaluate(() => {
    const blocks = [...document.querySelectorAll('.masthead,.city-panel,.node-rail,.viewport-controls,.footer')].map(e => e.getBoundingClientRect());
    return [...document.querySelectorAll('.node-tooltip.show')].every(e => {
      const r = e.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight &&
        blocks.every(b => !(r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top));
    });
  });
  await page.goto(base); await ready(page);
  assert(await page.locator('.active-label').evaluate(e => e.classList.contains('show')), 'Active label should persist');
  const overview = await page.locator('#nodes').evaluate(e => getComputedStyle(e).getPropertyValue('--minor-opacity'));
  assert.equal(await page.locator('.map-node.named[data-visible]:not(.active)').first().evaluate(e => getComputedStyle(e).opacity), '1');
  const candidate = await page.locator('.map-node').evaluateAll(buttons => buttons.findIndex(b => {
    const r = b.getBoundingClientRect();
    return b.matches('.named[data-visible]:not(.active)') && document.elementFromPoint(r.x+r.width/2, r.y+r.height/2)?.closest('.map-node') === b;
  }));
  assert(candidate >= 0, 'A non-selected named node should be discoverable');
  await page.locator('.map-node').nth(candidate).hover();
  await page.waitForTimeout(300);
  assert(await page.locator('#node-tooltip').evaluate(e => e.classList.contains('show')), 'Named hover label');
  assert(await labelsClear(page), 'Hover labels overlap UI');
  await page.screenshot({ path: path.join(out, 'desktop-hover.png') });
  await page.locator('.map-node').nth(candidate).click();
  await page.mouse.move(900, 400); await page.waitForTimeout(1200);
  assert.equal(await page.locator('.map-node.active').count(), 1);
  assert.equal(await page.locator('.map-node').nth(candidate).getAttribute('aria-pressed'), 'true');
  assert(await page.locator('.active-label').evaluate(e => e.classList.contains('show')));
  assert(await page.locator('#node-connection').evaluate(e => e.hasAttribute('data-visible')));
  const lineWidth = await page.locator('#node-connection-path').evaluate(e => getComputedStyle(e).strokeWidth);
  assert(parseFloat(lineWidth) >= 1.4);
  const minor = await page.locator('.map-node').evaluateAll(buttons => buttons.findIndex(b => {
    const r=b.getBoundingClientRect();
    return b.matches('.unnamed[data-visible]') && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.map-node')===b;
  }));
  assert(minor>=0);
  await page.locator('.map-node').nth(minor).click(); await page.waitForTimeout(900);
  assert.equal(await page.locator('.map-node').nth(minor).getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.active-label').textContent(),/未命名/);
  const namedCount = await page.locator('#node-rail button').count();
  for (let i=0; i<namedCount; i++) {
    await page.locator('#node-rail button').nth(i).click(); await page.waitForTimeout(900);
    assert(await labelsClear(page), `Desktop node ${i}: labels overlap UI`);
  }
  await page.locator('#node-rail button').nth(2).click(); await page.waitForTimeout(900);
  await page.locator('#theme-toggle').click(); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'desktop-dark.png') });
  for (let i=0;i<7;i++) await page.locator('#zoom-in').click();
  await page.waitForTimeout(1200);
  const zoomed = await page.locator('#nodes').evaluate(e => getComputedStyle(e).getPropertyValue('--minor-opacity'));
  assert(Number(zoomed) > Number(overview), 'Minor nodes should become clearer with zoom');
  await page.locator('#author-toggle').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('.map-node[data-visible]').first().evaluate(e => getComputedStyle(e).pointerEvents), 'none');
  await page.mouse.click(720,400); await page.waitForSelector('#author-snippet.show');
  assert.match(await page.locator('#author-code').textContent(), /x: \d+, y: \d+/);
  await page.locator('#author-toggle').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#node-rail button').nth(0).click(); await page.waitForTimeout(150);
  assert.equal(await page.locator('.map-node.active').evaluate(e => getComputedStyle(e,'::after').animationName), 'none');
  assert.equal(await page.locator('#node-connection-path').evaluate(e => getComputedStyle(e).animationName), 'none');
  // Keyboard focus receives the same label without requiring pointer hover.
  await page.locator('.map-node.named[data-visible]:not(.active)').first().focus();
  assert(await page.locator('#node-tooltip').evaluate(e => e.classList.contains('show')));
  const mobile = await browser.newContext({ viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true });
  const phone = await mobile.newPage(); track(phone);
  await phone.goto(base); await ready(phone);
  const point = phone.locator('.map-node.active');
  assert((await point.boundingBox()).width >= 44, 'Touch target is not shrunk by perspective');
  await phone.locator('#node-rail button').nth(2).tap(); await phone.waitForTimeout(1100);
  assert(await phone.locator('.active-label').evaluate(e => e.classList.contains('show')));
  assert(await labelsClear(phone));
  await phone.screenshot({ path:path.join(out,'mobile-light.png') });
  await phone.locator('#theme-toggle').tap(); await phone.waitForTimeout(400);
  await phone.screenshot({ path:path.join(out,'mobile-dark.png') });
  const touchNode=await phone.locator('.map-node').evaluateAll(buttons=>buttons.findIndex(b=>{
    const r=b.getBoundingClientRect();
    return b.matches('.named[data-visible]:not(.active)') && document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.map-node')===b;
  }));
  assert(touchNode>=0);
  await phone.locator('.map-node').nth(touchNode).tap(); await phone.waitForTimeout(1000);
  assert.equal(await phone.locator('.map-node').nth(touchNode).getAttribute('aria-pressed'),'true');
  const before=await phone.locator('#viewport-status').textContent();
  const touch=await mobile.newCDPSession(phone);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:430}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:225,y:430}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:255,y:430}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await phone.waitForTimeout(500);
  assert.notEqual(await phone.locator('#viewport-status').textContent(),before,'Horizontal touch rotation');
  for (const size of [{width:320,height:568},{width:844,height:390}]) {
    await phone.setViewportSize(size); await phone.waitForTimeout(500);
    assert(await labelsClear(phone), 'Small viewport label overlap');
    assert(await phone.evaluate(() => document.documentElement.scrollWidth === innerWidth && document.documentElement.scrollHeight === innerHeight));
  }
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({out,overviewMinorOpacity:Number(overview),zoomedMinorOpacity:Number(zoomed),lineWidth,desktopNamedHover:true,persistentSelection:true,labelClearance:true,mobile44pxTargets:true,editor:true,reducedMotion:true,errors},null,2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
