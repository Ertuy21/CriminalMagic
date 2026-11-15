import puppeteer from 'puppeteer-core';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage();
await page.setViewport({width:1000,height:700,deviceScaleFactor:1});
await page.goto('http://127.0.0.1:8123/?quality=low',{waitUntil:'load',timeout:180000});
await page.waitForFunction('window.__READY===true',{timeout:180000,polling:500});
await page.evaluate(()=>window.__game.startNewGame());
await new Promise(r=>setTimeout(r,5200));
for(let i=0;i<20;i++){const open=await page.evaluate(()=>window.__game.dialogueOpen); if(!open)break; await page.click('.dlg-box').catch(()=>{}); await new Promise(r=>setTimeout(r,200));}
await page.keyboard.down('w');
await new Promise(r=>setTimeout(r,400));
console.log(await page.evaluate(()=>{const g=window.__game,h=g.player;return {keys:[...g.input.keys],move:{...g.input.move},active:h.active,blocked:g.mode,pos:h.pos.toArray(),vel:h.vel.toArray(),moving:h.moving,paused:g.paused,wheel:g.wheelOpen,dlg:g.dialogueOpen,coll:h.game.world.collideCircle({x:h.pos.x,z:h.pos.z},0.42)};}));
await page.keyboard.up('w');
await browser.close();
