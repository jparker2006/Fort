import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--disable-renderer-backgrounding'] });
const p = await b.newPage();
await p.goto('http://127.0.0.1:4173/');
await p.waitForFunction(() => window.__fortReady);
await p.mouse.click(400,300);
await p.evaluate(() => { const f=window.__fort; f.debug.setYaw(0); f.debug.teleport(0,0,3.8); f.debug.placeSolid(0,0.6,1.0,4,1.2,4); f.debug.pump(2); });
await p.keyboard.down('KeyW');
await p.evaluate(()=>window.__fort.debug.pump(16));
console.log('pre-jump', JSON.stringify(await p.evaluate(()=>window.__fort.debug.playerPos())));
await p.keyboard.down('Space');
for (let k=0;k<8;k++){ await p.evaluate(()=>window.__fort.debug.pump(20)); const pos=await p.evaluate(()=>window.__fort.debug.playerPos()); console.log('t'+k, JSON.stringify(pos)); }
await p.keyboard.up('KeyW'); await p.keyboard.up('Space');
await b.close();
