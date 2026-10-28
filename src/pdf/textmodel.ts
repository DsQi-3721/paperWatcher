// Page text as a precise, selectable model: one box per character (page points, top-left origin),
// lines in reading order, paragraphs with a kind (body / heading / caption / equation …), and
// word / sentence boundaries. Selection, AI context and quote matching are all built on this.
import type { PDFPageProxy } from 'pdfjs-dist';
import type { Rect } from '../util/geom';

export interface TLine {
  start: number;      // first char index
  end: number;        // one past the last char (the '\n' after it is at `end`)
  x0: number; y0: number; x1: number; y1: number;
  base: number;
  size: number;
  font: string;
  col: number;        // 0 = left column, 1 = right column, -1 = spans / single column
}

export type ParaKind = 'body' | 'heading' | 'caption' | 'equation' | 'list' | 'margin' | 'other';

export interface TPara {
  l0: number; l1: number;         // first/last line index (inclusive)
  start: number; end: number;     // char range
  x0: number; y0: number; x1: number; y1: number;
  kind: ParaKind;
}

interface Run {
  str: string;
  x: number; base: number; size: number; w: number;
  font: string; asc: number; desc: number;
  eol: boolean;
  adv: number[];   // advance per UTF-16 unit, already scaled to the run width
}

const MATH_RE = /[Ͱ-Ͽ←-⇿∀-⋿⌀-⏿⟀-⟯⦀-⧿⨀-⫿\u{1d400}-\u{1d7ff}∑∏∫√∞≤≥≈≠±×÷∂∇]/u;
const CAPTION_RE = /^\s*(figure|fig\.?|table|tab\.?|algorithm|alg\.?|listing)\s*([a-z]?\d+[a-z]?|[ivx]+)\s*[:.|]/i;
const HEADING_RE = /^\s*((\d+(\.\d+){0,3}\.?)|([IVX]+\.)|([A-H](\.\d+)*\.?))\s+[A-Z\p{Lu}]/u;
const NAMED_HEADING_RE = /^\s*(abstract|introduction|related work|background|method(s|ology)?|experiments?|results|discussion|conclusions?|references|bibliography|acknowledge?ments?|appendix|limitations|broader impact)\b/i;
const EQNUM_RE = /\(\s*(\d+[a-z]?|[A-Z]\.\d+)\s*\)\s*$/;

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
function ctx() {
  if (!measureCtx) {
    measureCtx = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(8, 8).getContext('2d')!
      : document.createElement('canvas').getContext('2d')!;
  }
  return measureCtx;
}

/** Character widths already measured, per canvas font: a page measures thousands of characters but only a few
 *  hundred different (font, character) pairs, and papers share most of them. Bounded; the same numbers as measuring
 *  every time (a font string the canvas would ignore is not cached: it is measured in the font in effect, as always). */
const widthCache = new Map<string, Map<string, number>>();
const fontAccepted = new Map<string, boolean>();
let widthCount = 0;
/** The font the measuring context has had since the last font it accepted (it is only set when something is measured). */
let fontInEffect: string | null = null;
let probeCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
const PROBE = '10px __pw_probe__';
function accepted(font: string) {
  let ok = fontAccepted.get(font);
  if (ok === undefined) {
    probeCtx ??= typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d')! : document.createElement('canvas').getContext('2d')!;
    probeCtx.font = PROBE;
    probeCtx.font = font;
    ok = probeCtx.font !== PROBE;
    fontAccepted.set(font, ok);
  }
  return ok;
}
function widthsFor(font: string) {
  let m = widthCache.get(font);
  if (!m) {
    if (widthCount > 40000 || widthCache.size > 400) { widthCache.clear(); fontAccepted.clear(); widthCount = 0; }
    m = new Map();
    widthCache.set(font, m);
  }
  return m;
}

