import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist'], protocolTimeout: 120000 });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
const out = await page.evaluate(async () => {
  const g = window.__game; const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.startNewGame(); await sleep(900);
  g.missions._stop = true; await sleep(400);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null; g.mode='play';
  // camera yaw 0 means the camera looks along +Z. Determine which world direction is "screen right".
  g.cameraRig.yaw = 0; g.cameraRig.pitch = 0; g.cameraRig.initialized = false;
  await sleep(300);
  const cam = g.camera;
  cam.updateMatrixWorld(true);
  const right = new (cam.position.constructor)();
  right.set(1,0,0).applyQuaternion(cam.quaternion); // camera local +X = screen right
  // hero strafe vector used by the game for mx=+1
  const yaw = g.cameraRig.yaw;
  const gameRight = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  // vehicle turn direction for steer=+1
  const carYawBefore = 0;
  const fwd = { x: Math.sin(carYawBefore), z: Math.cos(carYawBefore) };
  return {
    screenRightWorld: { x: +right.x.toFixed(3), z: +right.z.toFixed(3) },
    gameRightVector: gameRight,
    dot: +(right.x*gameRight.x + right.z*gameRight.z).toFixed(3),
    carForward: fwd,
    yawIncreaseMovesForwardToward: { x: +(Math.sin(0.1)-Math.sin(0)).toFixed(3), z: +(Math.cos(0.1)-Math.cos(0)).toFixed(3) },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
