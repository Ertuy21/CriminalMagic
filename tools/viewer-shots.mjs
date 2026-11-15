import puppeteer from 'puppeteer-core';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = process.argv.slice(2);
const shots = [];
for (const id of ['mage', 'lucia']) {
  for (const view of ['face', 'three4', 'body']) {
    shots.push({ id, view, path: `shots/v-${id}-${view}.png` });
  }
}
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist','--window-size=620,760'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.setViewport({ width: 620, height: 760, deviceScaleFactor: 1 });
for (const s of shots) {
  await page.goto(`http://127.0.0.1:8123/tools/viewer.html?id=${s.id}&view=${s.view}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__READY === true', { timeout: 30000, polling: 100 }).catch(() => {});
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: s.path });
  console.log('shot', s.path);
}
await browser.close();
