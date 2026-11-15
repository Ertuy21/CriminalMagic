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
  await sleep(200);
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(400);

  // instrument each stage of animate()
  const stats = {};
  const wrap = (obj, name) => {
    const orig = obj[name].bind(obj);
    stats[name] = { ms: 0, n: 0 };
    obj[name] = function (...a) {
      const t = performance.now();
      const r = orig(...a);
      stats[name].ms += performance.now() - t;
      stats[name].n++;
      return r;
    };
    return () => { obj[name] = orig; };
  };
  const restores = [
    wrap(g.world, 'update'), wrap(g.vehicles, 'update'), wrap(g.crowd, 'update'),
    wrap(g.wildlife, 'update'), wrap(g.fx, 'update'), wrap(g.gameplay, 'update'),
    wrap(g.missions, 'update'), wrap(g.ui, 'update'), wrap(g, 'render'),
    wrap(g, 'updatePost'), wrap(g, 'updateWeather'), wrap(g.audio, 'update'),
  ];
  let frames = 0;
  const origAnimate = g.animate.bind(g);
  g.animate = function () { frames++; return origAnimate(); };
  await sleep(4000);
  g.animate = origAnimate;
  restores.forEach(r => r());
  const res = { frames, fps: +(frames / 4).toFixed(1) };
  for (const k of Object.keys(stats)) {
    const s = stats[k];
    res[k] = s.n ? +(s.ms / s.n).toFixed(2) : 0;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
