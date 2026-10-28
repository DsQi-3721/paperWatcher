// A loaded paper: pdf.js document, page sizes, lazily built text models, sections and full text.
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PaperMeta } from '../types';
import { buildPageText, type PageText } from './textmodel';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** One pdf.js worker for every paper and thumbnail while papers come and go: starting a worker means fetching and
 *  compiling the whole pdf.js worker bundle again (about a tenth of a second per paper). A document's
 *  loadingTask.destroy() releases its part of the worker (fonts, images, parsed pages) but leaves a worker it was
 *  given running; once no document has used it for a while, the worker itself goes, and its memory with it. */
let worker: pdfjs.PDFWorker | null = null;
let workerUsers = 0;
let workerIdle: ReturnType<typeof setTimeout> | undefined;
const WORKER_IDLE_MS = 30_000;
/** For other pdf.js users (e.g. PDF books): pass `worker: acquireWorker()` to getDocument and call releaseWorker()
 *  once that document is destroyed. */
export function acquireWorker(): pdfjs.PDFWorker {
  clearTimeout(workerIdle);
  workerUsers++;
  if (!worker || worker.destroyed) worker = new pdfjs.PDFWorker();
  return worker;
}
export function releaseWorker() {
  workerUsers = Math.max(0, workerUsers - 1);
  if (workerUsers) return;
  clearTimeout(workerIdle);
  workerIdle = setTimeout(() => {
    if (workerUsers || !worker) return;
    worker.destroy();
    worker = null;
  }, WORKER_IDLE_MS);
}

const SOURCE = {
  cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/', enableXfa: false,
};

/** Resolves when the browser is idle (or after `timeout` ms at the latest); `cancel` resolves it at once. */
function idleSlot(timeout: number): { done: Promise<void>; cancel(): void } {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
  const cic = (window as any).cancelIdleCallback as undefined | ((h: number) => void);
  let handle: number | ReturnType<typeof setTimeout>;
  if (ric) handle = ric(() => resolve(), { timeout });
  else handle = setTimeout(() => resolve(), 16);
  return {
    done,
    cancel() {
      if (ric && cic) cic(handle as number); else clearTimeout(handle as ReturnType<typeof setTimeout>);
      resolve();
    },
  };
}

export interface PageSize { w: number; h: number }

/** The first page as a small JPEG, for the bookshelf. */
export async function firstPageJpeg(page: PDFPageProxy, width = 320): Promise<Blob> {
  const scale = width / page.getViewport({ scale: 1 }).width;
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vp.width));
  canvas.height = Math.max(1, Math.round(vp.height));
  await page.render({ canvas, viewport: vp, background: '#fcfbf6' } as any).promise;
  try {
    return await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('toBlob failed'))), 'image/jpeg', 0.86));
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Thumbnail for a paper that is not open: load it just far enough to draw page 1. */
export async function thumbFor(meta: PaperMeta, width = 320): Promise<Blob> {
  const task = pdfjs.getDocument({ url: `/api/papers/${meta.id}/pdf`, ...SOURCE, worker: acquireWorker() });
  try {
    return await firstPageJpeg(await (await task.promise).getPage(1), width);
  } finally {
    void task.destroy();
    releaseWorker();
  }
}
export interface Section { title: string; page: number; y: number; level: number; off?: number }

export class PaperDoc {
  private pageCache = new Map<number, Promise<PDFPageProxy>>();
  /** Pages already fetched, for releasing their memory without waiting on a promise. */
  private pages: Array<PDFPageProxy | undefined> = [];
  private textCache = new Map<number, Promise<PageText>>();
  private sectionsP: Promise<Section[]> | null = null;
  private idleWait: { cancel(): void } | null = null;
  texts: Array<PageText | undefined> = [];
  destroyed = false;

  private constructor(public pdf: PDFDocumentProxy, public meta: PaperMeta, public sizes: PageSize[]) {}

