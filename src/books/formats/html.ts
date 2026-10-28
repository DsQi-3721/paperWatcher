// A single HTML page as a book: its charset (meta, BOM, or found), its body as blocks, chapters at its h1 / h2
// headings (whichever level repeats). Only pictures inside the file (data: URLs) can come along; links to other
// files are dropped, links inside it become '#<chapter>.<block>'.
import type { Block, FlowDoc, Run } from '../types';
import { blockText, Converter, cssHints, emptyHints, splitAtHeadings } from './blocks';
import { decodeText } from './encoding';
import { imageMime, imageSize, titleFromName } from './util';

export function parseHtml(data: ArrayBuffer, name: string): FlowDoc {
  const bytes = new Uint8Array(data);
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
  const declared = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w-]+)/i)?.[1];
  let text: string;
  try { text = declared ? new TextDecoder(declared).decode(bytes) : decodeText(bytes).text; } catch { text = decodeText(bytes).text; }
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const hints = emptyHints();
  for (const st of Array.from(doc.querySelectorAll('style'))) cssHints(st.textContent || '', hints);

  const resources = new Map<string, Blob>();
  let n = 0;
  const conv = new Converter({
    image: (src) => {
      const m = src.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
      if (!m) return null;
      try {
        const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
        const u8 = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
        const key = `img${++n}`;
        resources.set(key, new Blob([u8], { type: m[1] || imageMime(u8) || 'image/png' }));
        return { key, ...(imageSize(u8) ?? {}) };
      } catch { return null; }
    },
    link: (href) => href.startsWith('#') ? '@' + href.slice(1) : /^(https?|mailto):/i.test(href) ? href : null,
    hints,
  });
  const out = conv.run(doc.body ?? doc.documentElement);
  const docTitle = (doc.querySelector('title')?.textContent || '').trim();
  const firstH1 = out.blocks.find((b) => b.t === 'h1');
  const title = docTitle || (firstH1 ? blockText(firstH1) : '') || titleFromName(name);
  const { chapters, where } = splitAtHeadings(out.blocks.length ? out.blocks : [{ t: 'p', runs: [{ text: '（这个网页里没有文字）' }] }], out.anchors, title);
  for (const ch of chapters) for (const bl of ch.blocks as Block[]) if ('runs' in bl) for (const r of bl.runs as Run[]) {
    if (!r.href?.startsWith('@')) continue;
    const i = out.anchors.get(r.href.slice(1));
    if (i == null) { delete r.href; continue; }
    const at = where(i), id = `${at.chapter}.${at.block}`, tb = chapters[at.chapter]?.blocks[at.block];
    if (tb) tb.id = id;
    r.href = '#' + id;
  }
  const author = doc.querySelector('meta[name="author" i]')?.getAttribute('content')?.trim() || undefined;
  const lang = doc.documentElement.getAttribute('lang') || undefined;
  return { kind: 'flow', title, author, lang, cover: null, chapters, toc: chapters.map((c, i) => ({ title: c.title || `第 ${i + 1} 部分`, chapter: i })), resources };
}
