import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=low&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
await new Promise(r => setTimeout(r, 800));
const out = await page.evaluate(() => {
  const g = window.__game;
  const rows = [];
  for (const id of ['mage', 'lucia']) {
    const grp = g.heroes[id].group;
    const list = [];
    grp.traverse(o => {
      if (!o.isMesh) return;
      let path = [];
      let p = o;
      while (p && p !== grp) { path.unshift(p.name || p.type); p = p.parent; }
      list.push({ path: path.join('/'), mat: o.material.type, keep: !!o.userData.keep, tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 });
    });
    rows.push({ id, count: list.length, list });
  }
  return rows;
});
for (const r of out) {
  console.log('=== ' + r.id + ' : ' + r.count + ' meshes');
  const byMat = {};
  for (const m of r.list) byMat[m.mat] = (byMat[m.mat] || 0) + 1;
  console.log(JSON.stringify(byMat));
  for (const m of r.list) console.log('  ' + m.path + '  ' + m.mat + (m.keep ? ' [keep]' : '') + '  tris=' + Math.round(m.tris));
}
await browser.close();
