import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,810'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 810, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=medium', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 2200));
fs.mkdirSync('shots', { recursive: true });
await page.screenshot({ path: 'shots/ui-menu.png' });
await page.evaluate(() => window.__game.startNewGame());
await new Promise(r => setTimeout(r, 2500));
await page.screenshot({ path: 'shots/ui-gameplay.png' });
await page.evaluate(() => window.__game.ui.openWheel());
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'shots/ui-wheel.png' });
await page.evaluate(() => { const g = window.__game; g.ui.closeWheel(false); g.ui.openRadial(); });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'shots/ui-radial.png' });
await page.evaluate(() => { const g = window.__game; g.ui.closeRadial(false); g.ui.toggleMap(true); });
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: 'shots/ui-map.png' });
await page.evaluate(() => { const g = window.__game; g.ui.toggleMap(false); g.ui.togglePause(true); });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'shots/ui-pause.png' });
console.log(errors.slice(0, 15).join('\n'));
await browser.close();
