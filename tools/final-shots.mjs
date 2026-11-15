import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1440,810'], protocolTimeout: 200000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&hour=21.4&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 12; i++) { document.querySelector('.dlg-box')?.click(); document.getElementById('dlg-next')?.click(); await new Promise(r => setTimeout(r, 100)); }
  g.player.pos.set(790, 0, 150); g.player.crouch = true;
  g.cameraRig.yaw = 0.4; g.cameraRig.pitch = -0.10; g.cameraRig.initialized = false;
});
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: 'shots/final-clinic-street.png' });
// approach prompt
await page.evaluate(() => {
  const g = window.__game;
  g.missions._stop = true;
  setTimeout(() => {
    g.missions.active = false; g.missions.running = false; g.missions.current = null;
    g.missions.task = null; g.missions.pendingStory = null; g.missions._stop = false;
    g.state.storyDone = 1;
    g.missions.runMission(1);
    g.missions.runApproach();
  }, 260);
});
await new Promise(r => setTimeout(r, 2600));
await page.screenshot({ path: 'shots/final-approach.png' });
// detection
await page.evaluate(async () => {
  const g = window.__game;
  document.querySelectorAll('#dlg-choices .dlg-choice')[1]?.click();
  await new Promise(r => setTimeout(r, 300));
  for (let i = 0; i < 8; i++) { document.querySelector('.dlg-box')?.click(); document.getElementById('dlg-next')?.click(); await new Promise(r => setTimeout(r, 90)); }
  const ags = g.missions.spawnThugs(3, g.player.pos.x + 8, g.player.pos.z + 5, 7, 60);
  for (const a of ags) a.unaware = 0;
  g.player.shootAnim = 0.8;
  for (let i = 0; i < 22; i++) { g.gameplay.updateDetection(0.1); }
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'shots/final-detection.png' });
await browser.close();
