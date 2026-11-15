// Guarantees every one of the 45 operation start points is reachable.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
await page.goto(BASE + '/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });

const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.startNewGame();
  await sleep(1200);
  g.missions._stop = true;
  await sleep(600);
  g.missions.active = false; g.missions.running = false; g.missions.current = null;
  g.missions.task = null; g.missions.pendingStory = null; g.missions._stop = false;
  const MISSIONS = g.missions.constructor.MISSIONS;
  const bad = [];
  for (let i = 0; i < MISSIONS.length; i++) {
    g.state.storyDone = i;
    g.missions.pendingStory = null;
    g.missions.queueNext();
    const p = g.missions.pendingStory;
    if (!p) { bad.push({ i, reason: 'no pending story' }); continue; }
    const probe = { x: p.x, z: p.z };
    const hit = g.world.collideCircle(probe, 0.55);
    const moved = hit ? Math.hypot(probe.x - p.x, probe.z - p.z) : 0;
    if (moved > 0.5) bad.push({ i, title: MISSIONS[i].title, at: [Math.round(p.x), Math.round(p.z)], pushed: +moved.toFixed(1) });
  }
  return { total: MISSIONS.length, bad };
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', errors.slice(0, 6).join('\n') || 'none');
await browser.close();

const pass = out.total === 45 && out.bad.length === 0 && errors.length === 0;
if (!pass) process.exitCode = 1;