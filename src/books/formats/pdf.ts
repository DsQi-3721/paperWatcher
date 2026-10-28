// PDF books and magazines: fixed pages drawn by pdf.js. The first page's size is read at once, the others when they
// are about to be shown (not every page of the book on every opening); pages are drawn two at a time at the width
// asked for, and pdf.js lets go of what it decoded for a page once it is drawn (the reader keeps the drawing), so
// reading on through a magazine does not pile up its pictures; the outline becomes the contents.
// One pdf.js worker serves the whole app (the papers' too, src/pdf/doc): a book takes it when opened and gives it
// back exactly once, when its document is destroyed or could not be read.
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { acquireWorker, releaseWorker } from '../../pdf/doc';
import type { FixedDoc, TocItem } from '../types';
import { fail, titleFromName } from './util';

/** PDF titles that are really the name of the program or the file that made them. */
const JUNK_TITLE = /^(untitled|microsoft word|document\d*|无标题|新建|slide|print|\s*)$|\.(docx?|pdf|indd|tex|dvi|ps|qxd)$|^microsoft (word|powerpoint)\s*-/i;

export async function parsePdf(data: ArrayBuffer, name: string): Promise<FixedDoc> {
  // pdf.js takes the buffer over (detaches it): give it a copy, the caller may still need the file
  const task = pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/', enableXfa: false, worker: acquireWorker(),
  });
  // the document out of the worker and the worker given back: once, however often it is asked for
  let gone = false;
  const letGo = () => { if (gone) return; gone = true; void task.destroy(); releaseWorker(); };
  try { return await read(task, name, letGo); } catch (e) { letGo(); throw e; }
}

async function read(task: PDFDocumentLoadingTask, name: string, letGo: () => void): Promise<FixedDoc> {
  let pdf: PDFDocumentProxy;
  try { pdf = await task.promise; } catch (e: any) {
    if (e?.name === 'PasswordException') fail('这个 PDF 设了密码，读不了');
    fail('这个 PDF 打不开：' + (e?.message || e));
    throw e;
  }
  const info: any = (await pdf.getMetadata().catch(() => null))?.info || {};
  const t = String(info.Title || '').trim();
  const title = t && !JUNK_TITLE.test(t) ? t : titleFromName(name);
  const author = String(info.Author || '').trim() || undefined;
  const pages = pdf.numPages;
  const sizes: Array<{ w: number; h: number } | null> = new Array(pages).fill(null);
  const v0 = (await pdf.getPage(1)).getViewport({ scale: 1 });
  sizes[0] = { w: v0.width, h: v0.height };
  let dead = false;
  // a page's size, from its page object (the one drawing it also needs)
  const sizeOf = async (i: number) => {
    if (sizes[i] || dead || i < 0 || i >= pages) return sizes[i] ?? null;
    try { const v = (await pdf.getPage(i + 1)).getViewport({ scale: 1 }); sizes[i] = { w: v.width, h: v.height }; } catch { /* a broken page */ }
    return sizes[i];
  };

  // drawing: two pages at a time, the same request shared
  let running = 0;
  const waiting: Array<() => void> = [], made = new Map<string, Promise<HTMLCanvasElement>>();
  const slot = () => new Promise<void>((r) => { if (running < 2) { running++; r(); } else waiting.push(() => { running++; r(); }); });
  const free = () => { running--; waiting.shift()?.(); };
  const render = (i: number, widthPx: number): Promise<HTMLCanvasElement> => {
    const key = `${i}@${Math.round(widthPx)}`;
    const old = made.get(key);
    if (old) return old;
    const p = (async () => {
      await slot();
      try {
        const page = await pdf.getPage(i + 1);
        const base = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: Math.max(0.05, widthPx / base.width) });
        sizes[i] ??= { w: base.width, h: base.height };
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(vp.width));
        c.height = Math.max(1, Math.round(vp.height));
        try { await page.render({ canvas: c, viewport: vp, background: '#ffffff' } as any).promise; }
        // what pdf.js decoded for the page (its pictures, its drawing list) goes now that it is drawn (it waits
        // if the same page is being drawn at another width); drawing it again reads the page again
        finally { page.cleanup(); }
        return c;
      } finally { free(); made.delete(key); }
    })();
    made.set(key, p);
    return p;
  };

  return {
    kind: 'fixed', title, author, cover: null, pages,
    size: (i) => sizes[i] ?? null,
    sizeOf,
    render,
    toc: await outline(pdf),
    destroy: () => { dead = true; letGo(); },
  };
}

/** The PDF's outline as contents: each entry at the page its destination is on. */
async function outline(pdf: PDFDocumentProxy): Promise<TocItem[]> {
  const ol = await pdf.getOutline().catch(() => null);
  if (!ol?.length) return [];
  const conv = async (items: any[]): Promise<TocItem[]> => {
    const out: TocItem[] = [];
    for (const it of items) {
      let page = -1;
      try {
        let dest = it.dest;
        if (typeof dest === 'string') dest = await pdf.getDestination(dest);
        if (Array.isArray(dest) && dest[0] != null) page = typeof dest[0] === 'number' ? dest[0] : await pdf.getPageIndex(dest[0]);
      } catch { /* a dead link */ }
      const children = it.items?.length ? await conv(it.items) : [];
      const title = String(it.title || '').trim();
      if (page >= 0 && title) out.push(children.length ? { title, chapter: 0, block: page, children } : { title, chapter: 0, block: page });
      else out.push(...children);
    }
    return out;
  };
  return conv(ol);
}
