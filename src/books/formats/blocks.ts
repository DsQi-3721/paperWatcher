// HTML / XHTML → the reader's blocks: paragraphs of styled runs, headings, quotes, list items, preformatted text,
// pictures and rules. Used by EPUB, HTML files, MOBI and AZW3. It keeps what reading needs (bold, italic, code,
// super/subscript, links, ruby, centred lines) and drops the rest (fonts, colours, layout). Ids met on the way are
// remembered with the block they land in, so the contents and links can point into the text.
import type { Block, Chapter, Run, TocItem } from '../types';
import { headingOf } from './headings';
import { charsOf } from './util';

type Kind = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'li' | 'pre' | 'center';
interface Style { b?: boolean; i?: boolean; code?: boolean; sup?: boolean; sub?: boolean; href?: string }
interface Ctx { style: Style; kind: Kind; pre: boolean }

/** What the book's CSS says about its classes (centred lines, bold, italic, hidden). */
export interface CssHints { center: Set<string>; bold: Set<string>; italic: Set<string>; hidden: Set<string> }
export const emptyHints = (): CssHints => ({ center: new Set(), bold: new Set(), italic: new Set(), hidden: new Set() });

/** Read the classes a stylesheet centres, bolds, italicises or hides (simple selectors ending in .class only). */
export function cssHints(css: string, into: CssHints = emptyHints()): CssHints {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const body = m[2].toLowerCase();
    const centre = /text-align\s*:\s*center/.test(body), bold = /font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(body);
    const italic = /font-style\s*:\s*(italic|oblique)/.test(body), hidden = /display\s*:\s*none/.test(body);
    if (!centre && !bold && !italic && !hidden) continue;
    for (const sel of m[1].split(',')) {
      const cls = sel.trim().match(/\.([\w-]+)(?::[\w-]+)?\s*$/)?.[1];
      if (!cls) continue;
      if (centre) into.center.add(cls);
      if (bold) into.bold.add(cls);
      if (italic) into.italic.add(cls);
      if (hidden) into.hidden.add(cls);
    }
  }
  return into;
}

export interface ConvertOptions {
  /** an <img src> / <image href> as a picture: its resource key and size, or null (no such picture) */
  image(src: string): { key: string; w?: number; h?: number } | null;
  /** an <a href> as kept in the run (resolved), or null to drop the link */
  link(href: string): string | null;
  hints?: CssHints;
}

const SKIP = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'template', 'rp', 'rt', 'object', 'iframe', 'video', 'audio', 'canvas', 'button', 'input', 'select', 'textarea', 'map', 'math', 'annotation']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'caption', 'figure', 'figcaption',
  'center', 'address', 'hgroup', 'details', 'summary', 'body', 'html', 'form', 'fieldset', 'legend', 'menu', 'blockcode', 'listing', 'xmp', 'plaintext']);
