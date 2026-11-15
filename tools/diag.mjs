import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&hour=21.4&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await sleep(1200);
  // close any dialogue
  for (let i = 0; i < 20; i++) { document.getElementById('dlg-next')?.click(); document.querySelector('.dlg-box')?.click(); await sleep(60); }
  g.missions._stop = true;
  await sleep(200);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.dialogueOpen = false;
  document.getElementById('dialogue')?.classList.add('hidden');
  g.mode = 'play';
  window.__sleep = sleep;
});
await new Promise(r => setTimeout(r, 600));

const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = window.__sleep;
  const res = {};

  // --- scene census
  let meshes = 0, instanced = 0, lights = 0, sprites = 0, materials = new Set(), geoms = new Set();
  g.scene.traverse(o => {
    if (o.isInstancedMesh) instanced++;
    else if (o.isMesh) meshes++;
    if (o.isLight) lights++;
    if (o.isSprite) sprites++;
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m.uuid));
    if (o.geometry) geoms.add(o.geometry.uuid);
  });
  res.census = { meshes, instanced, lights, sprites, materials: materials.size, geometries: geoms.size };

  // per-car mesh count
  const car = g.vehicles.list[0];
  let carMeshes = 0;
  car.group.traverse(o => { if (o.isMesh) carMeshes++; });
  res.carMeshes = carMeshes;

  // --- draw calls for one full frame
  g.renderer.info.autoReset = false;
  g.renderer.info.reset();
  g.composer.render();
  res.drawCalls = g.renderer.info.render.calls;
  res.triangles = g.renderer.info.render.triangles;
  g.renderer.info.autoReset = true;

  // --- walking stop
  g.input.keys.add('KeyW');
  await sleep(800);
  res.walkSpeedHeld = +Math.hypot(g.player.vel.x, g.player.vel.z).toFixed(2);
  g.input.keys.delete('KeyW');
  await sleep(400);
  res.walkSpeedAfterRelease = +Math.hypot(g.player.vel.x, g.player.vel.z).toFixed(2);
  res.mode = g.mode;

  // --- drive on open road
  g.player.pos.set(20, 0, -300);
  car.pos.set(20, 0, -300);
  car.yaw = 0;
  g.gameplay.enterVehicle(car);
  await sleep(300);
  g.cameraRig.yaw = 0;
  g.input.keys.add('KeyW');
  await sleep(2000);
  res.car = { speedHeld: +car.speed.toFixed(2), yaw: +car.yaw.toFixed(2) };
  g.input.keys.add('KeyD');
  const yaw0 = car.yaw;
  await sleep(900);
  res.car.yawDeltaD = +(car.yaw - yaw0).toFixed(3);
  res.car.steerVisual = +car.wheels.find(w => w.front).group.rotation.y.toFixed(3);
  res.car.steerValue = +car.steer.toFixed(2);
  g.input.keys.delete('KeyW');
  g.input.keys.delete('KeyD');
  res.car.speedAtRelease = +car.speed.toFixed(2);
  await sleep(1500);
  res.car.speed15 = +car.speed.toFixed(2);
  await sleep(2500);
  res.car.speed4 = +car.speed.toFixed(2);
  res.car.steerAfter = +car.steer.toFixed(3);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
