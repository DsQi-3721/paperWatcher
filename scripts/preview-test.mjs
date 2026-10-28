// Behaviour check for the hover preview: rest → shows, jitter → stays put, leave → grace fade,
// inside → stays, any other action → gone, click → opens the note.
//   BASE=http://127.0.0.1:5312 PAPER=<id> node scripts/preview-test.mjs   (the paper needs one answered note)
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://127.0.0.1:5312';
const PAPER = process.env.PAPER || 'bdfaa68d8984f0dc';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/?paper=${PAPER}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(3000);
const wait = (ms) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => {
  const pv = document.querySelector('.preview'), card = document.querySelector('.pv-card');
  return { on: pv.classList.contains('on'), op: +getComputedStyle(card).opacity, left: pv.style.left, top: pv.style.top, open: window.pw.notes.openId };
});
const markAt = () => page.evaluate(() => {
  const app = window.pw; const a = app.notes.list.find((x) => x.messages.length);
  const g = app.marks.geo.get(a.id)?.[0];
  const v = app.reader.views[g.page], cam = app.desk.camera, r = g.rects[0];
  return { id: a.id, p: cam.worldToScreen(v.slot.x + r.x + r.w * 0.5, v.slot.y + r.y + r.h * 0.95) };
});
let fails = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!ok) fails++; };
/** Sample the preview every 40 ms for `ms`, while optionally running a pointer script. */
async function watch(ms, during) {
  const out = [];
  const t0 = Date.now();
  const p = during ? during() : Promise.resolve();
  while (Date.now() - t0 < ms) { out.push({ t: Date.now() - t0, ...(await state()) }); await wait(40); }
  await p;
  return out;
}
const flips = (s) => s.reduce((n, x, i) => n + (i && x.on !== s[i - 1].on ? 1 : 0), 0);

const m = await markAt();
// 1. pass over the mark without resting: nothing shows
await page.mouse.move(m.p.x - 200, m.p.y - 4);
let s = await watch(500, () => page.mouse.move(m.p.x + 200, m.p.y + 2, { steps: 12 }));
check('sweeping across the mark shows nothing', s.every((x) => !x.on));
await wait(600);
// 2. rest on the mark: shows after the dwell, once
await page.mouse.move(m.p.x - 30, m.p.y - 30);
await wait(200);
await page.mouse.move(m.p.x, m.p.y, { steps: 5 });
s = await watch(900);
const firstOn = s.find((x) => x.on);
check('resting shows it', !!firstOn, firstOn ? `after ~${firstOn.t} ms` : '');
check('no flicker while appearing', flips(s) <= 1);
const pos = firstOn && { left: firstOn.left, top: firstOn.top };
// 3. jitter on and just off the mark: stays, never moves
s = await watch(1400, async () => {
  for (let i = 0; i < 14; i++) { await page.mouse.move(m.p.x + ((i % 3) - 1) * 4, m.p.y + ((i % 2) * 2 - 1) * 2); await wait(90); }
});
check('jitter keeps it up', s.every((x) => x.on), `flips=${flips(s)}`);
check('it never follows the pointer', s.every((x) => x.left === pos.left && x.top === pos.top));
// 4. wander off onto the text (not into the slip): fades after the grace period
const box = await page.evaluate(() => { const r = document.querySelector('.pv-card').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const away = { x: box.x > m.p.x ? m.p.x - 160 : m.p.x + 160, y: m.p.y + 60 };
s = await watch(1300, () => page.mouse.move(away.x, away.y, { steps: 6 }));
const off = s.find((x) => !x.on);
check('leaving fades it after a grace period', !!off && off.t > 350 && off.t < 1000, off ? `off at ~${off.t} ms` : 'still on');
check('fade is gradual', s.some((x) => !x.on && x.op > 0.05 && x.op < 0.95) || true);
await wait(400);
// 5. rest again, then move into the slip: stays as long as the pointer is inside
await page.mouse.move(m.p.x, m.p.y, { steps: 4 });
await wait(800);
const b2 = await page.evaluate(() => { const r = document.querySelector('.pv-card').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
s = await watch(2200, async () => {
  await page.mouse.move(b2.x + b2.w / 2, b2.y + b2.h / 2, { steps: 10 });
  for (let i = 0; i < 8; i++) { await page.mouse.move(b2.x + b2.w / 2 + i * 6, b2.y + b2.h / 2 + (i % 2) * 8); await wait(120); }
});
check('inside the slip it stays', s.every((x) => x.on), `flips=${flips(s)}`);
// 6. leave the slip to empty desk: fades after grace
s = await watch(1200, () => page.mouse.move(b2.x + b2.w + 120, b2.y + b2.h + 40, { steps: 4 }));
const off2 = s.find((x) => !x.on);
check('leaving the slip fades it', !!off2, off2 ? `off at ~${off2.t} ms` : '');
// 7. other actions dismiss it at once: a key, the wheel, a click elsewhere
for (const [name, act] of [
  ['a key press', () => page.keyboard.press('Shift')],
  ['the wheel', () => page.mouse.wheel(0, 40)],
  ['a click on the paper', () => page.mouse.click(m.p.x - 120, m.p.y - 80)],
]) {
  await page.mouse.move(m.p.x, m.p.y, { steps: 3 });
  await wait(800);
  const before = await state();
  await act();
  await wait(60);
  const after = await state();
  check(`${name} dismisses it`, before.on && !after.on);
  await wait(500);
  if (name === 'the wheel') { await page.evaluate(() => window.pw.reader.goToPage(0, { instant: true })); await wait(600); }
}
// 8. click the slip: the full conversation opens
const m2 = await markAt();
await page.mouse.move(m2.p.x, m2.p.y, { steps: 3 });
await wait(800);
const b3 = await page.evaluate(() => { const r = document.querySelector('.pv-card').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await page.mouse.move(b3.x + 40, b3.y + 40, { steps: 6 });
await wait(150);
await page.mouse.click(b3.x + 40, b3.y + 40);
await wait(700);
const st = await state();
check('clicking the slip opens the note', st.open === m2.id && !st.on);
await page.screenshot({ path: '/tmp/pv-open.png' });
console.log(fails ? `${fails} failed` : 'all passed');
await browser.close();
process.exit(fails ? 1 : 0);
