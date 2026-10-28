// Screenshot the desk scene lab: node scripts/scene-shot.mjs out.png 'query' [waitMs] [w h dpr]
// (BASE env, default http://127.0.0.1:5312). Prints page errors and the object flashes seen.
import { chromium } from 'playwright-core';
const [out, query = '', wait = '600', w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:5312';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); });
await p.goto(`${BASE}/scene-lab.html?${query}`);
try { await p.waitForFunction(() => window.__ready, null, { timeout: 30000 }); }
catch { console.log(out, '| NOT READY | errors:', errs.join(' | ')); await b.close(); process.exit(1); }
await p.waitForTimeout(+wait);
await p.screenshot({ path: out });
const log = await p.evaluate(() => window.__log || []);
console.log(out, '| errors:', errs.join(' | ') || 'none', '| log:', log.join(' · ') || '-');
await b.close();
