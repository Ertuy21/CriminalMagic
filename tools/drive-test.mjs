import puppeteer from 'puppeteer-core';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 1400));
// dismiss any dialogue
for (let i = 0; i < 8; i++) {
  const open = await page.evaluate(() => window.__game.dialogueOpen);
  if (!open) break;
  await page.click('.dlg-box').catch(() => {});
  await new Promise(r => setTimeout(r, 150));
}
const veh = await page.evaluate(() => {
  const g = window.__game;
  const v = g.vehicles.list[0];
  v.pos.set(g.player.pos.x + 1.5, 0, g.player.pos.z + 1.5);
  g.gameplay.enterVehicle(v);
  return { type: v.type, name: v.name };
});
await page.click('#look-zone').catch(() => {});
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 2200));
const moving = await page.evaluate(() => {
  const g = window.__game;
  const v = g.player.inVehicle;
  return { speed: +v.speed.toFixed(2), yaw: +v.yaw.toFixed(2), throttle: v.controls?.throttle, pos: [+v.pos.x.toFixed(0), +v.pos.z.toFixed(0)], cam: g.camera.position.toArray().map(n => +n.toFixed(1)) };
});
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyA');
await new Promise(r => setTimeout(r, 700));
const turning = await page.evaluate(() => {
  const v = window.__game.player.inVehicle;
  return { speed: +v.speed.toFixed(2), steer: +v.steer.toFixed(2), damage: +v.damage.toFixed(1), fuel: +v.fuel.toFixed(1) };
});
await page.keyboard.up('KeyA');
await page.screenshot({ path: 'shots/drive-fixed.png' });
// weapon ownership trunk test
const guns = await page.evaluate(async () => {
  const g = window.__game;
  const v = g.player.inVehicle;
  g.switchCharacter('lucia');
  const rearX = v.pos.x - Math.sin(v.yaw) * 2.5;
  const rearZ = v.pos.z - Math.cos(v.yaw) * 2.5;
  g.player.pos.set(rearX + 0.4, 0, rearZ);
  g.player.updateInteraction();
  const inter = g.player.interaction?.label || null;
  g.player.interact();
  const first = { inter, owned: { ...g.player.owned }, weapon: g.player.weapon };
  g.gameplay.trunk(v);
  const second = { owned: { ...g.player.owned }, weapon: g.player.weapon };
  return { first, second };
});
console.log('PARK', JSON.stringify(veh), 'MOVE', JSON.stringify(moving), 'TURN', JSON.stringify(turning));
console.log('TRUNK', JSON.stringify(guns));
// mobile HUD emulation
const mobilePage = await browser.newPage();
await mobilePage.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await mobilePage.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await mobilePage.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await mobilePage.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 3200));
await mobilePage.screenshot({ path: 'shots/mobile-portrait.png' });
const mobile = await mobilePage.evaluate(() => {
  const g = window.__game;
  return { w: innerWidth, h: innerHeight, pr: g.renderer.getPixelRatio(), hudVisible: !document.getElementById('hud').classList.contains('hidden') };
});
console.log('MOBILE', JSON.stringify(mobile));
console.log('ERRORS', errors.slice(0, 10).join('\n') || 'none');
await browser.close();
