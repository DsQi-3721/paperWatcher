// Locates a quote from the AI's answer in the paper's text, tolerating the usual PDF extraction noise
// (ligatures, hyphenation, missing or extra spaces, curly quotes, math glyphs).
import type { PageText } from '../pdf/textmodel';
import type { TextRange } from '../types';

interface Squashed { s: string; map: Int32Array }

const cache = new WeakMap<PageText, Squashed>();

function squash(text: string): Squashed {
  // NFKC can change lengths, so normalize char by char and keep a map back to the original offsets.
  let s = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i].normalize('NFKC').toLowerCase();
    for (const c of ch) {
      if (/[\p{L}\p{N}]/u.test(c)) { s += c; map.push(i); }
    }
  }
  return { s, map: Int32Array.from(map) };
}

function squashPage(pt: PageText) {
  let sq = cache.get(pt);
  if (!sq) { sq = squash(pt.text); cache.set(pt, sq); }
  return sq;
}

function squashQuery(q: string) {
  return squash(q.replace(/[“”"'‘’`]/g, '')).s;
}

/** Best location of `quote` in the paper, searching the hinted page first. */
export function findQuote(texts: Array<PageText | undefined>, quote: string, pageHint?: number): TextRange | null {
  const q = squashQuery(quote);
  if (q.length < 4) return null;
  const order: number[] = [];
  const n = texts.length;
  if (pageHint !== undefined && pageHint >= 0 && pageHint < n) order.push(pageHint, pageHint - 1, pageHint + 1);
  for (let i = 0; i < n; i++) order.push(i);
  const seen = new Set<number>();
  const pages = order.filter((p) => p >= 0 && p < n && !seen.has(p) && (seen.add(p), true));

  // 1. exact (squashed) match
  for (const p of pages) {
    const pt = texts[p];
    if (!pt) continue;
    const sq = squashPage(pt);
    const k = sq.s.indexOf(q);
    if (k >= 0) return { page: p, start: sq.map[k], end: sq.map[k + q.length - 1] + 1 };
  }
  // 2. fuzzy: vote with 8-char shingles, then take the densest window
  const K = q.length > 40 ? 8 : 5;
  if (q.length < K + 2) return null;
  const shingles = new Map<string, number>();
  for (let i = 0; i + K <= q.length; i += 2) shingles.set(q.slice(i, i + K), i);
  let best: { page: number; start: number; end: number; score: number } | null = null;
  for (const p of pages) {
    const pt = texts[p];
    if (!pt) continue;
    const sq = squashPage(pt);
    const hits: Array<[number, number]> = [];
    for (const [sh, qi] of shingles) {
      let k = sq.s.indexOf(sh);
      let guard = 0;
      while (k >= 0 && guard++ < 8) {
        hits.push([k - qi, k]);
        k = sq.s.indexOf(sh, k + 1);
      }
    }
    if (!hits.length) continue;
    // cluster by implied start offset
    hits.sort((a, b) => a[0] - b[0]);
    let i = 0;
    while (i < hits.length) {
      let j = i;
      while (j + 1 < hits.length && hits[j + 1][0] - hits[i][0] < q.length * 0.25 + 6) j++;
      const score = j - i + 1;
      if (!best || score > best.score) {
        const first = Math.min(...hits.slice(i, j + 1).map((x) => x[1]));
        const last = Math.max(...hits.slice(i, j + 1).map((x) => x[1])) + K;
        best = { page: p, start: sq.map[Math.max(0, first)], end: sq.map[Math.min(sq.map.length - 1, last - 1)] + 1, score };
      }
      i = j + 1;
    }
  }
  if (best && best.score >= Math.max(2, shingles.size * 0.35)) return { page: best.page, start: best.start, end: best.end };
  return null;
}
