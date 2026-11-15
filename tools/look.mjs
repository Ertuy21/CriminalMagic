import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=900,900'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&hour=21.4&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 1200));

async function shot(name, src) {
  await page.evaluate(async (setupSrc) => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.dialogueOpen = false;
    for (const id of ['dialogue', 'chapter-card', 'loading', 'menu', 'hud']) {
      const el = document.getElementById(id); if (el) el.classList.add('hidden');
    }
    g.missions._stop = true;
    g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
    g.mode = 'play';
    g.paused = true;
    await sleep(50);
    new Function('g', setupSrc)(g);
    g.camera.updateMatrixWorld();
    g.composer.render();
    await sleep(50);
  }, src);
  await new Promise(r => setTimeout(r, 250));
  await page.screenshot({ path: 'shots/' + name + '.png' });
}

// Face-on, three-quarter light
await shot('look-mage', `
  const h = g.heroes.mage;
  g.player.pos.set(20, 0, -300); h.pos.set(20, 0, -300);
  h.yaw = Math.PI; h.group.rotation.y = Math.PI; h.group.position.copy(h.pos);
  h.model.update(0.016, { speed: 0 });
  h.group.updateMatrixWorld(true);
  g.camera.position.set(20.75, 1.48, -302.4);
  g.camera.lookAt(20, 1.36, -300);
  g.camera.fov = 32; g.camera.updateProjectionMatrix();
`);
await shot('look-lucia', `
  const h = g.heroes.lucia;
  g.player.pos.set(20, 0, -300); h.pos.set(20, 0, -300);
  h.yaw = Math.PI; h.group.rotation.y = Math.PI; h.group.position.copy(h.pos);
  h.model.update(0.016, { speed: 0 });
  h.group.updateMatrixWorld(true);
  g.camera.position.set(20.75, 1.48, -302.4);
  g.camera.lookAt(20, 1.36, -300);
  g.camera.fov = 32; g.camera.updateProjectionMatrix();
`);
await shot('look-car', `
  const car = g.vehicles.list[0];
  car.pos.set(20, 0, -300); car.yaw = Math.PI * 0.78;
  car.steer = 0.9;
  for (const w of car.wheels) if (w.front) w.group.rotation.y = -0.46 * 0.9;
  car.group.position.copy(car.pos); car.group.rotation.y = car.yaw;
  car.group.updateMatrixWorld(true);
  g.camera.position.set(24.2, 1.9, -303.5);
  g.camera.lookAt(20, 0.7, -300);
  g.camera.fov = 40; g.camera.updateProjectionMatrix();
`);
await shot('look-car-front', `
  const car = g.vehicles.list[0];
  car.pos.set(20, 0, -300); car.yaw = Math.PI;
  car.steer = 0.9;
  for (const w of car.wheels) if (w.front) w.group.rotation.y = -0.46 * 0.9;
  car.group.position.copy(car.pos); car.group.rotation.y = car.yaw;
  car.group.updateMatrixWorld(true);
  g.camera.position.set(21.6, 1.2, -296.4);
  g.camera.lookAt(20, 0.6, -300);
  g.camera.fov = 44; g.camera.updateProjectionMatrix();
`);
await browser.close();
