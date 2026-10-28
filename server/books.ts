// The reading shelf's storage: one folder per book under data/books/<id>/ (the file as it came, meta.json, cover.jpg),
// fetching books from links, and a narrow proxy for book catalogs (OPDS feeds, Gutendex) so the page can browse them.
// The browser parses the books; the server only keeps and serves the files.
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { ByteSink } from './http.ts';
import { MetaCache } from './metacache.ts';
import { DATA_DIR, writeFileAtomic, writeJsonFile } from './store.ts';

export const BOOKS_DIR = path.join(DATA_DIR, 'books');
export const BOOK_FORMATS = ['epub', 'mobi', 'azw3', 'txt', 'pdf', 'cbz', 'fb2', 'html', 'md'] as const;
export type BookFormat = typeof BOOK_FORMATS[number];

export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  kind: 'flow' | 'fixed';
  lang?: string;
  fileName?: string;
  size?: number;
  sourceUrl?: string;
  addedAt: number;
  openedAt?: number;
  cover?: number;
  color?: string;
  progress?: { chapter: number; offset: number; percent: number; at: number };
  bookmarks?: Array<{ chapter: number; offset: number; text: string; at: number }>;
  length?: number;
}

const ID_RE = /^[a-f0-9]{8,64}$/;
export function bookDir(id: string) {
  if (!ID_RE.test(id)) throw new Error('Bad book id');
  return path.join(BOOKS_DIR, id);
}
export const coverPath = (id: string) => path.join(bookDir(id), 'cover.jpg');
export async function bookFile(id: string): Promise<{ file: string; format: BookFormat } | null> {
  const m = await getBook(id);
  if (!m) return null;
  const file = path.join(bookDir(id), 'book.' + m.format);
  return (await fs.stat(file).catch(() => null))?.isFile() ? { file, format: m.format } : null;
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) as T; } catch { return fallback; }
}
/** A book's meta.json; the shelf's list looks at the book again before it is next sent. */
async function saveBookMeta(id: string, meta: BookMeta) {
  try { await writeJsonFile(path.join(bookDir(id), 'meta.json'), meta); } finally { shelf.touch(id); }
}
const locks = new Map<string, Promise<unknown>>();
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  const settled = next.catch(() => undefined);
  locks.set(key, settled);
  settled.then(() => { if (locks.get(key) === settled) locks.delete(key); });
  return next;
}

/** What kind of book a file is, from its first bytes (then its name). */
export function sniffFormat(buf: Buffer, name = ''): BookFormat | null {
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || '').replace(/^azw$/, 'azw3').replace(/^htm$/, 'html').replace(/^markdown$/, 'md').replace(/^zip$/, 'cbz');
  const head = buf.subarray(0, 4096), latin = head.toString('latin1');
  if (head[0] === 0x50 && head[1] === 0x4b) {
    if (latin.slice(30, 58) === 'mimetypeapplication/epub+zip' || /application\/epub\+zip/.test(latin)) return 'epub';
    if (/\.fb2/i.test(latin)) return 'fb2';
    if (ext === 'epub') return 'epub';
    return 'cbz';
  }
  if (latin.slice(0, 5) === '%PDF-' || latin.indexOf('%PDF-') >= 0 && latin.indexOf('%PDF-') < 1024) return 'pdf';
  if (latin.slice(60, 68) === 'BOOKMOBI') return ext === 'azw3' ? 'azw3' : 'mobi';
  if (/^\s*(<\?xml[^>]*>)?\s*<FictionBook/i.test(latin) || (/<\?xml/.test(latin.slice(0, 200)) && /FictionBook/.test(latin))) return 'fb2';
  if (/^\s*(<!doctype html|<html)/i.test(latin)) return ext === 'md' ? 'md' : 'html';
  if ((BOOK_FORMATS as readonly string[]).includes(ext)) return ext as BookFormat;
  // plain text (any encoding): no NUL bytes in the first few KB
  return head.includes(0) && !(head[0] === 0xff && head[1] === 0xfe) && !(head[0] === 0xfe && head[1] === 0xff) ? null : 'txt';
}

export async function ensureBooksDir() { await fs.mkdir(BOOKS_DIR, { recursive: true }); }

/** Every book with a meta.json and its file, the last read first (kept in memory, see metacache.ts). */
const shelf = new MetaCache<BookMeta>({
  dir: BOOKS_DIR,
  idRe: ID_RE,
  dataFile: (m) => 'book.' + m.format,
  matters: (name) => name === 'meta.json' || name.startsWith('book.'),
  sortKey: (m) => m.openedAt || m.addedAt,
});
export function listBooks(): Promise<BookMeta[]> { return shelf.list(); }
/** The same list as the JSON GET /api/books sends, kept ready between changes. */
export function listBooksJson(): Promise<Buffer> { return shelf.json(); }
export const getBook = (id: string) => readJsonFile<BookMeta | null>(path.join(bookDir(id), 'meta.json'), null);

