// Dev helper: drive the app through scenarios in headless Chrome and save screenshots.
//   PAPER=<paperId from data/papers> node scripts/flow.mjs <scenario>   (needs the dev server: npm run dev)
import { chromium } from 'playwright-core';
const [, , scenario = 'select', paperId = process.env.PAPER || 'bdfaa68d8984f0dc'] = process.argv;
const BASE = process.env.BASE || 'http://127.0.0.1:5199';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const logs = [];
page.on('console', (m) => { const t = `[${m.type()}] ${m.text()}`; logs.push(t); if (m.type() === 'error' || m.type() === 'warning') console.log(t.slice(0, 400)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 3).join(' | ')));
const shot = (name) => page.screenshot({ path: `.shots/${scenario}-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

// Screen coordinates of a phrase on a page (via the app's own text model and camera).
async function phrase(pageIndex, text, len) {
  return page.evaluate(({ pageIndex, text, len }) => {
    const app = window.pw; const pt = app.doc.texts[pageIndex];
    const i = pt.text.indexOf(text); if (i < 0) return null;
    const j = i + (len || text.length) - 1;
    const v = app.reader.views[pageIndex], cam = app.desk.camera;
    const a = pt.box(i), b = pt.box(j);
    const p0 = cam.worldToScreen(v.slot.x + a.x + 0.5, v.slot.y + a.y + a.h * 0.55);
    const p1 = cam.worldToScreen(v.slot.x + b.x + b.w - 0.5, v.slot.y + b.y + b.h * 0.55);
    return { p0, p1 };
  }, { pageIndex, text, len });
}
async function drag(p0, p1, steps = 14) {
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  await page.mouse.move(p1.x, p1.y, { steps }); await page.mouse.up();
}

if (scenario === 'drop') {
  await page.goto(BASE + '/');
  await page.waitForFunction(() => window.__ready);
  await wait(800);
  await page.evaluate(async (id) => { const m = await (await fetch('/api/papers/' + id)).json(); window.pw.openPaper(m, 'url'); }, paperId);
  for (const t of [250, 450, 650, 850, 1100, 1500, 2000, 2600, 3600]) { await wait(t - (t > 250 ? [250, 450, 650, 850, 1100, 1500, 2000, 2600, 3600][[250, 450, 650, 850, 1100, 1500, 2000, 2600, 3600].indexOf(t) - 1] : 0)); await shot(String(t)); }
} else {
  await page.goto(`${BASE}/?paper=${paperId}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
  await wait(2500);
  if (scenario === 'select' || scenario === 'ask') {
    await page.evaluate((pg) => window.pw.reader.goToPage(pg, { instant: true }), Number(process.env.PG || 0));
    await wait(1200);
    const PH = process.env.PHRASE || 'We propose a new simple network architecture, the Transformer';
    const p = await phrase(Number(process.env.PG || 0), PH.slice(0, 40), PH.length);
    console.log('phrase at', JSON.stringify(p));
    await drag(p.p0, p.p1);
    await wait(500);
    await shot('selected');
    if (scenario === 'ask') {
      const btn = await page.$('.sb-q');
      console.log('quick label:', await btn?.textContent());
      await btn?.click();
      for (const t of [1500, 6000, 12000, 20000, 32000, 45000]) { await wait(t === 1500 ? 1500 : t - [1500, 6000, 12000, 20000, 32000, 45000][[1500, 6000, 12000, 20000, 32000, 45000].indexOf(t) - 1]); await shot(String(t)); }
      const notes = await page.evaluate(() => JSON.stringify(window.pw.notes.list.map((a) => ({ style: a.style, margin: a.margin, msgs: a.messages.map((m) => m.role + ':' + m.text.slice(0, 300) + (m.error ? ' ERR ' + m.error : '')) })), null, 1));
      console.log(notes);
    }
  } else if (scenario === 'reopen') {
    const m = await page.evaluate(() => {
      const app = window.pw; const a = app.notes.list.find((x) => x.messages.length);
      if (!a) return null;
      const g = app.marks.geo.get(a.id)?.[0]; if (!g) return { id: a.id, nogeo: true };
      const v = app.reader.views[g.page], cam = app.desk.camera, r = g.rects[0];
      return { id: a.id, p: cam.worldToScreen(v.slot.x + r.x + r.w * 0.4, v.slot.y + r.y + r.h * 0.9) };
    });
    console.log('mark', JSON.stringify(m));
    if (m?.p) {
      await page.mouse.move(m.p.x - 30, m.p.y - 40);
      await page.mouse.move(m.p.x, m.p.y, { steps: 6 });
      await wait(1300);
      await shot('hover');
      await page.mouse.click(m.p.x, m.p.y);
      await wait(700);
      await shot('open-700');
      await wait(1600);
      await shot('open-2300');
      await page.keyboard.press('Escape');
      await wait(1200);
      await shot('closed');
    }
  } else if (scenario === 'followup') {
    const id = await page.evaluate(() => { const a = window.pw.notes.list.find((x) => x.messages.length); window.pw.notes.open(a.id, { focus: true }); return a.id; });
    await wait(1500);
    await page.keyboard.type('那 Transformer 具体怎么做到并行的？', { delay: 90 });
    await wait(150);
    await shot('typing');
    await page.keyboard.press('Enter');
    for (const t of [3000, 12000, 26000, 40000]) { await wait(t === 3000 ? 3000 : t - [3000, 12000, 26000, 40000][[3000, 12000, 26000, 40000].indexOf(t) - 1]); await shot(String(t)); }
    console.log(await page.evaluate((id) => JSON.stringify(window.pw.notes.byId(id).messages.map((m) => m.role + ': ' + m.text.slice(0, 160) + (m.error ? ' ERR ' + m.error : '')), null, 1), id));
  } else if (scenario === 'figask') {
    await page.evaluate(() => window.pw.reader.goToPage(2, { instant: true }));
    await wait(3000);
    const p = await page.evaluate(() => {
      const app = window.pw; const f = app.figures.get(2)?.[0]; if (!f) return null;
      const v = app.reader.views[2], cam = app.desk.camera;
      return cam.worldToScreen(v.slot.x + f.rect.x + f.rect.w * 0.5, v.slot.y + f.rect.y + f.rect.h * 0.35);
    });
    console.log('fig at', JSON.stringify(p));
    await page.mouse.move(p.x, p.y, { steps: 4 });
    await wait(400);
    await shot('hover');
    await page.mouse.click(p.x, p.y);
    await wait(500);
    await shot('selected');
    const btn = await page.$('.sb-q');
    console.log('quick:', await btn?.textContent());
    await btn?.click();
    for (const t of [2000, 15000, 35000, 55000]) { await wait(t === 2000 ? 2000 : t - [2000, 15000, 35000, 55000][[2000, 15000, 35000, 55000].indexOf(t) - 1]); await shot(String(t)); }
    console.log(await page.evaluate(() => JSON.stringify(window.pw.notes.list.filter((a) => a.anchor.kind === 'region').map((a) => [a.anchor.label, a.margin, a.messages.map((m) => m.role + ': ' + m.text.slice(0, 200) + (m.error ? ' ERR ' + m.error : ''))]), null, 1)));
  } else if (scenario === 'tools') {
    await page.evaluate(() => window.pw.reader.goToPage(1, { instant: true }));
    await wait(2500);
    // highlighter
    await page.keyboard.press('h');
    let p = await phrase(1, 'Recurrent neural networks, long short-term memory', 'Recurrent neural networks, long short-term memory'.length);
    if (p) { await drag(p.p0, p.p1); await wait(700); await shot('1-highlight'); }
    // eraser on it, then undo
    await page.keyboard.press('e');
    if (p) { await page.mouse.click((p.p0.x + p.p1.x) / 2, p.p0.y); await wait(600); await shot('2-erased'); }
    await page.keyboard.press('Meta+z');
    await wait(700);
    await shot('3-undo');
    // scissors box
    await page.keyboard.press('s');
    await drag({ x: 560, y: 300 }, { x: 900, y: 420 }, 10);
    await wait(500);
    await shot('4-scissors');
    await page.keyboard.press('Escape');
    // section by clicking a heading
    await page.keyboard.press('v');
    const hd = await phrase(1, '2 Background', 12);
    console.log('heading', JSON.stringify(hd));
    if (hd) { await page.mouse.click((hd.p0.x + hd.p1.x) / 2, hd.p0.y); await wait(800); await shot('5-section'); }
    console.log('sel', await page.evaluate(() => JSON.stringify(window.pw.selection.sel && { kind: window.pw.selection.sel.kind, unit: window.pw.selection.sel.unit, ranges: window.pw.selection.sel.ranges })));
    await page.keyboard.press('Escape');
    // layouts
    await page.keyboard.press('2'); await wait(1600); await shot('6-spread');
    await page.keyboard.press('3'); await wait(1800); await shot('7-grid');
    await page.keyboard.press('1'); await wait(1500);
    // panels
    await page.click('.lamp'); await wait(1500); await shot('8-settings');
    await page.keyboard.press('Escape');
    await page.click('.hud-tr .dobj:nth-child(2)'); await wait(600); await shot('9-notes');
    await page.keyboard.press('Escape');
    await page.click('.dobj-row .dobj:nth-child(2)'); await wait(800); await shot('10-library');
  } else if (scenario === 'importurl') {
    await page.click('.dobj-row .dobj:nth-child(1)');
    await wait(400);
    await page.fill('.imp-url', process.env.URL || 'https://arxiv.org/html/1512.03385v1');
    await page.keyboard.press('Enter');
    for (const t of [700, 1600, 3000]) { await wait(t === 700 ? 700 : t - [700, 1600, 3000][[700, 1600, 3000].indexOf(t) - 1]); await shot('fetch-' + t); }
    await page.waitForFunction(() => window.pw.meta && window.pw.meta.title !== 'Attention Is All You Need' && document.querySelectorAll('.page.printed').length > 0, null, { timeout: 90000 }).catch(() => console.log('timeout waiting for new paper'));
    await wait(5000);
    await shot('opened');
    console.log(await page.evaluate(() => JSON.stringify({ meta: window.pw.meta, cols: window.pw.doc.texts[0]?.columns, figs: [...window.pw.figures.entries()].map(([k, v]) => [k, v.map((f) => f.kind + ':' + (f.label || ''))]) })));
  } else if (scenario === 'wholepaper') {
    await page.click('.hud-tr .dobj:nth-child(2)'); await wait(500);
    await page.click('.nl-paper'); await wait(1500);
    await page.keyboard.type('这篇论文最核心的贡献是什么？用三句话说。', { delay: 60 });
    await wait(300); await shot('typed');
    await page.keyboard.press('Enter');
    for (const t of [3000, 20000, 40000]) { await wait(t === 3000 ? 3000 : t - [3000, 20000, 40000][[3000, 20000, 40000].indexOf(t) - 1]); await shot(String(t)); }
    await page.keyboard.press('Escape'); await wait(1200); await shot('closed');
    console.log(await page.evaluate(() => JSON.stringify(window.pw.notes.list.filter((a) => a.anchor.kind === 'paper').map((a) => [a.margin, a.messages.map((m) => m.role + ': ' + m.text.slice(0, 150) + (m.error ? ' ERR ' + m.error : ''))]), null, 1)));
  } else if (scenario === 'placeleft') {
    const p = await phrase(0, 'We explicitly reformulate the layers', 'We explicitly reformulate the layers as learning residual functions'.length);
    await drag(p.p0, p.p1);
    await wait(400);
    await page.click('.sb-ask');
    await wait(1600);
    await shot('sheet-left');
    await page.keyboard.type('残差函数是什么？', { delay: 70 });
    await wait(300);
    await shot('typing');
    await page.keyboard.press('Escape');
    await wait(900);
    // cross-page selection: from the end of page 1 into page 2
    await page.evaluate(() => window.pw.reader.goToPage(0, { instant: true }));
    await page.evaluate(() => { const c = window.pw.desk.camera; c.set({ y: c.view.y + 520 }); });
    await wait(1200);
    const a = await page.evaluate(() => {
      const app = window.pw, cam = app.desk.camera;
      const p0 = app.doc.texts[0], p1 = app.doc.texts[1];
      const l0 = p0.lines[p0.lines.length - 3], l1 = p1.lines[4];
      const v0 = app.reader.views[0], v1 = app.reader.views[1];
      return { s: cam.worldToScreen(v0.slot.x + l0.x0 + 2, v0.slot.y + (l0.y0 + l0.y1) / 2), e: cam.worldToScreen(v1.slot.x + l1.x1 - 2, v1.slot.y + (l1.y0 + l1.y1) / 2) };
    });
    console.log('cross', JSON.stringify(a));
    await drag(a.s, a.e, 20);
    await wait(500);
    await shot('cross-page');
    console.log(await page.evaluate(() => JSON.stringify(window.pw.selection.sel?.ranges)));
    // clean up the empty note we created
    await page.evaluate(() => { for (const n of window.pw.notes.list.filter((x) => !x.messages.length && x.anchor.kind === 'text' && x.style !== 'highlight')) window.pw.notes.erase(n.id); });
    await wait(1000);
  } else if (scenario === 'word') {
    const p = await phrase(0, 'Transformer', 11);
    await page.mouse.dblclick((p.p0.x + p.p1.x) / 2, p.p0.y);
    await wait(400);
    await shot('dbl');
  } else if (scenario === 'figure') {
    await page.evaluate(() => window.pw.reader.goToPage(2, { instant: true }));
    await wait(3000);
    const figs = await page.evaluate(() => JSON.stringify([...window.pw.figures.entries()].map(([k, v]) => [k, v.map((f) => [f.kind, f.label, Math.round(f.rect.x), Math.round(f.rect.y), Math.round(f.rect.w), Math.round(f.rect.h)])])));
    console.log('figures', figs);
    await shot('page3');
  }
}
await browser.close();
