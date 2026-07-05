import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--disable-renderer-backgrounding'] });
const p = await b.newPage({ viewport: { width: 700, height: 900 } });
await p.goto('http://127.0.0.1:4173/?turntable');
await p.waitForFunction(() => window.__fortReady);
// Face the camera: rotate so front (-Z, visor) faces +Z camera => rotation.y = PI
await p.evaluate(()=>window.__turntable.setAngle(Math.PI));
await p.waitForTimeout(300);
await p.screenshot({ path: 'test-results/evidence/t07-front.png' });
await p.evaluate(()=>window.__turntable.setAngle(Math.PI*0.75));
await p.waitForTimeout(200);
await p.screenshot({ path: 'test-results/evidence/t07-threequarter.png' });
await b.close();
