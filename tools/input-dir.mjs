import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 800));

const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.dialogueOpen = false;
  document.getElementById('dialogue')?.classList.add('hidden');
  g.missions._stop = true;
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(200);
  g.player.pos.set(20, 0, -300);
  g.cameraRig.yaw = 0;
  g.cameraRig.pitch = -0.1;
  g.cameraRig.initialized = false;
  await sleep(500);

  // camera basis: screen-right in world space
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const right = new THREE_V().setFromMatrixColumn(cam.matrixWorld, 0);
  const fwd = new THREE_V().setFromMatrixColumn(cam.matrixWorld, 2).negate();
  function THREE_V() { return { x: 0, y: 0, z: 0, setFromMatrixColumn(m, i) { const e = m.elements; this.x = e[i * 4]; this.y = e[i * 4 + 1]; this.z = e[i * 4 + 2]; return this; }, negate() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; } }; }
  const res = {
    camRight: [+right.x.toFixed(2), +right.z.toFixed(2)],
    camForward: [+fwd.x.toFixed(2), +fwd.z.toFixed(2)],
  };

  // press D -> where does the character go?
  g.input.keys.add('KeyD');
  const p0 = { x: g.player.pos.x, z: g.player.pos.z };
  await sleep(600);
  const p1 = { x: g.player.pos.x, z: g.player.pos.z };
  g.input.keys.delete('KeyD');
  await sleep(300);
  const dx = p1.x - p0.x, dz = p1.z - p0.z;
  res.pressD = {
    worldDelta: [+dx.toFixed(2), +dz.toFixed(2)],
    dotWithCamRight: +(dx * right.x + dz * right.z).toFixed(2),
    verdict: (dx * right.x + dz * right.z) > 0 ? 'right (correct)' : 'LEFT (inverted)',
  };

  // press W
  g.player.pos.set(20, 0, -300);
  g.input.keys.add('KeyW');
  const q0 = { x: g.player.pos.x, z: g.player.pos.z };
  await sleep(600);
  const q1 = { x: g.player.pos.x, z: g.player.pos.z };
  g.input.keys.delete('KeyW');
  const fx = q1.x - q0.x, fz = q1.z - q0.z;
  res.pressW = {
    dotWithCamForward: +(fx * fwd.x + fz * fwd.z).toFixed(2),
    verdict: (fx * fwd.x + fz * fwd.z) > 0 ? 'forward (correct)' : 'BACK (inverted)',
  };

  // vehicle turn: press D while driving
  const car = g.vehicles.list[0];
  g.player.pos.set(20, 0, -300);
  car.pos.set(20, 0, -300); car.yaw = 0;
  g.gameplay.enterVehicle(car);
  await sleep(200);
  g.cameraRig.yaw = 0;
  g.input.keys.add('KeyW');
  await sleep(1600);
  g.input.keys.add('KeyD');
  await sleep(700);
  const vyaw = car.yaw;
  const vfwd = { x: Math.sin(vyaw), z: Math.cos(vyaw) };
  res.carTurnD = {
    yaw: +vyaw.toFixed(3),
    carForward: [+vfwd.x.toFixed(2), +vfwd.z.toFixed(2)],
    dotWithCamRight: +(vfwd.x * right.x + vfwd.z * right.z).toFixed(2),
    verdict: (vfwd.x * right.x + vfwd.z * right.z) > 0 ? 'turned RIGHT (correct)' : 'turned LEFT (inverted)',
  };
  // wheel visual sign vs turn
  res.carTurnD.wheelYaw = +car.wheels.find(w => w.front).group.rotation.y.toFixed(2);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
