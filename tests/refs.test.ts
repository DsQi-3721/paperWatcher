import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findQuote } from '../src/notes/refs.ts';

const page = (text: string) => ({ text }) as any;

test('finds quotes despite hyphenation, ligatures and spacing', () => {
  const texts = [page('Intro text.\n'), page('We scale the dot prod-\nucts by 1/√dk to counteract this efﬁciently.\n')];
  const hit = findQuote(texts, 'we scale the dot products by', 1);
  assert.ok(hit);
  assert.equal(hit!.page, 1);
  assert.equal(texts[1].text.slice(hit!.start, hit!.end).replace(/\s+/g, ' '), 'We scale the dot prod- ucts by');
  const lig = findQuote(texts, 'counteract this efficiently');
  assert.ok(lig && lig.page === 1);
});

test('fuzzy match when the model paraphrases a little', () => {
  const texts = [page('The Transformer allows for significantly more parallelization and can reach a new state of the art in translation quality.')];
  const hit = findQuote(texts, 'allows significantly more parallelization and can reach a new state of the art');
  assert.ok(hit);
});

test('no match for text that is not there', () => {
  assert.equal(findQuote([page('Completely different content about cats.')], 'quantum chromodynamics lattice'), null);
});
