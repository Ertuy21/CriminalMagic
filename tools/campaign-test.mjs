import puppeteer from 'puppeteer-core';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 1200));

const seen = new Set();
let lastTitle = '';
const log = [];
for (let step = 0; step < 4200; step++) {
  const st = await page.evaluate(() => {
    const g = window.__game;
    const m = g.missions;
    return {
      done: g.state.storyDone,
      title: m.current?.title || '',
      hasTask: !!m.task,
      mode: g.mode,
      dlg: g.dialogueOpen,
      choices: document.querySelectorAll('#dlg-choices .dlg-choice').length,
      missionObj: document.getElementById('mission-obj')?.textContent || '',
      ending: g.mode === 'ending',
    };
  });
  if (st.title && st.title !== lastTitle) {
    lastTitle = st.title;
    log.push(`${st.done + 1}. ${st.title}`);
  }
  if (st.ending) { log.push('ENDING REACHED'); break; }
  if (st.dlc) {}
  // Advance dialogue: click first choice if present, else click dialogue box
  if (st.dlg) {
    if (st.choices > 0) await page.click('#dlg-choices .dlg-choice').catch(() => {});
    else await page.click('.dlg-box').catch(() => {});
    await new Promise(r => setTimeout(r, 30));
    continue;
  }
  // Teleport to waypoint and finish task
  await page.evaluate(() => {
    const g = window.__game;
    const m = g.missions;
    if (g.waypoint) { g.player.pos.x = g.waypoint.x; g.player.pos.z = g.waypoint.z; }
    if (m.task) {
      const t = m.task;
      if (t.type === 'kill' && t.agents) for (const a of t.agents) { a.down = true; a.active = false; }
      if (t.type === 'fight') for (const a of m.missionAgents) { a.down = true; a.active = false; }
      if (t.type === 'artifact') {
        const a = g.world.artifacts.find(k => k.id === t.x); // noop
      }
      if (t.type === 'drive' || t.type === 'goto' || t.type === 'until') {
        g.player.pos.set(t.x ?? 0, 0, t.z ?? 0);
      }
      if (t.type === 'timer') t.t = t.max;
      m.debugSkip();
    }
    // ensure artifacts auto-collect for tests
    if (m.current) {
      for (const a of g.world.artifacts) {
        if (!a.collected) g.gameplay.collectArtifact(a);
      }
    }
  });
  // trigger fight tasks by killing spawned enemies
  await page.evaluate(() => {
    const g = window.__game;
    for (const a of g.crowd.agents) if (a.mission && !a.down) { a.down = true; a.active = false; }
  });
  await new Promise(r => setTimeout(r, 55));
  if (step === 60) await page.screenshot({ path: 'shots/campaign-early.png' });
  if (step === 900) await page.screenshot({ path: 'shots/campaign-mid.png' });
}
const final = await page.evaluate(() => {
  const g = window.__game;
  return {
    storyDone: g.state.storyDone,
    ops: g.state.opsDone,
    bond: Math.round(g.state.bond),
    artifacts: g.state.artifacts.length,
    ending: g.state.ending,
    mode: g.mode,
    money: g.state.money,
  };
});
await page.screenshot({ path: 'shots/campaign-final.png' });
console.log(log.join('\n'));
console.log('FINAL', JSON.stringify(final));
console.log('ERRORS', errors.slice(0, 12).join('\n') || 'none');
await browser.close();