  static async open(meta: PaperMeta, onProgress?: (p: number) => void): Promise<PaperDoc> {
    const task = pdfjs.getDocument({ url: `/api/papers/${meta.id}/pdf`, ...SOURCE, worker: acquireWorker() });
    task.onProgress = (p: { loaded: number; total: number }) => onProgress?.(p.total ? p.loaded / p.total : 0);
    let pdf: PDFDocumentProxy;
    let pages: PDFPageProxy[];
    try {
      pdf = await task.promise;
      pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
    } catch (e) {
      // a paper that could not be read must not keep its half-loaded document in the worker
      void task.destroy();
      releaseWorker();
      throw e;
    }
    const sizes = pages.map((pg) => {
      const v = pg.getViewport({ scale: 1 });
      return { w: v.width, h: v.height };
    });
    const doc = new PaperDoc(pdf, meta, sizes);
    pages.forEach((pg, i) => { doc.pages[i] = pg; doc.pageCache.set(i, Promise.resolve(pg)); });
    return doc;
  }

  get numPages() { return this.pdf.numPages; }

  page(i: number): Promise<PDFPageProxy> {
    let p = this.pageCache.get(i);
    if (!p) {
      p = this.pdf.getPage(i + 1);
      p.then((pg) => { this.pages[i] = pg; }, () => {});
      this.pageCache.set(i, p);
    }
    return p;
  }

  /**
   * Gives back what pdf.js keeps for a page after drawing it (its operator list and decoded images): for pages
   * far from the view. Drawing the page again later simply asks the worker for them again. Text models stay.
   */
  releasePage(i: number) {
    if (!this.destroyed) this.pages[i]?.cleanup();
  }

  text(i: number): Promise<PageText> {
    let t = this.textCache.get(i);
    if (!t) {
      t = this.page(i).then((pg) => buildPageText(pg, i)).then((pt) => { this.texts[i] = pt; return pt; });
      this.textCache.set(i, t);
    }
    return t;
  }

  /** Title from the PDF itself: metadata if sensible, else the biggest text near the top of page 1. */
  async guessTitle(): Promise<string | null> {
    try {
      const info: any = (await this.pdf.getMetadata()).info;
      const t = (info?.Title || '').trim();
      if (t && t.length > 8 && !/^(untitled|microsoft word|arxiv|paper|main|document)/i.test(t) && !/\.(pdf|docx?|tex|dvi)$/i.test(t)) return t;
    } catch { /* ignore */ }
    const pt = await this.text(0);
    const top = pt.lines.filter((l) => l.y1 < pt.h * 0.45 && l.end - l.start > 3);
    if (!top.length) return null;
    const maxSize = Math.max(...top.map((l) => l.size));
    if (maxSize < pt.bodySize * 1.25) return null;
    const title = top.filter((l) => l.size > maxSize * 0.9).map((l) => pt.slice(l.start, l.end)).join(' ');
    return title.length > 5 && title.length < 300 ? title : null;
  }

  /** Sections from the PDF outline (hyperref bookmarks), falling back to detected headings. */
  sections(): Promise<Section[]> {
    if (!this.sectionsP) this.sectionsP = this.loadSections();
    return this.sectionsP;
  }

