// Kindle books: MOBI (the old Mobipocket markup) and AZW3 / KF8 (XHTML, also the newer half of combined .mobi files).
// A Palm database of records: record 0 holds the headers (PalmDOC, MOBI, EXTH metadata), then the compressed text
// (PalmDOC LZ77 or HUFF/CDIC), then pictures and indexes. MOBI 7 text is one long markup with byte-offset links
// (filepos) and page breaks between chapters; KF8 text is XHTML files cut into a skeleton and fragments that are put
// back together here, with links as kindle:pos:fid:…:off:… and pictures as kindle:embed:…. The contents come from the
// NCX index (or the MOBI 7 guide's contents page). DRM'd books are refused with a clear message.
import type { Block, FlowDoc, Run, TocItem } from '../types';
import { chapterOf, Converter, cssHints, emptyHints, finishContents, parseMarkup, type CssHints } from './blocks';
import { parseTxtText } from './txt';
import { blobOf, fail, imageMime, imageSize, titleFromName } from './util';

const NONE = 0xffffffff;
const dv = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const latin1 = new TextDecoder('latin1');
const ascii = (b: Uint8Array, o: number, n: number) => latin1.decode(b.subarray(o, o + n));

/* ---------- the Palm database ---------- */
function records(data: Uint8Array): Uint8Array[] {
  const v = dv(data), n = v.getUint16(76);
  const offs: number[] = [];
  for (let i = 0; i < n; i++) offs.push(v.getUint32(78 + i * 8));
  return offs.map((o, i) => data.subarray(Math.min(o, data.length), Math.min(offs[i + 1] ?? data.length, data.length)));
}

interface Header {
  compression: number; textLength: number; textRecords: number; encryption: number;
  headerLength: number; encoding: number; version: number; fullName: string;
  firstImage: number; huffOffset: number; huffCount: number; extraFlags: number;
  fdst: number; ncx: number; frag: number; skel: number;
  exth: Map<number, Uint8Array[]>;
}
function header(r0: Uint8Array): Header {
  const v = dv(r0);
  const h: Header = {
    compression: v.getUint16(0), textLength: v.getUint32(4), textRecords: v.getUint16(8), encryption: v.getUint16(12),
    headerLength: 0, encoding: 1252, version: 0, fullName: '', firstImage: NONE, huffOffset: NONE, huffCount: 0, extraFlags: 0,
    fdst: NONE, ncx: NONE, frag: NONE, skel: NONE, exth: new Map(),
  };
  if (r0.length < 24 || ascii(r0, 16, 4) !== 'MOBI') return h;
  const L = v.getUint32(20);
  h.headerLength = L;
  // fields past the end of a short header are missing
  const g = (o: number) => (o + 4 <= 16 + L && o + 4 <= r0.length ? v.getUint32(o) : NONE);
  h.encoding = g(0x1c);
  h.version = g(0x24);
  const nameOff = g(0x54), nameLen = g(0x58);
  h.firstImage = g(0x6c);
  h.huffOffset = g(0x70);
  h.huffCount = g(0x74) === NONE ? 0 : g(0x74);
  if (L >= 0xe4 && r0.length >= 0xf4) h.extraFlags = v.getUint16(0xf2);
  if (h.version >= 8) { h.fdst = g(0xc0); h.frag = g(0xf8); h.skel = g(0xfc); }
  h.ncx = g(0xf4);
  if (g(0x80) !== NONE && (g(0x80) & 0x40) && 16 + L + 12 <= r0.length && ascii(r0, 16 + L, 4) === 'EXTH') {
    let p = 16 + L + 12;
    const count = v.getUint32(16 + L + 8);
    for (let i = 0; i < count && p + 8 <= r0.length; i++) {
      const type = v.getUint32(p), len = v.getUint32(p + 4);
      if (len < 8) break;
      const arr = h.exth.get(type) ?? [];
      arr.push(r0.subarray(p + 8, p + len));
      h.exth.set(type, arr);
      p += len;
    }
  }
  if (nameOff !== NONE && nameLen !== NONE && nameOff + nameLen <= r0.length) h.fullName = decoder(h.encoding).decode(r0.subarray(nameOff, nameOff + nameLen));
  return h;
}
const decoder = (enc: number) => new TextDecoder(enc === 65001 ? 'utf-8' : 'windows-1252');
const exthNum = (h: Header, t: number) => { const b = h.exth.get(t)?.[0]; return b && b.length >= 4 ? dv(b).getUint32(0) : NONE; };
const exthStr = (h: Header, t: number) => (h.exth.get(t) ?? []).map((b) => decoder(h.encoding).decode(b).trim()).filter(Boolean);

