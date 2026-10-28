// Desk scene timing: loads scene-lab.html, records page errors, takes a screenshot, and times orbit frames
// (rAF to rAF, so JS + style + layout + paint) for each filter mode and quality.
//   BASE=http://127.0.0.1:5312 node scripts/scene-perf.mjs [w h dpr]
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://127.0.0.1:5312';
const [w = 1440, h = 900, dpr = 2] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = {};
for (const filter of ['0', '2.4']) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const t0 = Date.now();
  await page.goto(`${BASE}/scene-lab.html?wobble=${filter}${filter === '0' ? '&grain=0' : ''}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  const load = Date.now() - t0;
  if (filter !== '0') await page.screenshot({ path: '.shots/scene-lab.png' });
  const first = await page.evaluate(() => window.lab.scene.timing.full);
  const draft = await page.evaluate(() => window.lab.bench(30, 4, 'draft'));
  const final = await page.evaluate(() => window.lab.bench(12, 4, 'final'));
  const size = await page.evaluate(() => document.querySelector('.scene-svg').outerHTML.length);
  results[filter] = { load, first: +first.toFixed(1), svgKB: Math.round(size / 1024), draft, final, errors: errs.slice(0, 5) };
  await page.close();
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
