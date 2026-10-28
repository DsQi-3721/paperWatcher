import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arxivIdFromUrl, knownHostPdf } from '../server/resolve.ts';

test('arXiv ids from many link shapes', () => {
  assert.equal(arxivIdFromUrl(new URL('https://arxiv.org/abs/1706.03762v7')), '1706.03762v7');
  assert.equal(arxivIdFromUrl(new URL('https://arxiv.org/pdf/2310.06825.pdf')), '2310.06825');
  assert.equal(arxivIdFromUrl(new URL('https://arxiv.org/html/2401.04088v1')), '2401.04088v1');
  assert.equal(arxivIdFromUrl(new URL('https://huggingface.co/papers/2305.18290')), '2305.18290');
  assert.equal(arxivIdFromUrl(new URL('https://arxiv.org/abs/hep-th/9901001')), 'hep-th/9901001');
  assert.equal(arxivIdFromUrl(new URL('https://huggingface.co/models')), null);
});

test('known hosts map to their PDF urls', () => {
  assert.equal(knownHostPdf(new URL('https://openreview.net/forum?id=abc123')), 'https://openreview.net/pdf?id=abc123');
  assert.equal(knownHostPdf(new URL('https://aclanthology.org/2023.acl-long.1/')), 'https://aclanthology.org/2023.acl-long.1.pdf');
  assert.equal(knownHostPdf(new URL('https://proceedings.mlr.press/v202/kim23a.html')), 'https://proceedings.mlr.press/v202/kim23a/kim23a.pdf');
  assert.equal(knownHostPdf(new URL('https://github.com/a/b/blob/main/paper.pdf')), 'https://raw.githubusercontent.com/a/b/main/paper.pdf');
});
