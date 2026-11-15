import puppeteer from 'puppeteer-core';
const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser=await puppeteer.launch({executablePath:chrome,headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage();
await page.setViewport({width:800,height:500,deviceScaleFactor:1});
await page.goto('http://127.0.0.1:8123/?quality=low',{waitUntil:'load',timeout:180000});
await page.waitForFunction('window.__READY===true',{timeout:180000,polling:500});
await page.evaluate(()=>{ window.__game.composer.render=()=>{}; window.__game.startNewGame(); });
await new Promise(r=>setTimeout(r,1200));
console.log(await page.evaluate(()=>{const g=window.__game,h=g.player; return {paused:g.paused,wheel:g.wheelOpen,dlg:g.dialogueOpen,mode:g.mode,active:h.active,inV:h.inVehicle,pass:h.passenger,alive:h.alive,grounded:h.grounded,y:h.y,camYaw:g.cameraRig.yaw,dtlast:g.clockDelta};}));
console.log(await page.evaluate(()=>{
  const g=window.__game,h=g.player;
  g.input.move.x=0; g.input.move.y=1;
  const before=[...h.vel.toArray?.()||[]];
  h.vel.set(0,0,0);
  h.update(0.05,true);
  return {vel:h.vel.toArray(),pos:h.pos.toArray(),moving:h.moving,aim:h.aiming,blocked:g.mode};
}));
await browser.close();
