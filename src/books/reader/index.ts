// The book reader: a novel laid out page by page (or one long scroll) with pretext, a comic or a magazine page by page,
// over the blurred desk. One page, or an open book's two when the screen is wide enough; pages turn with a slide or a
// curl; contents, bookmarks, search and every typographic setting are a click away and apply as you change them.
// Where you are is (chapter, character offset), so any change of font, size or page width keeps the same text in view.
// The top and bottom bars carry data-edge, so the app's immersive mode can tuck them into the edges; a tap in the
// middle of the page toggles that mode. Nothing runs while the page is still.
import { clearCache as clearMeasures } from '@chenglou/pretext';
import { h } from '../../util/dom';
import type { BookDoc, BookMeta, BookProgress, BookSettings, Bookmark, FixedDoc, FlowDoc, ReaderHost, TocItem } from '../types';
import { BOOK_SETTINGS_DEFAULT } from '../types';
import { FlowLayout, type Page, type Ref } from './flow';
import { FONTS } from './fonts';
import { pictureSize } from './imgsize';
import { paintInto, paintPage } from './paint';

interface Geo {
  vw: number; vh: number; small: boolean; twoUp: boolean;
  /** one page sheet */
  sheetW: number; sheetH: number;
  /** the text area inside it */
  colW: number; textH: number; margin: number; padTop: number;
  /** where the book (one or two sheets) sits in the stage */
  bookX: number; bookY: number; bookW: number;
  top: number; bottom: number;
}
type FixedPages = number[];

const THEMES: Array<[BookSettings['theme'], string, string]> = [
  ['paper', '纸白', '#fffdf6'], ['sepia', '米黄', '#f4ecd8'], ['green', '护眼', '#cfe5cc'], ['ink', '墨水屏', '#ffffff'], ['night', '夜间', '#1f1d1a'],
];
const now = () => Date.now();
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** Sections round the one being read whose pages stay laid out (the rest keep only their page counts). */
const KEEP_SECTIONS = 2;
/** Fixed pages either side of the view whose decoded pictures are kept (two are fetched ahead each way). */
const FIXED_KEEP = 4;

/** Page counts found this session, per book, settings and page size (pages per section): a book opened again, or
 *  a setting put back, needs no pass over the whole book for its page numbers. A few dozen are kept. */
const COUNTS = new Map<string, Int32Array>();
const COUNTS_MAX = 32;
function rememberCounts(key: string, counts: Int32Array) {
  if (!counts.some((c) => c >= 0)) return;
  COUNTS.delete(key);
  COUNTS.set(key, counts);
  while (COUNTS.size > COUNTS_MAX) COUNTS.delete(COUNTS.keys().next().value!);
}

/** A decoded page picture as the cache holds it. */
type FixedImage = CanvasImageSource & { width: number; height: number };
/** Give a decoded page's memory back at once (not whenever the garbage collector gets to it). */
function releaseImage(img: unknown) {
  if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
  else if (img instanceof HTMLCanvasElement) { img.width = 0; img.height = 0; }
}
/** The page canvases of a view that has left the stage: their pixels go now. */
function releaseCanvases(el: HTMLElement) {
  for (const cv of el.querySelectorAll<HTMLCanvasElement>('canvas.bk-pagecanvas')) { cv.width = 0; cv.height = 0; }
}

export class BookReader {
  el: HTMLDivElement;
  private stage: HTMLDivElement;
  private book: HTMLDivElement | null = null;
  private scroller: HTMLDivElement;
  private top: HTMLDivElement;
  private bottom: HTMLDivElement;
  private titleChap: HTMLSpanElement;
  private status: HTMLSpanElement;
  private slider: HTMLInputElement;
  private tip: HTMLDivElement;
  private ticks: HTMLDivElement;
  private bmBtn: HTMLButtonElement;
  private panels: Record<'toc' | 'search' | 'set', HTMLDivElement>;
  private s: BookSettings;
  private geo!: Geo;
  private flow: FlowLayout | null = null;
  private imgSize = new Map<string, { w: number; h: number }>();
  /** pictures whose size could not be read (not tried again: a section laid out again lays out the same) */
  private noSize = new Set<string>();
  private urls = new Map<string, string>();
  /** the text being read (survives re-layouts): the first character of the first page in view */
  private anchor = { chapter: 0, offset: 0 };
  /** what is on screen now */
  private refs: Array<Ref | null> = [];
  private fixedPages: FixedPages = [];
  /** decoded pages (key page@width): the ones in view and the ones either side of it, ready for the next turn */
  private fixedCache = new Map<string, { pi: number; w: number; img: Promise<FixedImage> }>();
  /** the book, for the session's page counts (flow) */
  private bookKey = '';
  /** how long laying out takes, ms per character (learnt as it goes): the idle pass starts a section only if it fits */
  private msPerChar = 0.0005;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  private zoom = { k: 1, x: 0, y: 0 };
  private bookmarks: Bookmark[];
  private gen = 0;
  private busy: Promise<void> = Promise.resolve();
  private animating: Animation[] = [];
  private lastTurn = 0;
  private wheelAcc = 0;
  private idleId = 0;
  private resizeT: ReturnType<typeof setTimeout> | undefined;
  private relayoutT: ReturnType<typeof setTimeout> | undefined;
  private mark: { chapter: number; o0: number; o1: number } | null = null;
  private opened = false;
  private destroyed = false;
  private pointers = new Map<number, { x: number; y: number; t: number }>();
  private pinch: { d: number; k: number } | null = null;
  private drag: { x: number; y: number; zx: number; zy: number; moved: boolean } | null = null;
  private scrollSecs: Array<{ si: number; el: HTMLDivElement }> = [];
  /** set by the reader's own switch: overrides the book's direction */
  private rtlSet: boolean | null = null;
  /** right-to-left pages: the switch if touched, else the book's own direction, else the setting */
  private get rtl() { return this.doc.kind === 'fixed' && (this.rtlSet ?? this.doc.rtl ?? this.s.rtl); }
  private scrollFrame = 0;

  constructor(private host: HTMLElement, private doc: BookDoc, private meta: BookMeta, settings: BookSettings, private cb: ReaderHost) {
    this.s = { ...BOOK_SETTINGS_DEFAULT, ...settings };
    this.bookmarks = [...(meta.bookmarks ?? [])];
    const btn = (label: string, title: string, on: () => void, cls = '') => {
      const b = h('button', { class: 'bk-btn ' + cls, type: 'button', title }, label) as HTMLButtonElement;
      b.addEventListener('click', (e) => { e.stopPropagation(); on(); });
      return b;
    };
    this.stage = h('div', { class: 'bk-stage' });
    this.scroller = h('div', { class: 'bk-scroll' });
    // the top bar: back to the desk, what is being read, the tools
    this.titleChap = h('span', { class: 'bk-t-chap' });
    this.bmBtn = btn('书签', '在这一页加书签 / 取消（M）', () => this.toggleBookmark(), 'bm');
    this.top = h('div', { class: 'bk-top', 'data-edge': 'top' },
      btn('‹ 书桌', '回到书桌（B）', () => this.cb.onClose(), 'back'),
      h('div', { class: 'bk-title' }, h('span', { class: 'bk-t-book' }, doc.title || meta.title), this.titleChap),
      h('div', { class: 'bk-tools' },
        btn('目录', '目录与书签（T）', () => this.togglePanel('toc')),
        this.bmBtn,
        btn('搜索', '在书里搜索（/）', () => this.togglePanel('search')),
        btn('Aa', '阅读设置', () => this.togglePanel('set'), 'aa')));
    // the bottom bar: chapters, the progress slider, where we are
    this.slider = h('input', { class: 'bk-slider', type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': '阅读进度' }) as HTMLInputElement;
    this.tip = h('div', { class: 'bk-tip' });
    this.ticks = h('div', { class: 'bk-ticks' });
    this.status = h('span', { class: 'bk-status' });
    this.bottom = h('div', { class: 'bk-bottom', 'data-edge': 'bottom' },
      btn('‹', '上一章', () => void this.chapterStep(-1), 'chap'),
      h('div', { class: 'bk-progress' }, this.ticks, this.slider, this.tip),
      btn('›', '下一章', () => void this.chapterStep(1), 'chap'),
      this.status);
    this.panels = { toc: this.panel('toc', '目录'), search: this.panel('search', '搜索'), set: this.panel('set', '阅读设置') };
    this.el = h('div', { class: 'bk-reader', role: 'region', 'aria-label': doc.title || meta.title },
      this.stage, this.scroller, this.top, this.bottom, this.panels.toc, this.panels.search, this.panels.set);
    this.el.dataset.kind = doc.kind;
    this.applyTheme();
    if (doc.kind === 'flow') {
      let hash = 2166136261;
      for (const c of doc.chapters) { hash = Math.imul(hash ^ c.chars, 16777619); hash = Math.imul(hash ^ c.blocks.length, 16777619); }
      this.bookKey = `${meta.id}|${doc.title}|${doc.lang ?? ''}|${doc.chapters.length}|${(hash >>> 0).toString(36)}`;
    }
  }

  /* ================= opening and closing ================= */

  /** Lay out and show the book at a position (the start by default). */
  async open(at?: BookProgress) {
    if (this.opened) return;
    this.opened = true;
    this.host.append(this.el);
    this.measure();
    this.listen(true);
    if (this.doc.kind === 'flow') {
      this.anchor = at ? { chapter: clamp(at.chapter, 0, this.doc.chapters.length - 1), offset: Math.max(0, at.offset) } : { chapter: 0, offset: 0 };
      this.flow = this.makeFlow();
      this.drawTicks();
      await this.showAnchor(0);
      this.idleLayout();
    } else {
      const p = at ? clamp(Math.round(at.offset), 0, this.doc.pages - 1) : 0;
      this.anchor = { chapter: 0, offset: p };
      await this.showFixed(p, 0);
    }
    this.el.classList.add('on');
  }

  /** Where the page (or the open book's two pages) is on screen. */
  pageRect(): DOMRect {
    const sheets = this.book ? [...this.book.querySelectorAll<HTMLElement>('.bk-sheet')] : [];
    if (!sheets.length) { const g = this.geo; return new DOMRect(g.bookX, g.bookY, g.bookW, g.sheetH); }
    const rs = sheets.map((s) => s.getBoundingClientRect());
    const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top));
    return new DOMRect(x0, y0, Math.max(...rs.map((r) => r.right)) - x0, Math.max(...rs.map((r) => r.bottom)) - y0);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gen++;
    this.listen(false);
    for (const a of this.animating) a.cancel();
    clearTimeout(this.resizeT);
    clearTimeout(this.relayoutT);
    if (this.idleId) cancelIdle(this.idleId);
    if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
    this.el.remove();
    // what was counted stays for the session; decoded pages and drawn canvases go now, and a fixed book's own
    // resources (a PDF's worker) with them (destroying it again, as the app does, is harmless)
    for (const [key, f] of this.layouts) rememberCounts(this.bookKey + '#' + key, f.knownCounts());
    this.dropFixed(() => false);
    releaseCanvases(this.el);
    if (this.doc.kind === 'fixed') this.doc.destroy?.();
    // pretext's measurements of this book's words (bounded by pretext, but of a book no longer open): prepared
    // text elsewhere keeps its own widths; anything laid out later is measured again
    else clearMeasures();
  }

