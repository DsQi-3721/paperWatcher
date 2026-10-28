// Dev helper: capture a scenario frame by frame with the DevTools screencast.  node scripts/video.mjs drop
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
const [, , scenario = 'drop', paperId = 'bdfaa68d8984f0dc'] = process.argv;
const dir = `.shots/video-${scenario}`;
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
const cdp = await page.context().newCDPSession(page);
const frames = [];
let t0 = 0;
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  frames.push({ t: metadata.timestamp, data });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
if (scenario === 'flip') {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5199') + '/?paper=' + paperId);
  await page.waitForFunction(() => window.__ready);
  await page.evaluate(() => window.pw.setLayout('column'));
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.pw.reader.goToPage(0, { instant: true }));
  await page.waitForTimeout(1500);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 720, maxHeight: 450, everyNthFrame: 1 });
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(160);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
} else if (scenario === 'write') {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5199') + '/?paper=' + paperId);
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(2500);
  // a fake streaming answer on a fresh note: exercises layout + writer without calling an AI
  await page.evaluate(() => {
    const app = window.pw; const pt = app.doc.texts[0];
    const i = pt.text.indexOf('The dominant sequence transduction');
    const a = app.notes.create({ kind: 'text', ranges: [{ page: 0, start: i, end: i + 60 }], quote: 'demo', unit: 'passage' }, 'underline', 'blue');
    app.notes.open(a.id, { fly: true });
    window.__demo = a.id;
  });
  await page.waitForTimeout(1200);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 800, maxHeight: 500, everyNthFrame: 1 });
  await page.evaluate(() => {
    const app = window.pw; const a = app.notes.byId(window.__demo); const sh = app.notes.sheets.get(a.id);
    const user = { id: 'mu' + Date.now(), role: 'user', text: '这句话想说明什么？', at: Date.now() };
    a.messages.push(user); sh.addUser(user, true);
    const ai = { id: 'ma' + Date.now(), role: 'ai', text: '', at: Date.now() };
    const w = sh.startAi(ai);
    const full = '作者在说：当时最好的**序列转换模型**都靠 RNN 或 CNN，再加一个注意力把编码器和解码器连起来。\n\n- 循环结构必须一步一步算，没法并行；\n- 注意力只是**配角**。\n\n所以他们提出只用注意力的 Transformer，见 <ref page="1">based solely on attention mechanisms</ref>，复杂度是 $O(n^2 \\cdot d)$。\n\n<margin>旧模型靠循环，新模型只靠注意力</margin>';
    let k = 0;
    setTimeout(() => w.status('翻看 paper.txt…'), 300);
    setTimeout(() => {
      const t = setInterval(() => { k += 3; w.feed(full.slice(0, k)); if (k >= full.length) { clearInterval(t); w.done(full); } }, 45);
    }, 1400);
  });
  await page.waitForTimeout(9000);
  await page.evaluate(() => window.pw.notes.erase(window.__demo));
} else if (scenario === 'home') {
  // click a pile of past papers, pick the newest from the fan, then put it back on its pile (B)
  await page.goto((process.env.BASE || 'http://127.0.0.1:5199') + '/');
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(1500);
  const pile = await page.evaluate(() => { const r = document.querySelector('g.pile').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.4 }; });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
  await page.mouse.click(pile.x, pile.y);
  await page.waitForTimeout(900);
  const card = await page.evaluate(() => { const c = [...document.querySelectorAll('.fan-card')]; const r = c[c.length - 1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 40 }; });
  await page.mouse.click(card.x, card.y);
  await page.waitForTimeout(5200);
  await page.keyboard.press('b');
  await page.waitForTimeout(4200);
} else if (scenario === 'drop') {
  await page.goto((process.env.BASE || 'http://127.0.0.1:5199') + '/');
  await page.waitForFunction(() => window.__ready);
  await page.waitForTimeout(600);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
  await page.evaluate(async (id) => { const m = await (await fetch('/api/papers/' + id)).json(); window.pw.openPaper(m, 'url'); }, paperId);
  await page.waitForTimeout(4500);
}
await cdp.send('Page.stopScreencast');
await browser.close();
t0 = frames[0]?.t || 0;
frames.forEach((f, i) => writeFileSync(`${dir}/f${String(i).padStart(3, '0')}_${Math.round((f.t - t0) * 1000)}ms.jpg`, Buffer.from(f.data, 'base64')));
console.log('frames:', frames.length, 'span ms:', Math.round(((frames.at(-1)?.t || 0) - t0) * 1000));