const HEAD: Record<string, Kind> = { h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4' };
// CJK letters and punctuation: no spaces between them (an HTML line break between two Chinese characters is not a space)
const CJK = '\\u2E80-\\u9FFF\\uF900-\\uFAFF\\uFE30-\\uFE4F\\uFF00-\\uFFEF\\u3000-\\u303F\\u3040-\\u30FF\\uAC00-\\uD7AF';
const CJK_GAP = new RegExp(`([${CJK}]) (?=[${CJK}])`, 'g');
const CJK_END = new RegExp(`[${CJK}] $`), CJK_START = new RegExp(`^[${CJK}]`);

/** Collects runs into blocks. */
export class BlockBuilder {
  blocks: Block[] = [];
  /** element id → index of the block it is in */
  anchors = new Map<string, number>();
  private runs: Run[] = [];
  private kind: Kind = 'p';
  private pending: string[] = [];

  get open() { return this.runs.length > 0; }

  /** Some text in a style (whitespace already collapsed unless pre). */
  text(s: string, style: Style, kind: Kind, pre: boolean) {
    if (!s) return;
    if (!this.runs.length) {
      this.kind = kind;
      if (!pre) { s = s.replace(/^[ \u3000]+/, ''); if (!s) return; }
    }
    if (!pre) {
      s = s.replace(CJK_GAP, '$1');
      const last = this.runs[this.runs.length - 1];
      if (last) {
        if (last.text.endsWith(' ') && s.startsWith(' ')) s = s.slice(1);
        if (CJK_END.test(last.text) && CJK_START.test(s)) last.text = last.text.slice(0, -1);
        if (!s) return;
      }
    }
    const last = this.runs[this.runs.length - 1];
    if (last && !!last.b === !!style.b && !!last.i === !!style.i && !!last.code === !!style.code && !!last.sup === !!style.sup && !!last.sub === !!style.sub && last.href === style.href && !last.ruby) last.text += s;
    else {
      const r: Run = { text: s };
      if (style.b) r.b = true;
      if (style.i) r.i = true;
      if (style.code) r.code = true;
      if (style.sup) r.sup = true;
      if (style.sub) r.sub = true;
      if (style.href) r.href = style.href;
      this.runs.push(r);
    }
  }
  /** Base text with its reading over it. */
  ruby(base: string, reading: string, style: Style, kind: Kind) {
    if (!base) return;
    if (!this.runs.length) this.kind = kind;
    const r: Run = { text: base, ruby: reading };
    if (style.b) r.b = true;
    if (style.i) r.i = true;
    if (style.href) r.href = style.href;
    this.runs.push(r);
  }
  /** An id: it belongs to the block being written, or to the next one. */
  anchor(id: string) {
    if (!id || this.anchors.has(id)) return;
    if (this.runs.length) this.anchors.set(id, this.blocks.length);
    else this.pending.push(id);
  }
  private land(i: number) { for (const id of this.pending) if (!this.anchors.has(id)) this.anchors.set(id, i); this.pending = []; }

  /** End the block being written (if it has any text). */
  flush() {
    if (!this.runs.length) return;
    const runs = this.runs;
    this.runs = [];
    if (this.kind !== 'pre') {
      runs[0].text = runs[0].text.replace(/^[\s\u3000]+/, '');
      const last = runs[runs.length - 1];
      last.text = last.text.replace(/\s+$/, '');
    } else {
      runs[0].text = runs[0].text.replace(/^\n+/, '');
      runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
    }
    const kept = runs.filter((r) => r.text.length);
    if (!kept.length) return;
    this.land(this.blocks.length);
    this.blocks.push({ t: this.kind, runs: kept });
  }
  image(src: string, alt?: string, w?: number, h?: number) {
    this.flush();
    this.land(this.blocks.length);
    const b: Block = { t: 'img', src };
    if (alt) b.alt = alt;
    if (w && h) { b.w = w; b.h = h; }
    this.blocks.push(b);
  }
  hr() {
    this.flush();
    const prev = this.blocks[this.blocks.length - 1];
    if (!prev || prev.t === 'hr') return;
    this.land(this.blocks.length);
    this.blocks.push({ t: 'hr' });
  }
  /** Done: the blocks, ids still waiting go to the last block. */
  end() {
    this.flush();
    if (this.pending.length) this.land(Math.max(0, this.blocks.length - 1));
    return this;
  }
}

const cls = (el: Element) => (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
const styleOf = (el: Element) => (el.getAttribute('style') || '').toLowerCase();
const tagOf = (el: Element) => (el.localName || el.nodeName).toLowerCase().replace(/^.*:/, '');

/** Walks a DOM subtree into a builder. */
export class Converter {
  constructor(private opts: ConvertOptions, public out = new BlockBuilder()) {}

  run(root: Node) { this.walk(root, { style: {}, kind: 'p', pre: false }); return this.out.end(); }

  private hidden(el: Element) {
    const st = styleOf(el), h = this.opts.hints;
    if (/display\s*:\s*none/.test(st) || el.hasAttribute('hidden')) return true;
    return !!h && cls(el).some((c) => h.hidden.has(c));
  }

  private walk(node: Node, ctx: Ctx) {
    if (node.nodeType === 3) {
      let s = node.nodeValue || '';
      // zero-width marks go; runs of ordinary whitespace become one space (a full-width space is kept: it separates
      // a chapter's number from its title)
      if (!ctx.pre) s = s.replace(/[\u200b\u200c\u200d\ufeff]/g, '').replace(/[\t\n\r\f\v \u00a0]+/g, ' ');
      else s = s.replace(/\r\n?/g, '\n');
      this.out.text(s, ctx.style, ctx.kind, ctx.pre);
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType !== 1) { for (const c of Array.from(node.childNodes)) this.walk(c, ctx); return; }
    const el = node as Element, tag = tagOf(el);
    if (SKIP.has(tag) || this.hidden(el)) return;
    const id = el.getAttribute('id') || (tag === 'a' ? el.getAttribute('name') : null);
    if (id) this.out.anchor(id);

    if (tag === 'br') {
      // a line break inside a paragraph: the lines read as separate paragraphs (verse, addresses, chat lines)
      if (ctx.pre) this.out.text('\n', ctx.style, ctx.kind, true);
      else this.out.flush();
      return;
    }
    if (tag === 'hr') { this.out.hr(); return; }
    if (tag === 'img' || tag === 'image') { this.picture(el); return; }
    if (tag === 'svg') { for (const im of Array.from(el.getElementsByTagName('image'))) this.picture(im); return; }
    if (tag === 'ruby') { this.ruby(el, ctx); return; }
    if (tag === 'table') { this.table(el, ctx); return; }

    const style = this.inline(el, tag, ctx.style);
    if (BLOCK.has(tag)) {
      this.out.flush();
      let kind = ctx.kind, pre = ctx.pre;
      if (HEAD[tag]) kind = HEAD[tag];
      else if (tag === 'blockquote') kind = ctx.kind === 'p' || ctx.kind === 'center' ? 'quote' : ctx.kind;
      else if (tag === 'li' || tag === 'dd') kind = ctx.kind === 'p' || ctx.kind === 'quote' ? 'li' : ctx.kind;
      else if (tag === 'pre' || tag === 'listing' || tag === 'xmp' || tag === 'plaintext') { kind = 'pre'; pre = true; }
      else if (tag === 'figcaption' || tag === 'caption') kind = 'center';
      if ((kind === 'p' || kind === 'quote') && this.centred(el, tag)) kind = 'center';
      const inner: Ctx = { style: tag === 'dt' ? { ...style, b: true } : style, kind, pre };
      if (tag === 'li' && el.parentElement && tagOf(el.parentElement) === 'ol') {
        const n = Array.from(el.parentElement.children).filter((c) => tagOf(c) === 'li').indexOf(el) + (+(el.parentElement.getAttribute('start') || 1));
        this.out.text(`${n}. `, {}, kind, false);
      }
      for (const c of Array.from(el.childNodes)) this.walk(c, inner);
      this.out.flush();
      return;
    }
    for (const c of Array.from(el.childNodes)) this.walk(c, { ...ctx, style });
  }

  /** The inline style an element adds. */
  private inline(el: Element, tag: string, base: Style): Style {
    let s = base;
    const add = (k: keyof Style, v: any = true) => { if (s === base) s = { ...base }; (s as any)[k] = v; };
    if (tag === 'b' || tag === 'strong') add('b');
    else if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn' || tag === 'var') add('i');
    else if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') add('code');
    else if (tag === 'sup') add('sup');
    else if (tag === 'sub') add('sub');
    else if (tag === 'a') {
      const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      const kept = href ? this.opts.link(href) : null;
      if (kept) add('href', kept);
      // a footnote mark reads as a small raised number
      const type = (el.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || el.getAttribute('epub:type') || el.getAttribute('role') || '') + ' ' + (el.getAttribute('class') || '');
      if (/noteref|footnote|endnote|note|fn/i.test(type) && (el.textContent || '').trim().length <= 4) add('sup');
    }
    const st = styleOf(el), h = this.opts.hints, cs = cls(el);
    if (/font-weight\s*:\s*(bold|bolder|[6-9]00)/.test(st) || (h && cs.some((c) => h.bold.has(c)))) add('b');
    if (/font-style\s*:\s*(italic|oblique)/.test(st) || (h && cs.some((c) => h.italic.has(c)))) add('i');
    if (/vertical-align\s*:\s*super/.test(st)) add('sup');
    if (/vertical-align\s*:\s*sub/.test(st)) add('sub');
    return s;
  }

  private centred(el: Element, tag: string) {
    if (tag === 'center') return true;
    const a = (el.getAttribute('align') || '').toLowerCase();
    if (a === 'center' || a === 'middle') return true;
    if (/text-align\s*:\s*center/.test(styleOf(el))) return true;
    const h = this.opts.hints;
    return !!h && cls(el).some((c) => h.center.has(c));
  }

  private picture(el: Element) {
    const src = el.getAttribute('src') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || el.getAttribute('xlink:href') || el.getAttribute('href') || el.getAttribute('recindex') || '';
    if (!src) return;
    const pic = this.opts.image(src);
    const alt = (el.getAttribute('alt') || el.getAttribute('title') || '').trim();
    if (!pic) { return; }
    // a tiny inline picture (a rare character, an icon) inside a line: its alt text, or nothing
    const w = pic.w ?? (+(el.getAttribute('width') || 0) || undefined), hh = pic.h ?? (+(el.getAttribute('height') || 0) || undefined);
    if (this.out.open && w && hh && w <= 48 && hh <= 48) { if (alt) this.out.text(alt, {}, 'p', false); return; }
    this.out.image(pic.key, alt || undefined, w, hh);
  }

  private ruby(el: Element, ctx: Ctx) {
    let base = '', reading = '';
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 1) {
        const t = tagOf(c as Element);
        if (t === 'rt') { reading += (c.textContent || '').trim(); continue; }
        if (t === 'rp') continue;
        if (t === 'rb' || t === 'span') { base += c.textContent || ''; continue; }
      }
      base += c.textContent || '';
    }
    base = base.replace(/\s+/g, ctx.pre ? ' ' : '');
    if (reading) this.out.ruby(base, reading, ctx.style, ctx.kind);
    else this.out.text(base, ctx.style, ctx.kind, ctx.pre);
  }

  /** A table: each row one line, its cells side by side. */
  private table(el: Element, ctx: Ctx) {
    this.out.flush();
    const rows = Array.from(el.querySelectorAll('tr'));
    if (!rows.length) { for (const c of Array.from(el.childNodes)) this.walk(c, ctx); this.out.flush(); return; }
    const cap = el.querySelector('caption');
    if (cap) { for (const c of Array.from(cap.childNodes)) this.walk(c, { ...ctx, kind: 'center' }); this.out.flush(); }
    for (const tr of rows) {
      const cells = Array.from(tr.children).filter((c) => /^t[dh]$/.test(tagOf(c)));
      cells.forEach((td, i) => {
        if (i) this.out.text('\u3000|\u3000', {}, ctx.kind, false);
        const head = tagOf(td) === 'th';
        for (const c of Array.from(td.childNodes)) this.walk(c, { ...ctx, style: head ? { ...ctx.style, b: true } : ctx.style });
      });
      this.out.flush();
    }
  }
}

