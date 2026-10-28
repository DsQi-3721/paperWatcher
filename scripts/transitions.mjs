// Dev helper: how smooth the camera's turn is when opening a paper or a book from the desk and going back.
// Opening marks the paper/book as read on that server, so point it at a test server, e.g.
//   PORT=5312 PW_DATA_DIR=/tmp/pw_test npx tsx server/index.ts
//   node scripts/transitions.mjs http://127.0.0.1:5312 paper Attention
//   node scripts/transitions.mjs http://127.0.0.1:5312 book Alice
import { chromium } from 'playwright-core';
const [, , base, kind = 'paper', who = '.'] = process.argv;
if (!base) { console.error('usage: node scripts/transitions.mjs <url of a test server> [paper|book] [title regex]'); process.exit(1); }
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(base);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
await page.waitForTimeout(1500);
// frames from the click to the end, the turn's own frames (between the start and end of the camera move), long frames
const measure = (dir) => page.evaluate(async ([dir, kind, who]) => {
  const fr = []; let on = true, last = performance.now();
  const loop = (t) => { fr.push([t, t - last]); last = t; if (on) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const home = window.pw.home, name = dir === 'open' ? 'toReading' : 'toHome', orig = home[name].bind(home);
  let ts = 0, te = 0;
  home[name] = (ms) => { ts = performance.now(); return orig(ms).then((v) => { te = performance.now(); return v; }); };
  const t0 = performance.now();
  if (dir === 'open') {
    if (kind === 'book') { await window.pw.shelf.refresh(); void window.pw.openBook(window.pw.shelf.books.find((m) => new RegExp(who).test(m.title))); }
    else { const m = (await (await fetch('/api/papers')).json()).find((x) => new RegExp(who).test(x.title)); void window.pw.openPaper(m, 'library'); }
    const busy = () => !(window.pw.book || window.pw.reader) || window.pw.transitioning || document.body.classList.contains('opening');
    while (busy()) await new Promise((r) => setTimeout(r, 20));
  } else if (kind === 'book') await window.pw.closeBook();
  else await window.pw.goHome();
  const done = performance.now();
  await new Promise((r) => setTimeout(r, 200));
  on = false;
  home[name] = orig;
  const turn = fr.filter(([t]) => t > ts && t <= te + 1).map(([, d]) => d);
  return {
    totalMs: Math.round(done - t0), turnStartsAt: Math.round(ts - t0), turnMs: Math.round(te - ts), turnFrames: turn.length,
    turnFps: turn.length ? +(1000 * turn.length / (te - ts)).toFixed(1) : 0,
    longFrames: fr.filter(([t, d]) => t > t0 && t <= done && d > 34).map(([t, d]) => [Math.round(t - t0), Math.round(d)]),
  };
}, [dir, kind, who]);
const open = await measure('open');
await page.waitForTimeout(2500);
const back = await measure('back');
console.log(JSON.stringify({ kind, open, back }, null, 1));
await browser.close();
