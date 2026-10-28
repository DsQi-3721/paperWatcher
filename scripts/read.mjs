// Dev helper: open a paper, screenshot it, then run a few steps and screenshot again.
//   BASE=… PAPER=<id> SIZE=1440x900 STEPS="key:t;wait:600;shot:toc;js:…;move:x,y;click:x,y" node scripts/read.mjs /tmp/out
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://127.0.0.1:5312';
const PAPER = process.env.PAPER || 'bdfaa68d8984f0dc';
const [w, h] = (process.env.SIZE || '1440x900').split('x').map(Number);
const out = process.argv[2] || '/tmp/read';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) console.log('[console]', m.text().slice(0, 300)); });
await page.goto(`${BASE}/?paper=${PAPER}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}-1.png` });
if (process.env.STEPS) {
  for (const step of process.env.STEPS.split(';')) {
    const i = step.indexOf(':'), kind = step.slice(0, i), arg = step.slice(i + 1);
    if (kind === 'js') await page.evaluate(arg);
    else if (kind === 'key') await page.keyboard.press(arg);
    else if (kind === 'wait') await page.waitForTimeout(+arg);
    else if (kind === 'shot') await page.screenshot({ path: `${out}-${arg}.png` });
    else if (kind === 'move') { const [x, y] = arg.split(',').map(Number); await page.mouse.move(x, y, { steps: 8 }); }
    else if (kind === 'click') { const [x, y] = arg.split(',').map(Number); await page.mouse.click(x, y); }
  }
}
await browser.close();