function mul(m1: number[], m2: number[]) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export class PageText {
  text = '';
  boxes = new Float32Array(0);
  lines: TLine[] = [];
  paras: TPara[] = [];
  lineOf = new Int32Array(0);
  bodySize = 10;
  bodyFont = '';
  columns: Array<{ x0: number; x1: number }> = [];
  rotated: Array<{ text: string; rect: Rect }> = [];
  private grid = new Map<number, number[]>();
  private words: Int32Array | null = null;      // sorted word boundaries
  private wordLike: Uint8Array | null = null;

  constructor(public page: number, public w: number, public h: number) {}

  box(i: number): Rect {
    const b = this.boxes;
    return { x: b[i * 4], y: b[i * 4 + 1], w: b[i * 4 + 2] - b[i * 4], h: b[i * 4 + 3] - b[i * 4 + 1] };
  }

  /* ---------- hit testing ---------- */

  private cellKey(cx: number, cy: number) { return cy * 4096 + cx; }

  buildGrid() {
    this.grid.clear();
    const S = 16;
    this.lines.forEach((l, li) => {
      for (let cy = Math.floor(l.y0 / S); cy <= Math.floor(l.y1 / S); cy++)
        for (let cx = Math.floor(l.x0 / S); cx <= Math.floor(l.x1 / S); cx++) {
          const k = this.cellKey(cx, cy);
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(li);
        }
    });
  }

  /** Line under the point (with a little slack), or -1. */
  lineAt(x: number, y: number, slack = 2): number {
    const S = 16;
    const cands = new Set<number>();
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.grid.get(this.cellKey(Math.floor(x / S) + dx, Math.floor(y / S) + dy));
        if (arr) for (const li of arr) cands.add(li);
      }
    let best = -1, bestD = Infinity;
    for (const li of cands) {
      const l = this.lines[li];
      if (x < l.x0 - slack || x > l.x1 + slack || y < l.y0 - slack || y > l.y1 + slack) continue;
      const d = Math.abs(y - (l.y0 + l.y1) / 2);
      if (d < bestD) { bestD = d; best = li; }
    }
    return best;
  }

  /** Nearest line to a point, preferring lines in the same column. */
  nearestLine(x: number, y: number): number {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.lines.length; i++) {
      const l = this.lines[i];
      const dx = x < l.x0 ? l.x0 - x : x > l.x1 ? x - l.x1 : 0;
      const dy = y < l.y0 ? l.y0 - y : y > l.y1 ? y - l.y1 : 0;
      const d = dy * 1.0 + dx * 2.2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Caret offset (between characters) for a point on the page. */
  caretAt(x: number, y: number, strict = false): number {
    let li = this.lineAt(x, y);
    if (li < 0) {
      if (strict) return -1;
      li = this.nearestLine(x, y);
      if (li < 0) return -1;
      const l = this.lines[li];
      if (y < l.y0 && x < l.x0) return l.start;
      if (y > l.y1 && x > l.x1) return l.end;
    }
    const l = this.lines[li];
    if (x <= l.x0) return l.start;
    if (x >= l.x1) return l.end;
    const b = this.boxes;
    for (let i = l.start; i < l.end; i++) {
      const mid = (b[i * 4] + b[i * 4 + 2]) / 2;
      if (x < mid) return i;
    }
    return l.end;
  }

  /** Char index whose box contains the point (strict), or -1. */
  charAt(x: number, y: number): number {
    const li = this.lineAt(x, y, 1);
    if (li < 0) return -1;
    const l = this.lines[li];
    const b = this.boxes;
    for (let i = l.start; i < l.end; i++) if (x >= b[i * 4] - 0.5 && x <= b[i * 4 + 2] + 0.5) return i;
    return -1;
  }

  /* ---------- units ---------- */

  private ensureWords() {
    if (this.words) return;
    const seg = new Intl.Segmenter(undefined, { granularity: 'word' });
    const bounds: number[] = [];
    const like: number[] = [];
    for (const s of seg.segment(this.text)) {
      bounds.push(s.index);
      like.push(s.isWordLike ? 1 : 0);
    }
    bounds.push(this.text.length);
    this.words = Int32Array.from(bounds);
    this.wordLike = Uint8Array.from(like);
  }

  /** Word segment around char i, without joining hyphenated line breaks. */
  private rawWordAt(i: number): [number, number] {
    this.ensureWords();
    const w = this.words!;
    let lo = 0, hi = w.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (w[mid] <= i) lo = mid; else hi = mid - 1;
    }
    let k = lo;
    if (!this.wordLike![k]) {
      if (k + 1 < this.wordLike!.length && this.wordLike![k + 1] && /\s/.test(this.text[i] || '')) k = k + 1;
      else if (k > 0 && this.wordLike![k - 1]) k = k - 1;
    }
    return [w[k], w[k + 1]];
  }

  /** [start, end) of the word around char i (snaps to a neighbouring word on spaces/punctuation);
   *  a word hyphenated across a line break ("atten-\ntion") counts as one word. */
  wordAt(i: number): [number, number] {
    let [s, e] = this.rawWordAt(i);
    if (this.text[e] === '-' && this.text[e + 1] === '\n' && e + 2 < this.text.length) e = Math.max(e, this.rawWordAt(e + 2)[1]);
    if (this.text[s - 1] === '\n' && this.text[s - 2] === '-' && s >= 3) s = Math.min(s, this.rawWordAt(s - 3)[0]);
    return [s, e];
  }

  paraIndexAt(i: number): number {
    let lo = 0, hi = this.paras.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.paras[mid].start <= i) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  sentenceAt(i: number): [number, number] {
    const p = this.paras[this.paraIndexAt(i)];
    if (!p) return [i, i];
    const src = this.text.slice(p.start, p.end).replace(/\n/g, ' ');
    const seg = new Intl.Segmenter('en', { granularity: 'sentence' });
    const cuts: number[] = [];
    for (const s of seg.segment(src)) cuts.push(s.index);
    cuts.push(src.length);
    // Undo breaks after abbreviations and initials ("Fig. 3", "et al. (2020)", "J. Smith").
    const merged: number[] = [cuts[0]];
    for (let k = 1; k < cuts.length - 1; k++) {
      const before = src.slice(Math.max(0, cuts[k] - 12), cuts[k]).trimEnd();
      if (/(\b(fig|figs|eq|eqs|sec|secs|tab|ref|refs|al|e\.g|i\.e|cf|vs|etc|resp|approx|no|vol|pp|thm|lem|def|prop|cor|app|alg|ch|ca|dr|prof|mr|ms)\.|\b[A-Z]\.)$/i.test(before)) continue;
      merged.push(cuts[k]);
    }
    merged.push(src.length);
    const rel = i - p.start;
    for (let k = 0; k < merged.length - 1; k++) {
      if (rel >= merged[k] && rel < merged[k + 1]) {
        let s = p.start + merged[k], e = p.start + merged[k + 1];
        while (e > s && /\s/.test(this.text[e - 1])) e--;
        return [s, e];
      }
    }
    return [p.start, p.end];
  }

  /* ---------- geometry & text of a range ---------- */

  /** One rectangle per line covered by [s, e). */
  rangeRects(s: number, e: number): Rect[] {
    const out: Rect[] = [];
    if (e <= s) return out;
    const b = this.boxes;
    const l0 = this.lineOf[Math.max(0, Math.min(s, this.lineOf.length - 1))];
    for (let li = Math.max(0, l0); li < this.lines.length; li++) {
      const l = this.lines[li];
      if (l.start >= e) break;
      if (l.end <= s) continue;
      const a = Math.max(s, l.start), z = Math.min(e, l.end) - 1;
      if (z < a) continue;
      const x0 = b[a * 4], x1 = b[z * 4 + 2];
      out.push({ x: x0, y: l.y0, w: Math.max(1, x1 - x0), h: l.y1 - l.y0 });
    }
    return out;
  }

  /** Clean text of a range: hyphenation across line ends undone, line breaks become spaces. */
  slice(s: number, e: number): string {
    return cleanText(this.text.slice(s, e));
  }

  /** The paragraph(s) around a range with the selection wrapped in ⟦ ⟧ — context for the AI. */
  context(s: number, e: number, maxLen = 2400): string {
    const p0 = this.paras[this.paraIndexAt(s)], p1 = this.paras[this.paraIndexAt(Math.max(s, e - 1))];
    let a = p0.start, z = p1.end;
    // Small paragraphs (a heading, a one-line caption) get their neighbours too.
    if (z - a < 400) {
      const i0 = this.paraIndexAt(s), i1 = this.paraIndexAt(Math.max(s, e - 1));
      if (i0 > 0) a = this.paras[i0 - 1].start;
      if (i1 + 1 < this.paras.length) z = this.paras[i1 + 1].end;
    }
    const before = this.text.slice(a, s), sel = this.text.slice(s, e), after = this.text.slice(e, z);
    let out = cleanText(before) + ' ⟦' + cleanText(sel) + '⟧ ' + cleanText(after);
    if (out.length > maxLen) {
      const i = out.indexOf('⟦');
      const j = out.indexOf('⟧');
      const room = Math.max(200, (maxLen - (j - i)) / 2);
      out = (i > room ? '… ' : '') + out.slice(Math.max(0, i - room), Math.min(out.length, j + room)) + (j + room < out.length ? ' …' : '');
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  /** Text fully inside a rectangle (for region selections), in reading order. */
  textInRect(r: Rect): string {
    const parts: string[] = [];
    const b = this.boxes;
    for (const l of this.lines) {
      if (l.y1 < r.y || l.y0 > r.y + r.h || l.x1 < r.x || l.x0 > r.x + r.w) continue;
      let line = '';
      for (let i = l.start; i < l.end; i++) {
        const cx = (b[i * 4] + b[i * 4 + 2]) / 2, cy = (b[i * 4 + 1] + b[i * 4 + 3]) / 2;
        if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) line += this.text[i];
      }
      if (line.trim()) parts.push(line.trim());
    }
    for (const t of this.rotated) {
      const c = { x: t.rect.x + t.rect.w / 2, y: t.rect.y + t.rect.h / 2 };
      if (c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h) parts.push(t.text);
    }
    return cleanText(parts.join('\n'));
  }

  /** Lines overlapping a rect. */
  linesIn(r: Rect): number[] {
    const out: number[] = [];
    this.lines.forEach((l, i) => {
      if (l.x1 > r.x && l.x0 < r.x + r.w && l.y1 > r.y && l.y0 < r.y + r.h) out.push(i);
    });
    return out;
  }

  /** Plain text of the page for the AI's paper.txt. */
  plain(): string {
    const out: string[] = [];
    for (const p of this.paras) {
      if (p.kind === 'margin') continue;
      const t = this.slice(p.start, p.end);
      if (!t) continue;
      out.push(p.kind === 'heading' ? `\n## ${t}` : t);
    }
    return out.join('\n\n');
  }

  mathiness(li: number) {
    const l = this.lines[li];
    const s = this.text.slice(l.start, l.end);
    let m = 0;
    for (const ch of s) if (MATH_RE.test(ch)) m++;
    return m / Math.max(1, s.replace(/\s/g, '').length);
  }
}

