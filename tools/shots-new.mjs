import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1280,720'], protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&hour=21.4&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 3000));
// clear dialogue to see gameplay
await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 12; i++) { document.querySelector('.dlg-box')?.click(); await new Promise(r => setTimeout(r, 120)); }
  g.player.crouch = true; g.cameraRig.yaw = 2.1; g.cameraRig.pitch = -0.12;
});
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'shots/stealth-gameplay.png' });
// wheel screenshot
await page.evaluate(() => window.__game.ui.openWheel());
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'shots/wheel-current.png' });
await page.evaluate(() => window.__game.ui.closeWheel(false));
// detection HUD
await page.evaluate(async () => {
  const g = window.__game;
  const ags = g.missions.spawnThugs(3, g.player.pos.x + 9, g.player.pos.z + 6, 8, 60);
  for (const a of ags) { a.unaware = 0; a.state = 'chase'; }
  g.player.shootAnim = 0.6;
  for (let i = 0; i < 20; i++) { g.gameplay.updateDetection(0.1); g.crowd.update(0.1); }
});
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'shots/detection-hud.png' });
await browser.close();
