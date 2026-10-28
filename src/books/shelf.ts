// The books on the desk's textbook: the list (the server's), the book the textbook wears (the one read last), adding a
// book (the server keeps the file; here it is read once for its real title and author, its kind, length, cover and
// colour), and where each book was left and how the reader is set up.
import { api } from '../api';
import { coverFor, detectFormat, lengthOf, parseBook } from './formats/index';
import { BOOK_SETTINGS_DEFAULT, type BookMeta, type Bookmark, type BookProgress, type BookSettings } from './types';

const SETTINGS_KEY = 'pw.book.settings';

export class Shelf {
  books: BookMeta[] = [];
  onChange?: () => void;
  private pending = new Map<string, { t: ReturnType<typeof setTimeout>; p: BookProgress }>();

  async refresh() {
    try { this.books = await api.books(); } catch { this.books = []; }
    this.onChange?.();
    return this.books;
  }
  /** The book the textbook wears: the one read (or put on the shelf) last. */
  get current(): BookMeta | null { return this.books[0] ?? null; }
  coverUrl(m: BookMeta) { return m.cover ? api.bookCoverUrl(m) : undefined; }

  /** A file chosen or dropped: kept by the server, then read once here. (refresh false: the caller fetches the list
   *  once after a batch, instead of once per book) */
  async addFile(file: File | Blob, name: string, status?: (t: string) => void, refresh = true): Promise<BookMeta> {
    status?.(`正在放上书架：${name}`);
    const buf = await file.arrayBuffer();
    const format = detectFormat(new Uint8Array(buf.slice(0, 4096)), name) ?? undefined;
    const meta = await api.uploadBook(new Blob([buf]), name, format);
    return this.process(meta, buf, status, refresh);
  }
  /** A book from a link (a download link, or a file in an online catalog). */
  async addFromUrl(url: string, onEvent: (e: { type: string; text?: string; loaded?: number; total?: number }) => void, signal?: AbortSignal): Promise<BookMeta> {
    let meta: BookMeta | null = null, err = '';
    await api.fetchBook(url, (e) => { if (e.type === 'done') meta = e.meta; else if (e.type === 'error') err = e.message; else onEvent(e); }, signal);
    if (!meta) throw new Error(err || '没有下载到书');
    return this.process(meta, undefined, (text) => onEvent({ type: 'status', text }));
  }

  /** Read a new book once: its title and author as the book says, flowing text or pages, how long, its cover. A file
   *  that can't be read goes off the shelf again (with the reason). */
  async process(meta: BookMeta, buf?: ArrayBuffer, status?: (t: string) => void, refresh = true): Promise<BookMeta> {
    if (meta.cover && meta.length) { if (refresh) await this.refresh(); return meta; }
    status?.('正在翻看这本书…');
    const data = buf ?? await api.bookFile(meta.id);
    let doc;
    try { doc = await parseBook(data, meta.fileName || `${meta.title}.${meta.format}`, meta.format); }
    catch (e) { await api.deleteBook(meta.id).catch(() => {}); if (refresh) await this.refresh(); throw e; }
    try {
      const title = (doc.title || '').trim() || meta.title, author = (doc.author || '').trim() || meta.author;
      status?.('正在做封面…');
      const { jpeg, color } = await coverFor(doc, { title, author });
      await api.putBookCover(meta.id, jpeg);
      meta = await api.patchBook(meta.id, { title, author, kind: doc.kind, length: lengthOf(doc), color, lang: doc.lang });
    } finally {
      if (doc.kind === 'fixed') doc.destroy?.();
    }
    if (refresh) await this.refresh();
    return meta;
  }


  /* ---------- where a book was left, and the reader's settings ---------- */
  saveProgress(id: string, p: BookProgress) {
    const old = this.pending.get(id);
    if (old) clearTimeout(old.t);
    this.pending.set(id, { p, t: setTimeout(() => void this.flush(id), 1200) });
    const m = this.books.find((b) => b.id === id);
    if (m) m.progress = p;
  }
  async flush(id: string) {
    const x = this.pending.get(id);
    if (!x) return;
    clearTimeout(x.t);
    this.pending.delete(id);
    await api.patchBook(id, { progress: x.p, openedAt: Date.now() }).catch(() => {});
  }
  saveBookmarks(id: string, b: Bookmark[]) { void api.patchBook(id, { bookmarks: b }).catch(() => {}); }
  async opened(id: string) { await api.patchBook(id, { openedAt: Date.now() }).catch(() => {}); }

  settings(): BookSettings {
    try { return { ...BOOK_SETTINGS_DEFAULT, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { ...BOOK_SETTINGS_DEFAULT }; }
  }
  saveSettings(s: BookSettings) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* private mode */ } }
}