/** Parse markup as XHTML, falling back to HTML when it is not well-formed. */
export function parseMarkup(text: string, xhtml = true): Document {
  const dp = new DOMParser();
  if (xhtml) {
    const doc = dp.parseFromString(text, 'application/xhtml+xml');
    if (!doc.getElementsByTagName('parsererror').length) return doc;
  }
  return dp.parseFromString(text, 'text/html');
}

/** A chapter from blocks. */
export function chapterOf(blocks: Block[], title?: string): Chapter {
  const chars = blocks.reduce((a, b) => a + ('runs' in b ? charsOf(b.runs) : 0), 0);
  return title ? { title, blocks, chars } : { blocks, chars };
}

/** The text of a heading-ish block. */
export const blockText = (b: Block) => ('runs' in b ? b.runs.map((r) => r.text).join('') : '');

/** Split one long list of blocks into chapters at its headings (single-file books: HTML, Markdown). */
export function splitAtHeadings(blocks: Block[], anchors: Map<string, number>, fallbackTitle: string) {
  const kinds = ['h1', 'h2'] as const;
  // the biggest heading level that occurs more than once marks the chapters
  const lvl = kinds.find((k) => blocks.filter((b) => b.t === k).length >= 2) ?? kinds.find((k) => blocks.some((b) => b.t === k));
  const starts = lvl ? blocks.map((b, i) => (b.t === lvl ? i : -1)).filter((i) => i >= 0) : [];
  if (!starts.length || (starts.length === 1 && starts[0] === 0 && blocks.length < 400)) {
    return { chapters: [chapterOf(blocks, fallbackTitle)], where: (i: number) => ({ chapter: 0, block: i }) };
  }
  if (starts[0] !== 0) starts.unshift(0);
  const chapters = starts.map((s, k) => {
    const part = blocks.slice(s, starts[k + 1] ?? blocks.length);
    const head = part[0] && (part[0].t === 'h1' || part[0].t === 'h2') ? blockText(part[0]) : k === 0 ? fallbackTitle : undefined;
    return chapterOf(part, head || undefined);
  });
  const where = (i: number) => { let c = 0; while (c + 1 < starts.length && starts[c + 1] <= i) c++; return { chapter: c, block: i - starts[c] }; };
  void anchors;
  return { chapters, where };
}

