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
await new Promise(r => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.dialogueOpen = false;
  document.getElementById('dialogue')?.classList.add('hidden');
  g.missions._stop = true;
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(400);
  g.renderer.info.autoReset = false;
  g.renderer.info.reset();
  g.composer.render();
  const calls = g.renderer.info.render.calls;
  const tris = g.renderer.info.render.triangles;
  g.renderer.info.autoReset = true;
  // world mesh breakdown by parent group name
  const world = [];
  for (const c of g.world.root.children) {
    let n = 0, inst = 0;
    c.traverse(o => { if (o.isInstancedMesh) inst++; else if (o.isMesh) n++; });
    if (n + inst > 1) world.push({ name: c.name || c.type, meshes: n, inst });
  }
  world.sort((a, b) => (b.meshes + b.inst) - (a.meshes + a.inst));
  return { calls, tris, worldGroups: world.length, top: world.slice(0, 12) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
