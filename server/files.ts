// Serving files (PDFs, books, thumbnails, covers, pdf.js data, the built app): streamed from one open handle (never
// read whole into memory), closed as soon as the response ends however it ends (finished, client gone, read error),
// with validators (ETag, Last-Modified) so a browser that asks again gets a 304 instead of the file, and single byte
// ranges for clients that ask for them.
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.wasm': 'application/wasm',
  '.icc': 'application/octet-stream', '.pdf': 'application/pdf', '.ico': 'image/x-icon', '.map': 'application/json',
  '.epub': 'application/epub+zip', '.mobi': 'application/x-mobipocket-ebook', '.azw3': 'application/vnd.amazon.ebook',
  '.txt': 'application/octet-stream', '.cbz': 'application/vnd.comicbook+zip', '.fb2': 'application/x-fictionbook+xml', '.md': 'text/markdown',
};

/** For URLs whose bytes never change: a paper's PDF and a book's file (their ids are content hashes), a thumbnail or
 *  cover asked for with its ?v= version, the built app's hashed assets. */
export const IMMUTABLE = 'private, max-age=31536000, immutable';

/** Sends `file` (false when there is no such file). */
export async function sendFile(req: IncomingMessage, res: ServerResponse, file: string, cache = 'no-cache'): Promise<boolean> {
  let fh: fs.FileHandle;
  try { fh = await fs.open(file, 'r'); } catch { return false; }
  let streaming = false;
  try {
    // the stat of the handle that will be read: the size and validators describe exactly the bytes sent
    const st = await fh.stat();
    if (!st.isFile()) return false;
    const size = st.size;
    const etag = `"${st.ino.toString(36)}-${size.toString(36)}-${Math.round(st.mtimeMs * 1000).toString(36)}"`;
    const validators = { 'Cache-Control': cache, ETag: etag, 'Last-Modified': new Date(st.mtimeMs).toUTCString() };
    if (notModified(req, etag, st.mtimeMs)) {
      res.writeHead(304, validators);
      res.end();
      return true;
    }
    const range = byteRange(req, size, etag, validators['Last-Modified']);
    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...validators, 'Content-Range': `bytes */${size}` });
      res.end();
      return true;
    }
    const [start, end] = range ?? [0, size - 1];
    res.writeHead(range ? 206 : 200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': end - start + 1,
      ...validators,
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    });
    if (end < start || req.method === 'HEAD') {
      res.end();
      return true;
    }
    streaming = true;
    pipeline(fh.createReadStream({ start, end }), res, () => { /* the client left, or a read failed: both ends are closed */ });
    return true;
  } finally {
    if (!streaming) await fh.close().catch(() => {});
  }
}

/** If-None-Match (any of the tags, weak or not) and otherwise If-Modified-Since, as RFC 9110 orders them. */
function notModified(req: IncomingMessage, etag: string, mtimeMs: number) {
  const inm = req.headers['if-none-match'];
  if (inm) return inm.trim() === '*' || inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
  const ims = req.headers['if-modified-since'];
  if (!ims) return false;
  const t = Date.parse(ims);
  return !Number.isNaN(t) && Math.floor(mtimeMs / 1000) * 1000 <= t;
}

/** One `bytes=` range ([start, end], inclusive); null for the whole file (no range, several ranges, a range that is
 *  not valid, or If-Range says the file changed). */
function byteRange(req: IncomingMessage, size: number, etag: string, lastModified: string): [number, number] | 'unsatisfiable' | null {
  const h = req.headers.range;
  if (!h) return null;
  const ifRangeHeader = req.headers['if-range'];
  const ifRange = (Array.isArray(ifRangeHeader) ? ifRangeHeader[0] : ifRangeHeader)?.trim();
  if (ifRange && ifRange !== etag && ifRange !== lastModified) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) {
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    if (m[2] && Number(m[2]) < start) return null;
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start >= size) return 'unsatisfiable';
  return [start, end];
}
