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
await page.goto('http://127.0.0.1:8123/?quality=high&hour=14.5', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 1600));
const info = await page.evaluate(() => {
  const g = window.__game;
  return {
    wildlife: { birds: g.wildlife.birds.length, land: g.wildlife.animals.length, marine: g.wildlife.marine.length, species: g.wildlife.species.total },
    crowd: g.crowd.agents.length,
    vehicles: g.vehicles.list.length + g.vehicles.traffic.length,
    calls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
    geoms: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 3000));
await page.screenshot({ path: 'shots/session-gameplay.png' });
const started = await page.evaluate(() => {
  const g = window.__game;
  return { mode: g.mode, title: g.missions.current?.title, fpsCalls: g.renderer.info.render.calls };
});
console.log('GAMEPLAY', JSON.stringify(started));
// magic + portal test
const magic = await page.evaluate(async () => {
  const g = window.__game;
  const before = { x: g.player.pos.x, z: g.player.pos.z, mana: g.player.mana };
  const portal = g.player.spells.find(s => s.id === 'portal');
  portal.cdLeft = 0;
  g.player.mana = 100;
  g.player.spell = g.player.spells.indexOf(portal);
  g.player.cast(portal);
  return { before, after: { x: g.player.pos.x, z: g.player.pos.z, mana: g.player.mana }, dist: Math.hypot(g.player.pos.x - before.x, g.player.pos.z - before.z) };
});
console.log('PORTAL', JSON.stringify(magic));
// switch into vehicle and check camera sync
const veh = await page.evaluate(() => {
  const g = window.__game;
  const v = g.vehicles.list[0];
  v.pos.set(g.player.pos.x + 2, 0, g.player.pos.z + 2);
  g.gameplay.enterVehicle(v);
  return { inVehicle: !!g.player.inVehicle };
});
await new Promise(r => setTimeout(r, 800));
const drive = await page.evaluate(() => {
  const g = window.__game;
  const v = g.player.inVehicle;
  v.controls = { throttle: 1, steer: 0.1, brake: false };
  return { sync: [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1), v.pos.x.toFixed(1), v.pos.z.toFixed(1)] };
});
await new Promise(r => setTimeout(r, 1000));
const drive2 = await page.evaluate(() => {
  const g = window.__game;
  const v = g.player.inVehicle;
  return { speed: v.speed.toFixed(2), camYaw: g.cameraRig.yaw.toFixed(2), pos: [v.pos.x.toFixed(0), v.pos.z.toFixed(0)] };
});
await page.screenshot({ path: 'shots/session-driving.png' });
console.log('DRIVE', JSON.stringify({ veh, drive, drive2 }));
// switch while driving
const sw = await page.evaluate(() => {
  const g = window.__game;
  const ok = g.switchCharacter('lucia');
  return { ok, id: g.player.id, inVehicle: !!g.player.inVehicle };
});
console.log('SWITCH-IN-CAR', JSON.stringify(sw));
await page.evaluate(() => window.__game.ui.openWheel());
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: 'shots/session-wheel.png' });
await page.evaluate(() => window.__game.ui.closeWheel(false));
// artifact pickup + hidden ending gate
const gate = await page.evaluate(() => {
  const g = window.__game;
  return {
    bond: Math.round(g.state.bond),
    artifacts: g.state.artifacts.length,
    hiddenUnlocked: g.state.bond >= 80 && g.state.artifacts.length >= 5,
  };
});
console.log('GATE', JSON.stringify(gate));
console.log('ERRORS', errors.slice(0, 10).join('\n') || 'none');
await browser.close();
