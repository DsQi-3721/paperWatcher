// The bin (server/trash.ts through store.ts and books.ts): taking papers and books off the desk keeps everything until
// it is put back; clearing the files keeps a record; importing the same file again brings the record back (notes,
// tags, bookmarks, where you were); files are cleared by themselves after 30 days; tags and batches.
// Runs in a temporary data folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(tmpdir(), 'pw-trash-'));
process.env.PW_DATA_DIR = dir;
const store = await import('../server/store.ts');
const books = await import('../server/books.ts');

const pdf = (n: number) => Buffer.from(`%PDF-1.4\n% paper ${n}\n`);
const listed = async () => (await store.listPapers()).map((m) => m.id);
const notes = (id: string) => JSON.parse(fs.readFileSync(path.join(dir, 'papers', id, 'notes.json'), 'utf8'));

test('a paper thrown away leaves the desk, stays whole in the bin, and comes back with its notes', async () => {
  const m = await store.addPaper(pdf(1), { fileName: 'one.pdf', title: 'One' });
  await store.writeNotes(m.id, { version: 1, annotations: [{ id: 'a1', text: 'kept' }] });
  await store.patchMeta(m.id, { tags: ['RL', ' #rl ', 'Transformers'] });
  assert.deepEqual((await store.getMeta(m.id))!.tags, ['RL', 'Transformers'], 'tags are cleaned: no #, no repeats');
  const t = await store.trashPaper(m.id);
  assert.ok(t?.trashedAt);
  assert.ok(!(await listed()).includes(m.id), 'off the desk');
  const bin = await store.listPaperTrash();
  assert.equal(bin.length, 1);
  assert.equal(bin[0].id, m.id);
  assert.ok(!bin[0].purgedAt, 'files still there');
  assert.equal(await store.restorePaper(m.id), 'restored');
  assert.ok((await listed()).includes(m.id), 'back on the desk');
  assert.equal(notes(m.id).annotations[0].text, 'kept');
  const back = (await store.getMeta(m.id))!;
  assert.equal(back.trashedAt, undefined);
  assert.deepEqual(back.tags, ['RL', 'Transformers']);
  assert.equal((await store.listPaperTrash()).length, 0);
});

test('cleared files leave a record; importing the same PDF again brings back its notes, tags and title', async () => {
  const m = await store.addPaper(pdf(2), { fileName: 'two.pdf', title: 'Two (real title)' });
  await store.writeNotes(m.id, { version: 1, annotations: [{ id: 'b1' }, { id: 'b2' }] });
  await store.patchMeta(m.id, { tags: ['Diffusion'], view: { x: 1, y: 2, z: 1.5 } });
  await store.trashPaper(m.id);
  const purged = await store.purgePaper(m.id);
  assert.ok(purged?.purgedAt);
  const binDir = path.join(dir, 'trash', 'papers', m.id);
  assert.ok(!fs.existsSync(path.join(binDir, 'paper.pdf')), 'the PDF is gone');
  assert.ok(fs.existsSync(path.join(binDir, 'notes.json')), 'the notes are kept');
  assert.equal(await store.restorePaper(m.id), 'purged', 'nothing to put back without the file');
  const again = await store.addPaper(pdf(2), { fileName: 'downloaded-again.pdf' });
  assert.equal(again.id, m.id);
  assert.equal(again.title, 'Two (real title)');
  assert.deepEqual(again.tags, ['Diffusion']);
  assert.equal(again.notes, 2);
  assert.equal(again.trashedAt, undefined);
  assert.equal(notes(m.id).annotations.length, 2);
  assert.ok(!fs.existsSync(binDir), 'the record went back with it');
});

test('put back after being imported again meanwhile: the notes of both are kept', async () => {
  const m = await store.addPaper(pdf(3), { fileName: 'three.pdf' });
  await store.writeNotes(m.id, { version: 1, annotations: [{ id: 'old' }] });
  await store.patchMeta(m.id, { tags: ['A'] });
  await store.trashPaper(m.id);
  // the bin holds the folder; the same PDF is imported fresh and gets a note of its own…
  fs.renameSync(path.join(dir, 'trash', 'papers', m.id), path.join(dir, 'held'));
  await store.addPaper(pdf(3), { fileName: 'three.pdf' });
  await store.writeNotes(m.id, { version: 1, annotations: [{ id: 'new' }] });
  await store.patchMeta(m.id, { tags: ['B'] });
  fs.renameSync(path.join(dir, 'held'), path.join(dir, 'trash', 'papers', m.id));
  // …then the old copy is put back
  assert.equal(await store.restorePaper(m.id), 'merged');
  assert.deepEqual(notes(m.id).annotations.map((a: any) => a.id).sort(), ['new', 'old']);
  assert.deepEqual((await store.getMeta(m.id))!.tags, ['B', 'A']);
  assert.equal((await store.listPaperTrash()).find((x) => x.id === m.id), undefined);
});