export function cleanText(s: string) {
  return s
    .replace(/([A-Za-zÀ-ɏ])-\n(?=[a-zß-ÿ])/g, '$1')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .trim();
}

export async function buildPageText(page: PDFPageProxy, pageIndex: number): Promise<PageText> {
  const vp = page.getViewport({ scale: 1 });
  const pt = new PageText(pageIndex, vp.width, vp.height);
  const tc = await page.getTextContent();
  const styles = tc.styles as Record<string, { fontFamily: string; ascent: number; descent: number; vertical?: boolean }>;
  const c = ctx();

  const runs: Run[] = [];
  for (const it of tc.items as any[]) {
    if (!('str' in it)) continue;
    if (!it.str) {
      if (it.hasEOL && runs.length) runs[runs.length - 1].eol = true;
      continue;
    }
    const m = mul(vp.transform, it.transform);
    const size = Math.hypot(m[2], m[3]);
    const angle = Math.atan2(m[1], m[0]);
    const st = styles[it.fontName] || { fontFamily: 'serif', ascent: 0.8, descent: -0.2 };
    if (Math.abs(angle) > 0.08 || st.vertical) {
      const w = it.width, h = size;
      pt.rotated.push({
        text: it.str,
        rect: Math.abs(Math.abs(angle) - Math.PI / 2) < 0.2
          ? { x: m[4] - h, y: m[5] - w, w: h * 1.2, h: w }
          : { x: m[4], y: m[5] - h, w, h },
      });
      continue;
    }
    if (size < 0.5 || it.width <= 0) continue;
    // Per-character advances: measure in a similar generic face, then scale to the run's true width.
    const font = `${Math.max(1, size).toFixed(2)}px ${st.fontFamily || 'serif'}`;
    const ok = accepted(font);
    if (ok) fontInEffect = font;
    const known = ok ? widthsFor(font) : null;
    let fontSet = false;
    const units: number[] = [];
    let total = 0;
    for (let i = 0; i < it.str.length; i++) {
      const code = it.str.charCodeAt(i);
      if (code >= 0xdc00 && code <= 0xdfff) { units.push(0); continue; }
      const ch = code >= 0xd800 && code <= 0xdbff ? it.str.slice(i, i + 2) : it.str[i];
      let raw = known?.get(ch);
      if (raw === undefined) {
        if (!fontSet) { if (fontInEffect !== null) c.font = fontInEffect; fontSet = true; }
        raw = c.measureText(ch).width;
        if (known) { known.set(ch, raw); widthCount++; }
      }
      const wch = Math.max(0.05, raw);
      units.push(wch);
      total += wch;
    }
    const k = total > 0 ? it.width / total : 1;
    const asc = st.ascent && st.ascent > 0.3 ? st.ascent : 0.8;
    const desc = st.descent && st.descent < 0 ? -st.descent : 0.2;
    runs.push({ str: it.str, x: m[4], base: m[5], size, w: it.width, font: it.fontName, asc, desc, eol: !!it.hasEOL, adv: units.map((u) => u * k) });
  }

  /* --- group runs into lines --- */
  interface LB { runs: Run[]; base: number; size: number; x1: number }
  const lbs: LB[] = [];
  let cur: LB | null = null;
  for (const r of runs) {
    if (cur) {
      const dy = Math.abs(r.base - cur.base);
      const tol = 0.32 * Math.max(cur.size, r.size);
      const gap = r.x - cur.x1;
      const smallerScript = r.size < cur.size * 0.88 && r.base > cur.base - cur.size * 0.8 && r.base < cur.base + cur.size * 0.5;
      // A line that so far only holds a superscript (footnote mark, citation) adopts the first full-size run.
      const scriptOnly = cur.runs.every((x) => x.size < r.size * 0.88);
      const biggerJoins = scriptOnly && Math.abs(r.base - cur.base) < r.size * 0.8;
      const vOK = dy <= tol || smallerScript || biggerJoins;
      const eqNum = /^\s*\(\s*(\d+[a-z]?|[A-Z]\.\d+)\s*\)\s*$/.test(r.str) && dy <= tol;
      const hOK = gap > -cur.size * 0.6 && (gap < Math.max(cur.size, r.size) * 2.2 || (eqNum && gap < vp.width * 0.6));
      if (vOK && hOK) {
        cur.runs.push(r);
        if (biggerJoins && dy > tol) cur.base = r.base;
        if (!smallerScript) cur.size = Math.max(cur.size, r.size);
        cur.x1 = Math.max(cur.x1, r.x + r.w);
        if (r.eol) cur = null;
        continue;
      }
    }
    cur = { runs: [r], base: r.base, size: r.size, x1: r.x + r.w };
    lbs.push(cur);
    if (r.eol) cur = null;
  }

  /* --- column detection & reading order --- */
  const pageMid = vp.width / 2;
  const lineBox = (lb: LB) => {
    let x0 = Infinity, x1 = -Infinity;
    for (const r of lb.runs) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); }
    return { x0, x1 };
  };
  const side = (lb: LB) => {
    const { x0, x1 } = lineBox(lb);
    if (x1 < pageMid + 6) return 0;
    if (x0 > pageMid - 6) return 1;
    return -1;
  };
  let left = 0, right = 0, switches = 0, prevSide = -2;
  for (const lb of lbs) {
    const sd = side(lb);
    if (sd === 0) left++;
    if (sd === 1) right++;
    if (sd >= 0 && prevSide >= 0 && sd !== prevSide) switches++;
    if (sd >= 0) prevSide = sd;
  }
  const twoCol = left > 8 && right > 8;
  let ordered = lbs;
  if (twoCol && switches > Math.min(left, right) * 0.4) {
    // Row-major stream (common in Word exports): rebuild column-major order within bands split by full-width lines.
    const bands: LB[][] = [[]];
    const sortedByY = [...lbs].sort((a, b) => a.base - b.base);
    for (const lb of sortedByY) {
      if (side(lb) === -1 && lineBox(lb).x1 - lineBox(lb).x0 > vp.width * 0.55) { bands.push([lb]); bands.push([]); }
      else bands[bands.length - 1].push(lb);
    }
    ordered = [];
    for (const band of bands) {
      ordered.push(...band.filter((l) => side(l) !== 1).sort((a, b) => a.base - b.base));
      ordered.push(...band.filter((l) => side(l) === 1).sort((a, b) => a.base - b.base));
    }
  }

  /* --- flatten into text + boxes --- */
  let text = '';
  const boxes: number[] = [];
  const lineOf: number[] = [];
  const lines: TLine[] = [];
  for (const lb of ordered) {
    const li = lines.length;
    const start = text.length;
    let y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
    const fontCount = new Map<string, number>();
    let prevEnd = -Infinity, prevChar = ' ';
    for (const r of lb.runs) {
      const top = r.base - r.asc * r.size, bot = r.base + r.desc * r.size;
      const gap = r.x - prevEnd;
      if (prevEnd > -Infinity && gap > r.size * 0.14 && prevChar !== ' ' && r.str[0] !== ' ') {
        text += ' ';
        boxes.push(prevEnd, top, r.x, bot);
        lineOf.push(li);
      }
      let x = r.x;
      for (let i = 0; i < r.str.length; i++) {
        const a = r.adv[i];
        text += r.str[i];
        boxes.push(x, top, x + a, bot);
        lineOf.push(li);
        x += a;
      }
      prevEnd = r.x + r.w;
      prevChar = r.str[r.str.length - 1];
      y0 = Math.min(y0, top); y1 = Math.max(y1, bot);
      x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w);
      fontCount.set(r.font, (fontCount.get(r.font) || 0) + r.str.length);
    }
    // Trim trailing spaces from the line range.
    let end = text.length;
    while (end > start && text[end - 1] === ' ') end--;
    const font = [...fontCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    lines.push({ start, end, x0, y0, x1, y1, base: lb.base, size: lb.size, font, col: -1 });
    text += '\n';
    boxes.push(x1, y0, x1, y1);
    lineOf.push(li);
  }
  pt.text = text;
  pt.boxes = Float32Array.from(boxes);
  pt.lineOf = Int32Array.from(lineOf);
  pt.lines = lines;

  /* --- body metrics --- */
  const sizeHist = new Map<number, number>();
  const fontHist = new Map<string, number>();
  for (const l of lines) {
    const n = l.end - l.start;
    const k = Math.round(l.size * 2) / 2;
    sizeHist.set(k, (sizeHist.get(k) || 0) + n);
    fontHist.set(l.font, (fontHist.get(l.font) || 0) + n);
  }
  pt.bodySize = [...sizeHist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 10;
  pt.bodyFont = [...fontHist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  if (twoCol) {
    const L = lines.filter((l) => l.x1 < pageMid + 6), R = lines.filter((l) => l.x0 > pageMid - 6);
    const med = (arr: number[]) => arr.sort((a, b) => a - b)[Math.floor(arr.length / 2)] ?? 0;
    pt.columns = [
      { x0: med(L.map((l) => l.x0)), x1: Math.max(...L.filter((l) => Math.abs(l.size - pt.bodySize) < 1).map((l) => l.x1), pageMid - 10) },
      { x0: med(R.map((l) => l.x0)), x1: Math.max(...R.filter((l) => Math.abs(l.size - pt.bodySize) < 1).map((l) => l.x1), pageMid + 10) },
    ];
    for (const l of lines) l.col = l.x1 < pageMid + 6 ? 0 : l.x0 > pageMid - 6 ? 1 : -1;
  } else if (lines.length) {
    const body = lines.filter((l) => Math.abs(l.size - pt.bodySize) < 1);
    const src = body.length ? body : lines;
    pt.columns = [{ x0: Math.min(...src.map((l) => l.x0)), x1: Math.max(...src.map((l) => l.x1)) }];
  }

  /* --- paragraphs --- */
  const spacings: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const d = lines[i].base - lines[i - 1].base;
    if (d > 0 && d < pt.bodySize * 2.2 && lines[i].col === lines[i - 1].col) spacings.push(d);
  }
  spacings.sort((a, b) => a - b);
  const leading = spacings[Math.floor(spacings.length / 2)] || pt.bodySize * 1.2;
  const colOf = (l: TLine) => pt.columns[l.col >= 0 ? l.col : 0] || { x0: l.x0, x1: l.x1 };
  const lineText = (l: TLine) => text.slice(l.start, l.end);
  const isHeadingLine = (l: TLine) => {
    const s = lineText(l).trim();
    if (s.length < 2 || s.length > 90) return false;
    const bigger = l.size > pt.bodySize * 1.12;
    const otherFont = l.font !== pt.bodyFont;
    if (NAMED_HEADING_RE.test(s) && s.split(/\s+/).length <= 6 && (bigger || otherFont)) return true;
    if (HEADING_RE.test(s) && !/[.:;,]$/.test(s) && s.split(/\s+/).length <= 12 && (bigger || otherFont)) return true;
    if (!bigger || s.split(/\s+/).length > 14 || /[.;,]$/.test(s) || l.size >= pt.bodySize * 3) return false;
    // A sentence that runs on to the next line is prose set in a bigger size, not a heading.
    const li = lines.indexOf(l);
    const next = lines[li + 1], prev = lines[li - 1];
    const runsOn = (a: TLine | undefined, b: TLine | undefined) => !!a && !!b && Math.abs(a.size - b.size) < 0.6 && b.base - a.base > 0 && b.base - a.base < a.size * 1.8 && !/[.!?:]$/.test(lineText(a).trim()) && /^[a-z(]/.test(lineText(b).trim());
    if (runsOn(l, next) || runsOn(prev, l)) return false;
    return !/,/.test(s) || s.split(/\s+/).length <= 5;
  };
  const scriptRatio = (l: TLine) => {
    const hs: number[] = [];
    for (let i = l.start; i < l.end; i++) if (text[i] !== ' ') hs.push(boxes[i * 4 + 3] - boxes[i * 4 + 1]);
    if (hs.length < 3) return 0;
    const sorted = [...hs].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    return hs.filter((x) => x < med * 0.8).length / hs.length;
  };
  const isEquationLine = (li: number) => {
    const l = lines[li];
    const s = lineText(l).trim();
    const col = colOf(l);
    const cw = col.x1 - col.x0;
    const body = s.replace(EQNUM_RE, '').trim();
    if (body.length < 2) return false;
    const leftGap = l.x0 - col.x0;
    const centered = leftGap > cw * 0.08 && (col.x1 - l.x1 > cw * 0.04 || EQNUM_RE.test(s));
    const math = pt.mathiness(li);
    if (EQNUM_RE.test(s) && (centered || math > 0.05)) return true;
    if (!centered || s.length > 160) return false;
    return math > 0.22 || (/[=≤≥≈∝→←]/.test(s) && (scriptRatio(l) > 0.08 || math > 0.04) && s.split(/\s+/).length < 18);
  };

  const paras: TPara[] = [];
  let pStart = 0;
  const closePara = (l1: number) => {
    if (l1 < pStart) return;
    const ls = lines.slice(pStart, l1 + 1);
    const first = lineText(ls[0]).trim();
    let kind: ParaKind = 'body';
    if (ls.every((l) => l.y1 < pt.h * 0.06 || l.y0 > pt.h * 0.94) && ls.length <= 2) kind = 'margin';
    else if (CAPTION_RE.test(first)) kind = 'caption';
    else if (ls.length === 1 && isHeadingLine(ls[0])) kind = 'heading';
    else if (ls.every((_, k) => isEquationLine(pStart + k))) kind = 'equation';
    else if (/^\s*([•▪◦‣∙·\-–—]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/.test(first)) kind = 'list';
    paras.push({
      l0: pStart, l1,
      start: ls[0].start, end: ls[ls.length - 1].end,
      x0: Math.min(...ls.map((l) => l.x0)), y0: Math.min(...ls.map((l) => l.y0)),
      x1: Math.max(...ls.map((l) => l.x1)), y1: Math.max(...ls.map((l) => l.y1)),
      kind,
    });
    pStart = l1 + 1;
  };
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i];
    const col = colOf(a);
    const gap = b.base - a.base;
    const newCol = b.col !== a.col || gap < -a.size;
    const bigGap = gap > leading * 1.42 || gap > a.size * 2.4;
    const sizeJump = Math.abs(b.size - a.size) > Math.max(a.size, b.size) * 0.15;
    const indent = b.x0 > a.x0 + a.size * 0.7 && a.x1 > col.x1 - a.size * 1.5 && b.x0 - colOf(b).x0 < b.size * 3;
    const shortPrev = a.x1 < col.x1 - a.size * 3 && b.x0 <= a.x0 + 1;
    const caption = CAPTION_RE.test(lineText(b));
    const heading = isHeadingLine(b) || isHeadingLine(a);
    const eqSwitch = isEquationLine(i) !== isEquationLine(i - 1);
    const margin = (a.y1 < pt.h * 0.06) !== (b.y1 < pt.h * 0.06) || (a.y0 > pt.h * 0.94) !== (b.y0 > pt.h * 0.94);
    if (newCol || bigGap || sizeJump || indent || shortPrev || caption || heading || eqSwitch || margin) closePara(i - 1);
  }
  closePara(lines.length - 1);
  pt.paras = paras;
  pt.buildGrid();
  return pt;
}
