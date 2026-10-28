// Dev helper: how much work does the page do when nobody touches it?
import { chromium } from 'playwright-core';
const [, , url = 'http://127.0.0.1:5199/?paper=bdfaa68d8984f0dc', settle = '5000'] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
await page.goto(url);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(+settle);
const m = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
// count animation frames requested by the page during the window
await page.evaluate(() => { window.__raf = 0; const o = window.requestAnimationFrame; window.requestAnimationFrame = (f) => { window.__raf++; return o(f); }; });
const a = await m();
await page.waitForTimeout(5000);
const b = await m();
const raf = await page.evaluate(() => window.__raf);
const anims = await page.evaluate(() => document.getAnimations().filter((x) => x.playState === 'running').map((x) => (x.effect?.target?.className?.baseVal ?? x.effect?.target?.className) + ' ' + (x.animationName || '')));
const d = (k) => (b[k] - a[k]).toFixed(k.endsWith('Duration') ? 3 : 0);
console.log(JSON.stringify({ TaskDuration_s: d('TaskDuration'), ScriptDuration_s: d('ScriptDuration'), LayoutCount: d('LayoutCount'), RecalcStyleCount: d('RecalcStyleCount'), rafCalls: raf, runningAnimations: anims }, null, 1));
await browser.close();
