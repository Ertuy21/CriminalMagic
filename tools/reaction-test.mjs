// Verifies NPC reactions: panic on drawn magic, day/night density, goals by hour.
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.BASE || 'http://127.0.0.1:8123';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
  protocolTimeout: 180000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
await page.goto(BASE + '/?quality=low&hour=14&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 2200));

const out = await page.evaluate(async () => {
  const g = window.__game;
  for (let i = 0; i < 20; i++) g.crowd.update(0.1);
  const peds = g.crowd.agents.filter(a => a.active && a.type === 'ped');
  const badCoords = peds.filter(a => !Number.isFinite(a.x) || !Number.isFinite(a.z)).length;
  const roles = {};
  for (const a of peds) roles[a.role] = (roles[a.role] || 0) + 1;

  const near = peds[0];
  g.player.pos.set(near.x + 3, 0, near.z);
  g.player.castAnim = 0.5;
  for (let i = 0; i < 12; i++) g.crowd.update(0.1);
  const fleeing = g.crowd.agents.filter(a => a.active && a.type === 'ped' && a.state === 'flee').length;
  g.player.castAnim = 0;

  g.world.setHour(23.2); g.crowd.ensurePopulation();
  const nightPeds = g.crowd.agents.filter(a => a.active && a.type === 'ped').length;
  g.world.setHour(13); g.crowd.ensurePopulation();
  const dayPeds = g.crowd.agents.filter(a => a.active && a.type === 'ped').length;

  const traffic = g.vehicles.traffic ? g.vehicles.traffic.length : 0;
  const movingCars = g.vehicles.traffic ? g.vehicles.traffic.filter(v => Math.abs(v.speed) > 0.5).length : 0;
  return { peds: peds.length, badCoords, roles, fleeing, nightPeds, dayPeds, traffic, movingCars };
});

console.log(JSON.stringify(out, null, 1));
console.log('ERRORS', errors.slice(0, 6).join('\n') || 'none');
await browser.close();

const pass = out.badCoords === 0 && out.fleeing > 0 && out.nightPeds < out.dayPeds && out.movingCars > 0 && errors.length === 0;
if (!pass) process.exitCode = 1;