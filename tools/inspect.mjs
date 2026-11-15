import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?debug=1&hud=0&cam=street&hour=21.4&quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 1500));

const info = await page.evaluate(() => {
  const g = window.__game;
  const w = g.world;
  const sm = w.signMesh;
  const geo = sm?.geometry;
  const out = {
    signVerts: geo?.attributes?.position?.count,
    signVisible: sm?.visible,
    signOpacity: w.mat.sign.opacity,
    signColor: w.mat.sign.color.getHexString(),
    buildingCount: w.buildings.length,
    palms: w.palms?.length,
    atlasSize: [w.atlas.texture.image.width, w.atlas.texture.image.height],
    samples: [],
  };
  if (geo) {
    const pos = geo.attributes.position;
    for (let i = 0; i + 3 < Math.min(pos.count, 400); i += 4) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 4; k++) { cx += pos.getX(i + k); cy += pos.getY(i + k); cz += pos.getZ(i + k); }
      out.samples.push([cx / 4, cy / 4, cz / 4]);
    }
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
fs.mkdirSync('shots', { recursive: true });
if (info.samples.length) {
  const s = info.samples.find(p => p[2] > -200) || info.samples[0];
  console.log('sample sign at', s);
  await page.evaluate((pt) => {
    const g = window.__game;
    // place the camera 14m south of the sign, looking at it
    g.camera.position.set(pt[0], Math.max(3, pt[1] + 1), pt[2] + 14);
    g.camera.lookAt(pt[0], pt[1], pt[2]);
    g.debugCam = true;
  }, s);
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'shots/sign-close.png' });
}
// atlas dump
const dataUrl = await page.evaluate(() => window.__game.world.atlas.texture.image.toDataURL('image/png'));
fs.writeFileSync('shots/sign-atlas.png', Buffer.from(dataUrl.split(',')[1], 'base64'));

console.log(logs.slice(0, 40).join('\n'));
await browser.close();
