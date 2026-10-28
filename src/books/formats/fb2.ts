// FictionBook 2 (.fb2, and .fb2.zip): one XML file, its pictures inside as base64 <binary>. The description gives the
// title, the author, the language and the cover; the main <body>'s top sections are the chapters (nested sections'
// titles become headings inside); a notes body becomes a last chapter. Internal links become '#<chapter>.<block>'.
import type { Block, FlowDoc, Run, TocItem } from '../types';
import { BlockBuilder, blockText, chapterOf } from './blocks';
import { decodeText } from './encoding';
import { fail, imageSize, titleFromName } from './util';

const XLINK = 'http://www.w3.org/1999/xlink';
type Kind = 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'li' | 'pre' | 'center';
interface St { b?: boolean; i?: boolean; code?: boolean; sup?: boolean; sub?: boolean; href?: string }

const local = (el: Element) => (el.localName || el.nodeName).toLowerCase().replace(/^.*:/, '');
const kids = (el: Element) => Array.from(el.children);
const hrefOf = (el: Element) => el.getAttributeNS(XLINK, 'href') || el.getAttribute('l:href') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';

export function parseFb2Bytes(bytes: Uint8Array, name: string): FlowDoc {
  // the XML declaration says the encoding (windows-1251 is common); else find it
  const decl = new TextDecoder('latin1').decode(bytes.subarray(0, 200)).match(/encoding\s*=\s*["']([\w.-]+)["']/i)?.[1];
  let text: string;
  try { text = decl ? new TextDecoder(decl).decode(bytes) : decodeText(bytes).text; } catch { text = decodeText(bytes).text; }
  text = text.replace(/^\uFEFF/, '');
  let doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) doc = new DOMParser().parseFromString(text, 'text/html');
  const by = (root: Document | Element, n: string) => Array.from(root.getElementsByTagName(n)).concat(Array.from(root.getElementsByTagNameNS('*', n))).filter((x, i, a) => a.indexOf(x) === i);

  // the description
  const ti = by(doc, 'title-info')[0];
  const field = (n: string, root: Element | undefined = ti) => (root ? by(root, n)[0]?.textContent || '' : '').replace(/\s+/g, ' ').trim();
  const title = field('book-title') || titleFromName(name);
  const authors = ti ? by(ti, 'author').map((a) => [field('first-name', a), field('middle-name', a), field('last-name', a)].filter(Boolean).join(' ') || field('nickname', a)).filter(Boolean) : [];
  const lang = field('lang') || undefined;

  // the pictures
  const resources = new Map<string, Blob>(), sizes = new Map<string, { w: number; h: number } | null>();
  for (const bin of by(doc, 'binary')) {
    const id = bin.getAttribute('id');
    if (!id) continue;
    try {
      const raw = atob((bin.textContent || '').replace(/\s+/g, ''));
      const u8 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
      resources.set(id, new Blob([u8], { type: bin.getAttribute('content-type') || 'image/jpeg' }));
      sizes.set(id, imageSize(u8));
    } catch { /* bad base64 */ }
  }
  const pic = (href: string) => { const id = href.replace(/^#/, ''); return resources.has(id) ? { key: id, ...(sizes.get(id) ?? {}) } : null; };
  const coverHref = ti ? by(ti, 'coverpage').flatMap((c) => by(c, 'image'))[0] : undefined;
  const cover = coverHref ? resources.get(hrefOf(coverHref).replace(/^#/, '')) ?? null : null;

  // the bodies: the main one's sections are chapters; notes after
  const bodies = by(doc, 'body');
  if (!bodies.length) fail('这个 FB2 文件里没有正文');
  const main = bodies.find((b) => !/notes|comments/i.test(b.getAttribute('name') || '')) ?? bodies[0];
  const chapters: ReturnType<typeof chapterOf>[] = [];
  const anchors = new Map<string, { c: number; b: number }>();

  const convert = (root: Element, chapterTitle?: string) => {
    const out = new BlockBuilder();
    const inline = (node: Node, st: St, kind: Kind) => {
      if (node.nodeType === 3) { out.text((node.nodeValue || '').replace(/[\t\n\r\f\v \u00a0]+/g, ' '), st, kind, false); return; }
      if (node.nodeType !== 1) return;
      const el = node as Element, t = local(el);
      const id = el.getAttribute('id');
      if (id) out.anchor(id);
      let s = st;
      if (t === 'strong') s = { ...st, b: true };
      else if (t === 'emphasis') s = { ...st, i: true };
      else if (t === 'code') s = { ...st, code: true };
      else if (t === 'sup') s = { ...st, sup: true };
      else if (t === 'sub') s = { ...st, sub: true };
      else if (t === 'a') { const h = hrefOf(el); if (h) s = { ...st, href: h.startsWith('#') ? '@' + h.slice(1) : /^(https?|mailto):/i.test(h) ? h : st.href, ...(el.getAttribute('type') === 'note' ? { sup: true } : {}) }; }
      else if (t === 'image') { const p = pic(hrefOf(el)); if (p) out.image(p.key, el.getAttribute('alt') || undefined, p.w, p.h); return; }
      for (const c of Array.from(el.childNodes)) inline(c, s, kind);
    };
    const para = (el: Element, kind: Kind, st: St = {}) => { out.flush(); inline(el, st, kind); out.flush(); };
    const block = (el: Element, depth: number, kind: Kind = 'p') => {
      const t = local(el);
      const id = el.getAttribute('id');
      if (id) out.anchor(id);
      switch (t) {
        case 'title': for (const p of kids(el)) para(p, depth <= 1 ? 'h2' : depth === 2 ? 'h3' : 'h4'); if (!kids(el).length) para(el, 'h3'); return;
        case 'subtitle': para(el, 'center', { b: true }); return;
        case 'p': para(el, kind); return;
        case 'v': para(el, 'quote'); return;
        case 'text-author': para(el, 'center', { i: true }); return;
        case 'empty-line': out.flush(); return;
        case 'image': { out.flush(); const p = pic(hrefOf(el)); if (p) out.image(p.key, el.getAttribute('alt') || undefined, p.w, p.h); return; }
        case 'table': for (const tr of by(el, 'tr')) { out.flush(); kids(tr).forEach((td, i) => { if (i) out.text('\u3000|\u3000', {}, 'p', false); inline(td, local(td) === 'th' ? { b: true } : {}, 'p'); }); out.flush(); } return;
        case 'epigraph': case 'cite': case 'annotation': for (const c of kids(el)) block(c, depth, 'quote'); return;
        case 'poem': case 'stanza': for (const c of kids(el)) block(c, depth, 'quote'); return;
        case 'section': for (const c of kids(el)) block(c, depth + 1, kind); return;
        default: for (const c of kids(el)) block(c, depth, kind);
      }
    };
    for (const c of kids(root)) block(c, 1);
    out.end();
    if (!out.blocks.length) return;
    const c = chapters.length;
    for (const [id, b] of out.anchors) anchors.set(id, { c, b });
    const head = out.blocks[0] && out.blocks[0].t === 'h2' ? blockText(out.blocks[0]) : '';
    chapters.push(chapterOf(out.blocks, chapterTitle || head || undefined));
  };

  // a body's title (the book's name in it) goes before the first chapter
  const sections = kids(main).filter((e) => local(e) === 'section');
  if (sections.length) {
    const lead = kids(main).filter((e) => local(e) !== 'section');
    if (lead.some((e) => (e.textContent || '').trim() || local(e) === 'image')) {
      const wrap = doc.createElement('section');
      for (const e of lead) wrap.appendChild(e.cloneNode(true));
      convert(wrap, title);
    }
    for (const s of sections) convert(s);
  } else convert(main, title);
  for (const b of bodies) if (b !== main) { const before = chapters.length; convert(b, '注释'); if (chapters.length > before) chapters[chapters.length - 1].title = '注释'; }
  if (!chapters.length) fail('这个 FB2 文件里没有正文');

  // links inside → '#c.b'
  for (const ch of chapters) for (const bl of ch.blocks as Block[]) if ('runs' in bl) for (const r of bl.runs as Run[]) {
    if (!r.href?.startsWith('@')) continue;
    const at = anchors.get(r.href.slice(1));
    if (!at) { delete r.href; continue; }
    const id = `${at.c}.${at.b}`, tb = chapters[at.c]?.blocks[at.b];
    if (tb) tb.id = id;
    r.href = '#' + id;
  }
  const toc: TocItem[] = chapters.map((c, i) => ({ title: c.title || `第 ${i + 1} 部分`, chapter: i }));
  return { kind: 'flow', title, author: authors.slice(0, 3).join('、') || undefined, lang, cover, chapters, toc, resources };
}
