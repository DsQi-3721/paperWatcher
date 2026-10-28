// Plain-text novels: any common encoding, paragraphs however the file writes them (one per line as web novels do,
// indented, or separated by blank lines with hard-wrapped lines), chapters from their headings (第一章 / 序章 /
// 番外 / Chapter 1 …), title and author from the top of the file or its name. A list of chapter headings at the top
// (a table of contents typed into the file) makes no empty chapters. With no headings at all, the text is cut into
// parts of about 8000 characters at paragraph ends. Linear in the size of the file.
import type { Block, FlowDoc } from '../types';
import { chapterOf } from './blocks';
import { CJK, headingOf } from './headings';
import { decodeText } from './encoding';
import { titleFromName } from './util';

export function parseTxt(data: ArrayBuffer, name: string): FlowDoc {
  const { text } = decodeText(new Uint8Array(data));
  return parseTxtText(text, name);
}

export function parseTxtText(raw: string, name: string): FlowDoc {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  // title and author: a line like 《书名》 or 书名：…, and 作者：… near the top; else the file name
  let title = '', author = '';
  let seen = 0, firstLine = '';
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (++seen > 40) break;
    if (seen === 1) firstLine = t;
    // an English title page: the title, then "by Somebody"
    if (seen === 2 && /^by\s+\S/i.test(t) && firstLine.length <= 60 && !headingOf(firstLine)) {
      if (!title) title = firstLine;
      if (!author) author = t.replace(/^by\s+/i, '').trim();
    }
    if (!title) {
      const m = t.match(/^《([^》]{1,60})》/) ?? t.match(/^(?:书名|書名|标题|title)\s*[:：]\s*(.{1,60})$/i);
      if (m) title = m[1].trim();
    }
    if (!author) {
      const m = t.match(/(?:^|\s)(?:作者|作\s*者|著者|author|by)\s*[:：/]\s*([^\s，,]{1,30})/i) ?? t.match(/^文\s*[/／]\s*(\S{1,20})$/);
      if (m) author = m[1].trim();
    }
  }
  if (!title) {
    const base = titleFromName(name);
    const m = base.match(/^《?([^》]+?)》?\s*(?:作者|by)\s*[:：]?\s*(.+)$/i);
    if (m) { title = m[1].trim(); if (!author) author = m[2].trim(); } else title = base.replace(/^《(.+)》$/, '$1');
  }

  // how the file writes paragraphs (from a sample of its lines)
  let blank = 0, nonEmpty = 0, indented = 0, totalLen = 0;
  const sampleN = Math.min(lines.length, 4000);
  for (let i = 0; i < sampleN; i++) {
    const l = lines[i];
    if (!l.trim()) { blank++; continue; }
    nonEmpty++;
    totalLen += l.length;
    if (/^(\u3000|[ \t]{2,}|\t)/.test(l)) indented++;
  }
  const avg = nonEmpty ? totalLen / nonEmpty : 0;
  // how long a full (hard-wrapped) line is: lines this long were cut by the width, not ended by the writer
  const lens: number[] = [];
  for (let i = 0; i < sampleN; i++) { const n = lines[i].trim().length; if (n) lens.push(n); }
  lens.sort((x, y) => x - y);
  const full = lens.length ? lens[Math.floor(lens.length * 0.9)] * 0.8 : 0;
  const mode: 'blank' | 'indent' | 'line' = blank > sampleN * 0.22 && avg < 110 ? 'blank' : indented > nonEmpty * 0.4 ? 'indent' : 'line';

  // paragraphs and headings, in one pass
  type Para = { text: string; head: boolean };
  const paras: Para[] = [];
  let cur: string[] = [];
  const join = (parts: string[]) => {
    let out = '';
    for (const p of parts) {
      if (!out) { out = p; continue; }
      // hard-wrapped lines: CJK runs straight on, other scripts get a space
      out += CJK.test(out[out.length - 1]) && CJK.test(p[0]) ? p : ' ' + p;
    }
    return out;
  };
  const push = () => {
    if (!cur.length) return;
    const t = join(cur).replace(/[ \t]+/g, ' ').trim();
    if (t) paras.push({ text: t, head: false });
    cur = [];
  };
  let prev = '';
  for (const l of lines) {
    const t = l.replace(/^[\s\u3000]+/, '').replace(/\s+$/, '');
    if (!t) { push(); prev = ''; continue; }
    const h = headingOf(t);
    if (h) { push(); paras.push({ text: h, head: true }); prev = ''; continue; }
    if (mode === 'line') { cur.push(t); push(); }
    else if (mode === 'indent') {
      const wrapped = prev.length >= full && !/[。！？…”」』）)!?."]$/.test(prev);
      if (/^(\u3000|[ \t]{2,}|\t)/.test(l) || !wrapped) push();
      cur.push(t);
    } else cur.push(t);
    prev = t;
  }
  push();

  // chapters at the headings; a heading with nothing under it before the next one (a typed table of contents, a
  // volume title) makes no chapter
  const heads = paras.filter((p) => p.head).length;
  const chapters: ReturnType<typeof chapterOf>[] = [];
  if (heads >= 2) {
    let blocks: Block[] = [], titleNow = '';
    const close = () => {
      const body = blocks.filter((b) => b.t === 'p');
      if (body.length) chapters.push(chapterOf(blocks, titleNow || title));
      blocks = [];
    };
    for (const p of paras) {
      if (p.head) { close(); titleNow = p.text; blocks.push({ t: 'h2', runs: [{ text: p.text }] }); continue; }
      blocks.push({ t: 'p', runs: [{ text: p.text }] });
    }
    close();
    // what came before the first heading: kept only if it is more than the title page (title, author, 目录)
    const pre = chapters[0];
    if (pre && pre.blocks[0]?.t !== 'h2') {
      const META = /^《[^》]+》|^(书名|書名|标题|作者|作\s*者|著者|author|title|by)\b\s*[:：/]?|^目\s*录$|^contents$|^(内容)?简介[:：]?$/i;
      const rest = pre.blocks.map((b) => ('runs' in b ? b.runs.map((r) => r.text).join('') : '')).filter((t) => !META.test(t.trim()) && t.trim() !== title);
      if (rest.join('').length < 100) chapters.shift();
    }
  }
  if (!chapters.length) {
    // no headings: parts of ~8000 characters, cut at paragraph ends
    let blocks: Block[] = [], n = 0;
    const close = () => { if (blocks.length) { chapters.push(chapterOf(blocks, `第 ${chapters.length + 1} 部分`)); blocks = []; n = 0; } };
    for (const p of paras) {
      blocks.push({ t: p.head ? 'h3' : 'p', runs: [{ text: p.text }] });
      n += p.text.length;
      if (n >= 8000) close();
    }
    close();
    if (chapters.length === 1) chapters[0].title = title;
  }
  if (!chapters.length) chapters.push(chapterOf([{ t: 'p', runs: [{ text: '（这个文件是空的）' }] }], title));
  return {
    kind: 'flow', title, author: author || undefined, cover: null, chapters,
    toc: chapters.map((c, i) => ({ title: c.title || `第 ${i + 1} 部分`, chapter: i })),
    resources: new Map(),
  };
}
