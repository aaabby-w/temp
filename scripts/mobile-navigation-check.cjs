/* Regression: RAF clock drift on slow devices, rail gestures and mobile details. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const base = process.env.ATLAS_URL || 'http://127.0.0.1:5174/';
(async () => {
 const browser = await chromium.launch({ executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
 const errors=[], results=[];
 for (const size of [{width:390,height:780},{width:320,height:568},{width:844,height:390}]) {
  const context = await browser.newContext({viewport:size,deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const page = await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.__fovs=[];
   const native=WebGL2RenderingContext.prototype.uniformMatrix4fv;
   WebGL2RenderingContext.prototype.uniformMatrix4fv=function(location,transpose,data,...args){
    if(data.length===16&&data[11]===-1&&data[15]===0)window.__fovs.push(2*Math.atan(1/data[5])*180/Math.PI);
    return native.call(this,location,transpose,data,...args);
   };
  });
  await page.goto(base);await page.waitForSelector('#scene[data-vector-regions]');
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(900);
  const metrics=await page.evaluate(()=>{
   const head=document.querySelector('.masthead').getBoundingClientRect();
   const rail=document.querySelector('#node-rail').getBoundingClientRect();
   const panel=document.querySelector('#city-panel').getBoundingClientRect();
   return {headerBottom:head.bottom,railTop:rail.top,railBottom:rail.bottom,panelTop:panel.top,panelHeight:panel.height,
    firstFov:window.__fovs[0],overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
  });
  assert(Math.abs(metrics.firstFov-71)<.01);assert(!metrics.overflow);
  assert(metrics.headerBottom+3<metrics.railTop);assert(metrics.railBottom+24<metrics.panelTop);
  assert(metrics.panelHeight<95,'Mobile details should start compact');
  assert.equal(await page.locator('.panel-toggle').getAttribute('aria-expanded'),'false');
  assert(!await page.locator('#panel-description').isVisible());
  await page.screenshot({path:path.join(os.tmpdir(),`atlas-mobile-${size.width}.png`)});
  await page.locator('.panel-toggle').tap();assert.equal(await page.locator('.panel-toggle').getAttribute('aria-expanded'),'true');
  assert(await page.locator('#panel-description').isVisible());
  assert.equal(await page.locator('#panel-description').evaluate(e=>getComputedStyle(e).opacity),'1','Expanded details should be readable immediately');
  await page.screenshot({path:path.join(os.tmpdir(),`atlas-mobile-${size.width}-expanded.png`)});
  await page.locator('#reset-view').tap();await page.waitForTimeout(1000);
  assert.equal(await page.locator('.panel-toggle').getAttribute('aria-expanded'),'false');
  assert.match(await page.locator('#viewport-status').textContent(),/ZOOM 100%/);
  if(size.width===390){
   const cdp=await context.newCDPSession(page);
   // Native horizontal swipe must scroll the rail without selecting or rotating.
   const rail=await page.locator('#node-rail').boundingBox();
   const selected=await page.locator('.map-node.active').getAttribute('aria-label');
   const before=await page.locator('#viewport-status').textContent();
   const y=rail.y+rail.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:330,y}]});
   for(const x of [290,250,210,170,130])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(500);
   assert(await page.locator('#node-rail').evaluate(e=>e.scrollLeft>20));
   assert.equal(await page.locator('.map-node.active').getAttribute('aria-label'),selected);
   assert.equal(await page.locator('#viewport-status').textContent(),before);
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
   const count=await page.locator('#node-rail button').count();
   for(let i=0;i<10;i++){await page.locator('#node-rail button').nth(i%count).tap();await page.waitForTimeout(80);}
   await page.waitForTimeout(1200);await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
   const fovs=await page.evaluate(()=>window.__fovs);
   assert(fovs.every(v=>Number.isFinite(v)&&v>=28-.01&&v<=78+.01),'RAF clock caused FOV runaway');
   const active=page.locator('#node-rail button.active');
   await page.evaluate(()=>{window.__panelMutations=0;window.__panelObserver=new MutationObserver(()=>window.__panelMutations++);window.__panelObserver.observe(document.querySelector('#city-panel'),{childList:true});});
   await active.tap();await active.tap();await page.waitForTimeout(300);
   assert.equal(await page.evaluate(()=>window.__panelMutations),0,'Repeated selection rebuilds the panel');
   results.push({slowDeviceFovRange:[Math.min(...fovs),Math.max(...fovs)],railSwipe:true,repeatedSelectionStable:true});
  }
  results.push({viewport:size,...metrics});await context.close();
 }
 assert.equal(errors.length,0,errors.join('\n'));
 console.log(JSON.stringify({results,errors},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