/* ---------- text: decompression and the per-record trailing data ---------- */
function palmdoc(src: Uint8Array): Uint8Array {
  let out = new Uint8Array(Math.max(8192, src.length * 4)), o = 0, i = 0;
  const need = (k: number) => { if (o + k > out.length) { const n = new Uint8Array(out.length * 2 + k); n.set(out); out = n; } };
  while (i < src.length) {
    const c = src[i++];
    if (c === 0 || (c >= 0x09 && c <= 0x7f)) { need(1); out[o++] = c; }
    else if (c <= 0x08) { need(c); for (let k = 0; k < c && i < src.length; k++) out[o++] = src[i++]; }
    else if (c <= 0xbf) {
      if (i >= src.length) break;
      const x = ((c << 8) | src[i++]) & 0x3fff, dist = x >> 3, len = (x & 7) + 3;
      if (!dist || dist > o) continue;
      need(len);
      for (let k = 0; k < len; k++, o++) out[o] = out[o - dist];
    } else { need(2); out[o++] = 0x20; out[o++] = c ^ 0x80; }
  }
  return out.subarray(0, o);
}

/** HUFF/CDIC (Amazon's Huffman compression). */
class Huff {
  private dict1: Array<[number, boolean, number]> = [];
  private minc: number[] = [0];
  private maxc: number[] = [0];
  private dict: Array<[Uint8Array, boolean] | null> = [];
  constructor(recs: Uint8Array[]) {
    const huff = recs[0];
    if (ascii(huff, 0, 4) !== 'HUFF') fail('这本 Kindle 书的压缩格式读不了');
    const v = dv(huff), off1 = v.getUint32(8), off2 = v.getUint32(12);
    for (let i = 0; i < 256; i++) {
      const x = v.getUint32(off1 + i * 4), len = x & 0x1f, term = !!(x & 0x80), max = x >>> 8;
      this.dict1.push([len, term, (max + 1) * 2 ** (32 - len) - 1]);
    }
    for (let len = 1; len <= 32; len++) {
      this.minc.push(v.getUint32(off2 + (len - 1) * 8) * 2 ** (32 - len));
      this.maxc.push((v.getUint32(off2 + (len - 1) * 8 + 4) + 1) * 2 ** (32 - len) - 1);
    }
    for (const c of recs.slice(1)) {
      if (ascii(c, 0, 4) !== 'CDIC') continue;
      const cv = dv(c), phrases = cv.getUint32(8), bits = cv.getUint32(12);
      const n = Math.min(1 << bits, phrases - this.dict.length);
      for (let i = 0; i < n; i++) {
        const off = cv.getUint16(16 + i * 2), blen = cv.getUint16(16 + off);
        this.dict.push([c.subarray(18 + off, 18 + off + (blen & 0x7fff)), !!(blen & 0x8000)]);
      }
    }
  }
  unpack(data: Uint8Array): Uint8Array {
    const padded = new Uint8Array(data.length + 8);
    padded.set(data);
    const v = dv(padded), parts: Uint8Array[] = [];
    let bitsLeft = data.length * 8, pos = 0;
    // a 32-bit window starting at bit `pos`
    const peek = () => {
      const w = pos >>> 5, s = pos & 31, hi = v.getUint32(w * 4), lo = v.getUint32(w * 4 + 4);
      return s ? ((hi << s) | (lo >>> (32 - s))) >>> 0 : hi;
    };
    for (;;) {
      const code = peek();
      let [len, term, max] = this.dict1[code >>> 24];
      if (!term) { while (len < 32 && code < this.minc[len]) len++; max = this.maxc[len]; }
      pos += len;
      bitsLeft -= len;
      if (bitsLeft < 0 || !len) break;
      const r = Math.floor((max - code) / 2 ** (32 - len));
      const e = this.dict[r];
      if (!e) break;
      let [slice, done] = e;
      if (!done) { this.dict[r] = null; slice = this.unpack(slice); this.dict[r] = [slice, true]; }
      parts.push(slice);
    }
    return concat(parts);
  }
}
function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function trailing(rec: Uint8Array, flags: number): number {
  const size = rec.length;
  let num = 0;
  for (let f = flags >> 1; f; f >>= 1) {
    if (!(f & 1)) continue;
    let res = 0, shift = 0, p = size - num;
    while (p > 0) { const x = rec[p - 1]; res |= (x & 0x7f) << shift; shift += 7; p--; if ((x & 0x80) || shift >= 28) break; }
    num += res;
  }
  if (flags & 1 && size - num - 1 >= 0) num += (rec[size - num - 1] & 3) + 1;
  return Math.min(num, size);
}
function rawText(recs: Uint8Array[], h: Header, base: number): Uint8Array {
  const huff = h.compression === 17480 && h.huffOffset !== NONE ? new Huff(recs.slice(base + h.huffOffset, base + h.huffOffset + Math.max(1, h.huffCount))) : null;
  const parts: Uint8Array[] = [];
  for (let i = 1; i <= h.textRecords && base + i < recs.length; i++) {
    let r = recs[base + i];
    r = r.subarray(0, r.length - trailing(r, h.extraFlags));
    parts.push(h.compression === 2 ? palmdoc(r) : huff ? huff.unpack(r) : r);
  }
  const all = concat(parts);
  return h.textLength && h.textLength <= all.length ? all.subarray(0, h.textLength) : all;
}

