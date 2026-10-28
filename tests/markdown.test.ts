import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseReply, replyToPlain } from '../src/ink/markdown.ts';

test('extracts the margin gist and refs', () => {
  const p = parseReply('Scaling keeps softmax sane: <ref page="4">we scale the dot products by</ref>.\n\n<margin>scale or saturate</margin>');
  assert.equal(p.margin, 'scale or saturate');
  assert.equal(p.refs.length, 1);
  assert.equal(p.refs[0].page, 4);
  assert.equal(p.refs[0].quote, 'we scale the dot products by');
  assert.equal(p.blocks.length, 1);
});

test('holds back unfinished constructs while streaming', () => {
  const a = parseReply('Look at <ref page="2">the encoder sta', true);
  assert.equal(a.refs.length, 0);
  const text = JSON.stringify(a.blocks);
  assert.ok(!text.includes('encoder'), 'half-written ref must not show');
  const b = parseReply('The cost is $O(n^2', true);
  assert.ok(!JSON.stringify(b.blocks).includes('O(n'), 'open inline math is held back');
  const c = parseReply('This is **important', true);
  assert.ok(!JSON.stringify(c.blocks).includes('**'), 'dangling bold marker dropped');
  const d = parseReply('Half a wo', true);
  assert.ok(!JSON.stringify(d.blocks).includes('wo"'), 'trailing partial word held back');
});

test('lists, headings, display math and inline styles', () => {
  const p = parseReply('## Idea\n\n- **first** item\n- second with `code`\n\n$$a^2+b^2=c^2$$\n\nInline $x_i$ here.');
  assert.deepEqual(p.blocks.map((b) => b.t), ['h', 'li', 'li', 'math', 'p']);
  const li = p.blocks[1] as any;
  assert.equal(li.inl[0].b, true);
  const para = p.blocks[4] as any;
  assert.equal(para.inl[1].t, 'math');
});

test('plain text export keeps quotes with pages', () => {
  assert.equal(replyToPlain('See <ref page="3">the residual</ref>.<margin>m</margin>'), 'See “the residual” (p.3).');
});
