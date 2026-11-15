// Drives the whole 45-operation campaign headlessly and fails on any stall.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1024,640'],
  protocolTimeout: 300000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
await page.goto(BASE + '/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });

const result = await page.evaluate(async () => {
  const g = window.__game;
  const log = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.startNewGame();
  await sleep(1200);
  g.missions._stop = true;
  await sleep(800);
  g.missions.active = false; g.missions.running = false; g.missions.current = null;
  g.missions.task = null; g.missions.pendingStory = null; g.missions._stop = false;
  g.state.storyDone = 0;
  const t0 = performance.now();
  let lastTitle = '';
  let lastProgressAt = performance.now();
  let stall = null;
  g.missions.startCampaign();
  for (let guard = 0; guard < 60000 && performance.now() - t0 < 240000; guard++) {
    const m = g.missions;
    const title = m.current?.title || '';
    if (title && title !== lastTitle) { lastTitle = title; log.push(`${g.state.storyDone + 1}. ${title}`); }
    if (g.mode === 'ending') { log.push('ENDING: ' + g.state.ending); break; }
    if (g.dialogueOpen) {
      (document.querySelector('#dlg-choices .dlg-choice') || document.querySelector('.dlg-box'))?.click();
      document.getElementById('dlg-next')?.click();
      await sleep(18);
      continue;
    }
    if (g.waypoint) { g.player.pos.x = g.waypoint.x; g.player.pos.z = g.waypoint.z; }
    if (m.pendingStory) { g.player.pos.x = m.pendingStory.x; g.player.pos.z = m.pendingStory.z; }
    const t = m.task;
    if (t) {
      lastProgressAt = performance.now();
      if (t.type === 'kill' && t.agents) for (const a of t.agents) { a.down = true; a.active = false; }
      if (t.type === 'fight') for (const a of m.missionAgents) { a.down = true; a.active = false; }
      if (t.type === 'drive' || t.type === 'goto' || t.type === 'until') g.player.pos.set(t.x ?? 0, 0, t.z ?? 0);
      if (t.type === 'timer') t.t = t.max;
      if (t.type === 'until') t.fn = () => true;
      m.debugSkip();
    }
    for (const a of g.crowd.agents) if (a.mission && !a.down) { a.down = true; a.active = false; }
    await sleep(18);
    if (performance.now() - lastProgressAt > 15000 && !stall) {
      stall = { done: g.state.storyDone, title, task: m.task?.type, text: m.task?.text, mode: g.mode, dlg: g.dialogueOpen, pending: !!m.pendingStory, running: m.running };
      break;
    }
  }
  return {
    log, done: g.state.storyDone, ending: g.state.ending, mode: g.mode,
    money: g.state.money, bond: Math.round(g.state.bond), artifacts: g.state.artifacts.length,
    secs: Math.round((performance.now() - t0) / 1000), stall,
  };
});

console.log(result.log.join('\n'));
console.log('RESULT', JSON.stringify({
  done: result.done, ending: result.ending, mode: result.mode,
  money: result.money, bond: result.bond, artifacts: result.artifacts, secs: result.secs,
}));
if (result.stall) console.log('STALL', JSON.stringify(result.stall));
console.log('ERRORS', errors.slice(0, 8).join('\n') || 'none');
await browser.close();

const pass = result.done === 45 && !result.stall && errors.length === 0;
if (!pass) process.exitCode = 1;