  /* ================= geometry ================= */

  private measure() {
    const vw = this.el.clientWidth || innerWidth, vh = this.el.clientHeight || innerHeight, small = vw < 720 || vh < 520;
    const top = small ? 50 : 62, bottom = small ? 64 : 76, outer = small ? 6 : 32, gutter = 0;
    const s = this.s, sheetH = Math.max(240, vh - top - bottom);
    const margin = small ? Math.min(s.margin, 24) : s.margin, padTop = small ? 34 : Math.round(Math.max(44, Math.min(72, s.margin * 0.85)));
    let twoUp: boolean;
    if (this.doc.kind === 'fixed') twoUp = s.spread === 'double' || (s.spread === 'auto' && !small && vw > vh * 1.1);
    else twoUp = s.spread === 'double' || (s.spread === 'auto' && !small && vw > vh * 1.15 && (vw - 2 * outer - gutter) / 2 - 2 * margin >= Math.min(s.width, 560));
    if (this.s.mode === 'scroll') twoUp = false;
    const maxSheet = twoUp ? (vw - 2 * outer - gutter) / 2 : vw - 2 * outer;
    const colW = Math.floor(Math.max(160, Math.min(s.width, maxSheet - 2 * margin)));
    const sheetW = colW + 2 * margin, bookW = twoUp ? sheetW * 2 + gutter : sheetW;
    this.geo = { vw, vh, small, twoUp, sheetW, sheetH, colW, textH: Math.floor(sheetH - padTop * 2), margin, padTop,
      bookX: Math.round((vw - bookW) / 2), bookY: top, bookW, top, bottom };
    this.el.style.setProperty('--bk-top', `${top}px`);
    this.el.style.setProperty('--bk-bottom', `${bottom}px`);
    this.el.dataset.mode = this.doc.kind === 'flow' ? this.s.mode : 'page';
  }

  private layouts = new Map<string, FlowLayout>();
  /** A layout for the current settings and page size (the last few are kept: switching a setting back is instant;
   *  the page counts of the book with these settings, if found before this session, come with it). */
  private makeFlow() {
    const s = this.s, g = this.geo;
    const key = [s.font, s.size, s.lineHeight, s.paraSpace, s.indent, s.letterSpace, s.align, g.colW, g.textH].join('|');
    let f = this.layouts.get(key);
    if (!f) {
      f = new FlowLayout(this.doc as FlowDoc, s, { colW: g.colW, textH: g.textH }, this.imgSize);
      const known = COUNTS.get(this.bookKey + '#' + key);
      if (known) f.preload(known);
      this.layouts.set(key, f);
      if (this.layouts.size > 4) {
        const [oldKey, old] = this.layouts.entries().next().value!;
        rememberCounts(this.bookKey + '#' + oldKey, old.knownCounts());
        this.layouts.delete(oldKey);
      }
    } else { this.layouts.delete(key); this.layouts.set(key, f); }
    return f;
  }
  /** The sections whose pages a layout keeps: the ones round where we are, and the ones in view. */
  private keepNear(flow: FlowLayout) {
    const here = flow.sectionAt(this.anchor.chapter, this.anchor.offset);
    const shown = new Set(flow === this.flow ? this.refs.filter(Boolean).map((r) => r!.si) : []);
    return (si: number) => Math.abs(si - here) <= KEEP_SECTIONS || shown.has(si);
  }

  /* ================= flow: laying out and showing pages ================= */

  /** Has the section pictures whose sizes are not known yet? */
  private needsImages(si: number) {
    const sec = this.flow!.sections[si];
    return (this.doc as FlowDoc).chapters[sec.chapter].blocks.slice(sec.b0, sec.b1).some((b) => b.t === 'img' && !this.imgSize.has(b.src) && !this.noSize.has(b.src) && (this.doc as FlowDoc).resources.has(b.src));
  }
  /** Lay out a section: its pictures' sizes first (they decide its pages), then its text. */
  private async ensure(si: number) {
    const flow = this.flow!, sec = flow.sections[si];
    if (!sec) return null;
    if (!sec.pages) await this.imageSizes(flow, si);
    return flow.ensure(si);
  }
  /** What counting a section's pages waits for: its pictures' sizes and its faces. */
  private async ensureCount(flow: FlowLayout, si: number) {
    await this.imageSizes(flow, si);
    await flow.ensureFaces(si);
  }
  private async imageSizes(flow: FlowLayout, si: number) {
    const sec = flow.sections[si];
    if (!sec) return;
    const blocks = (this.doc as FlowDoc).chapters[sec.chapter].blocks.slice(sec.b0, sec.b1);
    await Promise.all(blocks.map(async (b) => {
      if (b.t !== 'img' || this.imgSize.has(b.src) || this.noSize.has(b.src)) return;
      const res = (this.doc as FlowDoc).resources;
      if (!res.has(b.src)) return;
      const sz = await pictureSize(res, b.src);
      if (sz && sz.w > 0 && sz.h > 0) this.imgSize.set(b.src, sz);
      else this.noSize.add(b.src);
    }));
  }
  private async nextRef(r: Ref): Promise<Ref | null> {
    const pages = await this.ensure(r.si);
    if (!pages) return null;
    if (r.pi + 1 < pages.length) return { si: r.si, pi: r.pi + 1 };
    if (r.si + 1 < this.flow!.sections.length) { await this.ensure(r.si + 1); return { si: r.si + 1, pi: 0 }; }
    return null;
  }
  private async prevRef(r: Ref): Promise<Ref | null> {
    if (r.pi > 0) return { si: r.si, pi: r.pi - 1 };
    if (r.si > 0) { const pages = await this.ensure(r.si - 1); return pages ? { si: r.si - 1, pi: pages.length - 1 } : null; }
    return null;
  }

  /** Show the page holding the anchor. */
  private async showAnchor(dir: number) {
    const flow = this.flow!;
    if (this.s.mode === 'scroll') return this.showScroll();
    await this.ensure(flow.sectionAt(this.anchor.chapter, this.anchor.offset));
    await this.showRef(flow.refAt(this.anchor.chapter, this.anchor.offset), dir, false);
  }

  /** Show the view starting at a page (and the page after it, as an open book). */
  private async showRef(r: Ref, dir: number, setAnchor = true) {
    const flow = this.flow!;
    const refs: Array<Ref | null> = [r];
    if (this.geo.twoUp) refs.push(await this.nextRef(r));
    this.refs = refs;
    const first = flow.page(r)!;
    if (setAnchor) this.anchor = { chapter: first.chapter, offset: first.o0 };
    const book = this.bookEl(refs.map((x) => (x ? flow.page(x) : null)), null);
    await this.swap(book, dir);
    this.afterMove();
    // the neighbours, ready before they are asked for
    void this.prefetch(r);
  }
  private async prefetch(r: Ref) {
    const flow = this.flow;
    const n = await this.nextRef(r);
    const nn = n && this.geo.twoUp ? await this.nextRef(n) : null;
    const p = await this.prevRef(r);
    // their pictures unpacked now (a book's pictures are read out of its file when first shown), not mid-turn
    if (flow !== this.flow || this.destroyed) return;
    for (const x of [n, nn, p]) { const pg = x && flow!.page(x); if (pg) for (const it of pg.items) if (it.kind === 'img') this.imgUrl(it.src); }
  }

  private async turn(dir: 1 | -1) {
    if (this.doc.kind === 'fixed') return this.turnFixed(dir);
    if (this.s.mode === 'scroll') { this.scroller.scrollBy({ top: dir * (this.scroller.clientHeight - 60), behavior: 'smooth' }); return; }
    const flow = this.flow;
    if (!flow || !this.refs[0]) return;
    this.finishAnimations();
    this.mark = null;
    if (dir > 0) {
      const last = [...this.refs].reverse().find(Boolean) as Ref;
      const n = await this.nextRef(last);
      if (!n) return this.flash('已经是最后一页了');
      await this.showRef(n, 1);
    } else {
      let p = await this.prevRef(this.refs[0]);
      if (!p) return this.flash('已经是第一页了');
      if (this.geo.twoUp) { const pp = await this.prevRef(p); if (pp) p = pp; }
      await this.showRef(p, -1);
    }
    this.lastTurn = performance.now();
  }

