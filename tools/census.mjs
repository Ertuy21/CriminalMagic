import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8123/?quality=high&play=1', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
const out = await page.evaluate(() => {
  const g = window.__game;
  const byRoot = {};
  const roots = {
    world: g.world.root,
    crowd: g.crowd.scene,
    vehicles: null,
  };
  // count per top-level named group under scene
  const rows = [];
  for (const child of g.scene.children) {
    let meshes = 0, inst = 0, tris = 0, lights = 0;
    child.traverse(o => {
      if (o.isInstancedMesh) { inst++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * o.count; }
      else if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }
      if (o.isLight) lights++;
    });
    rows.push({ name: child.name || child.type, meshes, inst, lights, tris: Math.round(tris) });
  }
  rows.sort((a, b) => (b.meshes + b.inst * 4) - (a.meshes + a.inst * 4));

  // world children breakdown
  const worldKids = g.world.root.children.map(c => {
    let meshes = 0, inst = 0;
    c.traverse(o => { if (o.isInstancedMesh) inst++; else if (o.isMesh) meshes++; });
    return { name: c.name || c.type, meshes, inst };
  }).sort((a, b) => b.meshes - a.meshes).slice(0, 20);

  return { sceneChildren: rows.slice(0, 25), worldKids };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
