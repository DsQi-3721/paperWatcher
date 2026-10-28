// EPUB 2 and 3: container.xml → the package (metadata, manifest, spine), the contents (nav.xhtml or toc.ncx), each
// spine file → a chapter of blocks, the pictures the text uses → resources, the cover. Links inside the book are
// rewritten to '#<chapter>.<block>' and the block they land on gets that id, so the reader can follow them.
import type { Block, FlowDoc, Run, TocItem } from '../types';
import { chapterOf, Converter, cssHints, emptyHints, finishContents, parseMarkup, type CssHints } from './blocks';
import { blobOf, fail, imageMime, imageSize, LazyBlobs, resolvePath, titleFromName } from './util';
import { Zip } from './zip';

const DC = 'http://purl.org/dc/elements/1.1/';
const OPS = 'http://www.idpf.org/2007/ops';
const FONT_OBFUSCATION = new Set(['http://www.idpf.org/2008/embedding', 'http://ns.adobe.com/pdf/enc#RC']);
const HTML_TYPES = /^(application\/xhtml\+xml|text\/html|application\/x-dtbook\+xml)$/i;

interface Item { id: string; href: string; type: string; props: string }

const xml = (text: string) => new DOMParser().parseFromString(text.replace(/^\uFEFF/, ''), 'application/xml');
const all = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS('*', name));
const first = (root: Document | Element, name: string) => root.getElementsByTagNameNS('*', name)[0] as Element | undefined;
const textIn = (el: Element | undefined | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

export function parseEpubZip(zip: Zip, name: string): FlowDoc {
  // DRM: anything encrypted other than obfuscated fonts
  if (zip.has('META-INF/rights.xml')) fail('这本书有 DRM 加密保护（Adobe），读不了。请换一个没有加密的版本。');
  if (zip.has('META-INF/encryption.xml')) {
    const enc = xml(zip.text('META-INF/encryption.xml'));
    const algs = all(enc, 'EncryptionMethod').map((e) => e.getAttribute('Algorithm') || '');
    if (algs.some((a) => a && !FONT_OBFUSCATION.has(a))) fail('这本书有 DRM 加密保护，读不了。请换一个没有加密的版本。');
  }

  // the package
  let opfPath = '';
  if (zip.has('META-INF/container.xml')) {
    const c = xml(zip.text('META-INF/container.xml'));
    const roots = all(c, 'rootfile');
    opfPath = (roots.find((r) => /oebps-package/.test(r.getAttribute('media-type') || '')) ?? roots[0])?.getAttribute('full-path') || '';
  }
  if (!opfPath || !zip.has(opfPath)) opfPath = zip.entries.find((e) => /\.opf$/i.test(e.name))?.name || '';
  if (!opfPath) fail('这个 EPUB 缺少目录文件（OPF），读不了');
  const opf = xml(zip.text(opfPath));

  const md = first(opf, 'metadata') ?? opf.documentElement;
  const title = textIn(md.getElementsByTagNameNS(DC, 'title')[0]) || titleFromName(name);
  const creators = Array.from(md.getElementsByTagNameNS(DC, 'creator')).map(textIn).filter(Boolean);
  const author = creators.slice(0, 3).join('、') || undefined;
  const lang = textIn(md.getElementsByTagNameNS(DC, 'language')[0]) || undefined;

  const items = new Map<string, Item>(), byHref = new Map<string, Item>();
  for (const it of all(opf, 'item')) {
    const id = it.getAttribute('id') || '', href = it.getAttribute('href');
    if (!href) continue;
    const item: Item = { id, href: resolvePath(opfPath, href), type: (it.getAttribute('media-type') || '').toLowerCase(), props: it.getAttribute('properties') || '' };
    items.set(id, item);
    byHref.set(item.href, item);
  }
  const spineEl = first(opf, 'spine');
  const spine = all(opf, 'itemref').map((r) => items.get(r.getAttribute('idref') || '')).filter((x): x is Item => !!x && (HTML_TYPES.test(x.type) || /\.x?html?$/i.test(x.href)));

  // what the stylesheets say about classes (centred, bold, italic, hidden)
  const hints: CssHints = emptyHints();
  for (const it of items.values()) if (it.type === 'text/css' || /\.css$/i.test(it.href)) { try { cssHints(zip.text(it.href), hints); } catch { /* a broken sheet */ } }

  // pictures, added as they are met: what kind and how big from their first bytes; each one unpacked only when the
  // reader asks for it
  const resources = new LazyBlobs(), pics = new Map<string, { key: string; w?: number; h?: number } | null>();
  const HEAD = 65536;
  const picture = (path: string) => {
    if (pics.has(path)) return pics.get(path)!;
    const ent = zip.get(path), head = ent ? zip.head(ent, HEAD) : null, mime = head?.length ? imageMime(head, path) : null;
    if (!ent || !head || !mime) { pics.set(path, null); return null; }
    // (a JPEG's frame header can sit behind big metadata: then the whole picture is read for its size)
    const size = imageSize(head) ?? (head.length >= HEAD ? imageSize(zip.bytes(ent)) : null);
    resources.setLazy(path, () => blobOf(zip.bytes(ent), mime), (n) => zip.head(ent, n));
    const pic = { key: path, ...(size ?? {}) };
    pics.set(path, pic);
    return pic;
  };

  // the spine, chapter by chapter; ids go into one map keyed 'file#id'
  const anchors = new Map<string, { c: number; b: number }>();
  const chapters: ReturnType<typeof chapterOf>[] = [];
  const startOf = new Map<string, number>();      // spine file → its chapter (the next one when it came out empty)
  const pendingStarts: string[] = [];
  for (const it of spine) {
    let doc: Document;
    try { doc = parseMarkup(zip.text(it.href), true); } catch { continue; }
    const body = doc.querySelector('body') ?? doc.documentElement;
    const conv = new Converter({
      image: (src) => picture(resolvePath(it.href, src)),
      link: (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) ? (/^(https?|mailto|ftp):/i.test(href) ? href : null)
        : `@${href.startsWith('#') ? it.href : resolvePath(it.href, href)}#${href.split('#')[1] ?? ''}`,
      hints,
    });
    const out = conv.run(body);
    pendingStarts.push(it.href);
    if (!out.blocks.length) continue;
    const c = chapters.length;
    for (const f of pendingStarts) startOf.set(f, c);
    pendingStarts.length = 0;
    for (const [id, b] of out.anchors) anchors.set(`${it.href}#${id}`, { c, b });
    chapters.push(chapterOf(out.blocks));
  }
  for (const f of pendingStarts) startOf.set(f, Math.max(0, chapters.length - 1));
  if (!chapters.length) fail('这个 EPUB 里没有能读的正文');

  // where a 'file#id' points
  const locate = (target: string): { c: number; b: number } | null => {
    const [file, frag = ''] = target.split('#');
    if (frag && anchors.has(`${file}#${frag}`)) return anchors.get(`${file}#${frag}`)!;
    const c = startOf.get(file);
    return c == null ? null : { c, b: 0 };
  };

  // links inside the book → '#c.b', and the target block gets that id
  for (const ch of chapters) for (const bl of ch.blocks) if ('runs' in bl) for (const r of bl.runs as Run[]) {
    if (!r.href?.startsWith('@')) continue;
    const at = locate(r.href.slice(1));
    if (!at) { delete r.href; continue; }
    const id = `${at.c}.${at.b}`, tb = chapters[at.c]?.blocks[at.b] as Block | undefined;
    if (tb) tb.id = id;
    r.href = '#' + id;
  }

  // the contents: nav.xhtml (EPUB 3), else toc.ncx (EPUB 2), else the chapters' own headings
  let toc: TocItem[] = [];
  const nav = [...items.values()].find((i) => /\bnav\b/.test(i.props));
  if (nav && zip.has(nav.href)) {
    try {
      const d = parseMarkup(zip.text(nav.href), true);
      const navs = Array.from(d.getElementsByTagName('nav'));
      const tocNav = navs.find((n) => /toc/.test(n.getAttributeNS(OPS, 'type') || n.getAttribute('epub:type') || n.getAttribute('role') || '')) ?? navs[0];
      const ol = tocNav?.querySelector('ol');
      if (ol) toc = navList(ol, nav.href, locate);
    } catch { /* fall back to the NCX */ }
  }
  if (!toc.length) {
    const ncxItem = items.get(spineEl?.getAttribute('toc') || '') ?? [...items.values()].find((i) => i.type === 'application/x-dtbncx+xml' || /\.ncx$/i.test(i.href));
    if (ncxItem && zip.has(ncxItem.href)) {
      try {
        const ncx = xml(zip.text(ncxItem.href));
        const map = first(ncx, 'navMap');
        if (map) toc = ncxPoints(map, ncxItem.href, locate);
      } catch { /* no contents */ }
    }
  }
  // chapter titles, and every titled chapter in the contents
  toc = finishContents(chapters, toc);

  // the cover: EPUB 3's cover-image, EPUB 2's <meta name="cover">, the guide's cover page, an image named cover
  let coverPath = [...items.values()].find((i) => /\bcover-image\b/.test(i.props))?.href;
  if (!coverPath) {
    const metaCover = all(opf, 'meta').find((m) => (m.getAttribute('name') || '').toLowerCase() === 'cover')?.getAttribute('content');
    if (metaCover) coverPath = items.get(metaCover)?.href ?? byHref.get(resolvePath(opfPath, metaCover))?.href;
  }
  if (!coverPath) {
    const ref = all(opf, 'reference').find((r) => /cover/i.test(r.getAttribute('type') || ''));
    const page = ref ? resolvePath(opfPath, ref.getAttribute('href') || '') : '';
    if (page && zip.has(page) && !/\.(jpe?g|png|gif|webp)$/i.test(page)) {
      try {
        const d = parseMarkup(zip.text(page), true);
        const img = d.querySelector('img') ?? d.getElementsByTagNameNS('*', 'image')[0];
        const src = img?.getAttribute('src') || img?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
        if (src) coverPath = resolvePath(page, src);
      } catch { /* no cover page */ }
    } else if (page) coverPath = page;
  }
  if (!coverPath) coverPath = [...items.values()].find((i) => /^image\//.test(i.type) && /cover/i.test(i.id + ' ' + i.href))?.href;
  if (!coverPath) {
    // a first chapter that is only a picture is the cover
    const b0 = chapters[0].blocks;
    if (b0.length <= 2 && b0[0]?.t === 'img') coverPath = b0[0].src;
  }
  // (the cover, too, is read out only when it is wanted: making the shelf's cover, not opening the book)
  let cover: Blob | null | undefined;
  const coverOf = (): Blob | null => {
    if (cover !== undefined) return cover;
    cover = null;
    if (coverPath) {
      if (resources.has(coverPath)) cover = resources.get(coverPath)!;
      else if (zip.has(coverPath)) { const bytes = zip.bytes(coverPath), mime = imageMime(bytes, coverPath); if (mime && bytes.length) cover = blobOf(bytes, mime); }
    }
    return cover;
  };

  return { kind: 'flow', title, author, lang, get cover() { return coverOf(); }, chapters, toc, resources };
}

/** EPUB 3's nav: <ol><li><a href>title</a><ol>…</ol></li></ol>. */
function navList(ol: Element, base: string, locate: (t: string) => { c: number; b: number } | null): TocItem[] {
  const out: TocItem[] = [];
  for (const li of Array.from(ol.children)) {
    if (li.localName.toLowerCase() !== 'li') continue;
    const a = Array.from(li.children).find((c) => /^(a|span)$/i.test(c.localName));
    const sub = Array.from(li.children).find((c) => c.localName.toLowerCase() === 'ol');
    const title = textIn(a) || textIn(li).slice(0, 80);
    const href = a?.getAttribute('href');
    const at = href ? locate(resolvePath(base, href) + (href.includes('#') ? '#' + href.split('#')[1] : '')) : null;
    const children = sub ? navList(sub, base, locate) : [];
    if (at && title) out.push(item(title, at, children));
    else if (children.length) out.push(title ? { title, chapter: children[0].chapter, ...(children[0].block ? { block: children[0].block } : {}), children } : children[0]);
  }
  return out;
}
/** EPUB 2's NCX: navMap > navPoint (navLabel/text, content@src, nested navPoint). */
function ncxPoints(parent: Element, base: string, locate: (t: string) => { c: number; b: number } | null): TocItem[] {
  const out: TocItem[] = [];
  for (const np of Array.from(parent.children)) {
    if (np.localName !== 'navPoint') continue;
    const title = textIn(first(np, 'text'));
    const src = first(np, 'content')?.getAttribute('src') || '';
    const at = src ? locate(resolvePath(base, src) + (src.includes('#') ? '#' + src.split('#')[1] : '')) : null;
    const children = ncxPoints(np, base, locate);
    if (at && title) out.push(item(title, at, children));
    else if (children.length) out.push(...children);
  }
  return out;
}
const item = (title: string, at: { c: number; b: number }, children: TocItem[]): TocItem => {
  const t: TocItem = { title, chapter: at.c };
  if (at.b) t.block = at.b;
  if (children.length) t.children = children;
  return t;
};

export function parseEpub(data: ArrayBuffer, name: string): FlowDoc {
  return parseEpubZip(new Zip(new Uint8Array(data)), name);
}
