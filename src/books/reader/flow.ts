// Reflowable books, laid out page by page with pretext. Each paragraph's runs become rich-inline items (one font
// string per run, the first-line indent a box); its lines are stacked and the page is filled to its height, keeping
// headings with what follows, not leaving a lone first or last line of a paragraph at a page edge, never cutting a
// line. Positions are (chapter, character offset in the chapter's runs): every line knows the offsets it covers, so
// any change of font, size or page width finds the same text again.
// A chapter is laid out whole (pretext does ~20k characters in ~15 ms); a huge one (a TXT novel with no chapters
// found) is cut into sections of whole paragraphs, each laid out on its own, so nothing ever waits for millions of
// characters. A section's page count outlives its pages: the reader keeps the pages of the sections round the one
// being read and lets the rest go (laying a section out again gives the very same pages), so a long book's exact
// page numbers cost a number per section, not every line of the book.
import { layoutNextRichInlineLineRange, materializeRichInlineLineRange, prepareRichInline, type RichInlineBox, type RichInlineItem } from '@chenglou/pretext/rich-inline';
import type { Block, BookSettings, FlowDoc, Run } from '../types';
import { facesLoading, facesReady, fontDef, fontString, isLatinBook, loadFaces, MONO_FAMILY } from './fonts';

/** The text area of one page, px. */
export interface Geometry { colW: number; textH: number }

export interface Frag { text: string; font: string; gap: number; w: number; cls: string; href?: string; ruby?: string; o0: number; o1: number; box?: boolean }
export interface Line {
  kind: 'line'; y: number; h: number; x: number; maxW: number; w: number; frags: Frag[]; justify: boolean; align: 'left' | 'center';
  o0: number; o1: number; block: number; cls: string; bullet?: boolean;
}
export interface Img { kind: 'img'; y: number; h: number; x: number; w: number; src: string; alt?: string; o0: number; o1: number; block: number }
export interface Rule { kind: 'hr'; y: number; h: number; x: number; w: number; o0: number; o1: number; block: number }
export type Item = Line | Img | Rule;

export interface Page {
  chapter: number;
  /** section index (in reading order) and page index in it */
  sec: number;
  index: number;
  items: Item[];
  /** characters it covers, [o0, o1) in its chapter */
  o0: number;
  o1: number;
  /** the chapter's first page (its title is set big) */
  opener: boolean;
}
export interface Section {
  chapter: number; b0: number; b1: number; o0: number; o1: number;
  /** its pages, while they are kept */
  pages: Page[] | null;
  /** how many pages it has, once known (kept when the pages are let go) */
  count: number | null;
}

/** One page reference: section and page index. */
export interface Ref { si: number; pi: number }

const SEC_CHARS = 60000;
const HEAD_SCALE: Record<string, number> = { h1: 1.55, h2: 1.32, h3: 1.15, h4: 1.05 };
const isText = (b: Block): b is Extract<Block, { runs: Run[] }> => 'runs' in b;
const blockText = (b: Block) => (isText(b) ? b.runs.reduce((a, r) => a + r.text, '') : '');

export interface Metrics {
  family: string; size: number; lineH: number; paraGap: number; indent: number; letter: number; justify: boolean;
  colW: number; textH: number;
}
export function metricsOf(s: BookSettings, g: Geometry, latin = false): Metrics {
  return {
    family: fontDef(s.font, latin).family, size: s.size, lineH: Math.round(s.size * s.lineHeight), paraGap: Math.round(s.paraSpace * s.size),
    indent: Math.max(0, s.indent) * s.size, letter: s.letterSpace * s.size, justify: s.align === 'justify', colW: g.colW, textH: g.textH,
  };
}

export class FlowLayout {
  readonly sections: Section[] = [];
  /** per chapter: where each block starts (characters), and its sections */
  readonly blockStart: number[][] = [];
  readonly chapterSecs: number[][] = [];
  readonly chapterChars: number[] = [];
  readonly charsBefore: number[] = [];
  readonly total: number;
  /** every block id → (chapter, block), for links */
  readonly ids = new Map<string, { chapter: number; block: number }>();
  m: Metrics;
  private pending = new Map<number, Promise<Page[]>>();
  /** sections whose pages are kept */
  private kept = new Set<number>();
  /** sections whose faces were found loaded for every character (they stay loaded: only a load in flight for one
   *  of the faces makes facesReady say no again) */
  private facesOk = new Set<number>();

