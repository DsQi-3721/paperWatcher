// The library lists kept in memory (server/metacache.ts, used by server/store.ts and server/books.ts): the list is
// exactly what reading every meta.json would give, it follows the server's own writes at once and changes made
// behind its back (hand edits, folders copied in or removed) soon after, and writes that change nothing are skipped.
// Runs in a temporary data folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(tmpdir(), 'pw-library-'));
process.env.PW_DATA_DIR = dir;
const store = await import('../server/store.ts');
const books = await import('../server/books.ts');
const { MetaCache } = await import('../server/metacache.ts');

const PAPERS = path.join(dir, 'papers');
const pdf = (n: number) => Buffer.from(`%PDF-1.4\n% paper ${n}\n`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => Promise<boolean>, ms = 5000) {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) return false;
    await sleep(15);
  }
  return true;
}

/** The list as the server built it before it kept one: every meta.json read and parsed, then sorted (papers are
 *  listed without their abstract, which the desk never shows). */
function reference(folder: string, dataFile: (m: any) => string, view: (m: any) => any = (m) => m) {
  const out: any[] = [];
  for (const id of fs.readdirSync(folder)) {
    if (!/^[a-f0-9]{8,64}$/.test(id)) continue;
    let m: any = null;
    try { m = JSON.parse(fs.readFileSync(path.join(folder, id, 'meta.json'), 'utf8')); } catch { /* skipped */ }
    if (m && fs.existsSync(path.join(folder, id, dataFile(m)))) out.push(m);
  }
  out.sort((a, b) => (b.openedAt || b.addedAt) - (a.openedAt || a.addedAt));
  return JSON.stringify(out.map(view));
}
const paperRef = () => reference(PAPERS, () => 'paper.pdf', ({ abstract: _a, ...rest }) => rest);
const paperList = async () => (await store.listPapersJson()).toString('utf8');

test('the paper list is what reading every meta.json gives, and follows the server’s own writes at once', async () => {
  assert.equal(await paperList(), '[]');
  const metas = [];
  for (let i = 0; i < 6; i++) metas.push(await store.addPaper(pdf(i), { fileName: `paper ${i}.pdf`, title: `Paper ${i}` }));
  assert.equal(await paperList(), paperRef());
  assert.equal((await store.listPapers()).length, 6);

  // an abstract stays in meta.json and in the paper's own meta, but not in the list
  await store.patchMeta(metas[1].id, { abstract: 'A long abstract the desk never shows.' });
  assert.equal((await store.getMeta(metas[1].id))!.abstract, 'A long abstract the desk never shows.');
  assert.ok(!(await paperList()).includes('A long abstract'));
  assert.equal(await paperList(), paperRef());

  await store.patchMeta(metas[2].id, { openedAt: Date.now() + 1000, title: '读过的' });
  let list = await store.listPapers();
  assert.equal(list[0].id, metas[2].id, 'the one read last comes first');
  assert.equal(list[0].title, '读过的');
  assert.equal(await paperList(), paperRef());

  await store.writeNotes(metas[3].id, { version: 1, annotations: [{ id: 'a' }, { id: 'b' }] });
  assert.equal((await store.listPapers()).find((m) => m.id === metas[3].id)!.notes, 2);
  const withThumb = await store.writeThumb(metas[4].id, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2]));
  assert.equal((await store.listPapers()).find((m) => m.id === metas[4].id)!.thumb, withThumb!.thumb);

  await store.deletePaper(metas[5].id);
  list = await store.listPapers();
  assert.equal(list.length, 5);
  assert.ok(!list.some((m) => m.id === metas[5].id));
  assert.equal(await paperList(), paperRef());

  // the objects handed out are the caller's own
  list[0].title = 'changed by a caller';
  assert.notEqual((await store.listPapers())[0].title, 'changed by a caller');
});

