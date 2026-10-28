// Reading book files into a BookDoc (src/books/types.ts): EPUB, MOBI / AZW3, TXT (any common encoding, chapters
// found), PDF, CBZ (and ZIPs of pictures), FB2, HTML and Markdown. What a file is comes from its first bytes, then its
// name; ZIPs are told apart by what is inside (an EPUB's container, an .fb2, pictures, a .txt). Each format's parser is
// loaded only when needed. Everything runs in the browser; problems a reader can't get past (DRM, passwords, RAR)
// come back as short Chinese messages.
import type { BookDoc, BookFormat } from '../types';
import { fail, IMAGE_EXT } from './util';
import { isZip, Zip } from './zip';

export { coverFor } from './cover';

/** File types the importer offers (for an <input accept>). */
export const BOOK_ACCEPT = '.epub,.mobi,.azw3,.azw,.prc,.pdb,.txt,.text,.pdf,.cbz,.zip,.fb2,.html,.htm,.xhtml,.md,.markdown';

const latin1 = (b: Uint8Array, o = 0, n = b.length) => new TextDecoder('latin1').decode(b.subarray(o, Math.min(b.length, o + n)));
const BY_EXT: Record<string, BookFormat> = {
  epub: 'epub', mobi: 'mobi', azw: 'mobi', prc: 'mobi', pdb: 'mobi', azw3: 'azw3', kf8: 'azw3', txt: 'txt', text: 'txt', pdf: 'pdf',
  cbz: 'cbz', zip: 'cbz', fb2: 'fb2', html: 'html', htm: 'html', xhtml: 'html', md: 'md', markdown: 'md',
};
const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');