  constructor(private doc: FlowDoc, s: BookSettings, g: Geometry, private imgSize: Map<string, { w: number; h: number }>) {
    let sample = '';
    for (const ch of doc.chapters) { for (const b of ch.blocks) { sample += blockText(b); if (sample.length > 4000) break; } if (sample.length > 4000) break; }
    this.m = metricsOf(s, g, isLatinBook(doc.lang, sample));
    let total = 0;
    doc.chapters.forEach((ch, ci) => {
      const starts: number[] = [];
      let o = 0;
      ch.blocks.forEach((b, bi) => { starts.push(o); o += blockText(b).length; if (b.id) this.ids.set(b.id, { chapter: ci, block: bi }); });
      starts.push(o);
      this.blockStart.push(starts);
      this.chapterChars.push(o);
      this.charsBefore.push(total);
      total += o;
      // sections: whole paragraphs, at most SEC_CHARS each
      const secs: number[] = [];
      let b0 = 0;
      for (let bi = 0; bi <= ch.blocks.length; bi++) {
        if (bi === ch.blocks.length || (starts[bi] - starts[b0] >= SEC_CHARS && bi > b0)) {
          if (bi > b0 || !secs.length) { secs.push(this.sections.length); this.sections.push({ chapter: ci, b0, b1: bi, o0: starts[b0], o1: starts[bi], pages: null, count: null }); }
          b0 = bi;
        }
      }
      this.chapterSecs.push(secs);
    });
    this.total = Math.max(1, total);
  }

  /** The section holding a position. */
  sectionAt(chapter: number, offset: number) {
    const c = Math.max(0, Math.min(this.doc.chapters.length - 1, chapter));
    const secs = this.chapterSecs[c];
    for (let i = secs.length - 1; i >= 0; i--) if (this.sections[secs[i]].o0 <= offset) return secs[i];
    return secs[0];
  }

  /** The faces a section is set in, and its text. */
  private facesOf(si: number) {
    const sec = this.sections[si], blocks = this.doc.chapters[sec.chapter].blocks.slice(sec.b0, sec.b1), m = this.m;
    const faces = [fontString({ family: m.family, size: m.size }), fontString({ family: m.family, size: m.size, bold: true })];
    if (blocks.some((b) => isText(b) && b.runs.some((r) => r.i))) faces.push(fontString({ family: m.family, size: m.size, italic: true }));
    if (blocks.some((b) => b.t === 'pre' || (isText(b) && b.runs.some((r) => r.code)))) faces.push(fontString({ family: MONO_FAMILY, size: m.size * 0.86 }));
    for (const b of blocks) if (b.t in HEAD_SCALE) faces.push(fontString({ family: m.family, size: m.size * HEAD_SCALE[b.t], bold: true }));
    return { faces, text: blocks.map(blockText).join('') };
  }
  /** Lay a section out (once; the faces it uses are loaded first). */
  ensure(si: number): Promise<Page[]> {
    const now = this.tryNow(si);
    if (now) return Promise.resolve(now);
    const sec = this.sections[si];
    let p = this.pending.get(si);
    if (!p) {
      p = (async () => {
        const { faces, text } = this.facesOf(si);
        await loadFaces(faces, text);
        if (!sec.pages) this.keep(si, this.layoutSection(si));
        this.pending.delete(si);
        return sec.pages!;
      })();
      this.pending.set(si, p);
    }
    return p;
  }
  /** Laid out at once if its faces are loaded already (else null: ensure() it). */
  tryNow(si: number): Page[] | null {
    const sec = this.sections[si];
    if (sec.pages) return sec.pages;
    if (!this.ready(si)) return null;
    return this.keep(si, this.layoutSection(si));
  }
  /** How many pages a section has, laying it out for that alone if need be (its pages are not kept); null while
   *  its faces are not loaded (ensureFaces() it). */
  countNow(si: number): number | null {
    const sec = this.sections[si];
    if (sec.count != null) return sec.count;
    if (!this.ready(si)) return null;
    sec.count = this.layoutSection(si).length;
    return sec.count;
  }
  /** Load the faces a section is set in (then countNow() / tryNow() can lay it out). */
  ensureFaces(si: number): Promise<void> {
    if (this.ready(si)) return Promise.resolve();
    const { faces, text } = this.facesOf(si);
    return loadFaces(faces, text);
  }
  /** Laid out already (or again, if its pages were let go), or null. */
  pagesOf(si: number) {
    const sec = this.sections[si];
    if (!sec) return null;
    if (sec.pages) return sec.pages;
    // laid out before and let go: laid out again now, the very same pages (every character of it was loaded in its
    // faces then, and loaded stays loaded, whatever else is loading meanwhile)
    return this.facesOk.has(si) ? this.keep(si, this.layoutSection(si)) : null;
  }
  /** Let the pages of the sections not wanted go (their page counts stay). */
  release(want: (si: number) => boolean) {
    for (const si of this.kept) if (!want(si) && !this.pending.has(si)) { this.sections[si].pages = null; this.kept.delete(si); }
  }
  /** Page counts known so far, one per section (-1: not yet). */
  knownCounts(): Int32Array {
    return Int32Array.from(this.sections, (s) => (s.pages ? s.pages.length : s.count ?? -1));
  }
  /** Page counts found before (by another layout of the same book with the same settings and page size). */
  preload(counts: Int32Array) {
    if (counts.length !== this.sections.length) return;
    this.sections.forEach((s, i) => { if (s.count == null && counts[i] >= 0) s.count = counts[i]; });
  }
  private keep(si: number, pages: Page[]) {
    const sec = this.sections[si];
    sec.pages = pages;
    sec.count = pages.length;
    this.kept.add(si);
    return pages;
  }
  /** facesReady for a section (once found, only a load in flight for one of its faces can make it no again). */
  private ready(si: number) {
    const { faces, text } = this.facesOf(si);
    if (this.facesOk.has(si)) return !facesLoading(faces);
    if (!facesReady(faces, text)) return false;
    this.facesOk.add(si);
    return true;
  }

