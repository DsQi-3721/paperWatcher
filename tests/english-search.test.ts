import test from 'node:test';
import assert from 'node:assert/strict';
import { findText } from '../src/english/search.ts';

test('PDF search handles case, whole words, regex characters, ligatures and original offsets', () => {
  const text = 'Attention and attention. attentional. a+b [x] efﬁcient';
  assert.equal(findText(text, 'attention').length, 3);
  assert.equal(findText(text, 'attention', { wholeWord: true }).length, 2);
  assert.equal(findText(text, 'Attention', { caseSensitive: true }).length, 1);
  for (const term of ['a+b', '[x]', 'efficient']) {
    const [hit] = findText(text, term);
    assert.ok(hit);
    assert.equal(text.slice(hit.start, hit.end).normalize('NFKC'), term);
  }
});
test('PDF search spans whitespace, line breaks and hyphenated line wraps without losing highlight offsets', () => {
  const text = 'A multi-\n  dimensional \n\t representation and self-attention.';
  const [hit] = findText(text, 'multidimensional representation');
  assert.equal(text.slice(hit.start, hit.end), 'multi-\n  dimensional \n\t representation');
  assert.equal(findText(text, 'self-attention').length, 1);
  assert.equal(findText(text, '').length, 0);
  assert.equal(findText(text, 'absent').length, 0);
  assert.equal(findText('a a a a', 'a', { limit: 2 }).length, 2);
});
