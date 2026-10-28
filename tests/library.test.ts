// Sorting the library by itself (src/library/facets.ts): groups for papers and books, years from arXiv numbers,
// topics from titles, authors met more than once, tags.
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorName, bookSections, cleanTag, findGroup, matches, paperSections, paperWords, paperYear, tagCounts, topicsOf } from '../src/library/facets.ts';
import type { PaperMeta } from '../src/types.ts';
import type { BookMeta } from '../src/books/types.ts';

const NOW = Date.UTC(2026, 9, 28);
const P = (x: Partial<PaperMeta>): PaperMeta => ({ id: x.title || 'x', title: '', addedAt: NOW - 100 * 86_400_000, ...x }) as PaperMeta;
const papers: PaperMeta[] = [
  P({ title: 'Attention Is All You Need', arxivId: '1706.03762', authors: ['Vaswani, Ashish', 'Shazeer, Noam'], openedAt: NOW - 86_400_000, notes: 3, tags: ['Transformers', 'must-read'], field: 'cs.CL' }),
  P({ title: 'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding', arxivId: '1810.04805', authors: ['Jacob Devlin', 'Ashish Vaswani'], tags: ['transformers'], field: 'cs.CL' }),
  P({ title: 'Denoising Diffusion Probabilistic Models', arxivId: '2006.11239', authors: ['Jonathan Ho'], addedAt: NOW - 3 * 86_400_000 }),
  P({ title: 'Mamba: Linear-Time Sequence Modeling with Selective State Spaces', year: 2023, openedAt: NOW - 200 * 86_400_000 }),
  P({ title: 'Some Old Paper', arxivId: 'cs/9901001' }),
];

test('years come from the record or the arXiv number (new and old style)', () => {
  assert.equal(paperYear({ arxivId: '1706.03762' }), 2017);
  assert.equal(paperYear({ arxivId: '2312.00752v2' }), 2023);
  assert.equal(paperYear({ arxivId: 'cs/9901001' }), 1999);
  assert.equal(paperYear({ arxivId: 'math.OC/0501001' }), 2005);
  assert.equal(paperYear({ year: 2019, arxivId: '1706.03762' }), 2019);
  assert.equal(paperYear({}), undefined);
});

test('topics are read off titles', () => {
  assert.deepEqual(topicsOf('Attention Is All You Need'), ['Transformer · 注意力']);
  assert.ok(topicsOf('Denoising Diffusion Probabilistic Models').includes('扩散 · 生成模型'));
  assert.ok(topicsOf('Mamba: Linear-Time Sequence Modeling with Selective State Spaces').includes('序列 · 状态空间'));
  assert.ok(topicsOf('Towards Deep Learning Models Resistant to Adversarial Attacks').includes('鲁棒 · 安全'));
  assert.deepEqual(topicsOf('关于某个问题的研究'), []);
});

test('paper groups: smart groups, tags (case folded), field, topics, years, authors seen twice', () => {
  const s = paperSections(papers, NOW);
  const g = (k: string) => findGroup(s, k);
  assert.equal(g('all')!.n, 5);
  assert.equal(g('unread')!.n, 3);
  assert.equal(g('notes')!.n, 1);
  assert.equal(g('new')!.n, 1);
  assert.equal(g('cold')!.n, 1);
  assert.equal(g('tag:transformers')!.n, 2, 'Transformers and transformers are one tag');
  assert.equal(g('tag:must-read')!.n, 1);
  assert.equal(g('tag:-')!.n, 3);
  assert.equal(g('field:cs.CL')!.n, 2);
  assert.match(g('field:cs.CL')!.label, /计算语言学/);
  assert.equal(g('year:2017')!.n, 1);
  assert.equal(g('year:2023')!.n, 1);
  assert.equal(g('year:1999')!.n, 1);
  assert.equal(g('author:ashish vaswani')!.n, 2, "'Vaswani, Ashish' and 'Ashish Vaswani' are one author");
  assert.equal(g('author:jonathan ho'), null, 'an author met once is not a group');
  assert.equal(g('topic:Transformer · 注意力')!.n, 2);
});

test('search words: title, authors (either way round), #tags, arXiv number, field, year', () => {
  const w = paperWords(papers[0]);
  for (const q of ['attention need', 'ashish vaswani', '#must-read', 'must', '1706.03762', '计算语言学', '2017', 'transformer']) assert.ok(matches(w, q), q);
  assert.ok(!matches(w, 'diffusion'));
});

test('tags: cleaned like the server, counted, most used first', () => {
  assert.equal(cleanTag('  #  深度  学习 '), '深度 学习');
  assert.equal(cleanTag('#'.repeat(3) + 'x'.repeat(40)).length, 24);
  assert.deepEqual(tagCounts(papers, (m) => m.tags).map((x) => [x.tag, x.n]), [['Transformers', 2], ['must-read', 1]]);
  assert.equal(authorName('He, Kaiming'), 'Kaiming He');
});

test('book groups: how far read, kinds, languages, authors', () => {
  const B = (x: Partial<BookMeta>): BookMeta => ({ id: x.title || 'b', title: '', format: 'epub', kind: 'flow', addedAt: NOW - 30 * 86_400_000, ...x }) as BookMeta;
  const books = [
    B({ title: '三体', author: '刘慈欣', lang: 'zh-CN', progress: { chapter: 9, offset: 0, percent: 0.99, at: NOW }, tags: ['科幻'] }),
    B({ title: '球状闪电', author: '刘慈欣', lang: 'zh', progress: { chapter: 2, offset: 0, percent: 0.3, at: NOW } }),
    B({ title: 'Alice', author: 'Lewis Carroll', lang: 'en', format: 'azw3' }),
    B({ title: '漫画', format: 'cbz', kind: 'fixed', bookmarks: [{ chapter: 0, offset: 3, text: '', at: NOW }] }),
  ];
  const s = bookSections(books, NOW), g = (k: string) => findGroup(s, k);
  assert.equal(g('unread')!.n, 2);
  assert.equal(g('reading')!.n, 1);
  assert.equal(g('done')!.n, 1);
  assert.equal(g('marks')!.n, 1);
  assert.equal(g('kind:小说 · 文字')!.n, 3);
  assert.equal(g('kind:漫画')!.n, 1);
  assert.equal(g('lang:zh')!.n, 2);
  assert.equal(g('lang:zh')!.label, '中文');
  assert.equal(g('author:刘慈欣')!.n, 2);
  assert.equal(g('tag:科幻')!.n, 1);
});
