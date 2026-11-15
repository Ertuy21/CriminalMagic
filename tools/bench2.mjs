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

async function measure(label, setup, teardown) {
  return page.evaluate(async (label, setupSrc, teardownSrc) => {
    const g = window.__game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    g.dialogueOpen = false;
    document.getElementById('dialogue')?.classList.add('hidden');
    document.getElementById('chapter-card')?.classList.add('hidden');
    g.missions._stop = true;
    g.missions.current = null; g.missions.task = null; g.missions.pendingStory = null;
    g.mode = 'play';
    await sleep(150);
    if (setupSrc) new Function('g', setupSrc)(g);
    await sleep(400);
    let frames = 0;
    const orig = g.animate.bind(g);
    g.animate = function () { frames++; return orig(); };
    await sleep(2500);
    g.animate = orig;
    if (teardownSrc) new Function('g', teardownSrc)(g);
    return { label, fps: +(frames / 2.5).toFixed(1) };
  }, label, setup, teardown);
}

const out = [];
out.push(await measure('baseline', '', ''));
out.push(await measure('no css overlays', `
  for (const id of ['grain','scan','vignette']) { const e=document.getElementById(id); if(e) e.style.display='none'; }
`, `for (const id of ['grain','scan','vignette']) { const e=document.getElementById(id); if(e) e.style.display=''; }`));
out.push(await measure('no css + no hud', `
  for (const id of ['grain','scan','vignette','hud','look-zone']) { const e=document.getElementById(id); if(e) e.style.display='none'; }
`, `for (const id of ['grain','scan','vignette','hud','look-zone']) { const e=document.getElementById(id); if(e) e.style.display=''; }`));
out.push(await measure('few lights (4 point)', `
  window.__saved = [];
  let n = 0;
  g.scene.traverse(o => { if (o.isPointLight) { window.__saved.push([o, o.intensity]); if (n++ >= 4) o.intensity = 0; } });
`, `
  for (const [o, i] of window.__saved) o.intensity = i;
`));
out.push(await measure('zero point lights', `
  window.__saved = [];
  g.scene.traverse(o => { if (o.isPointLight) { window.__saved.push([o, o.intensity]); o.intensity = 0; } });
`, `
  for (const [o, i] of window.__saved) o.intensity = i;
`));
out.push(await measure('no heroes', `
  g.heroes.mage.group.visible = false; g.heroes.lucia.group.visible = false;
`, `g.heroes.mage.group.visible = true; g.heroes.lucia.group.visible = true;`));
out.push(await measure('no point lights + no heroes', `
  window.__saved = [];
  g.scene.traverse(o => { if (o.isPointLight) { window.__saved.push([o, o.intensity]); o.intensity = 0; } });
  g.heroes.mage.group.visible = false; g.heroes.lucia.group.visible = false;
`, `
  for (const [o, i] of window.__saved) o.intensity = i;
  g.heroes.mage.group.visible = true; g.heroes.lucia.group.visible = true;
`));
out.push(await measure('direct renderer (no composer)', `
  window.__savedRender = g.render;
  g.render = function () { this.renderer.render(this.scene, this.camera); };
`, `g.render = window.__savedRender;`));
console.log(JSON.stringify(out, null, 1));
await browser.close();
