import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const url = process.argv[2] || 'http://127.0.0.1:8123/?debug=1&cam=beach&hour=21.4';
const out = process.argv[3] || 'shots/shot.png';
const w = parseInt(process.argv[4] || '1280', 10);
const h = parseInt(process.argv[5] || '720', 10);

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-dev-shm-usage', '--hide-scrollbars',
    `--window-size=${w},${h}`,
  ],
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
page.on('requestfailed', r => logs.push(`[reqfail] ${r.url()} ${r.failure()?.errorText}`));
await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load', timeout: 180000 });
try {
  await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
} catch (e) {
  logs.push('[wait] __READY timeout');
}
await new Promise(r => setTimeout(r, 2500));
fs.mkdirSync('shots', { recursive: true });
await page.screenshot({ path: out });
const info = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return { noGame: true };
  return {
    calls: g.renderer.info.render.calls,
    tris: g.renderer.info.render.triangles,
    geoms: g.renderer.info.memory.geometries,
    textures: g.renderer.info.memory.textures,
    camera: g.camera.position.toArray(),
    hour: g.world.hour,
    canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
  };
});
console.log(JSON.stringify(info, null, 2));
console.log(logs.slice(0, 80).join('\n'));
await browser.close();
