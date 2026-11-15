import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE ' + m.text()); });
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
  const count = (grp) => { let n = 0; grp.traverse(o => { if (o.isMesh) n++; }); return n; };
  const res = {
    mageMeshes: count(g.heroes.mage.group),
    luciaMeshes: count(g.heroes.lucia.group),
    mageDrawCallsApprox: count(g.heroes.mage.group),
    lights: (() => { const c = {}; g.scene.traverse(o => { if (o.isLight) c[o.type] = (c[o.type] || 0) + 1; }); return c; })(),
  };
  let frames = 0;
  const orig = g.animate.bind(g);
  g.animate = function () { frames++; return orig(); };
  await sleep(3000);
  g.animate = orig;
  res.fps = +(frames / 3).toFixed(1);
  return res;
});
console.log(JSON.stringify(out, null, 1));
console.log(errors.join('\n') || 'no errors');
await browser.close();
