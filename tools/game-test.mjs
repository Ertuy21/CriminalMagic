import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=1280,720'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 1500));
// skip intro dialogue
for (let i = 0; i < 14; i++) {
  const open = await page.evaluate(() => window.__game.dialogueOpen);
  if (!open) break;
  await page.click('.dlg-box').catch(() => {});
  await new Promise(r => setTimeout(r, 180));
}
const s0 = await page.evaluate(() => {
  const g = window.__game;
  return { open: g.dialogueOpen, obj: document.getElementById('mission-obj').textContent, pos: g.player.pos.toArray(), mode: g.mode };
});
console.log('after intro', JSON.stringify(s0));

// movement
await page.click('#look-zone').catch(() => {});
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 900));
await page.keyboard.up('KeyW');
const s1 = await page.evaluate(() => ({ pos: window.__game.player.pos.toArray(), moving: window.__game.player.moving }));
console.log('movement', JSON.stringify(s1));

// jump
await page.keyboard.press('Space');
await new Promise(r => setTimeout(r, 250));
const s2 = await page.evaluate(() => ({ y: window.__game.player.y, grounded: window.__game.player.grounded }));
console.log('jump', JSON.stringify(s2));
await new Promise(r => setTimeout(r, 700));

// cast a fireball
const before = await page.evaluate(() => ({ mana: window.__game.player.mana, mag: window.__game.player.mag.pistol, crime: window.__game.state.heat }));
await page.evaluate(() => { window.__game.player.spell = 0; window.__game.player.fireCd = 0; window.__game.player.cast(window.__game.player.spells[0]); });
await new Promise(r => setTimeout(r, 600));
const after = await page.evaluate(() => ({ mana: window.__game.player.mana, projectiles: window.__game.gameplay.projectiles.length, crime: window.__game.state.heat, fx: window.__game.fx.blasts.length }));
console.log('cast', JSON.stringify({ before, after }));

// switch
await page.evaluate(() => window.__game.switchCharacter('lucia'));
await new Promise(r => setTimeout(r, 500));
const sw = await page.evaluate(() => ({ id: window.__game.player.id, hud: document.getElementById('hud-name').textContent, ammo: document.getElementById('ammo').className }));
console.log('switch', JSON.stringify(sw));

// shoot
const magBefore = await page.evaluate(() => window.__game.player.mag.pistol);
await page.evaluate(() => { const g = window.__game; g.player.fireCd = 0; g.player.aimPoint.copy(g.player.pos).add({ x: 0, y: 1, z: 20 }); g.player.shoot(); });
await new Promise(r => setTimeout(r, 300));
const magAfter = await page.evaluate(() => window.__game.player.mag.pistol);
console.log('shoot', magBefore, magAfter);

// vehicle
const veh = await page.evaluate(() => {
  const g = window.__game;
  const v = g.vehicles.list[0];
  v.pos.set(g.player.pos.x + 1, 0, g.player.pos.z + 2);
  g.gameplay.enterVehicle(v);
  return { inVehicle: !!g.player.inVehicle, visible: g.player.group.visible };
});
console.log('enter vehicle', JSON.stringify(veh));
await page.keyboard.down('KeyW');
await new Promise(r => setTimeout(r, 900));
await page.keyboard.up('KeyW');
const drive = await page.evaluate(() => ({ speed: window.__game.player.inVehicle.speed, pos: window.__game.player.inVehicle.pos.toArray() }));
console.log('drive', JSON.stringify(drive));

// map
await page.evaluate(() => { window.__game.ui.toggleMap(true); });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'shots/test-map.png' });
await page.evaluate(() => { window.__game.ui.toggleMap(false); window.__game.ui.openWheel(); });
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: 'shots/test-wheel.png' });
console.log('errors', errors.slice(0, 10));
await browser.close();
