import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--ignore-gpu-blocklist', '--window-size=800,600'],
  protocolTimeout: 200000,
});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8123/?quality=low', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction('window.__READY === true', { timeout: 180000, polling: 400 });
const out = await page.evaluate(() => {
  const g = window.__game;
  const res = {};
  for (const id of ['mage', 'lucia']) {
    const m = g.heroes[id].model;
    const named = {
      hips: m.hips, chest: m.chest, neck: m.neck, head: m.head,
      armLshoulder: m.arms.L.shoulder, armRshoulder: m.arms.R.shoulder,
      armLelbow: m.arms.L.elbow, armRelbow: m.arms.R.elbow,
      handL: m.arms.L.hand, handR: m.arms.R.hand,
      legLhip: m.legs.L.hip, legRhip: m.legs.R.hip,
      kneeL: m.legs.L.knee, kneeR: m.legs.R.knee,
      footL: m.legs.L.foot, footR: m.legs.R.foot,
    };
    const rows = [];
    for (const [k, j] of Object.entries(named)) {
      let direct = 0;
      for (const c of j.children) if (c.isMesh) direct++;
      if (direct) rows.push(k + ':' + direct);
    }
    const eyeMeshes = m.eyes.map(e => e.children.filter(c => c.isMesh).length);
    res[id] = { jointDirectMeshes: rows, eyes: eyeMeshes, pony: m.pony?.length, tails: m.tails.length };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
