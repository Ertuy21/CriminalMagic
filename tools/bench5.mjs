import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 300000,
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
  document.getElementById('chapter-card')?.classList.add('hidden');
  g.missions._stop = true;
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(400);

  async function fps(label, setup, teardown, ms = 2500) {
    if (setup) setup();
    await sleep(400);
    let frames = 0;
    const orig = g.animate.bind(g);
    g.animate = function () { frames++; return orig(); };
    await sleep(ms);
    g.animate = orig;
    if (teardown) teardown();
    await sleep(250);
    return { label, fps: +(frames / (ms / 1000)).toFixed(1) };
  }

  const res = [];
  res.push(await fps('baseline'));

  // camera drag direction check
  const y0 = g.cameraRig.yaw;
  g.input.look.x = 100;
  g.cameraRig.update(0.016);
  res.push({ label: 'dragRightYawDelta', fps: +(g.cameraRig.yaw - y0).toFixed(4) });
  g.input.look.x = 0;

  res.push(await fps('no css blend overlays', () => {
    for (const id of ['grain', 'scan', 'vignette']) {
      const e = document.getElementById(id);
      if (e) { e.dataset.d = e.style.display; e.style.display = 'none'; }
    }
  }, () => {
    for (const id of ['grain', 'scan', 'vignette']) {
      const e = document.getElementById(id);
      if (e) e.style.display = e.dataset.d || '';
    }
  }));

  res.push(await fps('no post (bloom/smaa/grade off)', () => {
    g.bloom.enabled = false; g.smaa.enabled = false; g.grade.enabled = false;
  }, () => { g.bloom.enabled = true; g.smaa.enabled = true; g.grade.enabled = true; }));

  res.push(await fps('no shadows', () => { g.renderer.shadowMap.enabled = false; },
    () => { g.renderer.shadowMap.enabled = true; }));

  res.push(await fps('pr 0.7', () => {
    g.renderer.setPixelRatio(0.7); g.composer.setPixelRatio(0.7);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }, () => {
    g.renderer.setPixelRatio(1); g.composer.setPixelRatio(1);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }));

  res.push(await fps('all optimizations together', () => {
    for (const id of ['grain', 'scan']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
    g.bloom.enabled = false; g.smaa.enabled = false;
    g.renderer.shadowMap.enabled = false;
    g.renderer.setPixelRatio(0.7); g.composer.setPixelRatio(0.7);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }, () => {
    for (const id of ['grain', 'scan']) { const e = document.getElementById(id); if (e) e.style.display = ''; }
    g.bloom.enabled = true; g.smaa.enabled = true;
    g.renderer.shadowMap.enabled = true;
    g.renderer.setPixelRatio(1); g.composer.setPixelRatio(1);
    g.renderer.setSize(innerWidth, innerHeight, false); g.composer.setSize(innerWidth, innerHeight);
  }));
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
