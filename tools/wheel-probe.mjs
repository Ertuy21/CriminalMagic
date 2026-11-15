import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1280,720'], protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
const out = await page.evaluate(async () => {
  const g = window.__game; const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.startNewGame(); await sleep(900);
  g.missions._stop = true; await sleep(400);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null; g.mode='play';
  const v = g.vehicles.list[0];
  v.pos.set(g.player.pos.x + 2, 0, g.player.pos.z + 2);
  g.gameplay.enterVehicle(v);
  await sleep(300);
  // direct steering test: steer +1, check yaw delta and wheel visual sign
  v.controls = { throttle: 0.8, steer: 1, brake: false };
  const yaw0 = v.yaw;
  for (let i = 0; i < 30; i++) { v.update(1/60); g.input.move = { x: 1, y: 1 }; }
  const yawAfter = v.yaw;
  const front = v.wheels.find(w => w.front);
  return {
    yawDelta: +(yawAfter - yaw0).toFixed(3),
    wheelSteerVisual: +(front.group.rotation.y).toFixed(3),
    wheelSpinX: +(front.group.rotation.x).toFixed(2),
    wheelOrder: front.group.rotation.order,
    speed: +v.speed.toFixed(1),
    turnLeftOrRight: (yawAfter - yaw0) > 0 ? 'yaw+ (turns toward +X)' : 'yaw- ',
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
