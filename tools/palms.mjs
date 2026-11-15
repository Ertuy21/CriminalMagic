import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR', e.message));
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?debug=1&hud=0&cam=street&hour=21.4&quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 1200));
const info = await page.evaluate(() => {
  const w = window.__game.world;
  const p0 = w.palms?.[0];
  const m = new Float32Array(16);
  w.palmTrunks?.getMatrixAt(0, { elements: m, fromArray(){}, });
  const arr = w.palmTrunks?.instanceMatrix?.array;
  const bb = w.palmCrowns?.geometry?.boundingSphere;
  return {
    palmCount: w.palms?.length,
    trunkCount: w.palmTrunks?.count,
    trunkVisible: w.palmTrunks?.visible,
    crownVisible: w.palmCrowns?.visible,
    trunkParent: w.palmTrunks?.parent?.name,
    firstPalm: p0,
    firstMatrix: arr ? Array.from(arr.slice(0, 16)).map(v => +v.toFixed(2)) : null,
    crownBoundingSphere: bb ? { r: bb.radius, c: bb.center.toArray() } : null,
    trunkGeoBB: w.palmTrunks?.geometry?.boundingSphere,
  };
});
console.log(JSON.stringify(info, null, 2));
await page.evaluate(() => {
  const g = window.__game;
  g.camera.position.set(620, 4, -62);
  g.camera.lookAt(660, 5, -62);
  g.debugCam = true;
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'shots/palm-check.png' });
await page.evaluate(() => {
  const g = window.__game;
  g.camera.position.set(900, 8, 360);
  g.camera.lookAt(500, 20, -100);
  g.debugCam = true;
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: 'shots/water-check.png' });
await browser.close();