/* ---------- indexes (INDX + TAGX), as in the KF8 skeleton / fragment tables and the NCX ---------- */
interface IndexEntry { name: Uint8Array; tags: Map<number, number[]> }
function fwdVar(b: Uint8Array, o: number): [number, number] {
  let v = 0, n = 0;
  for (;;) { const x = b[o + n++]; v = (v * 128) + (x & 0x7f); if (x & 0x80 || o + n >= b.length) break; }
  return [n, v];
}
function readIndex(recs: Uint8Array[], idx: number): { entries: IndexEntry[]; cncx: Map<number, Uint8Array> } {
  const entries: IndexEntry[] = [], cncx = new Map<number, Uint8Array>();
  if (idx === NONE || idx >= recs.length) return { entries, cncx };
  const main = recs[idx];
  if (ascii(main, 0, 4) !== 'INDX') return { entries, cncx };
  const mv = dv(main), len = mv.getUint32(4), count = mv.getUint32(24), nctoc = mv.getUint32(52);
  // the tag table
  const tags: Array<[number, number, number, number]> = [];
  let cbc = 0;
  if (ascii(main, len, 4) === 'TAGX') {
    const first = mv.getUint32(len + 4);
    cbc = mv.getUint32(len + 8);
    for (let i = 12; i < first; i += 4) tags.push([main[len + i], main[len + i + 1], main[len + i + 2], main[len + i + 3]]);
  }
  // the string tables (CNCX) after the index records
  for (let j = 0; j < nctoc; j++) {
    const c = recs[idx + count + 1 + j];
    if (!c) break;
    let o = 0;
    while (o < c.length && c[o] !== 0) {
      const at = o, [n, l] = fwdVar(c, o);
      o += n;
      cncx.set(at + j * 0x10000, c.subarray(o, o + l));
      o += l;
    }
  }
  for (let i = idx + 1; i <= idx + count && i < recs.length; i++) {
    const d = recs[i];
    if (ascii(d, 0, 4) !== 'INDX') continue;
    const v = dv(d), idxt = v.getUint32(20), n = v.getUint32(24);
    const pos: number[] = [];
    for (let j = 0; j < n; j++) pos.push(v.getUint16(idxt + 4 + j * 2));
    pos.push(idxt);
    for (let j = 0; j < n; j++) {
      const start = pos[j], tl = d[start], name = d.subarray(start + 1, start + 1 + tl);
      entries.push({ name, tags: tagMap(d, start + 1 + tl, cbc, tags) });
    }
  }
  return { entries, cncx };
}
function tagMap(d: Uint8Array, start: number, cbc: number, table: Array<[number, number, number, number]>): Map<number, number[]> {
  const out = new Map<number, number[]>(), want: Array<[number, number | null, number | null, number]> = [];
  let cbi = 0, p = start + cbc;
  for (const [tag, per, mask, end] of table) {
    if (end === 1) { cbi++; continue; }
    let v = d[start + cbi] & mask;
    if (!v) continue;
    if (v === mask) {
      if (bits(mask) > 1) { const [n, val] = fwdVar(d, p); p += n; want.push([tag, null, val, per]); }
      else want.push([tag, 1, null, per]);
    } else {
      let m = mask;
      while (!(m & 1)) { m >>= 1; v >>= 1; }
      want.push([tag, v, null, per]);
    }
  }
  for (const [tag, count, bytes, per] of want) {
    const vals: number[] = [];
    if (count != null) for (let k = 0; k < count * per; k++) { const [n, val] = fwdVar(d, p); p += n; vals.push(val); }
    else { let used = 0; while (used < (bytes ?? 0)) { const [n, val] = fwdVar(d, p); p += n; used += n; vals.push(val); } }
    out.set(tag, vals);
  }
  return out;
}
const bits = (x: number) => { let c = 0; for (; x; x >>= 1) c += x & 1; return c; };

