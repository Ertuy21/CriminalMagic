import puppeteer from 'puppeteer-core';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1280,720'] });
const page = await browser.newPage();
const errors=[]; page.on('pageerror', e=>errors.push(e.message));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r=>setTimeout(r,5000));
console.log('state1', await page.evaluate(()=>({mode:window.__game.mode, open:window.__game.dialogueOpen, obj:document.getElementById('mission-obj').textContent, chapter:!document.getElementById('chapter-card').classList.contains('hidden')})));
for (let i=0;i<20;i++){
  const open = await page.evaluate(()=>window.__game.dialogueOpen);
  if(!open) break;
  await page.click('.dlg-box').catch(()=>{});
  await new Promise(r=>setTimeout(r,220));
}
console.log('state2', await page.evaluate(()=>({mode:window.__game.mode, open:window.__game.dialogueOpen, obj:document.getElementById('mission-obj').textContent, pos:window.__game.player.pos.toArray()})));
await page.keyboard.down('KeyW');
await new Promise(r=>setTimeout(r,1000));
await page.keyboard.up('KeyW');
console.log('move', await page.evaluate(()=>({pos:window.__game.player.pos.toArray(), moving:window.__game.player.moving, mode:window.__game.mode})));
await page.keyboard.press('Space');
await new Promise(r=>setTimeout(r,250));
console.log('jump', await page.evaluate(()=>({y:window.__game.player.y, grounded:window.__game.player.grounded})));
await page.screenshot({ path:'shots/test-move.png' });
console.log('errors', errors.slice(0,5));
await browser.close();
