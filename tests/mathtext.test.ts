import assert from 'node:assert/strict';
import { test } from 'node:test';
import { texToUnicode } from '../src/ink/mathtext.ts';

test('simple formulas become unicode', () => {
  assert.equal(texToUnicode('\\sqrt{d_k}'), '√dₖ');
  assert.equal(texToUnicode('x^2'), 'x²');
  assert.equal(texToUnicode('\\alpha + \\beta'), 'α + β');
  assert.equal(texToUnicode('\\mathbb{R}^n'), 'ℝⁿ');
  assert.equal(texToUnicode('O(n^2 \\cdot d)'), 'O(n² · d)');
  assert.equal(texToUnicode('QK^T'), 'QKᵀ');
});

test('rich formulas are left to KaTeX', () => {
  assert.equal(texToUnicode('\\begin{pmatrix}a&b\\end{pmatrix}'), null);
  assert.equal(texToUnicode('\\sqrt[3]{x}'), null);
});
