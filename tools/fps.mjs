import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // dismiss the intro dialogue completely
  g.dialogueOpen = false;
  document.getElementById('dialogue')?.classList.add('hidden');
  g.missions._stop = true;
  await sleep(300);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';

  // measure frames via rAF, independent of game loop
  const res = {};
  let frames = 0;
  let last = performance.now();
  let acc = 0, worst = 0, n = 0;
  function tick(ts) {
    const dt = ts - last; last = ts;
    if (n > 5) { acc += dt; worst = Math.max(worst, dt); }
    n++;
    frames++;
    if (frames < 240) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  await sleep(4000);
  res.fps = +(frames / 4).toFixed(1);
  res.avgMs = +(acc / Math.max(1, n - 5)).toFixed(2);
  res.worstMs = +worst.toFixed(1);
  res.mode = g.mode;

  // walking stop test
  g.input.keys.add('KeyW');
  await sleep(900);
  res.walkHeld = +Math.hypot(g.player.vel.x, g.player.vel.z).toFixed(2);
  g.input.keys.delete('KeyW');
  await sleep(150);
  res.walk150ms = +Math.hypot(g.player.vel.x, g.player.vel.z).toFixed(2);
  await sleep(400);
  res.walk550ms = +Math.hypot(g.player.vel.x, g.player.vel.z).toFixed(2);

  // vehicle
  const car = g.vehicles.list[0];
  g.player.pos.set(20, 0, -300);
  car.pos.set(20, 0, -300);
  car.yaw = 0;
  g.gameplay.enterVehicle(car);
  await sleep(300);
  g.cameraRig.yaw = 0;
  g.input.keys.add('KeyW');
  await sleep(2200);
  res.carSpeedHeld = +car.speed.toFixed(2);
  g.input.keys.add('KeyD');
  const y0 = car.yaw;
  await sleep(1000);
  res.yawDeltaD = +(car.yaw - y0).toFixed(3);
  res.steerValueD = +car.steer.toFixed(2);
  res.steerVisualD = +car.wheels.find(w => w.front).group.rotation.y.toFixed(3);
  g.input.keys.delete('KeyD');
  g.input.keys.add('KeyA');
  const y1 = car.yaw;
  await sleep(1000);
  res.yawDeltaA = +(car.yaw - y1).toFixed(3);
  res.steerVisualA = +car.wheels.find(w => w.front).group.rotation.y.toFixed(3);
  g.input.keys.delete('KeyA');
  g.input.keys.delete('KeyW');
  res.carSpeedAtRelease = +car.speed.toFixed(2);
  await sleep(1000);
  res.carSpeed1s = +car.speed.toFixed(2);
  await sleep(2000);
  res.carSpeed3s = +car.speed.toFixed(2);
  res.steerAfter = +car.steer.toFixed(3);
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log(errors.join('\n') || 'no page errors');
await browser.close();
