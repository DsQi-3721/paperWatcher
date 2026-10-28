// The small Markdown dialect the AI writes on scratch paper: paragraphs, bullets, a heading now and then,
// **bold**, *italic*, `code`, $math$, $$display math$$, plus <ref page="N">quote</ref> pointers back into
// the paper and one <margin>gist</margin>. While streaming, half-written constructs are held back so the
// handwriting never has to be erased and rewritten.

export interface RefInfo { id: number; page?: number; quote: string }

export type Inline =
  | { t: 'text'; s: string; b?: boolean; i?: boolean; code?: boolean; ref?: number }
  | { t: 'math'; tex: string };

export type Block =
  | { t: 'p'; inl: Inline[] }
  | { t: 'li'; inl: Inline[]; marker: string; depth: number }
  | { t: 'h'; inl: Inline[]; level: number }
  | { t: 'math'; tex: string }
  | { t: 'code'; s: string }
  | { t: 'quote'; inl: Inline[] }
  | { t: 'hr' };

export interface Parsed { blocks: Block[]; margin?: string; refs: RefInfo[]; visibleLength: number }

/** Cuts the source where an unfinished construct starts (only while streaming). */
function holdBack(src: string): string {
  let s = src;
  const lastLt = s.lastIndexOf('<');
  if (lastLt >= 0 && s.indexOf('>', lastLt) < 0) s = s.slice(0, lastLt);
  const openRef = s.lastIndexOf('<ref');
  if (openRef >= 0 && s.indexOf('</ref>', openRef) < 0) s = s.slice(0, openRef);
  const openMargin = s.lastIndexOf('<margin');
  if (openMargin >= 0 && s.indexOf('</margin>', openMargin) < 0) s = s.slice(0, openMargin);
  // display math
  const dd = s.split('$$').length - 1;
  if (dd % 2 === 1) s = s.slice(0, s.lastIndexOf('$$'));
  const openBr = s.lastIndexOf('\\[');
  if (openBr >= 0 && s.indexOf('\\]', openBr) < 0) s = s.slice(0, openBr);
  // inline math: count unescaped single $ in the last paragraph
  const lastPara = s.slice(s.lastIndexOf('\n\n') + 1);
  const singles = lastPara.replace(/\$\$/g, '').match(/(?<!\\)\$/g)?.length || 0;
  if (singles % 2 === 1) s = s.slice(0, s.lastIndexOf('$'));
  const openParen = s.lastIndexOf('\\(');
  if (openParen >= 0 && s.indexOf('\\)', openParen) < 0) s = s.slice(0, openParen);
  // code fence
  const fences = s.match(/^```/gm)?.length || 0;
  if (fences % 2 === 1) s = s.slice(0, s.lastIndexOf('```'));
  // unclosed emphasis in the tail: drop the dangling marker (bold renders without width change)
  const tail = s.slice(s.lastIndexOf('\n') + 1);
  if ((tail.match(/\*\*/g)?.length || 0) % 2 === 1) { const k = s.lastIndexOf('**'); s = s.slice(0, k) + s.slice(k + 2); }
  if ((tail.match(/`/g)?.length || 0) % 2 === 1) { const k = s.lastIndexOf('`'); s = s.slice(0, k) + s.slice(k + 1); }
  // do not show a half word at the very end (it might still grow and wrap)
  if (!/[\s\p{P}　-〿一-鿿]$/u.test(s)) {
    const m = /[A-Za-z0-9À-ɏ'’-]+$/.exec(s);
    if (m && m[0].length < 24) s = s.slice(0, s.length - m[0].length);
  }
  return s;
}

export function parseReply(raw: string, streaming = false): Parsed {
  let src = raw.replace(/\r\n?/g, '\n');
  const refs: RefInfo[] = [];
  let margin: string | undefined;
  const mm = /<margin>([\s\S]*?)<\/margin>/i.exec(src);
  if (mm) {
    margin = mm[1].trim();
    src = src.slice(0, mm.index) + src.slice(mm.index + mm[0].length);
  }
  if (streaming) src = holdBack(src);
  src = src.replace(/<margin>[\s\S]*$/i, '').trimEnd();

  const blocks: Block[] = [];
  const lines = src.split('\n');
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    const text = para.join(' ').trim();
    para = [];
    if (text) blocks.push({ t: 'p', inl: parseInline(text, refs) });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tline = line.trim();
    if (!tline) { flush(); continue; }
    if (/^```/.test(tline)) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) body.push(lines[i++]);
      blocks.push({ t: 'code', s: body.join('\n') });
      continue;
    }
    if (/^(\$\$|\\\[)/.test(tline)) {
      flush();
      const close = tline.startsWith('$$') ? '$$' : '\\]';
      let body = tline.slice(2);
      if (body.trim().endsWith(close) && body.trim().length >= close.length) {
        blocks.push({ t: 'math', tex: body.trim().slice(0, -close.length).trim() });
        continue;
      }
      const acc = [body];
      i++;
      while (i < lines.length && !lines[i].includes(close)) acc.push(lines[i++]);
      if (i < lines.length) acc.push(lines[i].slice(0, lines[i].indexOf(close)));
      blocks.push({ t: 'math', tex: acc.join('\n').trim() });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(tline);
    if (h) { flush(); blocks.push({ t: 'h', level: h[1].length, inl: parseInline(h[2], refs) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(tline)) { flush(); blocks.push({ t: 'hr' }); continue; }
    const li = /^(\s*)([-*+•·]|\d{1,2}[.)]|[a-z][.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const depth = Math.min(3, Math.floor(li[1].replace(/\t/g, '  ').length / 2));
      let body = li[3];
      // continuation lines (indented, not a new item)
      while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) && !/^\s*([-*+•·]|\d{1,2}[.)])\s+/.test(lines[i + 1])) body += ' ' + lines[++i].trim();
      const marker = /^\d/.test(li[2]) || /^[a-z]/.test(li[2]) ? li[2] : '•';
      blocks.push({ t: 'li', depth, marker, inl: parseInline(body, refs) });
      continue;
    }
    if (/^>\s?/.test(tline)) { flush(); blocks.push({ t: 'quote', inl: parseInline(tline.replace(/^>\s?/, ''), refs) }); continue; }
    para.push(tline);
  }
  flush();
  let visibleLength = 0;
  for (const b of blocks) {
    if (b.t === 'math') visibleLength += Math.max(4, b.tex.length / 2);
    else if (b.t === 'code') visibleLength += b.s.length;
    else if ('inl' in b) for (const x of b.inl) visibleLength += x.t === 'text' ? x.s.length : Math.max(2, x.tex.length / 2);
  }
  return { blocks, margin, refs, visibleLength };
}

export function parseInline(text: string, refs: RefInfo[]): Inline[] {
  const out: Inline[] = [];
  let b = false, it = false;
  let buf = '';
  const push = (extra?: Partial<Extract<Inline, { t: 'text' }>>) => {
    if (!buf) return;
    out.push({ t: 'text', s: buf, b: b || undefined, i: it || undefined, ...extra });
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpExecArray | null;
    if ((m = /^<ref(?:\s+page\s*=\s*["']?(\d+)["']?)?[^>]*>([\s\S]*?)<\/ref>/i.exec(rest))) {
      push();
      const id = refs.length;
      const quote = m[2].replace(/<[^>]+>/g, '').trim();
      refs.push({ id, page: m[1] ? Number(m[1]) : undefined, quote });
      out.push({ t: 'text', s: quote, b: b || undefined, i: it || undefined, ref: id });
      i += m[0].length;
      continue;
    }
    if ((m = /^\$\$([\s\S]+?)\$\$/.exec(rest)) || (m = /^\$(?!\s)([^$\n]+?)(?<!\s|\\)\$(?!\d)/.exec(rest)) || (m = /^\\\(([\s\S]+?)\\\)/.exec(rest))) {
      push();
      out.push({ t: 'math', tex: m[1].trim() });
      i += m[0].length;
      continue;
    }
    if ((m = /^`([^`]+)`/.exec(rest))) {
      push();
      out.push({ t: 'text', s: m[1], code: true });
      i += m[0].length;
      continue;
    }
    if (rest.startsWith('**') || rest.startsWith('__')) {
      push();
      b = !b;
      i += 2;
      continue;
    }
    if ((rest[0] === '*' || rest[0] === '_') && !/\w/.test(text[i - 1] || '') !== !/\w/.test(text[i + 1] || '')) {
      // single emphasis marker at a word boundary
      const prevWord = /\w/.test(text[i - 1] || '');
      const nextWord = /\w/.test(text[i + 1] || '');
      if ((!it && nextWord && !prevWord) || (it && prevWord && !nextWord)) {
        push();
        it = !it;
        i += 1;
        continue;
      }
    }
    if ((m = /^<\/?[a-z][^>]*>/i.exec(rest))) { i += m[0].length; continue; }   // stray tags
    if (rest[0] === '\\' && /[$*_`\\]/.test(rest[1] || '')) { buf += rest[1]; i += 2; continue; }
    buf += rest[0];
    i++;
  }
  push();
  return out;
}

/** Plain text of a reply (for copying / exports): refs become quotes, markup dropped. */
export function replyToPlain(raw: string): string {
  return raw
    .replace(/<margin>[\s\S]*?<\/margin>/gi, '')
    .replace(/<ref(?:\s+page\s*=\s*["']?(\d+)["']?)?[^>]*>([\s\S]*?)<\/ref>/gi, (_, p, q) => `“${q.trim()}”${p ? ` (p.${p})` : ''}`)
    .trim();
}
