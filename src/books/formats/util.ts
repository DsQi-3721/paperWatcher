// Small things every format needs: image sizes and types from their first bytes, paths inside a book, natural
// sorting, Blobs from bytes, friendly errors.

/** An error to show the student as it is (Chinese, short, says what to do). */
export const fail = (msg: string): never => { throw new Error(msg); };

/** Bytes as a Blob (copies them out of a bigger buffer). */
export function blobOf(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes.slice() as Uint8Array<ArrayBuffer>], { type });
}

const NO_BLOB = new Blob([]);
/** A book's pictures by key, each made (read out of the book's file) the first time it is asked for: opening a book
 *  with hundreds of pictures does not unpack and copy them all, only the ones that are looked at. Otherwise a Map. */
export class LazyBlobs extends Map<string, Blob> {
  private makers = new Map<string, () => Blob>();
  private heads = new Map<string, (n: number) => Uint8Array>();
  /** a picture made when first asked for; head(n) gives its first n bytes without making it */
  setLazy(key: string, make: () => Blob, head?: (n: number) => Uint8Array) {
    super.set(key, NO_BLOB);
    this.makers.set(key, make);
    if (head) this.heads.set(key, head);
    return this;
  }
  /** For a picture not made yet: what `read` finds in its first bytes (a few KB, else 256 KB), or null. */
  peek<T>(key: string, read: (head: Uint8Array) => T | null): T | null {
    const head = this.heads.get(key);
    if (!head || !this.makers.has(key)) return null;
    for (const n of [16384, 262144]) { const r = read(head(n)); if (r) return r; }
    return null;
  }
  get(key: string): Blob | undefined {
    const make = this.makers.get(key);
    if (make) { this.makers.delete(key); this.heads.delete(key); super.set(key, make()); }
    return super.get(key);
  }
  set(key: string, b: Blob) { this.makers?.delete(key); this.heads?.delete(key); return super.set(key, b); }
  delete(key: string) { this.makers.delete(key); this.heads.delete(key); return super.delete(key); }
  clear() { this.makers.clear(); this.heads.clear(); super.clear(); }
  private all() { for (const k of [...this.makers.keys()]) this.get(k); }
  forEach(f: (b: Blob, k: string, m: Map<string, Blob>) => void, thisArg?: unknown) { this.all(); super.forEach(f, thisArg); }
  entries() { this.all(); return super.entries(); }
  values() { this.all(); return super.values(); }
  [Symbol.iterator]() { return this.entries(); }
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', tif: 'image/tiff', tiff: 'image/tiff',
};
export const IMAGE_EXT = /\.(jpe?g|jpe|png|gif|webp|svg|bmp|avif)$/i;
export const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]+)(?:$|[?#])/)?.[1] ?? '');

/** An image's MIME type from its first bytes (or its name when the bytes don't say). */
export function imageMime(b: Uint8Array, name = ''): string | null {
  if (b.length >= 4) {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
    if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'image/avif';
    const head = String.fromCharCode(...b.subarray(0, Math.min(256, b.length))).trimStart();
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg/i.test(head) || /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  }
  return EXT_MIME[extOf(name)] ?? null;
}

/** An image's pixel size from its header (PNG, JPEG, GIF, WebP, BMP, SVG), or null. */
export function imageSize(b: Uint8Array): { w: number; h: number } | null {
  const n = b.length;
  try {
    if (n > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: u32(b, 16), h: u32(b, 20) };
    if (n > 10 && b[0] === 0x47 && b[1] === 0x49) return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
    if (n > 26 && b[0] === 0x42 && b[1] === 0x4d) return { w: Math.abs(i32le(b, 18)), h: Math.abs(i32le(b, 22)) };
    if (n > 30 && b[0] === 0x52 && b[8] === 0x57) {
      const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (kind === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
      if (kind === 'VP8L') return { w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
      if (kind === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    }
    if (n > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < n) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = (b[i + 2] << 8) | b[i + 3];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
        if (len < 2) return null;
        i += 2 + len;
      }
      return null;
    }
    const head = new TextDecoder().decode(b.subarray(0, Math.min(2048, n)));
    const svg = head.match(/<svg\b[^>]*>/i)?.[0];
    if (svg) {
      const num = (k: string) => { const v = svg.match(new RegExp(`\\s${k}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i')); return v ? +v[1] : 0; };
      let w = num('width'), h = num('height');
      const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      if ((!w || !h) && vb) { w = +vb[1]; h = +vb[2]; }
      if (w && h) return { w: Math.round(w), h: Math.round(h) };
    }
  } catch { /* a broken header: no size */ }
  return null;
}
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const i32le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

/** Sort names the way people number files: page2 before page10. */
export const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

/** A path inside a book, relative to the file it appears in ('OEBPS/Text/a.xhtml' + '../Images/b.png'). */
export function resolvePath(base: string, rel: string): string {
  let r = rel.split('#')[0].split('?')[0];
  try { r = decodeURIComponent(r); } catch { /* keep it as it is */ }
  if (!r) return base;
  const parts = r.startsWith('/') ? [] : base.split('/').slice(0, -1);
  for (const seg of r.replace(/^\/+/, '').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}
export const dirOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** A book's name from its file name: no extension, no trailing "(z-lib.org)"-style tags, no underscores. */
export function titleFromName(name: string): string {
  let t = name.split(/[\\/]/).pop() || name;
  t = t.replace(/\.(fb2\.zip|[a-z0-9]{2,8})$/i, '');
  t = t.replace(/[_]+/g, ' ').replace(/\s*[([（【][^)\]）】]*(z-?lib|libgen|anna|epub|mobi|txt|pdf|全本|精校|完结|作者)[^)\]）】]*[)\]）】]\s*/gi, ' ');
  return t.trim() || '未命名';
}

/** Characters in a run list (what progress counts). */
export const charsOf = (runs: Array<{ text: string }>) => runs.reduce((a, r) => a + r.text.length, 0);

/** Lets the page breathe during long parses (a big novel). */
export const breathe = () => new Promise<void>((r) => setTimeout(r, 0));
