import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
const dir = fs.mkdtempSync(path.join(tmpdir(), 'pw-english-test-'));
process.env.PW_DATA_DIR = dir;
const { validateDrafts, collectEnglish, listEnglish, patchEnglish } = await import('../server/english.ts');
const store = await import('../server/store.ts');
const { parseEnglishJSON } = await import('../server/ai/english.ts');
const text = '=== Page 1 ===\nAttention improves the representation.\n=== Page 2 ===\nWe propose a novel architecture based on attention.\nAttention helps.';
const raw = { kind: 'word', english: 'attention', chinese: '注意力', meaningEn: 'A mechanism that weights relevant inputs.', meaningZh: '衡量输入相关性的机制。', exampleEn: 'We propose a novel architecture based on attention.', exampleZh: '我们提出了一种基于注意力的新架构。' };
const paper = await store.addPaper(Buffer.from('%PDF-1.4\n% English test'), { title: 'Research paper' });
await store.writePaperText(paper.id, text);
const [draft] = validateDrafts([raw], paper, text);

test('AI entries require bilingual data and a verifiable original sentence; page and frequency come from PDF', () => {
  assert.equal(draft.source.page, 2);
  assert.equal(draft.source.occurrences, 3);
  assert.equal(draft.source.paperId, paper.id);
  const invalid = [
    { ...raw, exampleEn: 'Attention is all you need.' },
    { ...raw, english: 'fabricated term' },
    { ...raw, exampleZh: '' },
    { ...raw, meaningEn: '' },
    { ...raw, kind: 'invalid' },
  ];
  assert.deepEqual(validateDrafts(invalid, paper, text), []);
  assert.equal(validateDrafts([raw, { ...raw, english: 'Attention' }], paper, text).length, 1);
  assert.equal(validateDrafts([{ ...raw, kind: 'sentence', english: raw.exampleEn }], paper, text)[0].kind, 'sentence');
});

test('collection is persistent, case-insensitive, serialized and idempotent for network retries', async () => {
  await Promise.all(Array.from({ length: 5 }, () => collectEnglish([draft], 'same-request-id')));
  let entries = await listEnglish();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].collectionCount, 1);
  await Promise.all(Array.from({ length: 8 }, (_, i) => collectEnglish([{ ...draft, english: i % 2 ? 'Attention' : 'attention' }], `new-request-${i}`)));
  entries = await listEnglish();
  assert.equal(entries[0].collectionCount, 9);
  assert.equal(entries[0].sources.length, 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'english-notebook.json'), 'utf8')).entries[0].collectionCount, 9);
  assert.equal(fs.statSync(path.join(dir, 'english-notebook.json')).mode & 0o777, 0o600);
});

test('an original sentence can span two PDF pages and retains its starting page', () => {
  const split = '=== Page 1 ===\nWe propose a novel architecture\n=== Page 2 ===\nbased on attention.';
  const [entry] = validateDrafts([raw], paper, split);
  assert.equal(entry.source.page, 1);
  assert.equal(entry.source.exampleEn, raw.exampleEn);
});

test('learned state survives repeated collection; delete and undo preserve sources and counts', async () => {
  const entry = (await listEnglish())[0];
  await patchEnglish(entry.id, { learned: true });
  await collectEnglish([draft], 'later-collection');
  assert.equal((await listEnglish())[0].learned, true);
  await patchEnglish(entry.id, { deleted: true });
  assert.equal((await listEnglish()).length, 0);
  await patchEnglish(entry.id, { deleted: false });
  assert.equal((await listEnglish())[0].collectionCount, 10);
  await patchEnglish(entry.id, { learned: false });
  assert.equal((await listEnglish())[0].learned, false);
});

test('unverifiable additions and a damaged notebook do not overwrite existing vocabulary', async () => {
  const file = path.join(dir, 'english-notebook.json'), original = fs.readFileSync(file, 'utf8');
  await assert.rejects(collectEnglish([{ ...draft, source: { ...draft.source, exampleEn: 'Invented.' } }], 'invalid-request'), /无法核对/);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  fs.writeFileSync(file, '{broken');
  await assert.rejects(collectEnglish([draft], 'another-request'), /原文件已保留/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  fs.writeFileSync(file, original);
  assert.deepEqual(parseEnglishJSON('```json\n{"entries": []}\n```'), { entries: [] });
});
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
