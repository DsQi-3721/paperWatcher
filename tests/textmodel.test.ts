import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PageText } from '../src/pdf/textmodel.ts';

const pageWith = (text: string) => {
  const pt = new PageText(0, 600, 800);
  pt.text = text;
  return pt;
};

test('a word hyphenated across a line break is one word (and does not recurse forever)', () => {
  const pt = pageWith('the atten-\ntion layer');
  const i = pt.text.indexOf('atten');
  assert.deepEqual(pt.wordAt(i), [4, 15]);
  assert.deepEqual(pt.wordAt(pt.text.indexOf("tion")), [4, 15]);
  assert.equal(pt.slice(4, 15), "attention");
});

test('plain words and spaces', () => {
  const pt = pageWith('self attention layer');
  assert.deepEqual(pt.wordAt(6), [5, 14]);
  assert.deepEqual(pt.wordAt(4), [5, 14]); // on a space: snaps to the next word
});
