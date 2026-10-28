// The home desk end to end, with screens: the default view, an object's ring of actions and its speech bubble, the fan of
// past papers out of a pile, the desk settings, and the reading close-up. BASE env (default 127.0.0.1:5312).
import { chromium } from 'playwright-core';
const BASE = process.env.BASE || 'http://127.0.0.1:5312';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('pageerror', (e) => { if (!/WebSocket/.test(e.message)) errs.push(e.message); });
p.on('console', (m) => { if (m.type() === 'error' && !/404|WebSocket|\[vite\]|Vite server/.test(m.text())) errs.push(m.text()); });
const shot = (n) => p.screenshot({ path: `.shots/ui-${n}.png` });
await p.goto(BASE + '/'); await p.waitForFunction(() => window.__ready, null, { timeout: 30000 }); await p.waitForTimeout(800);
await shot('0-home');
// click the calculator on one of its own pixels
const hit = async (id) => p.evaluate((id) => {
  const s = window.pw.home.scene, r = s.screenBox(s.byId(id));
  for (let j = 0; j < 600; j++) { const x = r.x + r.width * ((j * 0.618) % 1), y = r.y + r.height * ((j * 0.383 + 0.5) % 1);
    const el = document.elementFromPoint(x, y), g = el && el.closest('g.ob'); if (g && g.dataset.obj === id) return { x, y }; }
  return null; }, id);
let pt = await hit('calculator');
await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(700); await shot('1-ring');
await p.click('.om-pill:has-text("倒过来看")'); await p.waitForTimeout(1600); await shot('2-bubble');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
// a pile: fan the papers out, hover one
const pile = await p.evaluate(() => { const g = document.querySelector('g.pile'); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.4 }; });
await p.mouse.click(pile.x, pile.y); await p.waitForTimeout(900); await shot('3-fan');
const card = await p.evaluate(() => { const c = [...document.querySelectorAll('.fan-card')]; const r = c[Math.floor(c.length / 2)].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 30 }; });
await p.mouse.move(card.x, card.y); await p.waitForTimeout(400); await shot('4-fan-hover');
await p.keyboard.press('Escape'); await p.waitForTimeout(500);
// settings
await p.click('.hp-btn:has-text("设置")'); await p.waitForTimeout(400); await shot('5-settings');
await p.click('.desk-settings .card-close'); await p.waitForTimeout(300);
// the blank sheet: the importer beside it
const spot = await p.evaluate(() => { const s = window.pw.home.scene.readingSpot(); return { x: s.rect.x + s.rect.width / 2, y: s.rect.y + s.rect.height / 2 }; });
await p.mouse.click(spot.x, spot.y); await p.waitForTimeout(500); await shot('6-importer');
await p.keyboard.press('Escape');
// open a paper from the fan: the camera turns down close over the blank sheet, the paper lands
await p.mouse.click(pile.x, pile.y); await p.waitForTimeout(900);
const c2 = await p.evaluate(() => { const c = [...document.querySelectorAll('.fan-card')]; const r = c[c.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 }; });
await p.mouse.click(c2.x, c2.y);
await p.waitForTimeout(1500); await shot('7-landing');
await p.waitForFunction(() => window.pw.reader && !document.body.classList.contains('opening'), null, { timeout: 30000 });
await p.waitForTimeout(700); await shot('8-reading');
await p.keyboard.press('b');
await p.waitForFunction(() => !window.pw.reader && document.body.classList.contains('no-paper'), null, { timeout: 30000 });
await p.waitForTimeout(1500); await shot('9-back');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no errors');
await b.close();
process.exit(errs.length ? 1 : 0);
