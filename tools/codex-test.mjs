import puppeteer from 'puppeteer-core';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,810'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=medium&hour=21.4', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 2000));
// finish a few missions instantly to populate the codex
await page.evaluate(async () => {
  const g = window.__game;
  for (let done = 0; done < 3; done++) {
    for (let k = 0; k < 40 && g.state.storyDone === done; k++) {
      if (g.dialogueOpen) {
        const btn = document.querySelector('#dlg-choices .dlg-choice') || document.querySelector('.dlg-box');
        btn?.click();
      }
      if (g.waypoint) { g.player.pos.x = g.waypoint.x; g.player.pos.z = g.waypoint.z; }
      if (g.missions.task) g.missions.debugSkip();
      for (const a of g.crowd.agents) if (a.mission && !a.down) { a.down = true; a.active = false; }
      await new Promise(r => setTimeout(r, 90));
    }
  }
});
await new Promise(r => setTimeout(r, 700));
await page.evaluate(() => window.__game.ui.togglePause(true));
await new Promise(r => setTimeout(r, 500));
await page.evaluate(() => window.__game.ui.toggleCodex());
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'shots/ui-codex.png' });
const codex = await page.evaluate(() => {
  const g = window.__game;
  return {
    storyDone: g.state.storyDone,
    chapters: document.querySelectorAll('.cx-ch').length,
    ops: document.querySelectorAll('.cx-op').length,
    done: document.querySelectorAll('.cx-op.done').length,
    fauna: document.getElementById('codex-fauna').textContent,
  };
});
console.log('CODEX', JSON.stringify(codex));
await page.evaluate(() => { window.__game.ui.toggleCodex(); window.__game.ui.togglePause(false); });
// final scenic shots
const scenic = [
  ['aerial', 900, 230, 600, 0, 0, -300, 20.6, 'shot-aerial-night.png'],
  ['beach', 888, 6.5, 300, 380, 26, -260, 18.2, 'shot-beach-sunset.png'],
  ['skyline', 1180, 20, 480, 300, 38, -260, 22.0, 'shot-skyline.png'],
];
for (const [name, px, py, pz, tx, ty, tz, hour, file] of scenic) {
  await page.evaluate(({ px, py, pz, tx, ty, tz, hour }) => {
    const g = window.__game;
    g.ui.togglePause(false);
    g.mode = 'play';
    g.debugCam = true; g.freeCam = true;
    g.camera.position.set(px, py, pz);
    g.camera.lookAt(tx, ty, tz);
    g.world.setHour(hour);
    document.getElementById('hud').classList.add('hidden');
  }, { px, py, pz, tx, ty, tz, hour });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: 'shots/' + file });
}
console.log('ERRORS', errors.slice(0, 10).join('\n') || 'none');
await browser.close();
