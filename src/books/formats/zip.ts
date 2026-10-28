// A ZIP read lazily: the central directory first, each entry inflated only when it is asked for (a 200 MB comic
// never sits in memory twice). EPUB, CBZ and zipped FB2 / TXT are ZIPs. Names without the UTF-8 flag are tried as
// UTF-8, then GBK (Chinese zip tools), as people expect.
import { Inflate, inflateSync } from 'fflate';
import { fail } from './util';

export interface ZipEntry { name: string; method: number; csize: number; usize: number; offset: number; flags: number }

const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

export class Zip {
  entries: ZipEntry[] = [];
  private byName = new Map<string, ZipEntry>();
  private lower = new Map<string, ZipEntry>();

  constructor(private data: Uint8Array) {
    const v = dv(data), n = data.length;
    // the end of central directory record: within the last 64 KB (+22) of the file
    let eocd = -1;
    for (let i = n - 22; i >= Math.max(0, n - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) fail('这个压缩包坏了，或者不是 ZIP 文件');
    let count = v.getUint16(eocd + 10, true), cdOffset = v.getUint32(eocd + 16, true);
    // ZIP64: the real numbers are in the ZIP64 record the locator points to
    if ((count === 0xffff || cdOffset === 0xffffffff) && eocd >= 20 && v.getUint32(eocd - 20, true) === 0x07064b50) {
      const z64 = Number(v.getBigUint64(eocd - 12, true));
      if (z64 + 56 <= n && v.getUint32(z64, true) === 0x06064b50) { count = Number(v.getBigUint64(z64 + 32, true)); cdOffset = Number(v.getBigUint64(z64 + 48, true)); }
    }
    const utf8 = new TextDecoder('utf-8', { fatal: true }), gbk = new TextDecoder('gb18030');
    let p = cdOffset;
    for (let k = 0; k < count && p + 46 <= n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
      let csize = v.getUint32(p + 20, true), usize = v.getUint32(p + 24, true);
      const nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      let offset = v.getUint32(p + 42, true);
      const raw = data.subarray(p + 46, p + 46 + nl);
      let name: string;
      if (flags & 0x800) name = new TextDecoder().decode(raw);
      else { try { name = utf8.decode(raw); } catch { name = gbk.decode(raw); } }
      // ZIP64 sizes / offset in the extra field
      let x = p + 46 + nl;
      const xe = x + xl;
      while (x + 4 <= xe) {
        const id = v.getUint16(x, true), len = v.getUint16(x + 2, true);
        if (id === 0x0001) {
          let q = x + 4;
          if (usize === 0xffffffff && q + 8 <= x + 4 + len) { usize = Number(v.getBigUint64(q, true)); q += 8; }
          if (csize === 0xffffffff && q + 8 <= x + 4 + len) { csize = Number(v.getBigUint64(q, true)); q += 8; }
          if (offset === 0xffffffff && q + 8 <= x + 4 + len) { offset = Number(v.getBigUint64(q, true)); }
        }
        x += 4 + len;
      }
      p += 46 + nl + xl + cl;
      if (name.endsWith('/')) continue;
      const e: ZipEntry = { name: name.replace(/\\/g, '/'), method, csize, usize, offset, flags };
      this.entries.push(e);
      this.byName.set(e.name, e);
      this.lower.set(e.name.toLowerCase(), e);
    }
    if (!this.entries.length) fail('这个压缩包是空的');
  }

  /** An entry by its path (exact, then ignoring case, then a leading slash). */
  get(name: string): ZipEntry | undefined {
    const n = name.replace(/^\/+/, '');
    return this.byName.get(n) ?? this.lower.get(n.toLowerCase());
  }
  has(name: string) { return !!this.get(name); }

  /** An entry's bytes (a view into the file when it was stored, a fresh array when it was deflated). */
  bytes(e: ZipEntry | string): Uint8Array {
    const ent = typeof e === 'string' ? this.get(e) : e;
    if (!ent) return new Uint8Array(0);
    if (ent.flags & 1) fail('这个压缩包加了密码，读不了');
    const v = dv(this.data), o = ent.offset;
    if (o + 30 > this.data.length || v.getUint32(o, true) !== 0x04034b50) return new Uint8Array(0);
    const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
    const raw = this.data.subarray(start, start + ent.csize);
    if (ent.method === 0) return raw;
    if (ent.method === 8) {
      try { return inflateSync(raw, ent.usize ? { out: new Uint8Array(ent.usize) } : undefined); } catch { return new Uint8Array(0); }
    }
    return new Uint8Array(0);   // other methods (bzip2, lzma…): skipped
  }
  /** The first n bytes of an entry, inflating no further than that (a picture's kind and size, without the rest of
   *  it). The same bytes as the start of bytes(e). */
  head(e: ZipEntry, n: number): Uint8Array {
    if (e.flags & 1) fail('这个压缩包加了密码，读不了');
    const v = dv(this.data), o = e.offset;
    if (o + 30 > this.data.length || v.getUint32(o, true) !== 0x04034b50) return new Uint8Array(0);
    const start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
    const raw = this.data.subarray(start, start + e.csize);
    if (e.method === 0) return raw.subarray(0, n);
    if (e.method !== 8) return new Uint8Array(0);
    const parts: Uint8Array[] = [];
    let got = 0;
    try {
      const inf = new Inflate((chunk) => { parts.push(chunk); got += chunk.length; });
      for (let p = 0; p < raw.length && got < n; p += 16384) inf.push(raw.subarray(p, p + 16384), p + 16384 >= raw.length);
    } catch { return new Uint8Array(0); }
    const out = new Uint8Array(Math.min(n, got));
    let at = 0;
    for (const c of parts) { if (at >= out.length) break; const k = Math.min(c.length, out.length - at); out.set(c.subarray(0, k), at); at += k; }
    return out;
  }
  /** An entry as text (UTF-8, with any BOM dropped). */
  text(e: ZipEntry | string): string {
    return new TextDecoder().decode(this.bytes(e)).replace(/^\uFEFF/, '');
  }
}

/** Does this look like the start of a ZIP? */
export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