  /** The page holding a position (its section must be laid out). */
  refAt(chapter: number, offset: number): Ref {
    const si = this.sectionAt(chapter, offset), pages = this.pagesOf(si)!;
    // the first page whose characters reach past the offset (a page of only a picture counts where it stands)
    for (let i = 0; i < pages.length; i++) if (offset < pages[i].o1 || (pages[i].o0 === pages[i].o1 && pages[i].o0 >= offset)) return { si, pi: i };
    return { si, pi: pages.length - 1 };
  }
  page(r: Ref) { return this.pagesOf(r.si)?.[r.pi] ?? null; }

  /** How many pages so far / in all (estimated for what is not laid out yet), and whether that is exact. */
  counts() {
    let known = 0, knownChars = 0, exact = true;
    for (const s of this.sections) if (s.count != null) { known += s.count; knownChars += s.o1 - s.o0; } else exact = false;
    const per = knownChars > 0 && known > 0 ? knownChars / known : this.charsPerPage();
    const est = (s: Section) => (s.count != null ? s.count : Math.max(1, Math.round((s.o1 - s.o0) / per)));
    let total = 0;
    for (const s of this.sections) total += est(s);
    return { total, exact, est };
  }
  /** Global page number (0-based) of a page, and pages left in its chapter. */
  numberOf(r: Ref) {
    const { est } = this.counts();
    let n = 0;
    for (let i = 0; i < r.si; i++) n += est(this.sections[i]);
    const sec = this.sections[r.si];
    let left = est(sec) - r.pi - 1;
    for (const si of this.chapterSecs[sec.chapter]) if (si > r.si) left += est(this.sections[si]);
    return { n: n + r.pi, left };
  }
  private charsPerPage() {
    const m = this.m;
    return Math.max(40, (m.colW / (m.size + m.letter)) * (m.textH / m.lineH) * 0.9);
  }
  /** Characters before a position, over the whole book, as 0..1. */
  percent(chapter: number, offset: number) { return Math.max(0, Math.min(1, (this.charsBefore[chapter] + offset) / this.total)); }
  /** A fraction of the book back to (chapter, offset). */
  at(percent: number) {
    const o = Math.max(0, Math.min(this.total - 1, percent * this.total));
    let c = 0;
    while (c + 1 < this.charsBefore.length && this.charsBefore[c + 1] <= o) c++;
    return { chapter: c, offset: Math.round(o - this.charsBefore[c]) };
  }