  /** Go to a position (contents, bookmarks, search hits, the slider). */
  private async goTo(chapter: number, offset: number, dir = 0, mark: { o0: number; o1: number } | null = null) {
    if (this.doc.kind === 'fixed') return this.showFixed(clamp(Math.round(offset), 0, this.doc.pages - 1), dir);
    this.mark = mark ? { chapter, ...mark } : null;
    this.anchor = { chapter, offset };
    await this.showAnchor(dir);
    if (this.s.mode !== 'scroll') {
      const p = this.flow!.page(this.refs[0]!);
      if (p) this.anchor = { chapter: p.chapter, offset: mark ? offset : p.o0 };
    }
  }

  private async chapterStep(d: number) {
    if (this.doc.kind === 'fixed') {
      const toc = flatToc(this.doc.toc), cur = this.fixedPages[0] ?? 0;
      const starts = toc.map((t) => t.block ?? 0).sort((a, b) => a - b);
      const target = d > 0 ? starts.find((s) => s > cur) : [...starts].reverse().find((s) => s < cur);
      return this.showFixed(target ?? (d > 0 ? this.doc.pages - 1 : 0), d);
    }
    const p = this.currentPage();
    if (!p) return;
    let c = p.chapter + d;
    if (d < 0 && p.o0 > 0) c = p.chapter;               // first back to this chapter's start
    if (c < 0 || c >= this.doc.chapters.length) return this.flash(d > 0 ? '已经是最后一章了' : '已经是第一章了');
    await this.goTo(c, 0, d);
  }

  private currentPage(): Page | null { return this.flow && this.refs[0] ? this.flow.page(this.refs[0]) : null; }

  /** Lay out the rest in idle time: neighbours first (their pages kept), then everything else counted (for exact
   *  page numbers; those pages are not kept). Counts found before this session are not counted again. */
  private idleLayout() {
    const flow = this.flow;
    if (!flow) return;
    const gen = this.gen, here = flow.sectionAt(this.anchor.chapter, this.anchor.offset);
    const order = flow.sections.map((_, i) => i).sort((a, b) => Math.abs(a - here) - Math.abs(b - here));
    const near = (si: number) => Math.abs(si - here) <= KEEP_SECTIONS;
    const done = (si: number) => (near(si) ? flow.sections[si].pages != null : flow.sections[si].count != null);
    let k = 0;
    // as many sections as an idle moment has room for (pictures' sizes and missing faces are waited for); a section
    // is started only when what it should take fits in what is left of the moment (or the moment has done nothing yet)
    const step = (deadline?: { timeRemaining(): number }) => {
      this.idleId = 0;
      if (gen !== this.gen || this.destroyed) return;
      const t0 = performance.now(), left = () => (deadline ? deadline.timeRemaining() : 12 - (performance.now() - t0));
      let did = false;
      while (k < order.length && done(order[k])) k++;
      while (k < order.length && left() > 4) {
        const si = order[k], sec = flow.sections[si];
        if (did && (sec.o1 - sec.o0) * this.msPerChar > left() - 2) break;
        const t1 = performance.now();
        if (this.needsImages(si) || (near(si) ? !flow.tryNow(si) : flow.countNow(si) == null)) {
          void (near(si) ? this.ensure(si) : this.ensureCount(flow, si)).then(() => { if (gen === this.gen && !this.destroyed) this.idleId = requestIdle(step); });
          return;
        }
        const chars = sec.o1 - sec.o0;
        if (chars > 2000) this.msPerChar = this.msPerChar * 0.7 + ((performance.now() - t1) / chars) * 0.3;
        did = true;
        k++;
        while (k < order.length && done(order[k])) k++;
      }
      if (k >= order.length) {
        rememberCounts(this.bookKey + '#' + this.keyOf(flow), flow.knownCounts());
        this.updateBars();
        return;
      }
      this.idleId = requestIdle(step);
    };
    this.idleId = requestIdle(step);
  }
  private keyOf(flow: FlowLayout) {
    for (const [key, f] of this.layouts) if (f === flow) return key;
    return '';
  }

  /* ================= building pages ================= */

  private bookEl(pages: Array<Page | null>, fixed: FixedPages | null): HTMLDivElement {
    const g = this.geo;
    const book = h('div', { class: 'bk-book' + (g.twoUp ? ' two' : ''), style: `left:${g.bookX}px;top:${g.bookY}px;width:${g.bookW}px;height:${g.sheetH}px` });
    if (fixed) {
      const order = this.rtl && g.twoUp ? [...fixed].reverse() : fixed;
      const full = g.twoUp && fixed.length === 1;   // a lone cover in an open book
      order.forEach((pi, k) => book.append(this.fixedSheet(pi, g.twoUp ? (full ? (this.rtl ? 'l' : 'r') : k === 0 ? 'l' : 'r') : 's')));
      if (full) book.classList.add('lone');
      if (this.s.fit === 'width' && !g.twoUp) book.style.height = `${Math.max(g.sheetH, ...fixed.map((p) => this.fixedBox(p).h))}px`;
    } else pages.forEach((p, k) => book.append(this.sheetEl(p, g.twoUp ? (k === 0 ? 'l' : 'r') : 's')));
    return book;
  }

  private sheetEl(p: Page | null, side: 'l' | 'r' | 's'): HTMLDivElement {
    const g = this.geo;
    const sheet = h('div', { class: `bk-sheet ${side}`, style: `width:${g.sheetW}px;height:${g.sheetH}px;${side === 'r' ? `left:${g.sheetW}px;` : ''}` });
    if (!p) { sheet.classList.add('blank'); return sheet; }
    const flow = this.flow!, doc = this.doc as FlowDoc;
    const text = paintPage(p, { imgUrl: (src) => this.imgUrl(src), letter: flow.m.letter, mark: this.mark });
    Object.assign(text.style, { left: `${g.margin}px`, top: `${g.padTop}px`, width: `${g.colW}px`, height: `${g.textH}px` });
    sheet.append(text);
    const chapTitle = doc.chapters[p.chapter]?.title || tocTitle(doc.toc, p.chapter) || '';
    if (!p.opener && chapTitle) sheet.append(h('div', { class: 'bk-head', style: `left:${g.margin}px;right:${g.margin}px` }, chapTitle));
    const { n } = flow.numberOf({ si: p.sec, pi: p.index });
    sheet.append(h('div', { class: `bk-foot ${side}`, style: `left:${g.margin}px;right:${g.margin}px` }, String(n + 1)));
    if (this.bookmarkOn(p.chapter, p.o0, p.o1)) sheet.append(h('div', { class: 'bk-ribbon', title: '书签' }));
    return sheet;
  }

  private imgUrl(src: string) {
    let u = this.urls.get(src);
    if (!u) {
      const blob = (this.doc as FlowDoc).resources?.get(src);
      u = blob ? URL.createObjectURL(blob) : 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
      this.urls.set(src, u);
    }
    return u;
  }

