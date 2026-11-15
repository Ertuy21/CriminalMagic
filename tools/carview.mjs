import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=760,560'],
  protocolTimeout: 200000,
});
const jobs = process.argv.slice(2);
const list = jobs.length ? jobs : ['three4', 'front', 'side', 'rear'];
for (const view of list) {
  const page = await browser.newPage();
  await page.setViewport({ width: 760, height: 560, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8123/tools/carview.html?view=' + view + '&steer=0.9', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.__READY === true', { timeout: 60000, polling: 200 });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: 'shots/carv-' + view + '.png' });
  await page.close();
}
await browser.close();
