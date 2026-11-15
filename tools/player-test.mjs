import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?play=1&quality=medium', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 1500));
fs.mkdirSync('shots', { recursive: true });

await page.evaluate(() => {
  const g = window.__game;
  g.missions.task = null;
  g.missions.current = null;
  g.missions.clearMarker();
  g.ui.hideMission();
  g.mode = 'play';
  g.player.pos.set(760, 0, 120);
  g.player.yaw = -2.0;
  g.cameraRig.yaw = -2.0;
  g.cameraRig.initialized = false;
});
await new Promise(r => setTimeout(r, 1800));
await page.screenshot({ path: 'shots/hero-mage.png' });

await page.evaluate(() => {
  const g = window.__game;
  g.switchCharacter('lucia');
  g.player.pos.set(760, 0, 120);
  g.cameraRig.yaw = -2.0;
  g.cameraRig.initialized = false;
});
await new Promise(r => setTimeout(r, 1800));
await page.screenshot({ path: 'shots/hero-lucia.png' });

await page.evaluate(() => {
  const g = window.__game;
  const v = g.vehicles.list[0];
  v.pos.set(758, 0, 130);
  g.gameplay.enterVehicle(v);
  g.cameraRig.initialized = false;
});
await new Promise(r => setTimeout(r, 1800));
await page.screenshot({ path: 'shots/vehicle.png' });

const info = await page.evaluate(() => {
  const g = window.__game;
  return {
    mode: g.mode,
    player: g.player.id,
    hp: g.player.hp,
    pos: g.player.pos.toArray(),
    inVehicle: !!g.player.inVehicle,
    crowdActive: g.crowd.agents.filter(a => a.active).length,
    uiVisible: !document.getElementById('hud').classList.contains('hidden'),
    portraits: Object.keys(g.ui.portraits || {}),
    dialogueOpen: g.dialogueOpen,
  };
});
console.log(JSON.stringify(info, null, 2));
console.log(errors.slice(0, 12).join('\n'));
await browser.close();