/** What kind of book a file is, from its first bytes and its name (null: not one we can read). */
export function detectFormat(head: Uint8Array, name: string): BookFormat | null {
  const ext = extOf(name), byName = BY_EXT[ext] ?? null;
  if (isZip(head)) {
    // a ZIP's first entry: an EPUB starts with an uncompressed 'mimetype' file
    const n = head.length >= 30 ? head[26] | (head[27] << 8) : 0, x = head.length >= 30 ? head[28] | (head[29] << 8) : 0;
    const first = latin1(head, 30, n);
    if (first === 'mimetype' && /application\/epub\+zip/.test(latin1(head, 30 + n + x, 40))) return 'epub';
    if (/\.fb2$/i.test(first) || /\.fb2\.zip$/i.test(name)) return 'fb2';
    if (byName === 'epub' || byName === 'fb2' || byName === 'cbz') return byName;
    if (IMAGE_EXT.test(first) || /comicinfo\.xml/i.test(first)) return 'cbz';
    if (first === 'mimetype' || /^META-INF\//.test(first)) return 'epub';
    return byName === 'txt' ? 'txt' : 'cbz';
  }
  if (head.length >= 4 && latin1(head, 0, 1024).includes('%PDF')) return 'pdf';
  if (head.length >= 68) {
    const kind = latin1(head, 60, 8);
    if (kind === 'BOOKMOBI') {
      // record 0's MOBI header says the version: 8 is KF8 (AZW3)
      const r0 = head.length >= 82 ? ((head[78] << 24) | (head[79] << 16) | (head[80] << 8) | head[81]) >>> 0 : 0;
      if (r0 && head.length >= r0 + 0x28 && latin1(head, r0 + 16, 4) === 'MOBI') {
        const ver = ((head[r0 + 0x24] << 24) | (head[r0 + 0x25] << 16) | (head[r0 + 0x26] << 8) | head[r0 + 0x27]) >>> 0;
        if (ver >= 8) return 'azw3';
      }
      return byName === 'azw3' ? 'azw3' : 'mobi';
    }
    if (kind === 'TEXtREAd') return 'mobi';
  }
  if (isRar(head)) return null;
  const text = latin1(head, 0, 1024);
  if (/<FictionBook/.test(text)) return 'fb2';
  if (byName === 'md' || byName === 'txt') return byName;
  if (/^\s*(<\?xml[^>]*>\s*)?(<!doctype html|<html[\s>])/i.test(text) || byName === 'html') return 'html';
  if (byName) return byName;
  // no name to go by: plain text if it looks like text (few control bytes)
  let ctl = 0;
  for (const c of head.subarray(0, 4096)) if (c < 9 || (c > 13 && c < 32)) ctl++;
  return head.length && ctl < head.length * 0.02 ? 'txt' : null;
}
const isRar = (b: Uint8Array) => (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) || (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf);

/** A whole file, read into a document. */
export async function parseBook(data: ArrayBuffer, name: string, format?: BookFormat): Promise<BookDoc> {
  const head = new Uint8Array(data, 0, Math.min(data.byteLength, 64 * 1024));
  if (!data.byteLength) fail('这个文件是空的');
  if (isRar(head)) fail('暂时读不了 RAR / 7z 压缩包：请解压后重新打包成 ZIP（或 CBZ）再导入');
  const fmt = format ?? detectFormat(head, name);
  if (!fmt) fail('认不出这个文件的格式。支持 EPUB、MOBI、AZW3、TXT、PDF、CBZ、FB2、HTML 和 Markdown');
  if (isZip(head)) return parseZip(data, name, fmt!);
  switch (fmt) {
    case 'mobi': case 'azw3': return (await import('./mobi')).parseMobi(data, name);
    case 'pdf': return (await import('./pdf')).parsePdf(data, name);
    case 'fb2': return (await import('./fb2')).parseFb2Bytes(new Uint8Array(data), name);
    case 'html': return (await import('./html')).parseHtml(data, name);
    case 'md': return (await import('./markdown')).parseMarkdown(data, name);
    case 'epub': case 'cbz': fail('这个文件不是完整的压缩包，可能下载坏了'); break;
    default: return (await import('./txt')).parseTxt(data, name);
  }
  throw new Error('unreachable');
}

/** A ZIP: an EPUB (its container), a zipped FB2, a comic (pictures), or a zipped TXT novel. */
async function parseZip(data: ArrayBuffer, name: string, fmt: BookFormat): Promise<BookDoc> {
  const zip = new Zip(new Uint8Array(data));
  if (zip.has('META-INF/container.xml') || zip.entries.some((e) => /\.opf$/i.test(e.name))) return (await import('./epub')).parseEpubZip(zip, name);
  const fb2 = zip.entries.find((e) => /\.fb2$/i.test(e.name));
  if (fb2) return (await import('./fb2')).parseFb2Bytes(zip.bytes(fb2), name);
  const pics = zip.entries.filter((e) => IMAGE_EXT.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name));
  const texts = zip.entries.filter((e) => /\.(txt|text)$/i.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name)).sort((a, b) => b.usize - a.usize);
  if (texts.length && (!pics.length || texts[0].usize > 20000)) {
    const bytes = zip.bytes(texts[0]);
    const ab = bytes.slice().buffer as ArrayBuffer;
    return (await import('./txt')).parseTxt(ab, texts[0].name.split('/').pop() || name);
  }
  if (pics.length) return (await import('./cbz')).parseCbzZip(zip, name);
  const inner = zip.entries.find((e) => /\.(epub|mobi|azw3|pdf)$/i.test(e.name));
  if (inner) { const b = zip.bytes(inner); return parseBook(b.slice().buffer as ArrayBuffer, inner.name); }
  void fmt;
  return fail('这个压缩包里没有能读的书（EPUB、TXT、FB2 或漫画图片）');
}

/** How long the book is: characters (flow) or pages (fixed). */
export function lengthOf(doc: BookDoc): number {
  return doc.kind === 'flow' ? doc.chapters.reduce((a, c) => a + c.chars, 0) : doc.pages;
}
