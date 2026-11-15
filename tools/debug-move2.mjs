import puppeteer from 'puppeteer-core';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage();
await page.setViewport({width:800,height:500,deviceScaleFactor:1});
await page.goto('http://127.0.0.1:8123/?quality=low',{waitUntil:'load',timeout:180000});
await page.waitForFunction('window.__READY===true',{timeout:180000,polling:500});
await page.evaluate(()=>{ window.__game.composer.render=()=>{}; window.__game.startNewGame(); });
await page.waitForFunction("window.__game.mode === 'play'",{timeout:30000,polling:200});
console.log('play reached');
// skip dialogue by clicking
for(let i=0;i<40;i++){const open=await page.evaluate(()=>window.__game.dialogueOpen); if(!open)break; await page.click('.dlg-box').catch(()=>{}); await new Promise(r=>setTimeout(r,120));}
console.log(await page.evaluate(()=>{const g=window.__game,h=g.player; return {mode:g.mode,dlg:g.dialogueOpen,wheel:g.wheelOpen,paused:g.paused,obj:document.getElementById('mission-obj').textContent,camYaw:g.cameraRig.yaw};}));
await page.keyboard.down('w');
await new Promise(r=>setTimeout(r,600));
console.log('hold', await page.evaluate(()=>{const g=window.__game,h=g.player;return {keys:[...g.input.keys],move:{...g.input.move},pos:h.pos.toArray(),vel:h.vel.toArray(),mode:g.mode,blocked:g.mode!=='play'||g.wheelOpen||g.dialogueOpen,camYaw:g.cameraRig.yaw};}));
await page.keyboard.up('w');
await browser.close();