test('after 30 days in the bin the files are cleared by themselves; a record is wiped only by hand', async () => {
  const m = await store.addPaper(pdf(4), { fileName: 'four.pdf' });
  await store.trashPaper(m.id);
  const metaFile = path.join(dir, 'trash', 'papers', m.id, 'meta.json');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, trashedAt: Date.now() - 31 * 86_400_000 }));
  const rec = (await store.listPaperTrash()).find((x) => x.id === m.id)!;
  assert.ok(rec.purgedAt, 'cleared');
  assert.ok(!fs.existsSync(path.join(dir, 'trash', 'papers', m.id, 'paper.pdf')));
  await store.forgetPaper(m.id);
  assert.equal((await store.listPaperTrash()).find((x) => x.id === m.id), undefined);
});

test('emptying the bin clears every file but keeps every record', async () => {
  const a = await store.addPaper(pdf(5), { fileName: 'five.pdf' }), b = await store.addPaper(pdf(6), { fileName: 'six.pdf' });
  await store.trashPaper(a.id);
  await store.trashPaper(b.id);
  assert.equal(await store.emptyPaperTrash(), 2);
  const recs = (await store.listPaperTrash()).filter((x) => x.id === a.id || x.id === b.id);
  assert.equal(recs.length, 2);
  assert.ok(recs.every((x) => x.purgedAt));
});

test('batches: tags on and off for many papers, and many into the bin', async () => {
  const ps = [];
  for (let i = 10; i < 14; i++) ps.push(await store.addPaper(pdf(i), { fileName: `p${i}.pdf` }));
  const ids = ps.map((p) => p.id);
  await store.batchPapers(ids, 'tag', ['NLP', '#Survey']);
  assert.ok((await Promise.all(ids.map((id) => store.getMeta(id)))).every((m) => m!.tags!.join() === 'NLP,Survey'));
  await store.batchPapers(ids.slice(0, 2), 'untag', ['nlp']);
  assert.deepEqual((await store.getMeta(ids[0]))!.tags, ['Survey']);
  assert.deepEqual((await store.getMeta(ids[3]))!.tags, ['NLP', 'Survey']);
  await store.batchPapers(ids.slice(2), 'trash');
  const on = await listed();
  assert.ok(ids.slice(0, 2).every((id) => on.includes(id)) && ids.slice(2).every((id) => !on.includes(id)));
});

test('the papers’ own text can be searched (every word, a line round the first)', async () => {
  const m = await store.addPaper(pdf(20), { fileName: 'text.pdf' });
  await store.writePaperText(m.id, 'Intro. We use label smoothing of 0.1 during training. Label smoothing hurts perplexity.');
  const hits = await store.searchPaperText('label SMOOTHING training');
  const h = hits.find((x) => x.id === m.id)!;
  assert.ok(h, 'found');
  assert.equal(h.hits, 2);
  assert.match(h.snippet, /label smoothing of 0\.1/);
  assert.equal((await store.searchPaperText('nowhere-to-be-found')).length, 0);
});

test('books: thrown away and put back; cleared and imported again with where you were, bookmarks and tags', async () => {
  const epub = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(26), Buffer.from('mimetypeapplication/epub+zip'), Buffer.from('rest of a book')]);
  const b = await books.addBook(epub, { fileName: 'novel.epub' });
  await books.patchBook(b.id, { progress: { chapter: 3, offset: 120, percent: 0.4, at: 1 }, bookmarks: [{ chapter: 1, offset: 5, text: 'here', at: 1 }], tags: ['小说', '小说'] });
  assert.deepEqual((await books.getBook(b.id))!.tags, ['小说']);
  await books.trashBook(b.id);
  assert.ok(!(await books.listBooks()).some((x) => x.id === b.id));
  assert.equal(await books.restoreBook(b.id), 'restored');
  assert.ok((await books.listBooks()).some((x) => x.id === b.id));
  await books.trashBook(b.id);
  await books.purgeBook(b.id);
  const rec = (await books.listBookTrash()).find((x) => x.id === b.id)!;
  assert.ok(rec.purgedAt);
  const again = await books.addBook(epub, { fileName: 'novel.epub' });
  assert.equal(again.progress?.percent, 0.4);
  assert.equal(again.bookmarks?.length, 1);
  assert.deepEqual(again.tags, ['小说']);
  assert.equal((await books.listBookTrash()).find((x) => x.id === b.id), undefined);
  await books.batchBooks([b.id], 'tag', ['科幻']);
  assert.deepEqual((await books.getBook(b.id))!.tags, ['小说', '科幻']);
});