test('changes made behind the server’s back show up', async () => {
  const before = await store.listPapers();
  const a = before[1];
  // a hand edit, in place
  const metaFile = path.join(PAPERS, a.id, 'meta.json');
  fs.writeFileSync(metaFile, JSON.stringify({ ...a, title: 'Edited by hand' }, null, 2));
  assert.ok(await waitFor(async () => (await store.listPapers()).some((m) => m.title === 'Edited by hand')), 'hand edit seen');
  // a paper folder copied in (from a backup, another machine)
  const id = 'abcdef0123456789';
  fs.mkdirSync(path.join(PAPERS, id));
  fs.writeFileSync(path.join(PAPERS, id, 'paper.pdf'), pdf(99));
  fs.writeFileSync(path.join(PAPERS, id, 'meta.json'), JSON.stringify({ id, title: 'Copied in', addedAt: Date.now() + 5000 }));
  assert.ok(await waitFor(async () => (await store.listPapers())[0]?.id === id), 'copied-in folder seen');
  // its PDF taken away: no longer listed; put back: listed again
  fs.renameSync(path.join(PAPERS, id, 'paper.pdf'), path.join(PAPERS, id, 'away.pdf'));
  assert.ok(await waitFor(async () => !(await store.listPapers()).some((m) => m.id === id)), 'paper without its PDF hidden');
  fs.renameSync(path.join(PAPERS, id, 'away.pdf'), path.join(PAPERS, id, 'paper.pdf'));
  assert.ok(await waitFor(async () => (await store.listPapers()).some((m) => m.id === id)), 'PDF back, paper back');
  // a damaged meta.json: not listed (as before), and back once repaired
  fs.writeFileSync(path.join(PAPERS, id, 'meta.json'), '{ not json');
  assert.ok(await waitFor(async () => !(await store.listPapers()).some((m) => m.id === id)), 'damaged meta hidden');
  fs.writeFileSync(path.join(PAPERS, id, 'meta.json'), JSON.stringify({ id, title: 'Repaired', addedAt: 1 }));
  assert.ok(await waitFor(async () => (await store.listPapers()).some((m) => m.title === 'Repaired')), 'repaired meta seen');
  // the folder removed
  fs.rmSync(path.join(PAPERS, id), { recursive: true });
  assert.ok(await waitFor(async () => !(await store.listPapers()).some((m) => m.id === id)), 'removed folder gone');
  assert.equal(await paperList(), paperRef());
});

test('without a watcher: folders added or removed show at once, edits inside one after the next full look', async () => {
  const lib = fs.mkdtempSync(path.join(tmpdir(), 'pw-nowatch-'));
  try {
    const cache = new MetaCache<any>({
      dir: lib, idRe: /^[a-f0-9]{8,64}$/, dataFile: () => 'paper.pdf', matters: () => true,
      sortKey: (m) => m.openedAt || m.addedAt, watch: false, sweepMs: 300,
    });
    const add = (id: string, title: string, addedAt: number) => {
      fs.mkdirSync(path.join(lib, id));
      fs.writeFileSync(path.join(lib, id, 'paper.pdf'), 'x');
      fs.writeFileSync(path.join(lib, id, 'meta.json'), JSON.stringify({ id, title, addedAt }));
    };
    add('1111111111111111', 'one', 1);
    assert.deepEqual((await cache.list()).map((m) => m.title), ['one']);
    add('2222222222222222', 'two', 2);
    assert.deepEqual((await cache.list()).map((m) => m.title), ['two', 'one'], 'the folder’s mtime shows the new one');
    fs.rmSync(path.join(lib, '1111111111111111'), { recursive: true });
    assert.deepEqual((await cache.list()).map((m) => m.title), ['two']);
    fs.writeFileSync(path.join(lib, '2222222222222222', 'meta.json'), JSON.stringify({ id: '2222222222222222', title: 'two, edited', addedAt: 2 }));
    await sleep(350);
    assert.deepEqual((await cache.list()).map((m) => m.title), ['two, edited']);
    cache.touch('2222222222222222');   // a write of the server's own is seen at once, sweep or not
    fs.writeFileSync(path.join(lib, '2222222222222222', 'meta.json'), JSON.stringify({ id: '2222222222222222', title: 'two, by us', addedAt: 2 }));
    cache.touch('2222222222222222');
    assert.deepEqual((await cache.list()).map((m) => m.title), ['two, by us']);
  } finally {
    fs.rmSync(lib, { recursive: true, force: true });
  }
});

test('a passing error (too many open files) keeps what is known instead of emptying the list', async () => {
  const lib = fs.mkdtempSync(path.join(tmpdir(), 'pw-passing-'));
  const real = { stat: fs.promises.stat, readdir: fs.promises.readdir };
  try {
    const cache = new MetaCache<any>({
      dir: lib, idRe: /^[a-f0-9]{8,64}$/, dataFile: () => 'paper.pdf', matters: () => true,
      sortKey: (m) => m.addedAt, watch: false, sweepMs: 0,
    });
    for (const [id, t] of [['1111111111111111', 1], ['2222222222222222', 2]] as const) {
      fs.mkdirSync(path.join(lib, id));
      fs.writeFileSync(path.join(lib, id, 'paper.pdf'), 'x');
      fs.writeFileSync(path.join(lib, id, 'meta.json'), JSON.stringify({ id, addedAt: t }));
    }
    assert.equal((await cache.list()).length, 2);
    const emfile = () => Object.assign(new Error('too many open files'), { code: 'EMFILE' });
    (fs.promises as any).readdir = async () => { throw emfile(); };
    (fs.promises as any).stat = async (p: string, ...rest: unknown[]) => { if (String(p).includes('1111')) throw emfile(); return real.stat.call(fs.promises, p, ...(rest as [])); };
    await sleep(5);
    assert.equal((await cache.list()).length, 2, 'the folder could not be listed: the list stays');
    (fs.promises as any).readdir = real.readdir;
    await sleep(5);
    assert.equal((await cache.list()).length, 2, 'one item could not be looked at: it stays');
    (fs.promises as any).stat = real.stat;
    fs.rmSync(path.join(lib, '1111111111111111'), { recursive: true });
    await sleep(5);
    assert.deepEqual((await cache.list()).map((m) => m.id), ['2222222222222222'], 'and real changes still show');
  } finally {
    Object.assign(fs.promises, real);
    fs.rmSync(lib, { recursive: true, force: true });
  }
});

