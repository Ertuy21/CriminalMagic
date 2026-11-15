import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', e => logs.push('PAGEERR ' + e.message));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?debug=1&hud=0&cam=street&hour=21.4&quality=medium', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 2000));
fs.mkdirSync('shots', { recursive: true });

const views = [
  { name: 'g-street-night', hour: 21.4, weather: 'clear', p: [652, 3.0, -66], t: [-320, 12, -66] },
  { name: 'g-skyline-night', hour: 21.4, weather: 'clear', p: [1120, 16, 470], t: [300, 38, -260] },
  { name: 'g-beach-day', hour: 14, weather: 'clear', p: [888, 6.5, 300], t: [380, 26, -260] },
  { name: 'g-water-sunset', hour: 18.7, weather: 'clear', p: [1150, 18, 650], t: [300, 40, -250] },
  { name: 'g-aerial-day', hour: 11, weather: 'clear', p: [900, 230, 600], t: [0, 0, -300] },
  { name: 'g-street-rain', hour: 22, weather: 'storm', p: [300, 3.0, -66], t: [-500, 14, -66] },
];
for (const v of views) {
  await page.evaluate((v) => {
    const g = window.__game;
    g.world.setWeather(v.weather);
    g.world.setHour(v.hour);
    g.camera.position.set(...v.p);
    g.camera.lookAt(...v.t);
    g.debugCam = true;
  }, v);
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: `shots/${v.name}.png` });
  console.log('shot', v.name);
}
console.log(logs.slice(0, 10).join('\n'));
await browser.close();
