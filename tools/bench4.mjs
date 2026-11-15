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
  document.getElementById('chapter-card')?.classList.add('hidden');
  g.missions._stop = true;
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(300);

  async function fps(label, setup, teardown) {
    if (setup) setup();
    await sleep(500);
    let frames = 0;
    const orig = g.animate.bind(g);
    g.animate = function () { frames++; return orig(); };
    await sleep(2500);
    g.animate = orig;
    if (teardown) teardown();
    await sleep(300);
    return { label, fps: +(frames / 2.5).toFixed(1) };
  }

  const res = [];
  res.push(await fps('baseline'));

  // remove point lights from the scene entirely
  const pts = [];
  g.scene.traverse(o => { if (o.isPointLight) pts.push(o); });
  const parents = pts.map(p => p.parent);
  res.push(await fps('point lights removed from scene', () => {
    pts.forEach(p => p.parent && p.parent.remove(p));
  }, () => {
    pts.forEach((p, i) => parents[i] && parents[i].add(p));
  }));

  // shadow map off
  res.push(await fps('shadows disabled', () => {
    g.renderer.shadowMap.enabled = false;
  }, () => { g.renderer.shadowMap.enabled = true; }));

  // reduce triangle load: hide world far stuff
  res.push(await fps('post: bloom off', () => { g.bloom.enabled = false; }, () => { g.bloom.enabled = true; }));
  res.push(await fps('post: smaa off', () => { g.smaa.enabled = false; }, () => { g.smaa.enabled = true; }));
  res.push(await fps('post: grade off', () => { g.grade.enabled = false; }, () => { g.grade.enabled = true; }));
  res.push(await fps('post: bloom+smaa off', () => { g.bloom.enabled = false; g.smaa.enabled = false; },
    () => { g.bloom.enabled = true; g.smaa.enabled = true; }));
  res.push(await fps('renderer only (no composer)', () => {
    window.__r = g.render;
    g.render = function () { this.renderer.render(this.scene, this.camera); };
  }, () => { g.render = window.__r; }));
  res.push(await fps('pixel ratio 0.6', () => {
    window.__pr = g.renderer.getPixelRatio();
    g.renderer.setPixelRatio(0.6); g.composer.setPixelRatio(0.6);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }, () => {
    g.renderer.setPixelRatio(window.__pr); g.composer.setPixelRatio(window.__pr);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }));
  res.push(await fps('point lights removed + composer only + pr0.75', () => {
    pts.forEach(p => p.parent && p.parent.remove(p));
    g.renderer.setPixelRatio(0.75); g.composer.setPixelRatio(0.75);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }, () => {
    pts.forEach((p, i) => parents[i] && parents[i].add(p));
    g.renderer.setPixelRatio(1); g.composer.setPixelRatio(1);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }));
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