test('lists asked for while papers change end up matching the files', async () => {
  const list = await store.listPapers();
  const jobs: Promise<unknown>[] = [];
  for (let i = 0; i < 30; i++) {
    const m = list[i % list.length];
    jobs.push(store.patchMeta(m.id, { title: `round ${i}`, openedAt: Date.now() + i }));
    jobs.push(store.listPapersJson());
  }
  await Promise.all(jobs);
  assert.equal(await paperList(), paperRef());
});

test('a patch that changes nothing leaves meta.json alone', async () => {
  const m = (await store.listPapers())[0];
  const file = path.join(PAPERS, m.id, 'meta.json');
  const view = { layout: 'column', x: 1, y: 2, z: 0.5 };
  await store.patchMeta(m.id, { view });
  const mtime = fs.statSync(file).mtimeMs;
  await sleep(20);
  const again = await store.patchMeta(m.id, { view: { ...view } });
  assert.deepEqual(again!.view, view);
  assert.equal(fs.statSync(file).mtimeMs, mtime, 'the same view again: no write');
  // a notes save that keeps the count does not touch meta.json either
  await store.writeNotes(m.id, { version: 1, annotations: [{ id: 'x' }] });
  const m2 = fs.statSync(file).mtimeMs;
  await sleep(20);
  await store.writeNotes(m.id, { version: 1, annotations: [{ id: 'y' }] });
  assert.equal(fs.statSync(file).mtimeMs, m2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(PAPERS, m.id, 'notes.json'), 'utf8')).annotations[0].id, 'y');
});

test('the paper text sent again unchanged is not written again', async () => {
  const m = (await store.listPapers())[0];
  const file = path.join(PAPERS, m.id, 'paper.txt');
  await store.writePaperText(m.id, Buffer.from('=== Page 1 ===\n残差学习'));
  const mtime = fs.statSync(file).mtimeMs;
  await sleep(20);
  await store.writePaperText(m.id, Buffer.from('=== Page 1 ===\n残差学习'));
  assert.equal(fs.statSync(file).mtimeMs, mtime);
  await store.writePaperText(m.id, Buffer.from('=== Page 1 ===\n残差学习!'));
  assert.equal(await store.readPaperText(m.id), '=== Page 1 ===\n残差学习!');
  await store.writePaperText(m.id, Buffer.from([0x61, 0xff, 0x62]));   // not UTF-8: stored as text, as before
  assert.equal(await store.readPaperText(m.id), 'a�b');
  assert.ok(!fs.readdirSync(path.join(PAPERS, m.id)).some((f) => f.endsWith('.tmp')), 'no temp files left');
});

test('a damaged notes file is copied aside once, however often it is read', async () => {
  const m = (await store.listPapers())[0];
  const folder = path.join(PAPERS, m.id);
  fs.writeFileSync(path.join(folder, 'notes.json'), '{"version":1,"annotations":[');
  for (let i = 0; i < 3; i++) await assert.rejects(() => store.readNotes(m.id), /damaged/);
  assert.equal(fs.readdirSync(folder).filter((f) => f.startsWith('notes.json.damaged-')).length, 1);
});

test('the book list follows patches and covers at once; a patch that changes nothing is not written', async () => {
  const a = await books.addBook(Buffer.from('第一章\n春天来了。\n', 'utf8'), { fileName: 'spring.txt' });
  const b = await books.addBook(Buffer.from('Chapter 1\nIt was cold.\n', 'utf8'), { fileName: 'winter.txt' });
  const ref = () => reference(path.join(dir, 'books'), (m) => 'book.' + m.format);
  assert.equal((await books.listBooksJson()).toString('utf8'), ref());
  await books.patchBook(a.id, { progress: { chapter: 0, offset: 3, percent: 0.5, at: 1 }, openedAt: Date.now() + 1000 });
  const list = await books.listBooks();
  assert.equal(list[0].id, a.id);
  assert.equal(list[0].progress!.percent, 0.5);
  const covered = await books.writeCover(b.id, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
  assert.equal((await books.listBooks()).find((m) => m.id === b.id)!.cover, covered!.cover);
  const file = path.join(dir, 'books', a.id, 'meta.json');
  const mtime = fs.statSync(file).mtimeMs;
  await sleep(20);
  await books.patchBook(a.id, { progress: { chapter: 0, offset: 3, percent: 0.5, at: 1 } });
  assert.equal(fs.statSync(file).mtimeMs, mtime);
  assert.equal((await books.listBooksJson()).toString('utf8'), ref());
  await books.deleteBook(a.id);
  assert.deepEqual((await books.listBooks()).map((m) => m.id), [b.id]);
});

test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
