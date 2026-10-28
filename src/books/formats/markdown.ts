// A Markdown file as a book: headings, paragraphs, emphasis, inline code, code blocks, lists, quotes, rules and links
// (pictures by URL can't come along: their alt text stays). Chapters at its # / ## headings.
import type { Block, FlowDoc, Run } from '../types';
import { blockText, splitAtHeadings } from './blocks';
import { decodeText } from './encoding';
import { titleFromName } from './util';

/** Inline Markdown → runs: **bold**, __bold__, *italic*, _italic_, `code`, [text](url), ![alt](url). */
export function inlineRuns(s: string): Run[] {
  const out: Run[] = [];
  const push = (text: string, st: Partial<Run> = {}) => { if (!text) return; const last = out[out.length - 1];
    if (last && !!last.b === !!st.b && !!last.i === !!st.i && !!last.code === !!st.code && last.href === st.href) last.text += text; else out.push({ text, ...st }); };
  const re = /(`+)([^`]+?)\1|!\[([^\]]*)\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)(.+?)\6|(\*|_)(?=\S)(.+?)(?<=\S)\8/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    push(s.slice(last, m.index));
    if (m[1]) push(m[2], { code: true });
    else if (m[3] != null) push(m[3]);
    else if (m[4]) push(m[4], /^(https?|mailto):/i.test(m[5]) ? { href: m[5] } : {});
    else if (m[6]) for (const r of inlineRuns(m[7])) push(r.text, { ...r, b: true });
    else if (m[8]) for (const r of inlineRuns(m[9])) push(r.text, { ...r, i: true });
    last = m.index! + m[0].length;
  }
  push(s.slice(last));
  return out.map((r) => ({ ...r, text: r.text.replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1') }));
}

export function parseMarkdown(data: ArrayBuffer, name: string): FlowDoc {
  const text = decodeText(new Uint8Array(data)).text.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let para: string[] = [], kind: 'p' | 'quote' | 'li' = 'p';
  const flush = () => { if (para.length) { const t = para.join(' ').replace(/\s+/g, ' ').trim(); if (t) blocks.push({ t: kind, runs: inlineRuns(t) }); } para = []; kind = 'p'; };
  // front matter (--- … ---) at the very top: skipped, its title kept
  let i = 0, fmTitle = '';
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end > 0) { fmTitle = lines.slice(1, end).find((l) => /^title\s*:/i.test(l))?.replace(/^title\s*:\s*/i, '').replace(/^["']|["']$/g, '').trim() || ''; i = end + 1; }
  }
  for (; i < lines.length; i++) {
    const l = lines[i];
    const fence = l.match(/^\s*(```+|~~~+)/);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith(fence[1]); i++) code.push(lines[i]);
      if (code.length) blocks.push({ t: 'pre', runs: [{ text: code.join('\n'), code: true }] });
      continue;
    }
    if (!l.trim()) { flush(); continue; }
    const h = l.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { flush(); const lvl = Math.min(4, h[1].length); blocks.push({ t: (`h${lvl}` as 'h1'), runs: inlineRuns(h[2]) }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if (i + 1 < lines.length && para.length && /^\s*(=+|-+)\s*$/.test(lines[i + 1]) && !/^\s*[-*+]\s/.test(l)) {
      // a Setext heading: the line under it is === or ---
      para.push(l); const t = para.join(' '); para = []; blocks.push({ t: lines[i + 1].includes('=') ? 'h1' : 'h2', runs: inlineRuns(t.trim()) }); i++; continue;
    }
    const q = l.match(/^\s*>\s?(.*)$/);
    if (q) { if (kind !== 'quote') flush(); kind = 'quote'; para.push(q[1]); continue; }
    const li = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (li) { flush(); kind = 'li'; para.push(/^\d/.test(li[1]) ? `${li[1].replace(')', '.')} ${li[2]}` : li[2]); continue; }
    if (kind === 'quote') flush();
    para.push(l.trim());
  }
  flush();
  const firstH1 = blocks.find((b) => b.t === 'h1');
  const title = fmTitle || (firstH1 ? blockText(firstH1) : '') || titleFromName(name);
  const { chapters } = splitAtHeadings(blocks.length ? blocks : [{ t: 'p', runs: [{ text: '（这个文件是空的）' }] }], new Map(), title);
  return { kind: 'flow', title, cover: null, chapters, toc: chapters.map((c, k) => ({ title: c.title || `第 ${k + 1} 部分`, chapter: k })), resources: new Map() };
}