  /** The view on the stage now (the one a turn takes away). */
  private shown: HTMLDivElement | null = null;
  /** The new view in, the old one out (with the turn the settings ask for). */
  private async swap(book: HTMLDivElement, dir: number) {
    const old = this.shown;
    this.book = book;
    this.zoom = { k: 1, x: 0, y: 0 };
    if (!old || dir === 0 || this.s.turn === 'none' || this.reducedMotion.matches) {
      this.stage.append(book);
      this.shown = book;
      if (old) this.retire(old);
      return;
    }
    const vdir = this.rtl ? -dir : dir;
    if (this.doc.kind === 'fixed') {
      const ready = [...book.querySelectorAll<HTMLElement>('.bk-sheet')].map((sh) => (sh as HTMLElement & { ready?: Promise<void> }).ready).filter(Boolean);
      await Promise.race([Promise.all(ready), new Promise((r) => setTimeout(r, 350))]);
      // another view was asked for while this one's pictures came (quick turns): this one is never shown
      if (this.book !== book) { this.retire(book); return; }
    }
    if (this.s.turn === 'curl') return this.curl(old, book, vdir);
    this.stage.append(book);
    this.shown = book;
    const dx = 42 * vdir;
    const a = book.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 230, easing: 'cubic-bezier(.2,.7,.2,1)' });
    const b = old.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dx * 0.7}px)`, opacity: 0 }], { duration: 190, easing: 'ease-in', fill: 'forwards' });
    this.animating.push(a, b);
    await b.finished.catch(() => undefined);
    this.retire(old);
    this.animating = this.animating.filter((x) => x !== a && x !== b);
  }
  /** A view off the stage for good: its page canvases' pixels go with it. */
  private retire(el: HTMLDivElement) {
    el.remove();
    if (this.doc.kind === 'fixed') releaseCanvases(el);
  }

  /** A page turning over on its hinge: in an open book the right page (next) or left page (back) turns over the
   *  gutter, its back showing the page that comes after it; a single page turns away to the left. */
  private async curl(old: HTMLDivElement, book: HTMLDivElement, vdir: number) {
    book.style.zIndex = '0';
    old.style.zIndex = '1';
    this.stage.insertBefore(book, old);
    this.shown = book;
    const g = this.geo, dur = 520;
    const anims: Animation[] = [];
    if (g.twoUp) {
      const olds = [...old.querySelectorAll<HTMLElement>(':scope > .bk-sheet')], news = [...book.querySelectorAll<HTMLElement>(':scope > .bk-sheet')];
      const front = vdir > 0 ? olds[olds.length - 1] : olds[0], backSrc = vdir > 0 ? news[0] : news[news.length - 1];
      if (!front || !backSrc) { this.retire(old); return; }
      // the turning page keeps its own box (a comic page is not a text page's size); its back is the page it reveals
      const box = { x: front.offsetLeft, y: front.offsetTop, w: front.offsetWidth, h: front.offsetHeight };
      const flip = h('div', { class: 'bk-flip', style: `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;transform-origin:${vdir > 0 ? 'left' : 'right'} center` });
      const back = cloneSheet(backSrc);
      back.classList.add('back');
      Object.assign(back.style, { left: '0', top: '0', width: `${box.w}px`, height: `${box.h}px` });
      Object.assign(front.style, { left: '0', top: '0' });
      front.classList.add('front');
      const shade = h('div', { class: 'bk-flip-shade', style: vdir > 0 ? '' : 'transform:scaleX(-1)' });
      front.append(shade);
      flip.append(front, back);
      old.append(flip);
      anims.push(flip.animate([{ transform: 'perspective(5200px) rotateY(0deg)' }, { transform: `perspective(5200px) rotateY(${vdir > 0 ? -180 : 180}deg)` }],
        { duration: dur, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' }));
      anims.push(shade.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.5 }, { opacity: 0.9 }], { duration: dur, fill: 'forwards' }));
    } else {
      // one page: it turns away on its left edge (forward), or the earlier page turns back over it; it darkens as it
      // goes edge-on, and the page under it is uncovered
      const moving = vdir > 0 ? old : book;
      if (vdir < 0) { book.style.zIndex = '2'; this.stage.append(book); }
      moving.style.transformOrigin = 'left center';
      const sheet = moving.querySelector<HTMLElement>('.bk-sheet');
      const shade = h('div', { class: 'bk-flip-shade' });
      sheet?.append(shade);
      const turn = [{ transform: 'perspective(4600px) rotateY(0deg)' }, { transform: 'perspective(4600px) rotateY(-92deg)' }];
      anims.push(moving.animate(vdir > 0 ? turn : [...turn].reverse(), { duration: dur * 0.8, easing: vdir > 0 ? 'cubic-bezier(.5,.05,.7,.6)' : 'cubic-bezier(.25,.5,.4,1)', fill: vdir > 0 ? 'forwards' : 'none' }));
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      anims.push(shade.animate(vdir > 0 ? fade : [...fade].reverse(), { duration: dur * 0.8, fill: 'forwards' }));
      anims[anims.length - 1].finished.then(() => shade.remove(), () => shade.remove());
    }
    this.animating.push(...anims);
    await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
    this.retire(old);
    book.style.zIndex = '';
    this.animating = this.animating.filter((x) => !anims.includes(x));
  }

  private finishAnimations() { for (const a of [...this.animating]) { try { a.finish(); } catch { /* gone */ } } }

  /* ================= scroll mode (flow) ================= */

  private async showScroll() {
    const flow = this.flow!, g = this.geo, sc = this.scroller;
    this.book?.remove();
    this.book = null;
    this.shown = null;
    sc.replaceChildren();
    this.scrollSecs = [];
    const col = h('div', { class: 'bk-col bk-sheet', style: `width:${g.sheetW}px` });
    sc.append(col);
    const si = flow.sectionAt(this.anchor.chapter, this.anchor.offset);
    await this.appendScrollSec(si, false);
    if (si > 0) await this.appendScrollSec(si - 1, true);
    // where the anchor's line is
    const line = col.querySelector<HTMLElement>(`.bk-sec[data-si="${si}"]`);
    let target = line ? line.offsetTop : 0;
    const ls = line ? [...line.querySelectorAll<HTMLElement>('.bk-line')] : [];
    for (const l of ls) if (+l.dataset.o0! <= this.anchor.offset) target = (line!.offsetTop + l.offsetTop) - 24; else break;
    sc.scrollTop = Math.max(0, target);
    this.afterMove();
  }
  private scrollPending = new Set<number>();
  private async appendScrollSec(si: number, before: boolean) {
    const flow = this.flow!, g = this.geo, col = this.scroller.querySelector<HTMLElement>('.bk-col');
    if (!col || this.scrollSecs.some((x) => x.si === si) || this.scrollPending.has(si) || si < 0 || si >= flow.sections.length) return;
    this.scrollPending.add(si);
    const pages = await this.ensure(si).finally(() => this.scrollPending.delete(si));
    if (!pages || this.flow !== flow || !col.isConnected) return;
    const el = h('div', { class: 'bk-sec', 'data-si': String(si), style: `padding:0 ${g.margin}px` });
    const box = h('div', { class: 'bk-text flow', style: `width:${g.colW}px` });
    let y = 0;
    for (const p of pages) {
      const used = p.items.reduce((a, it) => Math.max(a, it.y + it.h), 0);
      paintInto(box, p, { imgUrl: (src) => this.imgUrl(src), letter: flow.m.letter, mark: this.mark, dy: y });
      y += used + flow.m.paraGap;
    }
    box.style.height = `${y}px`;
    el.append(box);
    const scTop = this.scroller.scrollTop;
    if (before) { col.insertBefore(el, col.firstChild); this.scroller.scrollTop = scTop + el.offsetHeight; }
    else col.append(el);
    this.scrollSecs.push({ si, el });
  }
  private onScroll = () => {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      if (this.destroyed || this.s.mode !== 'scroll' || !this.flow) return;
      const sc = this.scroller, col = sc.querySelector<HTMLElement>('.bk-col');
      if (!col) return;
      // more below, more above
      const secs = [...col.querySelectorAll<HTMLElement>('.bk-sec')];
      const lastSi = Math.max(...secs.map((s) => +s.dataset.si!)), firstSi = Math.min(...secs.map((s) => +s.dataset.si!));
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - sc.clientHeight * 1.5) void this.appendScrollSec(lastSi + 1, false);
      if (sc.scrollTop < sc.clientHeight * 1.2) void this.appendScrollSec(firstSi - 1, true);
      // keep a few sections round the one in view; the rest go (the scroll stays where it is)
      if (secs.length > 5) {
        const top = sc.scrollTop;
        const viewSi = +(secs.find((s) => s.offsetTop + s.offsetHeight > top)?.dataset.si ?? firstSi);
        // all measured first, then taken out (a measure between removals would lay the column out again each time)
        const gone = secs.filter((s) => Math.abs(+s.dataset.si! - viewSi) > 2).map((s) => ({ s, si: +s.dataset.si!, above: s.offsetTop + s.offsetHeight <= top, hgt: s.offsetHeight }));
        let shift = 0;
        for (const { s, si, above, hgt } of gone) {
          s.remove();
          this.scrollSecs = this.scrollSecs.filter((x) => x.si !== si);
          if (above) shift += hgt;
        }
        if (shift) sc.scrollTop = top - shift;
      }
      // the first line in view is where we are
      const y = sc.scrollTop + 8;
      for (const s of secs) {
        if (s.offsetTop + s.offsetHeight < y) continue;
        let o = -1;
        for (const l of s.querySelectorAll<HTMLElement>('.bk-line')) { if (s.offsetTop + l.offsetTop + l.offsetHeight >= y) { o = +l.dataset.o0!; break; } }
        if (o >= 0) { const sec = this.flow.sections[+s.dataset.si!]; this.anchor = { chapter: sec.chapter, offset: o }; }
        break;
      }
      this.afterMove();
    });
  };

  /* ================= fixed pages (comics, magazines) ================= */

  private fixedSpread(i: number): FixedPages {
    const n = (this.doc as FixedDoc).pages;
    if (!this.geo.twoUp) return [clamp(i, 0, n - 1)];
    if (i <= 0) return [0];
    const a = i % 2 === 1 ? i : i - 1;
    return a + 1 < n ? [a, a + 1] : [a];
  }
  private async showFixed(i: number, dir: number) {
    const doc = this.doc as FixedDoc, pages = this.fixedSpread(i);
    this.fixedPages = pages;
    this.anchor = { chapter: 0, offset: pages[0] };
    // a page's size decides its box: the ones not known yet are read first (a PDF's pages are measured when needed)
    if (doc.sizeOf && pages.some((p) => !doc.size(p))) {
      await Promise.all(pages.map((p) => doc.sizeOf!(p)));
      if (this.fixedPages !== pages || this.destroyed) return;
    }
    const book = this.bookEl([], pages);
    // decoded pages further than a few either side go (their memory back at once); the margin is twice what is
    // fetched ahead, so turning back and forth decodes nothing again
    const w0 = this.fixedPixelWidth(), lo = pages[0] - FIXED_KEEP, hi = pages[pages.length - 1] + FIXED_KEEP;
    this.dropFixed((e) => e.w === w0 && e.pi >= lo && e.pi <= hi);
    await this.swap(book, dir);
    this.afterMove();
    // the next and previous pages, ready before they are asked for
    const n = (this.doc as FixedDoc).pages, w = this.fixedPixelWidth();
    for (const d of [1, 2, -1, -2]) { const p = this.fixedPages[d > 0 ? this.fixedPages.length - 1 : 0] + d; if (p >= 0 && p < n) void this.fixedImage(p, w); }
  }
  private async turnFixed(dir: 1 | -1) {
    this.finishAnimations();
    const n = (this.doc as FixedDoc).pages, cur = this.fixedPages;
    const target = dir > 0 ? cur[cur.length - 1] + 1 : cur[0] - 1;
    if (target >= n) return this.flash('已经是最后一页了');
    if (target < 0) return this.flash('已经是第一页了');
    await this.showFixed(dir < 0 && this.geo.twoUp ? Math.max(0, target - (target % 2 === 0 ? 1 : 0)) : target, dir);
    this.lastTurn = performance.now();
  }
  private fixedBox(pi: number) {
    const g = this.geo, doc = this.doc as FixedDoc;
    const sz = doc.size(pi) ?? doc.size(0) ?? { w: 1000, h: 1414 };
    const areaW = g.twoUp ? (g.vw - 64) / 2 : g.vw - (g.small ? 12 : 64), areaH = g.sheetH;
    let w: number, hh: number;
    if (this.s.fit === 'width' && !g.twoUp) { w = Math.min(areaW, 1100); hh = w * (sz.h / sz.w); }
    else { const k = Math.min(areaW / sz.w, areaH / sz.h); w = sz.w * k; hh = sz.h * k; }
    return { w: Math.round(w), h: Math.round(hh) };
  }
  private fixedPixelWidth() {
    const b = this.fixedBox(this.fixedPages[0] ?? 0);
    return Math.ceil((b.w * Math.min(3, devicePixelRatio || 1)) / 200) * 200;
  }
  private fixedImage(pi: number, widthPx: number): Promise<FixedImage> {
    const key = `${pi}@${widthPx}`;
    let e = this.fixedCache.get(key);
    if (!e) {
      e = { pi, w: widthPx, img: (this.doc as FixedDoc).render(pi, widthPx) as Promise<FixedImage> };
      this.fixedCache.set(key, e);
      // (a safety net: the window round the view keeps far fewer)
      if (this.fixedCache.size > 24) { const oldest = this.fixedCache.values().next().value!; this.dropFixed((x) => x !== oldest); }
    }
    return e.img;
  }
  /** Let decoded pages go, all but the ones wanted: each one's memory is given back as soon as whatever was
   *  already waiting to draw it has drawn it. */
  private dropFixed(want: (e: { pi: number; w: number }) => boolean) {
    for (const [key, e] of this.fixedCache) {
      if (want(e)) continue;
      this.fixedCache.delete(key);
      e.img.then(releaseImage, () => undefined);
    }
  }
  private fixedSheet(pi: number, side: 'l' | 'r' | 's'): HTMLDivElement {
    const g = this.geo, box = this.fixedBox(pi);
    const sheet = h('div', { class: `bk-sheet fixed ${side}`, 'data-page': String(pi) });
    // in an open book the two pages meet at the middle; one page is centred
    const x = side === 's' ? (g.bookW - box.w) / 2 : side === 'l' ? g.bookW / 2 - box.w : g.bookW / 2;
    const y = this.s.fit === 'width' && !g.twoUp ? 0 : (g.sheetH - box.h) / 2;
    Object.assign(sheet.style, { left: `${x}px`, top: `${y}px`, width: `${box.w}px`, height: `${box.h}px` });
    const cv = h('canvas', { class: 'bk-pagecanvas' }) as HTMLCanvasElement;
    sheet.append(cv);
    const dpr = Math.min(3, devicePixelRatio || 1);
    cv.width = Math.round(box.w * dpr);
    cv.height = Math.round(box.h * dpr);
    sheet.classList.add('loading');
    (sheet as HTMLDivElement & { ready?: Promise<void> }).ready = this.fixedImage(pi, this.fixedPixelWidth()).then((img) => {
      if (this.destroyed) return;
      cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
      sheet.classList.remove('loading');
    }, () => { sheet.classList.add('broken'); });
    if (this.bookmarkOn(0, pi, pi + 1)) sheet.append(h('div', { class: 'bk-ribbon', title: '书签' }));
    return sheet;
  }

  /* ================= after every move: bars, progress ================= */

  private afterMove() {
    if (this.destroyed) return;
    this.updateBars();
    const p = this.position();
    this.cb.onProgress({ chapter: p.chapter, offset: p.offset, percent: p.percent, at: now() });
    // the pages of sections far from here go (their counts stay; laying one out again gives the same pages)
    if (this.flow) this.flow.release(this.keepNear(this.flow));
  }

  /** Where we are, and how far through the book (to the end of what is in view). */
  private position() {
    if (this.doc.kind === 'fixed') {
      const last = this.fixedPages[this.fixedPages.length - 1] ?? 0, n = this.doc.pages;
      return { chapter: 0, offset: this.fixedPages[0] ?? 0, percent: n <= 1 ? 1 : (last + 1) / n };
    }
    const flow = this.flow!;
    if (this.s.mode === 'scroll') return { ...this.anchor, percent: flow.percent(this.anchor.chapter, this.anchor.offset) };
    const pages = this.refs.filter(Boolean).map((r) => flow.page(r!)!).filter(Boolean);
    const first = pages[0], last = pages[pages.length - 1];
    if (!first) return { ...this.anchor, percent: 0 };
    return { chapter: first.chapter, offset: first.o0, percent: flow.percent(last.chapter, last.o1) };
  }

  private pct = '';
  private updateBars() {
    if (this.destroyed) return;
    const pos = this.position();
    const v = String(Math.round(pos.percent * 1000)), pct = `${(pos.percent * 100).toFixed(2)}%`;
    if (this.slider.value !== v) this.slider.value = v;
    // (on the slider itself, the only thing that paints it: set on the reader it would restyle every line on screen)
    if (pct !== this.pct) { this.pct = pct; this.slider.style.setProperty('--bk-pct', pct); }
    if (this.doc.kind === 'fixed') {
      const n = this.doc.pages, ps = this.fixedPages;
      setText(this.titleChap, tocAtPage(this.doc.toc, ps[0] ?? 0) || '');
      setText(this.status, `第 ${ps.map((p) => p + 1).join('–')} / ${n} 页 · ${Math.round(pos.percent * 100)}%`);
    } else {
      const flow = this.flow!, doc = this.doc;
      const chap = doc.chapters[pos.chapter]?.title || tocTitle(doc.toc, pos.chapter) || `第 ${pos.chapter + 1} 章`;
      const everyFrame = this.s.mode === 'scroll';
      setText(this.titleChap, chap, everyFrame);
      if (everyFrame) setText(this.status, `${chap} · ${Math.round(pos.percent * 100)}%`, true);
      else {
        const rs = this.refs.filter(Boolean) as Ref[];
        const nums = rs.map((r) => flow.numberOf(r));
        const { total, exact } = flow.counts();
        const left = nums[nums.length - 1]?.left ?? 0;
        setText(this.status, `第 ${nums.map((x) => x.n + 1).join('–')} / ${exact ? '' : '约 '}${total} 页 · ${left > 0 ? `本章还剩 ${left} 页` : '本章最后一页'} · ${Math.round(pos.percent * 100)}%`);
      }
    }
    const on = this.doc.kind === 'fixed' ? this.bookmarkOn(0, this.fixedPages[0] ?? 0, (this.fixedPages[this.fixedPages.length - 1] ?? 0) + 1) : this.viewBookmark() !== null;
    if (this.bmBtn.getAttribute('aria-pressed') !== String(on)) this.bmBtn.setAttribute('aria-pressed', String(on));
    if (this.panels.toc.classList.contains('on')) this.markTocHere();
  }

  /* ================= bookmarks ================= */

  private bookmarkOn(chapter: number, o0: number, o1: number) { return this.bookmarks.some((b) => b.chapter === chapter && b.offset >= o0 && (b.offset < o1 || (o0 === o1 && b.offset === o0))); }
  private viewBookmark(): number | null {
    const flow = this.flow;
    if (!flow) return null;
    const pages = this.s.mode === 'scroll' ? [] : this.refs.filter(Boolean).map((r) => flow.page(r!)!);
    for (let i = 0; i < this.bookmarks.length; i++) {
      const b = this.bookmarks[i];
      if (this.s.mode === 'scroll' ? b.chapter === this.anchor.chapter && Math.abs(b.offset - this.anchor.offset) < 40 : pages.some((p) => p && b.chapter === p.chapter && b.offset >= p.o0 && b.offset < Math.max(p.o1, p.o0 + 1))) return i;
    }
    return null;
  }
  private toggleBookmark() {
    if (this.doc.kind === 'fixed') {
      const p = this.fixedPages[0] ?? 0, i = this.bookmarks.findIndex((b) => b.chapter === 0 && this.fixedPages.includes(b.offset));
      if (i >= 0) { this.bookmarks.splice(i, 1); this.flash('书签已取消'); } else { this.bookmarks.push({ chapter: 0, offset: p, text: `第 ${p + 1} 页`, at: now() }); this.flash('加了书签'); }
    } else {
      const i = this.viewBookmark();
      if (i !== null) { this.bookmarks.splice(i, 1); this.flash('书签已取消'); }
      else {
        const pos = this.position();
        this.bookmarks.push({ chapter: pos.chapter, offset: pos.offset, text: snippetAt(this.doc as FlowDoc, pos.chapter, pos.offset, 28), at: now() });
        this.flash('加了书签');
      }
    }
    this.bookmarks.sort((a, b) => a.chapter - b.chapter || a.offset - b.offset);
    this.cb.onBookmarks([...this.bookmarks]);
    this.redraw();
    if (this.panels.toc.classList.contains('on')) this.fillToc(this.panels.toc.dataset.tab === 'bm' ? 'bm' : 'toc');
  }

  /** The same view again (a bookmark ribbon, a mark), no animation. */
  private redraw() {
    if (this.doc.kind === 'fixed') { void this.showFixed(this.fixedPages[0] ?? 0, 0); return; }
    if (this.s.mode === 'scroll') { void this.showScroll(); return; }
    if (this.refs[0]) void this.showRef(this.refs[0], 0, false);
  }

  /* ================= panels ================= */

  private panel(kind: 'toc' | 'search' | 'set', title: string): HTMLDivElement {
    const close = h('button', { class: 'bk-x', type: 'button', title: '收起（Esc）', html: '<svg viewBox="0 0 24 24"><path d="M6.5 6.8Q12 11.2 17.6 17.4M17.2 6.4Q12 12.4 6.8 17.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' });
    close.addEventListener('click', (e) => { e.stopPropagation(); this.closePanels(); });
    const head = h('div', { class: 'bk-p-head' }, h('span', { class: 'bk-p-title' }, title), close);
    const body = h('div', { class: 'bk-p-body' });
    const el = h('div', { class: `bk-panel ${kind}`, role: 'dialog', 'aria-label': title }, head, body);
    for (const t of ['pointerdown', 'click', 'wheel', 'dblclick']) el.addEventListener(t, (e) => e.stopPropagation(), { passive: t === 'wheel' } as AddEventListenerOptions);
    return el;
  }
  private togglePanel(kind: 'toc' | 'search' | 'set') {
    const el = this.panels[kind], on = !el.classList.contains('on');
    this.closePanels();
    if (!on) return;
    if (kind === 'toc') this.fillToc('toc');
    if (kind === 'search') this.fillSearch();
    if (kind === 'set') this.fillSettings();
    el.classList.add('on');
    this.el.classList.add('panel-open');
    if (kind === 'search') (el.querySelector('input') as HTMLInputElement | null)?.focus();
  }
  private closePanels() {
    for (const p of Object.values(this.panels)) p.classList.remove('on');
    this.el.classList.remove('panel-open');
  }
  private get panelOpen() { return Object.values(this.panels).some((p) => p.classList.contains('on')); }

  /* ----- contents and bookmarks ----- */
  private fillToc(tab: 'toc' | 'bm') {
    const el = this.panels.toc, body = el.querySelector('.bk-p-body')!;
    el.dataset.tab = tab;
    const tabs = h('div', { class: 'bk-tabs' },
      ...(['toc', 'bm'] as const).map((t) => { const b = h('button', { class: 'bk-tab', type: 'button', 'aria-pressed': String(t === tab) }, t === 'toc' ? '目录' : `书签 ${this.bookmarks.length || ''}`.trim());
        b.addEventListener('click', () => this.fillToc(t)); return b; }));
    const list = h('div', { class: 'bk-list' });
    if (tab === 'toc') {
      const items = this.doc.toc.length ? this.doc.toc : this.doc.kind === 'flow' ? this.doc.chapters.map((c, i) => ({ title: c.title || `第 ${i + 1} 章`, chapter: i })) as TocItem[] : [];
      const add = (t: TocItem, depth: number) => {
        const row = h('button', { class: `bk-row lv${Math.min(depth, 3)}`, type: 'button', 'data-ch': String(t.chapter), 'data-bl': String(t.block ?? 0) }, h('span', { class: 'bk-row-t' }, t.title));
        row.addEventListener('click', () => {
          this.closePanels();
          if (this.doc.kind === 'fixed') void this.showFixed(t.block ?? 0, 0);
          else void this.goTo(t.chapter, this.flow!.blockStart[t.chapter]?.[t.block ?? 0] ?? 0, 0);
        });
        list.append(row);
        for (const c of t.children ?? []) add(c, depth + 1);
      };
      for (const t of items) add(t, 0);
      if (!items.length) list.append(h('div', { class: 'bk-empty' }, '这本书没有目录。'));
    } else {
      const add = h('button', { class: 'bk-add', type: 'button' }, this.doc.kind === 'fixed' || this.viewBookmark() === null ? '＋ 在这一页加书签' : '取消这一页的书签');
      add.addEventListener('click', () => this.toggleBookmark());
      list.append(add);
      if (!this.bookmarks.length) list.append(h('div', { class: 'bk-empty' }, '还没有书签。读到想回来的地方，按「书签」或 M。'));
      this.bookmarks.forEach((b, i) => {
        const pct = this.doc.kind === 'fixed' ? (b.offset + 1) / this.doc.pages : this.flow!.percent(b.chapter, b.offset);
        const del = h('button', { class: 'bk-del', type: 'button', title: '删除这个书签' }, '×');
        del.addEventListener('click', (e) => { e.stopPropagation(); this.bookmarks.splice(i, 1); this.cb.onBookmarks([...this.bookmarks]); this.redraw(); this.fillToc('bm'); });
        const row = h('div', { class: 'bk-bm', role: 'button', tabindex: '0' }, h('span', { class: 'bk-bm-t' }, b.text || '（无文字）'), h('span', { class: 'bk-bm-p' }, `${Math.round(pct * 100)}%`), del);
        row.addEventListener('click', () => { this.closePanels(); void this.goTo(b.chapter, b.offset, 0); });
        list.append(row);
      });
    }
    body.replaceChildren(tabs, list);
    if (tab === 'toc') this.markTocHere();
  }
  private markTocHere() {
    const list = this.panels.toc.querySelector('.bk-list');
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>('.bk-row')];
    const pos = this.position();
    let here: HTMLElement | null = null;
    for (const r of rows) {
      const c = +r.dataset.ch!, bl = +r.dataset.bl!;
      const o = this.doc.kind === 'fixed' ? bl : this.flow!.blockStart[c]?.[bl] ?? 0;
      const before = this.doc.kind === 'fixed' ? o <= pos.offset : c < pos.chapter || (c === pos.chapter && o <= pos.offset);
      r.classList.remove('here');
      if (before) here = r;
    }
    here?.classList.add('here');
    here?.scrollIntoView({ block: 'nearest' });
  }

  /* ----- search ----- */
  private fillSearch() {
    const body = this.panels.search.querySelector('.bk-p-body')!;
    if (body.querySelector('input')) return;
    const input = h('input', { class: 'bk-q', type: 'search', placeholder: this.doc.kind === 'flow' ? '搜书里的字句，回车' : '漫画和杂志没有文字可搜', disabled: this.doc.kind !== 'flow' }) as HTMLInputElement;
    const out = h('div', { class: 'bk-list results' });
    let gen = 0;
    const run = async () => {
      const q = input.value.trim(), my = ++gen;
      if (!q || this.doc.kind !== 'flow') { out.replaceChildren(); return; }
      out.replaceChildren(h('div', { class: 'bk-empty' }, '搜索中…'));
      const hits = await searchBook(this.doc, q, 400, () => my !== gen || this.destroyed);
      if (my !== gen || this.destroyed) return;
      out.replaceChildren(h('div', { class: 'bk-count' }, hits.length ? `${hits.length >= 400 ? '400+' : hits.length} 处` : '没找到'));
      for (const hit of hits) {
        const ctx = h('span', { class: 'bk-hit-t' });
        ctx.append(hit.before, h('mark', null, hit.text), hit.after);
        const row = h('button', { class: 'bk-hit', type: 'button' }, ctx,
          h('span', { class: 'bk-hit-p' }, `${(this.doc.chapters[hit.chapter]?.title || tocTitle(this.doc.toc, hit.chapter) || '').slice(0, 14)} · ${Math.round(this.flow!.percent(hit.chapter, hit.offset) * 100)}%`));
        // the panel steps aside so the hit is in view (the results stay for the next look)
        row.addEventListener('click', () => { this.closePanels(); void this.goTo(hit.chapter, hit.offset, 0, { o0: hit.offset, o1: hit.offset + hit.text.length }); });
        out.append(row);
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } e.stopPropagation(); });
    input.addEventListener('input', () => { if (!input.value.trim()) out.replaceChildren(); });
    body.replaceChildren(h('div', { class: 'bk-qrow' }, input), out);
  }

  /* ----- settings ----- */
  private fillSettings() {
    const body = this.panels.set.querySelector('.bk-p-body')!, s = this.s, flow = this.doc.kind === 'flow';
    const sec = (label: string, ...kids: (Node | null)[]) => h('div', { class: 'bk-s-sec' }, h('div', { class: 'bk-s-label' }, label), ...kids.filter(Boolean) as Node[]);
    const choice = <K extends keyof BookSettings>(key: K, opts: Array<[BookSettings[K], string]>, relayout = true) => h('div', { class: 'bk-seg' },
      ...opts.map(([v, label]) => { const b = h('button', { class: 'bk-segb', type: 'button', 'aria-pressed': String(s[key] === v) }, label);
        b.addEventListener('click', () => { this.set({ [key]: v } as Partial<BookSettings>, relayout); this.fillSettings(); }); return b; }));
    const slider = <K extends keyof BookSettings>(key: K, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const v = s[key] as number, out = h('span', { class: 'bk-s-val' }, fmt(v));
      const r = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(v) }) as HTMLInputElement;
      r.addEventListener('input', () => { out.textContent = fmt(+r.value); this.set({ [key]: +r.value } as Partial<BookSettings>, true, 110); });
      return h('div', { class: 'bk-s-row' }, r, out);
    };
    const fonts = h('div', { class: 'bk-fonts' }, ...FONTS.map((f) => {
      const b = h('button', { class: 'bk-font', type: 'button', 'aria-pressed': String(s.font === f.key), style: `font-family:${f.family}` }, h('span', { class: 'bk-font-s' }, f.sample), h('span', { class: 'bk-font-n' }, f.name));
      b.addEventListener('click', () => { this.set({ font: f.key }, true); this.fillSettings(); });
      return b;
    }));
    const themes = h('div', { class: 'bk-themes' }, ...THEMES.map(([k, name, col]) => {
      const b = h('button', { class: `bk-theme t-${k}`, type: 'button', 'aria-pressed': String(s.theme === k), title: name, style: `--sw:${col}` }, h('span', { class: 'bk-theme-sw' }, '文'), h('span', { class: 'bk-theme-n' }, name));
      b.addEventListener('click', () => { this.set({ theme: k }, false); this.fillSettings(); });
      return b;
    }));
    const amb = h('div', { class: 'bk-amb' });
    try { amb.append(this.cb.ambience.panel()); } catch { /* the lab without the app */ }
    const reset = h('button', { class: 'bk-reset', type: 'button' }, '恢复默认');
    reset.addEventListener('click', () => { this.set({ ...BOOK_SETTINGS_DEFAULT }, true); this.fillSettings(); });
    const parts: Array<HTMLElement | null> = [
      flow ? sec('字体', fonts) : null,
      flow ? sec('字号', slider('size', 12, 36, 1, (v) => `${v}px`)) : null,
      flow ? sec('行距', slider('lineHeight', 1.2, 2.6, 0.05, (v) => v.toFixed(2))) : null,
      flow ? sec('段距', slider('paraSpace', 0, 2, 0.05, (v) => `${v.toFixed(2)} 字`)) : null,
      flow ? sec('首行缩进', slider('indent', 0, 4, 0.5, (v) => `${v} 字`)) : null,
      flow ? sec('字距', slider('letterSpace', -0.05, 0.3, 0.01, (v) => `${v.toFixed(2)} 字`)) : null,
      flow ? sec('页边距', slider('margin', 16, 120, 2, (v) => `${v}px`)) : null,
      flow ? sec('版心宽度', slider('width', 360, 1100, 10, (v) => `${v}px`)) : null,
      flow ? sec('对齐', choice('align', [['justify', '两端对齐'], ['left', '左对齐']])) : null,
      sec('主题', themes),
      sec('页面', choice('spread', [['auto', '自动'], ['single', '单页'], ['double', '双页']])),
      flow ? sec('方式', choice('mode', [['page', '翻页'], ['scroll', '滚动']])) : null,
      sec('翻页动画', choice('turn', [['slide', '平移'], ['curl', '仿真'], ['none', '无']], false)),
      !flow ? sec('阅读方向', (() => { const seg = h('div', { class: 'bk-seg' });
        for (const [v, label] of [[false, '从左往右'], [true, '从右往左（日漫）']] as Array<[boolean, string]>) {
          const bt = h('button', { class: 'bk-segb', type: 'button', 'aria-pressed': String(this.rtl === v) }, label);
          bt.addEventListener('click', () => { this.rtlSet = v; this.set({ rtl: v }, true); this.fillSettings(); });
          seg.append(bt);
        }
        return seg; })()) : null,
      !flow ? sec('适合', choice('fit', [['page', '整页'], ['width', '宽度']])) : null,
      h('div', { class: 'bk-s-sub' }, '阅读环境'),
      amb,
      reset];
    body.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }

  /** Change settings: tell the host; re-lay out (now, or after a short pause while a slider moves) or just restyle. */
  private set(patch: Partial<BookSettings>, relayout: boolean, delay = 0) {
    this.s = { ...this.s, ...patch };
    this.cb.onSettings({ ...this.s });
    this.applyTheme();
    if (!relayout) return;
    clearTimeout(this.relayoutT);
    if (delay) this.relayoutT = setTimeout(() => { this.relayoutT = undefined; void this.relayout(); }, delay);
    else void this.relayout();
  }
  private applyTheme() {
    this.el.dataset.theme = this.s.theme;
    this.el.dataset.turn = this.s.turn;
    this.el.dataset.fit = this.s.fit;
  }

  /** Everything laid out again for new settings or a new screen size, the same text kept in view. */
  private relayout() {
    this.busy = this.busy.then(async () => {
      if (this.destroyed) return;
      this.finishAnimations();
      this.gen++;
      if (this.idleId) { cancelIdle(this.idleId); this.idleId = 0; }
      this.measure();
      // (decoded pages at a width no longer used go when the view is shown again)
      if (this.doc.kind === 'fixed') { await this.showFixed(this.fixedPages[0] ?? this.anchor.offset, 0); return; }
      const keep = { ...this.anchor }, prev = this.flow;
      this.flow = this.makeFlow();
      this.anchor = keep;
      // the layout left behind keeps what it counted (for the session) and only the pages round here (a setting
      // put back shows at once; the rest of its pages go)
      if (prev && prev !== this.flow) {
        rememberCounts(this.bookKey + '#' + this.keyOf(prev), prev.knownCounts());
        prev.release(this.keepNear(prev));
      }
      if (this.s.mode !== 'scroll') { this.scroller.replaceChildren(); this.scrollSecs = []; }
      await this.showAnchor(0);
      this.anchor = keep;
      this.drawTicks();
      this.idleLayout();
    });
    return this.busy;
  }

  private drawTicks() {
    if (this.doc.kind !== 'flow' || !this.flow) { this.ticks.replaceChildren(); return; }
    const n = this.doc.chapters.length;
    if (n < 2 || n > 160) { this.ticks.replaceChildren(); return; }
    this.ticks.replaceChildren(...this.flow.charsBefore.slice(1).map((c) => h('i', { style: `left:${((c / this.flow!.total) * 100).toFixed(2)}%` })));
  }

  /* ================= input ================= */

  private listen(on: boolean) {
    const m = on ? 'addEventListener' : 'removeEventListener';
    (window as any)[m]('keydown', this.onKey, { capture: true });
    (window as any)[m]('resize', this.onResize);
    if (on) {
      this.stage.addEventListener('click', this.onClick);
      this.stage.addEventListener('wheel', this.onWheel, { passive: false });
      this.stage.addEventListener('pointerdown', this.onDown);
      this.stage.addEventListener('pointermove', this.onPointerMove);
      this.stage.addEventListener('pointerup', this.onUp);
      this.stage.addEventListener('pointercancel', this.onUp);
      this.stage.addEventListener('dblclick', this.onDbl);
      this.scroller.addEventListener('scroll', this.onScroll, { passive: true });
      this.scroller.addEventListener('click', this.onClick);
      this.slider.addEventListener('input', this.onSlide);
      this.slider.addEventListener('change', this.onSlideEnd);
      this.slider.addEventListener('pointerup', this.onSlideEnd);
      this.el.addEventListener('pointerdown', this.onAnyDown);
    }
  }

  private onAnyDown = (e: PointerEvent) => {
    // a click outside an open panel closes it
    if (this.panelOpen && !(e.target as Element).closest('.bk-panel, .bk-top, .bk-bottom')) { this.closePanels(); e.stopPropagation(); this.swallowClick = true; }
  };
  private swallowClick = false;

  private onKey = (e: KeyboardEvent) => {
    if (!this.opened || this.destroyed || e.metaKey || e.ctrlKey || e.altKey) return;
    // typing in a text field (the search box) keeps its keys; a slider or a button does not
    const t = e.target as HTMLElement, typing = !!t && (t.isContentEditable || /textarea|select/i.test(t.tagName)
      || (t.tagName === 'INPUT' && !/^(range|checkbox|radio|button|submit)$/i.test((t as HTMLInputElement).type)));
    const k = e.key;
    let done = true;
    if (typing) {
      if (k === 'Escape') { this.closePanels(); (t as HTMLElement).blur(); } else return;
    } else if (k === 'Escape') { if (this.panelOpen) this.closePanels(); else this.cb.onClose(); }
    else if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) void this.turn(this.rtl && k === 'ArrowRight' ? -1 : 1);
    else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) void this.turn(this.rtl && k === 'ArrowLeft' ? 1 : -1);
    else if ((k === 'ArrowDown' || k === 'ArrowUp') && this.s.mode === 'scroll' && this.doc.kind === 'flow') done = false;
    else if (k === 'ArrowDown') void this.turn(1);
    else if (k === 'ArrowUp') void this.turn(-1);
    else if (k === 'Home') void this.goTo(0, 0, -1);
    else if (k === 'End') void (this.doc.kind === 'fixed' ? this.showFixed(this.doc.pages - 1, 1) : this.goTo(this.doc.chapters.length - 1, Math.max(0, (this.flow?.chapterChars.at(-1) ?? 1) - 1), 1));
    else if (k === 't' || k === 'T') this.togglePanel('toc');
    else if (k === '/') this.togglePanel('search');
    else if (k === 'm' || k === 'M') this.toggleBookmark();
    else if (k === 'b' || k === 'B') this.cb.onClose();
    else if (k === 'f' || k === 'F') this.cb.ambience.setImmersive(!this.cb.ambience.immersive());
    else if (k === '=' || k === '+') this.bumpSize(1);
    else if (k === '-') this.bumpSize(-1);
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
  };
  private bumpSize(d: number) {
    if (this.doc.kind === 'fixed') { this.setZoom(clamp(this.zoom.k * (d > 0 ? 1.25 : 0.8), 1, 4)); return; }
    this.set({ size: clamp(this.s.size + d, 12, 36) }, true);
    this.flash(`字号 ${this.s.size}`);
  }

  private onResize = () => {
    clearTimeout(this.resizeT);
    this.resizeT = setTimeout(() => { this.resizeT = undefined; void this.relayout(); }, 160);
  };

  private onClick = (e: MouseEvent) => {
    if (this.swallowClick) { this.swallowClick = false; return; }
    if (this.drag?.moved) { this.drag = null; return; }
    const t = e.target as HTMLElement;
    const link = t.closest('[data-href]') as HTMLElement | null;
    if (link) { e.preventDefault(); this.follow(link.dataset.href!); return; }
    if ((window.getSelection()?.toString() || '').trim()) return;
    if (this.doc.kind === 'fixed' && this.zoom.k > 1.01) return;
    const r = this.el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
    if (this.s.mode === 'scroll' && this.doc.kind === 'flow') { this.cb.ambience.setImmersive(!this.cb.ambience.immersive()); return; }
    const rtl = this.rtl;
    if (x < 0.3) void this.turn(rtl ? 1 : -1);
    else if (x > 0.7) void this.turn(rtl ? -1 : 1);
    else this.cb.ambience.setImmersive(!this.cb.ambience.immersive());
  };

  private follow(href: string) {
    if (/^[a-z]+:/i.test(href) && !href.startsWith('#')) { window.open(href, '_blank', 'noopener'); return; }
    const ids = this.flow?.ids, frag = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '', file = href.split('#')[0].split('/').pop() || '';
    const at = ids?.get(href) ?? (frag ? ids?.get(frag) : undefined) ?? (file ? ids?.get(file) : undefined);
    if (at) void this.goTo(at.chapter, this.flow!.blockStart[at.chapter][at.block], 1);
  }

  private onWheel = (e: WheelEvent) => {
    if (this.doc.kind === 'fixed' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.setZoom(clamp(this.zoom.k * Math.exp(-e.deltaY * 0.01), 1, 4), e.clientX, e.clientY);
      return;
    }
    if (this.s.mode === 'scroll' && this.doc.kind === 'flow') return;
    if (this.doc.kind === 'fixed' && (this.zoom.k > 1.01 || (this.s.fit === 'width' && !this.geo.twoUp))) return;
    e.preventDefault();
    const t = performance.now();
    if (t - this.lastTurn < 320) { this.wheelAcc = 0; return; }
    this.wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(this.wheelAcc) >= 48) { const d = this.wheelAcc > 0 ? 1 : -1; this.wheelAcc = 0; this.lastTurn = t; void this.turn(d as 1 | -1); }
  };

  /* ----- touch, drag, pinch ----- */
  private onDown = (e: PointerEvent) => {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    if (this.pointers.size === 2 && this.doc.kind === 'fixed') {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.zoom.k };
    } else if (this.doc.kind === 'fixed' && this.zoom.k > 1.01 && e.button === 0) {
      this.drag = { x: e.clientX, y: e.clientY, zx: this.zoom.x, zy: this.zoom.y, moved: false };
      try { this.stage.setPointerCapture(e.pointerId); } catch { /* gone */ }
    }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { ...this.pointers.get(e.pointerId)!, x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      this.setZoom(clamp(this.pinch.k * (d / this.pinch.d), 1, 4), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (this.drag) {
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > 4) this.drag.moved = true;
      this.zoom.x = this.drag.zx + dx;
      this.zoom.y = this.drag.zy + dy;
      this.applyZoom();
    }
  };
  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    // a drag that moved keeps its record until the click it ends in has been swallowed
    if (this.drag && !this.pointers.size && !this.drag.moved) this.drag = null;
    if (!p || e.pointerType !== 'touch' || this.zoom.k > 1.01) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y, dt = performance.now() - p.t;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 700) {
      this.swallowClick = true;
      void this.turn((dx < 0) !== this.rtl ? 1 : -1);
    }
  };
  private onDbl = (e: MouseEvent) => {
    if (this.doc.kind !== 'fixed') return;
    e.preventDefault();
    this.setZoom(this.zoom.k > 1.01 ? 1 : 2, e.clientX, e.clientY);
  };
  private setZoom(k: number, cx = innerWidth / 2, cy = innerHeight / 2) {
    if (!this.book) return;
    const r = this.stage.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    // keep the point under the pointer where it is
    const f = k / this.zoom.k;
    this.zoom = { k, x: k <= 1.001 ? 0 : ox - (ox - this.zoom.x) * f, y: k <= 1.001 ? 0 : oy - (oy - this.zoom.y) * f };
    this.applyZoom();
    if (k > 1.01) void this.sharpenFixed(k);
    // back to the whole page: the pages drawn finer for the zoom go (the canvases keep what they show)
    else if (this.doc.kind === 'fixed') { const w0 = this.fixedPixelWidth(); this.dropFixed((e) => e.w === w0); }
  }
  private applyZoom() {
    if (!this.book) return;
    const z = this.zoom;
    this.book.style.transform = z.k > 1.001 ? `translate(${z.x.toFixed(1)}px, ${z.y.toFixed(1)}px) scale(${z.k.toFixed(3)})` : '';
    this.book.style.transformOrigin = 'center center';
    this.el.classList.toggle('zoomed', z.k > 1.01);
  }
  /** Zoomed in: the page drawn again at the finer size. */
  private async sharpenFixed(k: number) {
    const w0 = this.fixedPixelWidth(), w = Math.ceil((w0 * Math.min(k, 3)) / 400) * 400;
    // pages drawn for another zoom are not wanted any more
    this.dropFixed((e) => e.w === w0 || e.w === w);
    for (const sheet of this.book?.querySelectorAll<HTMLElement>('.bk-sheet.fixed') ?? []) {
      const pi = +sheet.dataset.page!, cv = sheet.querySelector('canvas')!;
      const img = await this.fixedImage(pi, w).catch(() => null);
      if (!img || this.destroyed || this.zoom.k < 1.01) return;
      const dpr = Math.min(3, devicePixelRatio || 1);
      cv.width = Math.round(sheet.clientWidth * dpr * Math.min(k, 3));
      cv.height = Math.round(sheet.clientHeight * dpr * Math.min(k, 3));
      cv.getContext('2d')?.drawImage(img, 0, 0, cv.width, cv.height);
    }
  }

  /* ----- the progress slider ----- */
  private onSlide = () => {
    const pct = +this.slider.value / 1000;
    this.el.classList.add('sliding');
    let label: string;
    if (this.doc.kind === 'fixed') label = `第 ${Math.round(pct * (this.doc.pages - 1)) + 1} 页`;
    else {
      const at = this.flow!.at(pct), { total } = this.flow!.counts();
      label = `${(this.doc.chapters[at.chapter]?.title || tocTitle(this.doc.toc, at.chapter) || `第 ${at.chapter + 1} 章`).slice(0, 18)} · 约第 ${Math.max(1, Math.round(pct * total))} 页`;
    }
    this.tip.textContent = label;
    this.tip.style.left = `${(pct * 100).toFixed(2)}%`;
  };
  private onSlideEnd = () => {
    if (!this.el.classList.contains('sliding')) return;
    this.el.classList.remove('sliding');
    this.slider.blur();
    const pct = +this.slider.value / 1000;
    if (this.doc.kind === 'fixed') void this.showFixed(Math.round(pct * (this.doc.pages - 1)), 0);
    else { const at = this.flow!.at(pct); void this.goTo(at.chapter, at.offset, 0); }
  };

  /* ----- a word from the reader ----- */
  private flash(text: string) {
    const f = h('div', { class: 'bk-flash', role: 'status' }, text);
    this.el.append(f);
    f.addEventListener('animationend', () => f.remove());
  }
}

/* ================= helpers ================= */

/** Text into an element; in scroll mode (every frame) only when it changes (the same text again is still a change to
 *  lay out and paint). */
function setText(el: HTMLElement, text: string, onlyIfChanged = false) { if (!onlyIfChanged || el.textContent !== text) el.textContent = text; }

function requestIdle(f: (d?: { timeRemaining(): number }) => void): number {
  const ric = (window as any).requestIdleCallback as ((cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number) | undefined;
  return ric ? ric(f, { timeout: 400 }) : (setTimeout(() => f(), 30) as unknown as number);
}
function cancelIdle(id: number) {
  const cic = (window as any).cancelIdleCallback as ((id: number) => void) | undefined;
  if (cic) cic(id); else clearTimeout(id);
}

/** A copy of a page for the back of a turning page (a canvas's picture copied too). */
function cloneSheet(src: HTMLElement): HTMLElement {
  const c = src.cloneNode(true) as HTMLElement;
  const a = src.querySelectorAll('canvas'), b = c.querySelectorAll('canvas');
  a.forEach((cv, i) => { const d = b[i] as HTMLCanvasElement; d.width = cv.width; d.height = cv.height; d.getContext('2d')?.drawImage(cv, 0, 0); });
  return c;
}

function flatToc(items: TocItem[], out: TocItem[] = []): TocItem[] {
  for (const t of items) { out.push(t); if (t.children) flatToc(t.children, out); }
  return out;
}
function tocTitle(items: TocItem[], chapter: number): string {
  for (const t of flatToc(items)) if (t.chapter === chapter) return t.title;
  return '';
}
function tocAtPage(items: TocItem[], page: number): string {
  let best = '';
  for (const t of flatToc(items)) if ((t.block ?? 0) <= page) best = t.title;
  return best;
}

function chapterText(doc: FlowDoc, c: number): string {
  let s = '';
  for (const b of doc.chapters[c].blocks) if ('runs' in b) for (const r of b.runs) s += r.text;
  return s;
}
function snippetAt(doc: FlowDoc, c: number, o: number, n: number) {
  return chapterText(doc, c).slice(o, o + n * 2).replace(/\s+/g, ' ').trim().slice(0, n);
}

/** Every place a phrase occurs (case-insensitive for Latin), with a little text round it. */
async function searchBook(doc: FlowDoc, q: string, max: number, stop: () => boolean) {
  const needle = q.toLowerCase(), hits: Array<{ chapter: number; offset: number; text: string; before: string; after: string }> = [];
  for (let c = 0; c < doc.chapters.length && hits.length < max; c++) {
    const text = chapterText(doc, c), low = text.toLowerCase();
    for (let i = low.indexOf(needle); i >= 0 && hits.length < max; i = low.indexOf(needle, i + needle.length)) {
      hits.push({ chapter: c, offset: i, text: text.slice(i, i + q.length), before: '…' + text.slice(Math.max(0, i - 16), i).replace(/\s+/g, ' '), after: text.slice(i + q.length, i + q.length + 24).replace(/\s+/g, ' ') + '…' });
    }
    // a long book: let the page breathe between chapters
    if (c % 20 === 19) { await new Promise((r) => setTimeout(r, 0)); if (stop()) return hits; }
  }
  return hits;
}