/* ---------- shared: pictures, anchors, the contents ---------- */
const B32 = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const fromB32 = (s: string) => { let v = 0; for (const ch of s.toUpperCase()) v = v * 32 + Math.max(0, B32.indexOf(ch)); return v; };

/** Put `<a id="…">` marks into markup bytes at byte offsets (moved out of any tag they fall in). */
function insertMarks(bytes: Uint8Array, marks: Array<{ at: number; id: string }>): Uint8Array {
  if (!marks.length) return bytes;
  const enc = new TextEncoder(), sorted = marks.filter((m) => m.at >= 0 && m.at <= bytes.length).sort((a, b) => a.at - b.at);
  const parts: Uint8Array[] = [];
  let last = 0;
  for (const m of sorted) {
    let at = m.at;
    // inside a tag (a '<' with no '>' after it before `at`)? then before that tag
    for (let k = at - 1; k >= Math.max(last, at - 4096); k--) { if (bytes[k] === 0x3e) break; if (bytes[k] === 0x3c) { at = k; break; } }
    if (at < last) at = last;
    parts.push(bytes.subarray(last, at), enc.encode(`<a id="${m.id}"></a>`));
    last = at;
  }
  parts.push(bytes.subarray(last));
  return concat(parts);
}

class Pictures {
  resources = new Map<string, Blob>();
  private seen = new Map<string, { key: string; w?: number; h?: number } | null>();
  constructor(private recs: Uint8Array[]) {}
  /** a record as a picture (null: not an image) */
  get(key: string, rec: number) {
    if (this.seen.has(key)) return this.seen.get(key)!;
    let b = this.recs[rec];
    let res: { key: string; w?: number; h?: number } | null = null;
    if (b && b.length > 16) {
      if (ascii(b, 0, 4) === 'CRES') b = b.subarray(12);   // a KF8 "HD" picture: a 12-byte header, then the image
      const mime = imageMime(b);
      if (mime && /^image\/(jpeg|png|gif|webp|bmp)/.test(mime)) { this.resources.set(key, blobOf(b, mime)); res = { key, ...(imageSize(b) ?? {}) }; }
    }
    this.seen.set(key, res);
    return res;
  }
}

function rewriteLinks(chapters: ReturnType<typeof chapterOf>[], anchors: Map<string, { c: number; b: number }>) {
  for (const ch of chapters) for (const bl of ch.blocks as Block[]) if ('runs' in bl) for (const r of bl.runs as Run[]) {
    if (!r.href?.startsWith('@')) continue;
    const at = anchors.get(r.href.slice(1));
    if (!at) { delete r.href; continue; }
    const id = `${at.c}.${at.b}`, tb = chapters[at.c]?.blocks[at.b];
    if (tb) tb.id = id;
    r.href = '#' + id;
  }
}
/** NCX entries → a tree of contents items, through a function that finds where each position landed. */
function ncxToc(ix: ReturnType<typeof readIndex>, h: Header, locate: (e: IndexEntry) => { c: number; b: number } | null): TocItem[] {
  const dec = decoder(h.encoding);
  const nodes = ix.entries.map((e) => {
    const label = e.tags.get(3)?.[0], t = label != null ? ix.cncx.get(label) : undefined;
    return { e, title: t ? dec.decode(t).trim() : '', level: e.tags.get(4)?.[0] ?? 0, parent: e.tags.get(21)?.[0] ?? -1, at: locate(e) };
  });
  const items = nodes.map((n) => (n.at && n.title ? ({ title: n.title, chapter: n.at.c, ...(n.at.b ? { block: n.at.b } : {}) } as TocItem) : null));
  const roots: TocItem[] = [];
  nodes.forEach((n, i) => {
    const it = items[i];
    if (!it) return;
    const par = n.parent >= 0 && n.parent < items.length ? items[n.parent] : null;
    if (par && n.level > 0) (par.children ??= []).push(it); else roots.push(it);
  });
  return roots;
}