  /* ---------- laying a section out ---------- */
  private layoutSection(si: number): Page[] {
    const sec = this.sections[si], ch = this.doc.chapters[sec.chapter], m = this.m;
    const starts = this.blockStart[sec.chapter];
    const pages: Page[] = [];
    let items: Item[] = [], y = 0;
    const flush = () => {
      if (!items.length) return;
      const o0 = Math.min(...items.map((it) => it.o0)), o1 = Math.max(...items.map((it) => it.o1));
      pages.push({ chapter: sec.chapter, sec: si, index: pages.length, items, o0, o1, opener: sec.b0 === 0 && pages.length === 0 });
      items = [];
      y = 0;
    };
    const fits = (h: number) => y + h <= m.textH + 0.5;
    for (let bi = sec.b0; bi < sec.b1; bi++) {
      const b = ch.blocks[bi], o = starts[bi];
      const lb = this.layoutBlock(b, bi, o, bi === 0);
      if (!lb) { if (y > 0) y += m.paraGap; continue; }
      // space before (none at the top of a page, except a chapter's opening title)
      if (y > 0) y += lb.before;
      else if (bi === 0 && lb.head && pages.length === 0) y += Math.round(m.lineH * 1.6);
      if (lb.kind === 'img' || lb.kind === 'hr') {
        const it = lb.items[0];
        if (!fits(it.h) && items.length) flush();
        it.y = y;
        items.push(it);
        y += it.h + lb.after;
        continue;
      }
      const lines = lb.items as Line[];
      // a heading goes with at least two lines of what follows
      if (lb.head && items.length) {
        const blockH = lines.reduce((a, l) => a + l.h, 0);
        if (!fits(blockH + lb.after + 2 * m.lineH)) flush();
      }
      for (let k = 0; k < lines.length; k++) {
        const L = lines[k];
        if (!fits(L.h)) flush();
        else if (items.length && !lb.head) {
          // not a lone first line at the foot of a page, nor a lone last line at the head of the next
          if (k === 0 && lines.length >= 2 && !fits(L.h + lines[1].h)) flush();
          else if (k === lines.length - 2 && k >= 2 && !fits(L.h + lines[k + 1].h)) flush();
        }
        L.y = y;
        items.push(L);
        y += L.h;
      }
      y += lb.after;
    }
    flush();
    if (!pages.length) pages.push({ chapter: sec.chapter, sec: si, index: 0, items: [], o0: sec.o0, o1: sec.o1, opener: sec.b0 === 0 });
    return pages;
  }