  private async loadSections(): Promise<Section[]> {
    const out: Section[] = [];
    try {
      const outline = await this.pdf.getOutline();
      const walk = async (items: any[], level: number) => {
        for (const it of items || []) {
          let dest = it.dest;
          try {
            if (typeof dest === 'string') dest = await this.pdf.getDestination(dest);
            if (Array.isArray(dest) && dest[0]) {
              const page = typeof dest[0] === 'object' ? await this.pdf.getPageIndex(dest[0]) : Number(dest[0]);
              const h = this.sizes[page]?.h ?? 792;
              let y = 0;
              if (dest[1]?.name === 'XYZ' && typeof dest[3] === 'number') y = h - dest[3];
              else if (dest[1]?.name === 'FitH' && typeof dest[2] === 'number') y = h - dest[2];
              out.push({ title: String(it.title || '').trim(), page, y: Math.max(0, y), level });
            }
          } catch { /* unresolvable bookmark */ }
          if (it.items?.length && level < 3) await walk(it.items, level + 1);
        }
      };
      if (outline?.length) await walk(outline, 0);
    } catch { /* no outline */ }
    if (out.length >= 2) {
      // Outline entries are already in document order (left column before right); pin each to a
      // reading-order offset on its page so lookups work in two-column layouts.
      const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      for (const sec of out) {
        const pt = await this.text(sec.page);
        const want = norm(sec.title).slice(0, 24);
        // The heading paragraph that carries the title, close to where the bookmark points.
        let best: { start: number } | null = null, bestScore = Infinity;
        if (want) for (const p of pt.paras) {
          const txt = norm(pt.slice(p.start, p.end));
          if (!txt.includes(want)) continue;
          const score = Math.abs(p.y0 - sec.y) + (p.kind === 'heading' ? 0 : 220) + (txt.length > want.length * 3 + 12 ? 160 : 0);
          if (score < bestScore) { bestScore = score; best = p; }
        }
        const line = pt.lines.find((l) => l.y1 >= sec.y - 2);
        sec.off = best && bestScore < 320 ? best.start : line ? line.start : 0;
      }
      return out.sort((a, b) => a.page - b.page || (a.off ?? 0) - (b.off ?? 0));
    }
    // Heuristic: heading paragraphs from the text models (built on demand for all pages).
    const res: Section[] = [];
    for (let i = 0; i < this.numPages; i++) {
      const pt = await this.text(i);
      // On the first page, title / authors / affiliations come before the Abstract: not sections.
      const frontEnd = i === 0 ? pt.paras.findIndex((p) => /^\s*(abstract|summary|1\.?\s+introduction|introduction)\b/i.test(pt.slice(p.start, p.end))) : -1;
      for (const [k, p] of pt.paras.entries()) {
        if (p.kind !== 'heading' || (frontEnd > 0 && k < frontEnd)) continue;
        const title = pt.slice(p.start, p.end);
        const level = /^\s*\d+\.\d+\.\d+/.test(title) ? 2 : /^\s*\d+\.\d+/.test(title) ? 1 : 0;
        res.push({ title, page: i, y: p.y0, level, off: p.start });
      }
    }
    return res;
  }

  /** The section a position belongs to, compared in reading order (char offset on the page). */
  async sectionAt(page: number, off: number): Promise<Section | null> {
    const secs = await this.sections();
    let best: Section | null = null;
    for (const s of secs) {
      if (s.page < page || (s.page === page && (s.off ?? 0) <= off)) best = s;
      else break;
    }
    return best;
  }

  /** Full text with page markers, written to paper.txt for the CLI agents. Pages whose text model is not built yet
   *  are built one at a time when the browser is idle (never in the middle of drawing or scrolling); it stops (and
   *  rejects) as soon as the paper is put away. */
  async fullText(onPage?: (i: number) => void): Promise<string> {
    const parts: string[] = [`# ${this.meta.title}`];
    if (this.meta.authors?.length) parts.push(this.meta.authors.join(', '));
    for (let i = 0; i < this.numPages; i++) {
      if (!this.texts[i]) {
        const slot = idleSlot(300);
        this.idleWait = slot;
        await slot.done;
        this.idleWait = null;
      }
      if (this.destroyed) throw new Error('the paper was put away');
      const pt = await this.text(i);
      parts.push(`\n=== Page ${i + 1} ===\n${pt.plain()}`);
      onPage?.(i);
    }
    return parts.join('\n');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.idleWait?.cancel();
    this.idleWait = null;
    void this.pdf.loadingTask.destroy();
    this.pages = [];
    releaseWorker();
  }
}
