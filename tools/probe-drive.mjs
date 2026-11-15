import puppeteer from 'puppeteer-core';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
const probe = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  const pos = { x: 758, z: 96 };
  const r1 = g.world.collideCircle({ ...pos }, 1.35);
  out.collide = r1;
  out.nearColliders = g.world.colliders.filter(c => pos.x > c.minX - 6 && pos.x < c.maxX + 6 && pos.z > c.minZ - 6 && pos.z < c.maxZ + 6).slice(0, 6);
  out.trafficNear = g.vehicles.traffic.map(c => {
    const nx = c.next.x - c.node.x, nz = c.next.z - c.node.z;
    const len = Math.hypot(nx, nz) || 1;
    const x = c.node.x + (nx / len) * c.t + (nz / len) * 2.1;
    const z = c.node.z + (nz / len) * c.t - (nx / len) * 2.1;
    return { d: +Math.hypot(x - pos.x, z - pos.z).toFixed(1), x: +x.toFixed(0), z: +z.toFixed(0) };
  }).sort((a, b) => a.d - b.d).slice(0, 4);
  // simulate vehicle maths directly
  g.startNewGame();
  return out;
});
console.log('PROBE1', JSON.stringify(probe, null, 2));
await new Promise(r => setTimeout(r, 2500));
const sim = await page.evaluate(async () => {
  const g = window.__game;
  const v = g.vehicles.list[0];
  v.pos.set(0, 0, -180);
  v.yaw = 0;
  v.speed = 0;
  g.gameplay.enterVehicle(v);
  v.controls = { throttle: 1, steer: 0, brake: false };
  const samples = [];
  for (let i = 0; i < 40; i++) {
    v.update(0.05, true);
    if (i % 8 === 0) samples.push({ i, speed: +v.speed.toFixed(2), z: +v.pos.z.toFixed(1), fuel: +v.fuel.toFixed(1) });
  }
  return { samples, controls: v.controls, driver: !!v.driver };
});
console.log('SIM', JSON.stringify(sim));
const realtime = await page.evaluate(() => {
  const g = window.__game;
  const v = g.player.inVehicle;
  return { speed: v.speed, brake: v.controls.brake, throttle: v.controls.throttle };
});
await new Promise(r => setTimeout(r, 1200));
const realtime2 = await page.evaluate(() => {
  const g = window.__game;
  const v = g.player.inVehicle;
  return { speed: +v.speed.toFixed(2), z: +v.pos.z.toFixed(1), throttle: v.controls.throttle, slow: g.timeSlow };
});
console.log('RT', JSON.stringify(realtime), 'RT2', JSON.stringify(realtime2));
await browser.close();
