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
  g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
  g.mode = 'play';
  await sleep(300);

  const res = {};

  // 1) full loop but render() replaced by nothing at all
  const r0 = g.render;
  g.render = () => {};
  let frames = 0;
  let orig = g.animate.bind(g);
  g.animate = function () { frames++; return orig(); };
  await sleep(2000);
  g.animate = orig;
  res.loopWithoutRenderFps = +(frames / 2).toFixed(1);
  g.render = r0;

  // 2) raw rAF only, game loop stopped
  const rAnimate = g.animate;
  g.animate = () => {};
  frames = 0;
  let last = performance.now();
  let ticks = 0;
  function tick() { ticks++; if (performance.now() - last < 2000) requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  await sleep(2200);
  res.rawRafFps = +(ticks / 2).toFixed(1);
  g.animate = rAnimate;

  // 3) renderer.render only, no composer, no loop
  frames = 0;
  const t0 = performance.now();
  for (let i = 0; i < 30; i++) { g.renderer.render(g.scene, g.camera); }
  g.renderer.getContext().finish();
  res.directRender30Ms = +((performance.now() - t0) / 30).toFixed(2);

  // 4) composer render only
  const t1 = performance.now();
  for (let i = 0; i < 30; i++) { g.composer.render(); }
  g.renderer.getContext().finish();
  res.composerRender30Ms = +((performance.now() - t1) / 30).toFixed(2);

  // 5) composer with shadow disabled
  g.renderer.shadowMap.autoUpdate = false;
  const t2 = performance.now();
  for (let i = 0; i < 30; i++) { g.composer.render(); }
  g.renderer.getContext().finish();
  res.composerNoShadowMs = +((performance.now() - t2) / 30).toFixed(2);
  g.renderer.shadowMap.autoUpdate = true;

  // 6) composer at half resolution
  g.composer.setSize(640, 360);
  const t3 = performance.now();
  for (let i = 0; i < 30; i++) { g.composer.render(); }
  g.renderer.getContext().finish();
  res.composerHalfResMs = +((performance.now() - t3) / 30).toFixed(2);
  g.composer.setSize(innerWidth, innerHeight);

  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