/* ---------- MOBI 7 ---------- */
function mobi7(recs: Uint8Array[], h: Header, title: string, author: string | undefined, lang: string | undefined, cover: Blob | null, pics: Pictures): FlowDoc {
  const raw = rawText(recs, h, 0);
  const view = latin1.decode(raw);
  // every byte position something points to: link targets, the contents (NCX) and the guide's contents page
  const targets = new Set<number>();
  for (const m of view.matchAll(/filepos\s*=\s*["']?0*(\d+)/gi)) targets.add(+m[1]);
  const ncx = readIndex(recs, h.ncx);
  for (const e of ncx.entries) { const p = e.tags.get(1)?.[0]; if (p != null) targets.add(p); }
  const marked = insertMarks(raw, [...targets].map((at) => ({ at, id: `fp${at}` })));
  let html = decoder(h.encoding).decode(marked);
  html = html.replace(/filepos\s*=\s*["']?0*(\d+)["']?/gi, 'href="#fp$1"')
    .replace(/(?:hi|lo)?recindex\s*=\s*["']?0*(\d+)["']?/gi, 'src="rec:$1"');
  // the guide's contents page (its attributes in any order)
  const tocPage = [...html.matchAll(/<reference\b[^>]*>/gi)].map((m) => m[0]).find((t) => /type\s*=\s*["']?toc\b/i.test(t))?.match(/href="#fp(\d+)"/)?.[1];
  const chunks = html.split(/<mbp:pagebreak\s*\/?>/i);
  const chapters: ReturnType<typeof chapterOf>[] = [];
  const anchors = new Map<string, { c: number; b: number }>();
  const hints: CssHints = emptyHints();
  for (const chunk of chunks) {
    const doc = parseMarkup(`<html><body>${chunk.replace(/<\/?(html|head|body)[^>]*>/gi, '').replace(/<guide>[\s\S]*?<\/guide>/gi, '')}</body></html>`, false);
    const out = new Converter({
      image: (src) => { const m = src.match(/^rec:(\d+)$/); return m && h.firstImage !== NONE ? pics.get(src, h.firstImage + +m[1] - 1) : null; },
      link: (href) => href.startsWith('#') ? '@' + href.slice(1) : /^(https?|mailto):/i.test(href) ? href : null,
      hints,
    }).run(doc.body);
    const c = chapters.length;
    if (!out.blocks.length) { for (const [id] of out.anchors) anchors.set(id, { c: Math.max(0, c), b: 0 }); continue; }
    for (const [id, b] of out.anchors) anchors.set(id, { c, b });
    chapters.push(chapterOf(out.blocks));
  }
  // anchors left pointing past the end (empty last chunks)
  for (const [id, at] of anchors) if (at.c >= chapters.length) anchors.set(id, { c: Math.max(0, chapters.length - 1), b: 0 });
  if (!chapters.length) fail('这本 Kindle 书里没有能读的正文');
  rewriteLinks(chapters, anchors);
  let toc: TocItem[] = ncx.entries.length ? ncxToc(ncx, h, (e) => { const p = e.tags.get(1)?.[0]; return p != null ? anchors.get(`fp${p}`) ?? null : null; }) : [];
  if (!toc.length && tocPage) {
    // the guide's contents page: its links, in order
    const at = anchors.get(`fp${tocPage}`);
    if (at) {
      const seen = new Set<string>();
      for (let c = at.c; c < Math.min(chapters.length, at.c + 3) && !toc.length; c++) for (const bl of chapters[c].blocks) if ('runs' in bl) for (const r of bl.runs) {
        if (!r.href?.startsWith('#') || seen.has(r.href)) continue;
        seen.add(r.href);
        const [cc, bb] = r.href.slice(1).split('.').map(Number);
        if (cc !== c && r.text.trim()) toc.push({ title: r.text.trim(), chapter: cc, ...(bb ? { block: bb } : {}) });
      }
    }
  }
  toc = finishContents(chapters, toc);
  return { kind: 'flow', title, author, lang, cover, chapters, toc, resources: pics.resources };
}

/* ---------- KF8 (AZW3) ---------- */
function kf8(recs: Uint8Array[], h: Header, base: number, title: string, author: string | undefined, lang: string | undefined, cover: Blob | null, pics: Pictures, imageBase: number[]): FlowDoc {
  const raw = rawText(recs, h, base);
  // the flows: 0 is the XHTML, the others CSS / SVG
  let flows: Uint8Array[] = [raw];
  const fd = h.fdst !== NONE ? recs[base + h.fdst] : undefined;
  if (fd && ascii(fd, 0, 4) === 'FDST') {
    const v = dv(fd), n = v.getUint32(8);
    flows = [];
    for (let i = 0; i < n; i++) flows.push(raw.subarray(v.getUint32(12 + i * 8), v.getUint32(16 + i * 8)));
  }
  const text = flows[0];
  const hints: CssHints = emptyHints();
  for (const f of flows.slice(1)) { const s = new TextDecoder().decode(f); if (/[{]\s*[\w-]+\s*:/.test(s)) cssHints(s, hints); }

  // skeletons and fragments → the original XHTML files
  const sk = readIndex(recs, h.skel === NONE ? NONE : base + h.skel).entries.map((e) => ({ count: e.tags.get(1)?.[0] ?? 0, start: e.tags.get(6)?.[0] ?? 0, len: e.tags.get(6)?.[1] ?? 0 }));
  const fr = readIndex(recs, h.frag === NONE ? NONE : base + h.frag).entries.map((e) => ({ insert: parseInt(latin1.decode(e.name), 10), file: e.tags.get(3)?.[0] ?? 0, start: e.tags.get(6)?.[0] ?? 0, len: e.tags.get(6)?.[1] ?? 0 }));
  const parts: Array<{ bytes: Uint8Array; start: number; end: number }> = [];
  if (sk.length) {
    let fi = 0;
    for (const s of sk) {
      let bytes = text.subarray(s.start, s.start + s.len), ptr = s.start + s.len;
      for (let k = 0; k < s.count && fi < fr.length; k++, fi++) {
        const f = fr[fi], slice = text.subarray(ptr, ptr + f.len);
        const at = Math.max(0, Math.min(bytes.length, f.insert - s.start));
        bytes = concat([bytes.subarray(0, at), slice, bytes.subarray(at)]);
        ptr += f.len;
      }
      parts.push({ bytes, start: s.start, end: ptr });
    }
  } else parts.push({ bytes: text, start: 0, end: text.length });

  // positions (the contents' and links' kindle:pos:fid:…:off:…) → marks in their files
  const posOf = (fid: number, off: number) => (fr[fid] ? fr[fid].insert + off : off);
  const partAt = (pos: number) => { for (let i = 0; i < parts.length; i++) if (pos >= parts[i].start && pos < parts[i].end) return i; return -1; };
  const marks = new Map<number, Array<{ at: number; id: string }>>();
  const mark = (fid: number, off: number) => {
    const id = `kp${fid}_${off}`, pos = posOf(fid, off), pi = partAt(pos);
    if (pi < 0) return;
    const list = marks.get(pi) ?? [];
    if (!list.some((m) => m.id === id)) list.push({ at: pos - parts[pi].start, id });
    marks.set(pi, list);
  };
  const ncx = readIndex(recs, h.ncx === NONE ? NONE : base + h.ncx);
  for (const e of ncx.entries) { const pf = e.tags.get(6); if (pf && pf.length >= 2) mark(pf[0], pf[1]); }
  for (const p of parts) for (const m of latin1.decode(p.bytes).matchAll(/kindle:pos:fid:([0-9A-V]{4}):off:([0-9A-V]{10})/gi)) mark(fromB32(m[1]), fromB32(m[2]));

  const chapters: ReturnType<typeof chapterOf>[] = [];
  const anchors = new Map<string, { c: number; b: number }>();
  const firstOf = new Map<number, number>();   // part → its chapter
  parts.forEach((p, pi) => {
    let html = new TextDecoder().decode(insertMarks(p.bytes, marks.get(pi) ?? []));
    html = html.replace(/kindle:pos:fid:([0-9A-V]{4}):off:([0-9A-V]{10})/gi, (_, a, b) => `#kp${fromB32(a)}_${fromB32(b)}`)
      .replace(/kindle:embed:([0-9A-V]{4})(\?[^"')\s]*)?/gi, (_, a) => `embed:${fromB32(a)}`);
    const doc = parseMarkup(html, true);
    const out = new Converter({
      image: (src) => {
        const m = src.match(/^embed:(\d+)$/);
        if (!m) return null;
        for (const b0 of imageBase) { const pic = pics.get(src, b0 + +m[1] - 1); if (pic) return pic; }
        return null;
      },
      link: (href) => href.startsWith('#') ? '@' + href.slice(1) : /^(https?|mailto):/i.test(href) ? href : null,
      hints,
    }).run(doc.querySelector('body') ?? doc.documentElement);
    firstOf.set(pi, chapters.length);
    if (!out.blocks.length) { for (const [id] of out.anchors) anchors.set(id, { c: chapters.length, b: 0 }); return; }
    const c = chapters.length;
    for (const [id, b] of out.anchors) anchors.set(id, { c, b });
    chapters.push(chapterOf(out.blocks));
  });
  for (const [id, at] of anchors) if (at.c >= chapters.length) anchors.set(id, { c: Math.max(0, chapters.length - 1), b: 0 });
  if (!chapters.length) fail('这本 Kindle 书里没有能读的正文');
  rewriteLinks(chapters, anchors);
  let toc = ncxToc(ncx, h, (e) => { const pf = e.tags.get(6); return pf && pf.length >= 2 ? anchors.get(`kp${pf[0]}_${pf[1]}`) ?? null : null; });
  toc = finishContents(chapters, toc);
  void firstOf;
  return { kind: 'flow', title, author, lang, cover, chapters, toc, resources: pics.resources };
}

/* ---------- the book ---------- */
export function parseMobi(data: ArrayBuffer, name: string): FlowDoc {
  const bytes = new Uint8Array(data);
  if (bytes.length < 86) fail('这个文件太短了，不是 Kindle 电子书');
  const kind = ascii(bytes, 60, 8), recs = records(bytes);
  if (kind === 'TEXtREAd') {
    // a plain PalmDOC text (.pdb / .prc)
    const h = header(recs[0]);
    return parseTxtText(new TextDecoder('windows-1252').decode(rawText(recs, { ...h, extraFlags: 0 }, 0)), name);
  }
  if (kind !== 'BOOKMOBI') fail('这个文件不是 Kindle 电子书（MOBI / AZW3）');
  const h = header(recs[0]);
  if (h.encryption) fail('这本 Kindle 书有 DRM 加密，读不了。请换一个没有加密的版本（EPUB / MOBI / AZW3）。');
  // a combined file: its KF8 half starts at the record EXTH 121 names (after a BOUNDARY record)
  const boundary = exthNum(h, 121);
  let base = 0, hh = h;
  if (h.version >= 8) base = 0;
  else if (boundary !== NONE && boundary > 0 && boundary < recs.length) {
    const h8 = header(recs[boundary]);
    if (h8.version >= 8 && !h8.encryption) { base = boundary; hh = h8; }
  }
  const isK8 = hh.version >= 8;
  const title = exthStr(hh, 503)[0] || exthStr(h, 503)[0] || hh.fullName.trim() || h.fullName.trim() || titleFromName(name);
  const author = (exthStr(hh, 100).length ? exthStr(hh, 100) : exthStr(h, 100)).slice(0, 3).join('、') || undefined;
  const lang = exthStr(hh, 524)[0] || exthStr(h, 524)[0] || undefined;
  const pics = new Pictures(recs);
  // where pictures start: the KF8 header's (relative to its half) and the MOBI 7 header's
  const imageBase = [...new Set([hh.firstImage !== NONE ? base + hh.firstImage : -1, h.firstImage !== NONE ? h.firstImage : -1].filter((x) => x >= 0 && x < recs.length))];
  let cover: Blob | null = null;
  for (const t of [201, 202]) {
    const off = exthNum(hh, t) !== NONE ? exthNum(hh, t) : exthNum(h, t);
    if (off === NONE) continue;
    for (const b0 of imageBase) { const p = pics.get(`cover${t}`, b0 + off); if (p) { cover = pics.resources.get(p.key)!; break; } }
    if (cover) break;
  }
  const doc = isK8 ? kf8(recs, hh, base, title, author, lang, cover, pics, imageBase) : mobi7(recs, h, title, author, lang, cover, pics);
  // the cover is not one of the book's pictures unless the text uses it
  for (const k of [...pics.resources.keys()]) if (k.startsWith('cover')) pics.resources.delete(k);
  const dir = exthStr(hh, 527)[0];
  if (dir && /rtl/i.test(dir)) doc.rtl = true;
  return doc;
}
