import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 1000));
const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.dialogueOpen = false;
  document.getElementById('dialogue')?.classList.add('hidden');
  g.missions._stop = true;
  await sleep(200);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(300);

  const N = 20;
  function time(fn) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) fn();
    return +((performance.now() - t0) / N).toFixed(3);
  }
  const r = {};
  r.gameplayUpdate = time(() => g.gameplay.update(1 / 60, 1 / 60));
  r.worldUpdate = time(() => g.world.update(1 / 60, 1 / 60));
  r.crowdUpdate = time(() => g.crowd.update(1 / 60));
  r.wildlifeUpdate = time(() => g.wildlife.update(1 / 60));
  r.vehiclesUpdate = time(() => g.vehicles.update(1 / 60));
  r.fxUpdate = time(() => g.fx.update(1 / 60));
  r.missionsUpdate = time(() => g.missions.update(1 / 60));
  r.uiUpdate = time(() => g.ui.update(1 / 60));
  r.audioUpdate = time(() => g.audio.update(1 / 60, g));
  r.render = time(() => g.composer.render());
  r.mageModelUpdate = time(() => g.heroes.mage.model.update(1 / 60, { speed: 0.5 }));
  r.crowdAgents = g.crowd.agents.filter(a => a.active).length;
  r.heroMageMeshes = (() => { let n = 0; g.heroes.mage.group.traverse(o => { if (o.isMesh) n++; }); return n; })();
  r.heroLuciaMeshes = (() => { let n = 0; g.heroes.lucia.group.traverse(o => { if (o.isMesh) n++; }); return n; })();
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
