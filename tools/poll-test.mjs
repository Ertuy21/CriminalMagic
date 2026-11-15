import puppeteer from 'puppeteer-core';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:700,deviceScaleFactor:1});
await page.goto('http://127.0.0.1:8123/?quality=low',{waitUntil:'load',timeout:180000});
await page.waitForFunction('window.__READY===true',{timeout:180000,polling:500});
await page.evaluate(()=>window.__game.startNewGame());
for(let i=0;i<10;i++){
  await new Promise(r=>setTimeout(r,1000));
  console.log(i+1, await page.evaluate(()=>{const g=window.__game;return {mode:g.mode, chapter:!document.getElementById('chapter-card').classList.contains('hidden'), dlg:g.dialogueOpen, cur:g.missions.current?.title, task:g.missions.task?.type, obj:document.getElementById('mission-obj').textContent, t:g.missions.task?.t};}));
}
await browser.close();
