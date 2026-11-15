import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=900,600'], protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await page.evaluate(async () => {
  const g = window.__game; const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.startNewGame(); await sleep(900);
  g.missions._stop = true; await sleep(400);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null; g.mode='play';
});
await new Promise(r => setTimeout(r, 400));
const box = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width }; });
// press and drag right, then release OUTSIDE the zone (common gesture)
await page.touchscreen.touchStart(box.x, box.y);
await page.touchscreen.touchMove(box.x + 35, box.y);
await new Promise(r => setTimeout(r, 200));
const during = await page.evaluate(() => { const g = window.__game; return { mx: +g.input.move.x.toFixed(2), my: +g.input.move.y.toFixed(2), stickId: g.input.stickId }; });
await page.touchscreen.touchMove(box.x + 300, box.y - 200);
await new Promise(r => setTimeout(r, 120));
const dragged = await page.evaluate(() => { const g = window.__game; return { mx: +g.input.move.x.toFixed(2), my: +g.input.move.y.toFixed(2) }; });
await page.touchscreen.touchEnd();
await new Promise(r => setTimeout(r, 350));
const after = await page.evaluate(() => { const g = window.__game; return { mx: +g.input.move.x.toFixed(2), my: +g.input.move.y.toFixed(2), stickId: g.input.stickId, vel: [+g.player.vel.x.toFixed(2), +g.player.vel.z.toFixed(2)] }; });
console.log('DURING', JSON.stringify(during));
console.log('DRAGGED_OUT', JSON.stringify(dragged));
console.log('AFTER_RELEASE', JSON.stringify(after));
await browser.close();