/** Keep a book (the same file twice is one book) and return its record. */
export async function addBook(buf: Buffer, info: { fileName?: string; sourceUrl?: string; format?: string; title?: string; author?: string }): Promise<BookMeta> {
  const format = (BOOK_FORMATS as readonly string[]).includes(info.format || '') ? info.format as BookFormat : sniffFormat(buf, info.fileName);
  if (!format) throw new Error('看不出这是什么格式的书（支持 EPUB、MOBI、AZW3、TXT、PDF、CBZ、FB2、HTML、Markdown）');
  const id = createHash('sha256').update(buf).digest('hex').slice(0, 16);
  return withLock('book:' + id, async () => {
    const dir = bookDir(id);
    await fs.mkdir(dir, { recursive: true });
    const old = await getBook(id);
    const file = path.join(dir, 'book.' + format);
    if (!existsSync(file)) await writeFileAtomic(file, buf);
    const base = (info.fileName || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();
    const meta: BookMeta = {
      ...(old || {}),
      id, format,
      kind: old?.kind || (format === 'pdf' || format === 'cbz' ? 'fixed' : 'flow'),
      title: old?.title || info.title || base || '无题',
      author: old?.author || info.author,
      fileName: old?.fileName || info.fileName,
      sourceUrl: old?.sourceUrl || info.sourceUrl,
      size: buf.length,
      addedAt: old?.addedAt || Date.now(),
    };
    await saveBookMeta(id, meta);
    return meta;
  });
}

export function patchBook(id: string, patch: Partial<BookMeta>): Promise<BookMeta | null> {
  return withLock('book:' + id, async () => {
    const cur = await getBook(id);
    if (!cur) return null;
    const allowed: Array<keyof BookMeta> = ['title', 'author', 'kind', 'lang', 'openedAt', 'color', 'progress', 'bookmarks', 'length'];
    const next = { ...cur };
    for (const k of allowed) if (k in patch) (next as any)[k] = (patch as any)[k];
    // nothing new (the same place saved again): the file stays as it is
    if (JSON.stringify(next) !== JSON.stringify(cur)) await saveBookMeta(id, next);
    return next;
  });
}

export async function deleteBook(id: string) {
  try { await fs.rm(bookDir(id), { recursive: true, force: true }); } finally { shelf.touch(id); }
}

export async function writeCover(id: string, buf: Buffer) {
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Error('The cover must be a JPEG');
  if (!existsSync(bookDir(id))) return null;
  await writeFileAtomic(coverPath(id), buf);
  return withLock('book:' + id, async () => {
    const cur = await getBook(id);
    if (!cur) return null;
    const next = { ...cur, cover: Date.now() };
    await saveBookMeta(id, next);
    return next;
  });
}

const MAX_BOOK = 400 * 1024 * 1024;
const okUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'http:' || x.protocol === 'https:'; } catch { return false; } };
/** An answer that will not be read: its connection is let go now, not when it is garbage-collected. */
const unread = (res: Response, e: Error) => { res.body?.cancel().catch(() => {}); return e; };

/** Download a book from a link (redirects followed), with progress. */
export async function fetchBook(url: string, status: (t: string) => void, progress: (loaded: number, total: number) => void, signal: AbortSignal) {
  if (!okUrl(url)) throw new Error('这不是一个网址');
  status('正在连接…');
  const res = await fetch(url, { redirect: 'follow', signal, headers: { 'User-Agent': 'PaperWatcher/0.1 (+local reading app)', Accept: '*/*' } });
  if (!res.ok || !res.body) throw unread(res, new Error(`下载失败（HTTP ${res.status}）`));
  const total = Number(res.headers.get('content-length') || 0);
  if (total > MAX_BOOK) throw unread(res, new Error('文件太大了（超过 400 MB）'));
  const cd = res.headers.get('content-disposition') || '';
  const fromCd = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1] || /filename="?([^";]+)"?/i.exec(cd)?.[1];
  const fromUrl = decodeURIComponent(new URL(res.url || url).pathname.split('/').pop() || '');
  const fileName = (fromCd ? decodeURIComponent(fromCd) : fromUrl) || 'book';
  const type = res.headers.get('content-type') || '';
  const reader = res.body.getReader();
  try {
    // a web page, not the book: said before downloading it
    if (/text\/html/i.test(type) && !/\.html?$/i.test(fileName)) throw new Error('这个链接打开的是网页，不是书的文件（请找“下载”链接）');
    status('正在下载…');
    const sink = new ByteSink(total);
    let last = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (sink.length + value.length > MAX_BOOK) throw new Error('文件太大了（超过 400 MB）');
      sink.push(value);
      if (Date.now() - last > 150) { progress(sink.length, total); last = Date.now(); }
    }
    progress(sink.length, total);
    return { buf: sink.done(), fileName, sourceUrl: url };
  } catch (e) {
    reader.cancel().catch(() => {});
    throw e;
  }
}

/** A catalog page (OPDS / Atom / JSON), fetched for the page (which can't reach other sites itself). */
export async function fetchCatalog(url: string, signal: AbortSignal) {
  if (!okUrl(url)) throw new Error('这不是一个网址');
  const res = await fetch(url, { redirect: 'follow', signal, headers: { 'User-Agent': 'PaperWatcher/0.1 (+local reading app)', Accept: 'application/atom+xml, application/opds+json, application/json, application/xml, text/xml;q=0.9, */*;q=0.5' } });
  if (!res.ok) throw unread(res, new Error(`书库没有回应（HTTP ${res.status}）`));
  const len = Number(res.headers.get('content-length') || 0);
  if (len > 8 * 1024 * 1024) throw unread(res, new Error('书库返回的内容太大了'));
  // read with a cap, so a feed without a Content-Length is not taken in whole before it is measured (the 8M
  // characters allowed below are at most 24 MB of UTF-8)
  const sink = new ByteSink(len);
  const reader = res.body?.getReader();
  for (;;) {
    const got = reader && await reader.read();
    if (!got || got.done) break;
    if (sink.length + got.value.length > 24 * 1024 * 1024) { reader.cancel().catch(() => {}); throw new Error('书库返回的内容太大了'); }
    sink.push(got.value);
  }
  const text = new TextDecoder().decode(sink.done());   // as res.text(): UTF-8, a BOM dropped
  if (text.length > 8 * 1024 * 1024) throw new Error('书库返回的内容太大了');
  return { text, type: res.headers.get('content-type') || '', url: res.url || url };
}
