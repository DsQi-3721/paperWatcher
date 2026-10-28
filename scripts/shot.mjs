// Dev helper: screenshot the app in headless Chrome.  node scripts/shot.mjs <url> <out.png> [w] [h] [waitMs] [js]
import { chromium } from 'playwright-core';
const [, , url, out, w = 1440, h = 900, wait = 2500, js] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() !== 'debug') console.log('[console]', m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 }).catch(() => console.log('no __ready'));
if (js) await page.evaluate(js);
await page.waitForTimeout(+wait);
const clip = process.env.CLIP ? (([x, y, width, height]) => ({ x, y, width, height }))(process.env.CLIP.split(",").map(Number)) : undefined;
await page.screenshot({ path: out, clip });
await browser.close();
