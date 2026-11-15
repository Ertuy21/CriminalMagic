import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
// baseline: trivial WebGL page
await page.goto('data:text/html,<canvas id=c width=1280 height=720></canvas><script>const gl=document.getElementById("c").getContext("webgl2");let n=0,t0=performance.now();function f(){gl.clearColor(0.1,0.1,0.2,1);gl.clear(gl.COLOR_BUFFER_BIT);n++;if(performance.now()-t0<2000)requestAnimationFrame(f);else window.__fps=n/((performance.now()-t0)/1000);}requestAnimationFrame(f);</script>', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 2600));
const base = await page.evaluate(() => window.__fps);

// now the game at different qualities
const results = { baselineWebGL: +base.toFixed(1) };
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:8123/?quality=' + q + '&play=1', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
  const r = await p.evaluate(async () => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.dialogueOpen = false;
    document.getElementById('dialogue')?.classList.add('hidden');
    document.getElementById('chapter-card')?.classList.add('hidden');
    g.missions._stop = true;
    await sleep(200);
    g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
    g.mode = 'play';
    await sleep(500);
    let frames = 0;
    const orig = g.animate.bind(g);
    g.animate = function () { frames++; return orig(); };
    await sleep(3000);
    g.animate = orig;
    return { fps: +(frames / 3).toFixed(1), pr: g.renderer.getPixelRatio(), calls: g.renderer.info.render.calls };
  });
  results[q] = r;
  await p.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
