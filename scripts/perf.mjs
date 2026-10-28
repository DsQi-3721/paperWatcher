// Dev helper: time-to-read and background text extraction for a paper.  node scripts/perf.mjs <paperId>
import { chromium } from 'playwright-core';
import { statSync } from 'node:fs';
const [, , id] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const t0 = Date.now();
await page.goto(`http://127.0.0.1:5199/?paper=${id}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
const tReady = Date.now() - t0;
await page.waitForFunction(() => window.pw.doc && window.pw.doc.texts.filter(Boolean).length === window.pw.doc.numPages, null, { timeout: 180000 });
const tText = Date.now() - t0;
const info = await page.evaluate(() => ({ pages: window.pw.doc.numPages, printed: document.querySelectorAll('.page.printed').length, canvases: document.querySelectorAll('canvas.pg-raster').length }));
const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : 'n/a');
await page.waitForTimeout(3000);
let txt = 'n/a';
try { txt = Math.round(statSync(`data/papers/${id}/paper.txt`).size / 1024) + ' KB'; } catch {}
// scroll through the whole paper quickly, then measure work
const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(40); }
await page.waitForTimeout(1500);
const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
const after = await page.evaluate(() => ({ canvases: document.querySelectorAll('canvas.pg-raster').length, page: window.pw.reader.currentPage() + 1 }));
console.log(JSON.stringify({ ...info, readyMs: tReady, allTextMs: tText, heap: mem, paperTxt: txt, scrollTaskSec: (m1.TaskDuration - m0.TaskDuration).toFixed(2), afterScroll: after }, null, 1));
await browser.close();
