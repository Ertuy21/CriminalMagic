import puppeteer from 'puppeteer-core';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=760,900'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.setViewport({ width: 760, height: 900, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?play=1&quality=medium', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 1400));

const prep = async (id) => page.evaluate((id) => {
  const g = window.__game;
  if (g.player.id !== id) g.switchCharacter(id);
  g.missions._stop = true;
  g.missions.task = null; g.missions.current = null; g.missions.pendingStory = null;
  g.ui.hideMission(); g.ui.el.hud.classList.add('hidden');
  document.getElementById('dialogue')?.classList.add('hidden');
  g.dialogueOpen = false;
  g.paused = true;
  g.world.setHour(14.0);
  const p = g.player;
  p.pos.set(760, 0, 120); p.y = 0; p.yaw = 0; p.group.rotation.y = 0;
  p.model.update(0.016, { speed: 0 });
  g.companion.group.visible = false;
  g.crowd.agents.forEach(a => a.active = false);
  g.cameraRig.update = () => {};
  // point a fill light at the face so it is not a silhouette
  if (!g._fillLight) {
    const L = new (g.camera.constructor === Object ? Object : Object)();
    g._fillLight = new (window.__game.scene.children[0].constructor === Object ? Object : Object)();
  }
}, id);

const frame = async (fov, dist, yOff) => page.evaluate(({ fov, dist, yOff }) => {
  const g = window.__game;
  const head = new (g.camera.position.constructor)();
  g.player.model.head.getWorldPosition(head);
  const target = new (g.camera.position.constructor)(g.player.pos.x, head.y + yOff, g.player.pos.z);
  g.camera.position.set(target.x, target.y, target.z + dist);
  g.camera.lookAt(target);
  g.camera.fov = fov;
  g.camera.updateProjectionMatrix();
}, { fov, dist, yOff });

await prep('mage');
await frame(24, 1.15, 0.0);
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'shots/face-mage.png' });
await frame(30, 3.6, 0.02);
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'shots/front-mage.png' });

await prep('lucia');
await frame(24, 1.15, 0.0);
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'shots/face-lucia.png' });
await frame(30, 3.6, 0.02);
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: 'shots/front-lucia.png' });
await browser.close();
console.log('done');