  /** One block's lines (y from the block's top), or its picture / rule, and the space round it. */
  private layoutBlock(b: Block, bi: number, o: number, first: boolean): { kind: string; items: Item[]; before: number; after: number; head: boolean } | null {
    const m = this.m;
    if (b.t === 'img') {
      const nat = this.imgSize.get(b.src) ?? (b.w && b.h ? { w: b.w, h: b.h } : { w: m.colW, h: m.colW * 0.66 });
      let w = nat.w < 64 ? nat.w : Math.min(m.colW, nat.w), hh = w * (nat.h / Math.max(1, nat.w));
      const maxH = m.textH - m.lineH * 0.5;
      if (hh > maxH) { w *= maxH / hh; hh = maxH; }
      return { kind: 'img', head: false, before: m.paraGap + m.lineH * 0.3, after: m.paraGap + m.lineH * 0.3,
        items: [{ kind: 'img', y: 0, h: Math.round(hh), x: Math.round((m.colW - w) / 2), w: Math.round(w), src: b.src, alt: b.alt, o0: o, o1: o, block: bi }] };
    }
    if (b.t === 'hr') {
      return { kind: 'hr', head: false, before: m.paraGap, after: m.paraGap, items: [{ kind: 'hr', y: 0, h: m.lineH, x: 0, w: m.colW, o0: o, o1: o, block: bi }] };
    }
    const text = blockText(b);
    if (!text.trim()) return null;
    const head = b.t in HEAD_SCALE, size = head ? m.size * HEAD_SCALE[b.t] : b.t === 'pre' ? m.size * 0.86 : m.size;
    const lineH = head ? Math.round(size * 1.45) : b.t === 'pre' ? Math.round(size * 1.5) : m.lineH;
    const fam = b.t === 'pre' ? MONO_FAMILY : m.family;
    const left = b.t === 'quote' ? m.size * 1.6 : b.t === 'li' ? m.size * 1.4 : b.t === 'pre' ? m.size * 0.8 : 0;
    const right = b.t === 'quote' ? m.size * 0.6 : b.t === 'pre' ? m.size * 0.4 : 0;
    const maxW = Math.max(m.size * 4, m.colW - left - right);
    const center = b.t === 'center' || b.t === 'h1' || b.t === 'h2';
    // the runs as rich-inline items; the indent (ordinary paragraphs) a box in front
    const items: Array<RichInlineItem | RichInlineBox> = [];
    const meta: Array<{ run: number; start: number; cls: string; href?: string; ruby?: string; font: string } | null> = [];
    if (b.t === 'p' && m.indent > 0 && !/^\s/.test(text)) { items.push({ width: m.indent }); meta.push(null); }
    let start = 0;
    b.runs.forEach((r, ri) => {
      if (r.text) {
        const small = r.sup || r.sub ? 0.68 : r.code ? 0.88 : 1;
        const font = fontString({ family: r.code ? MONO_FAMILY : fam, size: size * small, bold: head || r.b, italic: r.i });
        items.push({ text: r.text, font, letterSpacing: r.code || b.t === 'pre' ? 0 : m.letter });
        const cls = [r.b ? 'b' : '', r.i ? 'i' : '', r.code ? 'code' : '', r.sup ? 'sup' : '', r.sub ? 'sub' : '', r.href ? 'link' : ''].filter(Boolean).join(' ');
        meta.push({ run: ri, start: o + start, cls, href: r.href, ruby: r.ruby, font });
      }
      start += r.text.length;
    });
    if (!items.length) return null;
    const prepared = prepareRichInline(items, { whiteSpace: b.t === 'pre' ? 'pre-wrap' : 'normal' });
    const lines: Line[] = [];
    let cursor: any = undefined;
    for (let guard = 0; guard < 100000; guard++) {
      const range = layoutNextRichInlineLineRange(prepared, maxW, cursor);
      if (!range) break;
      const ml = materializeRichInlineLineRange(prepared, range);
      const frags: Frag[] = [];
      for (const fr of ml.fragments) {
        const mt = meta[fr.itemIndex];
        if (!mt) { frags.push({ text: '', font: '', gap: fr.gapBefore, w: fr.occupiedWidth, cls: '', o0: o, o1: o, box: true }); continue; }
        frags.push({ text: fr.text, font: mt.font, gap: fr.gapBefore, w: fr.occupiedWidth, cls: mt.cls, href: mt.href, ruby: mt.ruby,
          o0: mt.start + fr.sourceStart, o1: mt.start + fr.sourceEnd });
      }
      const textFrags = frags.filter((f) => !f.box);
      if (!textFrags.length) { cursor = range.end; continue; }
      lines.push({ kind: 'line', y: 0, h: lineH, x: Math.round(left), maxW, w: ml.width, frags, justify: false, align: center ? 'center' : 'left',
        o0: textFrags[0].o0, o1: textFrags[textFrags.length - 1].o1, block: bi,
        cls: head ? `head ${b.t}${first ? ' opener' : ''}` : b.t === 'quote' ? 'quote' : b.t === 'pre' ? 'pre' : b.t === 'li' ? 'li' : '',
        bullet: b.t === 'li' && lines.length === 0 });
      cursor = range.end;
    }
    // every line but a paragraph's last is set to the full width, when the gap left is small
    // (Latin lines spread the gap over their spaces and take more of it; CJK lines spread it between characters)
    if (m.justify && !center && b.t !== 'pre') for (let k = 0; k < lines.length - 1; k++) {
      const txt = lines[k].frags.map((f) => f.text).join('').trim(), spaces = (txt.match(/ /g) || []).length;
      const limit = spaces >= 3 && /[A-Za-z]/.test(txt) ? 0.3 : 0.14;
      if ((maxW - lines[k].w) / maxW < limit) lines[k].justify = true;
    }
    if (!lines.length) return null;
    const before = head ? Math.round(lineH * (b.t === 'h1' ? 1.3 : 0.9)) : b.t === 'li' ? Math.round(m.paraGap * 0.4) : m.paraGap;
    const after = head ? Math.round(lineH * 0.55) : b.t === 'li' ? 0 : 0;
    return { kind: 'text', items: lines, before, after, head };
  }
}
