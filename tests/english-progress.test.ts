import test from 'node:test';
import assert from 'node:assert/strict';
import { EnglishEntryStream, extractEnglishEntries } from '../server/ai/english-stream.ts';
import { englishCount, validateDrafts } from '../server/english.ts';
import { englishApi } from '../src/english/api.ts';
import type { EnglishDraft } from '../src/english/types.ts';

const paper = { id: '0123456789abcdef', title: 'Progress test' };
const raw = (i: number) => ({ kind: 'word', english: `term${i}`, chinese: `术语${i}`, meaningEn: 'A technical expression.', meaningZh: '专业表达。', exampleEn: `We use term${i} in our model.`, exampleZh: `我们在模型中使用术语${i}。` });
const text = '=== Page 1 ===\n' + Array.from({ length: 75 }, (_, i) => raw(i).exampleEn).join(' ');

test('count accepts arbitrary positive integers instead of clamping to 30–50', () => {
  for (const n of [1, 7, 23, 51, 65, 500, 10_000]) { assert.equal(englishCount(n), n); assert.equal(englishCount(String(n)), n); }
  for (const value of [0, -1, 1.5, Infinity, NaN, '', '1.2', 'abc', null, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => englishCount(value), /大于 0 的整数/);
});

test('streaming parser emits complete entries before the document ends, handling escaped quotes and braces', () => {
  const entry = { ...raw(0), meaningEn: 'Use "a {brace}" and \\ paths, not "]"; 中文 👩‍🔬.' };
  const payload = JSON.stringify({ entries: [entry, raw(1)], exhausted: false });
  const parser = new EnglishEntryStream();
  const cut = payload.indexOf('},{') + 1;
  const first: unknown[] = [];
  for (let i = 0; i < cut; i += 3) first.push(...parser.feed(payload.slice(i, Math.min(i + 3, cut))));
  assert.deepEqual(first, [entry]);
  assert.deepEqual(parser.feed(payload.slice(cut)), [raw(1)]);
  assert.deepEqual(parser.feed('\n'), []);
  const incomplete = new EnglishEntryStream();
  assert.deepEqual(incomplete.feed('{"entries":[{"english":"unfinished'), []);
});

test('65 requested entries are streamed and validated across batches without a hidden 50-item cutoff', async () => {
  let next = 0; const sizes: number[] = [], counts: number[] = [], phases: number[] = [];
  const entries = await extractEnglishEntries({ count: 65, query: '', paper, text, signal: new AbortController().signal,
    onBatch: (n) => phases.push(n), onEntry: (_e, n) => counts.push(n),
    generate: async (message, emit) => {
      const size = Number(/^Select (\d+)/.exec(message)![1]); sizes.push(size);
      const entries = Array.from({ length: size }, () => raw(next++)); entries.forEach(emit);
      assert.equal(counts.length, next, 'progress arrives before generate resolves');
      return { entries, exhausted: false };
    },
  });
  assert.deepEqual(sizes, [20, 20, 20, 5]);
  assert.deepEqual(phases, [1, 2, 3, 4]);
  assert.equal(entries.length, 65);
  assert.equal(validateDrafts(entries, paper, text).length, 65);
  assert.deepEqual(counts, Array.from({ length: 65 }, (_, i) => i + 1));
});

test('small goals finish in one batch; exhausted queries and duplicate entries do not inflate progress', async () => {
  let calls = 0;
  const run = (count: number, entries: unknown[]) => extractEnglishEntries({ count, query: 'targeted terms', paper, text, signal: new AbortController().signal,
    onBatch: () => {}, onEntry: () => {}, generate: async (_m, emit) => { calls++; entries.forEach(emit); return { entries, exhausted: true }; } });
  assert.equal((await run(1, [raw(0)])).length, 1); assert.equal(calls, 1);
  assert.equal((await run(99, [raw(0), raw(0), { ...raw(1), exampleEn: 'Invented example.' }, raw(2)])).length, 2);
  assert.equal(calls, 2);
  await assert.rejects(extractEnglishEntries({ count: 7, query: '', paper, text, signal: AbortSignal.abort(), onBatch: () => {}, onEntry: () => {}, generate: async () => { throw new Error('must not run'); } }), { name: 'AbortError' });
});

test('client collection splits large notebooks into safe requests using one retry-safe collection id', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: any[] = [], progress: number[] = [];
  globalThis.fetch = async (_url, init) => { const body = JSON.parse(String(init!.body)); bodies.push(body); return Response.json(body.entries); };
  try {
    const drafts = validateDrafts(Array.from({ length: 65 }, (_, i) => raw(i)), paper, text);
    const saved = await englishApi.collect(drafts, 'one-collection-request', (n) => progress.push(n));
    assert.equal(saved.length, 65); assert.deepEqual(bodies.map((b) => b.entries.length), [50, 15]);
    assert.ok(bodies.every((b) => b.collectionId === 'one-collection-request'));
    assert.deepEqual(progress, [50, 65]);
  } finally { globalThis.fetch = originalFetch; }
});

test('client receives live entries and progress, but interrupted responses still report failure', async () => {
  const originalFetch = globalThis.fetch;
  const [entry] = validateDrafts([raw(0)], paper, text);
  const events = [{ type: 'progress', phase: 'waiting', text: 'Analyzing', target: 7, completed: 0 }, { type: 'entry', entry }, { type: 'progress', phase: 'generating', text: 'Writing', target: 7, completed: 1 }];
  globalThis.fetch = async () => new Response(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  const seen: EnglishDraft[] = [], phases: string[] = [];
  try {
    await assert.rejects(englishApi.generate({}, new AbortController().signal, (p) => phases.push(p.phase), (e) => seen.push(e)), /连接中断/);
    assert.deepEqual(seen, [entry]); assert.deepEqual(phases, ['waiting', 'generating']);
  } finally { globalThis.fetch = originalFetch; }
});
