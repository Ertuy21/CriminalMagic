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
await new Promise(r => setTimeout(r, 1000));
const out = await page.evaluate(async () => {
  const g = window.__game;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  g.dialogueOpen = false;
  document.getElementById('dialogue')?.classList.add('hidden');
  g.missions._stop = true;
  await sleep(200);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(300);

  // count lights
  const lights = [];
  g.scene.traverse(o => { if (o.isLight) lights.push(o.type); });
  const lightCount = {};
  for (const l of lights) lightCount[l] = (lightCount[l] || 0) + 1;

  function bench(label, mutate, restore) {
    mutate();
    g.renderer.info.autoReset = false;
    g.renderer.info.reset();
    const t0 = performance.now();
    for (let i = 0; i < 8; i++) { g.composer.render(); }
    const t = (performance.now() - t0) / 8;
    const calls = g.renderer.info.render.calls / 8;
    g.renderer.info.autoReset = true;
    restore();
    return { label, ms: +t.toFixed(2), calls: Math.round(calls) };
  }

  const results = [];
  results.push(bench('baseline', () => {}, () => {}));
  results.push(bench('no shadows', () => { g.renderer.shadowMap.enabled = false; g.scene.traverse(o => { if (o.isMesh) o.castShadow = false; }); },
    () => { g.renderer.shadowMap.enabled = true; }));
  results.push(bench('no bloom', () => { g.bloom.enabled = false; }, () => { g.bloom.enabled = true; }));
  results.push(bench('no smaa', () => { g.smaa.enabled = false; }, () => { g.smaa.enabled = true; }));
  results.push(bench('no grade', () => { g.grade.enabled = false; }, () => { g.grade.enabled = true; }));
  results.push(bench('no post at all', () => { g.composer.passes.forEach(p => p.enabled = false); }, () => { g.composer.passes.forEach(p => p.enabled = true); }));
  results.push(bench('no crowd', () => { g.crowd.meshes.forEach(m => m.visible = false); }, () => { g.crowd.meshes.forEach(m => m.visible = true); }));
  results.push(bench('no wildlife', () => { g.wildlife.wings.forEach(w => w.mesh.visible = false); }, () => { g.wildlife.wings.forEach(w => w.mesh.visible = true); }));
  results.push(bench('no world', () => { g.world.root.visible = false; }, () => { g.world.root.visible = true; }));
  results.push(bench('no heroes', () => { g.heroes.mage.group.visible = false; g.heroes.lucia.group.visible = false; }, () => { g.heroes.mage.group.visible = true; g.heroes.lucia.group.visible = true; }));
  results.push(bench('no fog', () => { g.scene.fog = null; g.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if ('fog' in m) m.fog = false; m.needsUpdate = true; }); } }); }, () => {}));
  return { lightCount, results };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
