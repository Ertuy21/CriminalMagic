// Verifies stealth: unaware enemies while crouching, detection after noise.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto(BASE + '/?quality=low&hour=14&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 2400));

const out = await page.evaluate(async () => {
  const g = window.__game;
  const ags = g.missions.spawnThugs(3, g.player.pos.x + 10, g.player.pos.z + 10, 8, 60);
  for (const a of ags) { a.unaware = 5; a.state = 'idle'; a.speed = 0; }
  g.player.crouch = true;
  for (let i = 0; i < 10; i++) { g.gameplay.updateDetection(0.1); g.crowd.update(0.1); }
  const unaware = ags.filter(a => a.unaware > 0).length;
  const hiddenWhileSneaking = document.getElementById('detect').classList.contains('hidden');

  g.player.crouch = false;
  g.player.moving = 7;
  g.player.shootAnim = 0.5;
  // one tick wakes them, then detection accumulates while they are aware
  for (let i = 0; i < 4; i++) g.crowd.update(0.1);
  for (let i = 0; i < 16; i++) { g.player.shootAnim = 0.5; g.gameplay.updateDetection(0.1); }
  const aware = ags.filter(a => a.unaware <= 0).length;
  const detectShown = !document.getElementById('detect').classList.contains('hidden');
  const barWidth = document.querySelector('#detect i')?.style.width;
  g.missions.clearMissionAgents();
  return { unaware, hiddenWhileSneaking, aware, detectShown, barWidth };
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', errors.slice(0, 6).join('\n') || 'none');
await browser.close();

const pass = out.unaware === 3 && out.hiddenWhileSneaking && out.aware === 3 && out.detectShown && errors.length === 0;
if (!pass) process.exitCode = 1;