/** Chapter titles (from the contents, the first heading, or a first line that reads like one — "CHAPTER I" with its
 *  subtitle), and contents that list every titled chapter (some books' own contents skip most of them). */
export function finishContents(chapters: Chapter[], toc: TocItem[]): TocItem[] {
  const walk = (list: TocItem[]) => { for (const t of list) { const ch = chapters[t.chapter]; if (ch && !ch.title && !t.block) ch.title = t.title; if (t.children) walk(t.children); } };
  walk(toc);
  for (const ch of chapters) {
    if (ch.title) continue;
    const hd = ch.blocks.find((b) => b.t === 'h1' || b.t === 'h2' || b.t === 'h3');
    const t = hd ? blockText(hd).trim() : '';
    if (t && t.length <= 60) { ch.title = t; continue; }
    const lines = ch.blocks.slice(0, 4).filter((b) => 'runs' in b).map((b) => blockText(b).trim());
    if (lines[0] && headingOf(lines[0])) ch.title = lines[1] && lines[1].length <= 40 && !/[。.!?！？]$/.test(lines[1]) && !headingOf(lines[1]) ? `${lines[0]} ${lines[1]}` : lines[0];
  }
  const listed = new Set<number>();
  const mark = (list: TocItem[]) => { for (const t of list) { listed.add(t.chapter); if (t.children) mark(t.children); } };
  mark(toc);
  const out = toc.slice();
  chapters.forEach((ch, i) => {
    if (!ch.title || listed.has(i)) return;
    let k = out.length;
    while (k > 0 && out[k - 1].chapter > i) k--;
    out.splice(k, 0, { title: ch.title, chapter: i });
  });
  return out.length ? out : chapters.map((c, i) => ({ title: c.title || `第 ${i + 1} 部分`, chapter: i }));
}
