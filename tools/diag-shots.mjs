import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&hour=21.4&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 1200));

async function shot(name, setup) {
  await page.evaluate(async (setupSrc) => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.dialogueOpen = false;
    document.getElementById('dialogue')?.classList.add('hidden');
    g.missions._stop = true;
    g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
    g.mode = 'play';
    g.paused = true;
    g.ui.el.hud.classList.add('hidden');
    for (const id of ['chapter-card', 'dialogue', 'loading', 'fade', 'flash', 'menu']) {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    }
    document.getElementById('fade')?.style.setProperty('opacity', '0');
    await sleep(60);
    // eslint-disable-next-line no-new-func
    new Function('g', setupSrc)(g);
    g.camera.updateMatrixWorld();
    g.renderer.info.autoReset = false;
    g.renderer.info.reset();
    g.composer.render();
    window.__stats = { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    g.renderer.info.autoReset = true;
    await sleep(60);
  }, setup);
  await new Promise(r => setTimeout(r, 250));
  await page.screenshot({ path: 'shots/' + name + '.png' });
  return page.evaluate(() => window.__stats);
}

// car with steered wheels
console.log('car', await shot('diag-car-steer', `
  const car = g.vehicles.list[0];
  car.pos.set(40, 0, -300); car.yaw = 0; car.steer = 1;
  for (const w of car.wheels) if (w.front) w.group.rotation.y = -0.42;
  car.bodyGroup.rotation.z = -0.07;
  car.group.position.copy(car.pos); car.group.rotation.y = 0;
  car.group.updateMatrixWorld(true);
  g.camera.position.set(41.2, 1.5, -296.2);
  g.camera.lookAt(40, 0.55, -300);
`));
console.log('side', await shot('diag-car-side', `
  const car = g.vehicles.list[0];
  car.pos.set(40, 0, -300); car.yaw = 0;
  car.group.position.copy(car.pos); car.group.rotation.y = 0;
  car.group.updateMatrixWorld(true);
  g.camera.position.set(36.2, 0.95, -300.01);
  g.camera.lookAt(40, 0.55, -300);
`));
console.log('heroface', await shot('diag-hero-face', `
  const h = g.player;
  h.pos.set(40, 0, -310); h.yaw = 0; h.group.position.copy(h.pos); h.group.rotation.y = 0;
  h.model.update(0.016, { speed: 0 });
  h.group.updateMatrixWorld(true);
  g.camera.position.set(40.55, 1.42, -312.2);
  g.camera.lookAt(40, 1.30, -310);
`));
console.log('herobody', await shot('diag-hero-body', `
  const h = g.player;
  h.pos.set(40, 0, -310); h.yaw = 0; h.group.position.copy(h.pos); h.group.rotation.y = 0;
  h.model.update(0.016, { speed: 0 });
  h.group.updateMatrixWorld(true);
  g.camera.position.set(42.1, 1.0, -307.9);
  g.camera.lookAt(40, 0.9, -310);
`));
console.log('crowd', await shot('diag-crowd', `
  const a = g.crowd.agents.find(a => a.active && a.type === 'ped') || g.crowd.agents[0];
  a.active = true; a.type = 'ped'; a.down = false; a.x = 40; a.z = -318; a.yaw = 0; a.speed = 0; a.phase = 1; a.build = 1;
  g.crowd.setColors(a);
  g.crowd.update(0.016);
  g.camera.position.set(40.6, 1.45, -320.0);
  g.camera.lookAt(40, 1.25, -318);
`));
await browser.close();
