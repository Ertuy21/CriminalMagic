import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist'], protocolTimeout: 120000 });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
const out = await page.evaluate(async () => {
  const g = window.__game; const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.startNewGame(); await sleep(900);
  g.missions._stop = true; await sleep(400);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null; g.mode = 'play';
  // freeze camera yaw exactly and let the rig settle
  g.cameraRig.yaw = 0; g.cameraRig.pitch = -0.16; g.cameraRig.initialized = false;
  g.cameraRig.update(0.5);
  await sleep(200);
  const cam = g.camera;
  const V3 = cam.position.constructor;
  const project = (x, z) => { const v = new V3(x, 1, z).project(cam); return { sx: +v.x.toFixed(3), sy: +v.y.toFixed(3) }; };
  const p0 = g.player.pos.clone();
  const base = project(p0.x, p0.z);
  // where the game's "right" (move.x=+1) points in world
  const yaw = g.cameraRig.yaw;
  const rgt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const rgtScreen = project(p0.x + rgt.x * 5, p0.z + rgt.z * 5);
  const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const fwdScreen = project(p0.x + fwd.x * 5, p0.z + fwd.z * 5);
  return {
    cameraPos: { x: +cam.position.x.toFixed(2), y: +cam.position.y.toFixed(2), z: +cam.position.z.toFixed(2) },
    playerPos: { x: +p0.x.toFixed(2), z: +p0.z.toFixed(2) },
    base, rgtScreen, fwdScreen,
    rightMovesScreenX: +(rgtScreen.sx - base.sx).toFixed(3),
    forwardMovesScreenY: +(fwdScreen.sy - base.sy).toFixed(3),
    verdictRight: (rgtScreen.sx - base.sx) > 0 ? 'CORRECT (right on screen)' : 'INVERTED (moves left)',
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
