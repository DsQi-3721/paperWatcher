// Handwriting on scratch paper. Text is laid out with pretext (rich inline: handwriting, bold, code,
// inline math boxes, ref tags) without touching DOM layout, painted one line per element, and revealed by a
// Writer: a pen moves along each line while a soft mask uncovers the ink behind it. Streaming answers
// re-layout only their last block, so earlier lines never move.
import { layoutNextRichInlineLineRange, materializeRichInlineLineRange, prepareRichInline } from '@chenglou/pretext/rich-inline';
import { C, F } from '../theme';
import { onFrame } from '../util/anim';
import { h } from '../util/dom';
import { hashStr, Rng } from '../util/rng';
import { parseReply, type Block, type Inline, type Parsed } from './markdown';
import { texToUnicode, typeset } from './mathtext';
import { underline as underlinePath } from './sketch';

export interface Hand {
  name: 'user' | 'ai' | 'note';
  family: string;
  size: number;
  weight: number;
  bold: number;
  line: number;
  color: string;
}

export const HAND_USER: Hand = { name: 'user', family: F.user, size: 21, weight: 400, bold: 600, line: 26, color: C.userInk };
export const HAND_AI: Hand = { name: 'ai', family: F.ai, size: 15, weight: 400, bold: 700, line: 26, color: C.aiInk };

const fontOf = (hand: Hand, o: { b?: boolean; size?: number; mono?: boolean } = {}) =>
  o.mono ? `400 ${Math.round((o.size ?? hand.size) * (hand.name === 'user' ? 0.68 : 0.9))}px ${F.mono}` : `${o.b ? hand.bold : hand.weight} ${o.size ?? hand.size}px ${hand.family}`;

/** Characters whose font slices have been loaded, per font: one entry per character (bounded by the alphabet), not
 *  one per distinct text ever written, which grew with every note and answer. */
const loaded = new Map<string, Set<string>>();
/** Waits until the fonts (and the unicode-range slices for this text) are ready, so measurements are true. */
export async function ensureFonts(fonts: string[], text: string) {
  const sample = [...new Set(text)].join('').slice(0, 2000) || 'a';
  await Promise.all(fonts.map(async (f) => {
    let have = loaded.get(f);
    if (!have) loaded.set(f, (have = new Set()));
    // slices already loaded for this font are still loaded: only the new characters need asking for
    const missing = [...sample].filter((ch) => !have!.has(ch));
    if (!missing.length) return;
    try { await document.fonts.load(f, missing.join('')); } catch { /* best effort */ }
    for (const ch of missing) have.add(ch);
  }));
}

export interface LineMeta { el: HTMLElement; x: number; y: number; w: number; base: number }

interface BlockOut { key: string; el: HTMLDivElement; lines: LineMeta[]; height: number; refs: Array<[number, HTMLElement]> }

interface ItemMeta { kind: 'text' | 'mathtext' | 'mathbox' | 'reftag' | 'code'; b?: boolean; i?: boolean; ref?: number; html?: string; h?: number; depth?: number }

/** Lays out one block at the given width. Returns positioned line elements (relative to the block). */
async function renderBlock(b: Block, width: number, hand: Hand, rng: Rng, refsPage: Map<number, number | undefined>): Promise<BlockOut> {
  const L = hand.line;
  const el = h('div', { class: 'hw-block' });
  const lines: LineMeta[] = [];
  const refs: Array<[number, HTMLElement]> = [];

  if (b.t === 'hr') {
    const svg = `<svg width="${width}" height="${L}" class="hw-hr"><path d="${underlinePath(width * 0.15, width * 0.85, L / 2, rng, true)}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></svg>`;
    const line = h('div', { class: 'hw-line', html: svg, style: `top:0;left:0;width:${width}px;height:${L}px` });
    el.append(line);
    lines.push({ el: line, x: 0, y: 0, w: width, base: L / 2 });
    return { key: '', el, lines, height: L, refs };
  }

  if (b.t === 'math') {
    const size = Math.round(hand.size * 1.02);
    const m = await typeset(b.tex, true, size);
    const rows = Math.max(1, Math.ceil((m.h + 6) / L));
    const w = Math.min(m.w, width);
    const left = Math.max(0, (width - w) / 2);
    const line = h('div', { class: 'hw-line hw-mathblock', html: m.html, style: `top:${(rows * L - m.h) / 2}px;left:${left}px;width:${w}px;height:${m.h}px;font-size:${size}px` });
    if (m.w > width) { line.style.transform = `scale(${width / m.w})`; line.style.transformOrigin = '0 50%'; }
    el.append(line);
    lines.push({ el: line, x: left, y: (rows * L - m.h) / 2, w, base: m.h * 0.7 });
    return { key: '', el, lines, height: rows * L, refs };
  }

  if (b.t === 'code') {
    const font = fontOf(hand, { mono: true });
    const prepared = prepareRichInline([{ text: b.s, font }], { whiteSpace: 'pre-wrap' });
    let cursor: any = undefined;
    let row = 0;
    const box = h('div', { class: 'hw-codebox' });
    el.append(box);
    for (;;) {
      const range = layoutNextRichInlineLineRange(prepared, width - 16, cursor);
      if (!range) break;
      const ml = materializeRichInlineLineRange(prepared, range);
      const text = ml.fragments.map((f) => f.text).join('');
      const line = h('div', { class: 'hw-line hw-code', style: `top:${row * L}px;left:8px;font:${font}` }, text);
      el.append(line);
      lines.push({ el: line, x: 8, y: row * L, w: Math.max(4, ml.width), base: L * 0.68 });
      cursor = range.end;
      row++;
    }
    box.style.height = row * L + 'px';
    return { key: '', el, lines, height: Math.max(1, row) * L, refs };
  }

  // Inline flow blocks: p, li, h, quote.
  const inl: Inline[] = (b as any).inl;
  const isHead = b.t === 'h';
  const size = isHead ? Math.round(hand.size * (b.level <= 2 ? 1.2 : 1.1)) : hand.size;
  const indent = b.t === 'li' ? 22 + b.depth * 18 : b.t === 'quote' ? 16 : 0;
  const items: any[] = [];
  const metas: ItemMeta[] = [];
  const mathJobs: Array<Promise<void>> = [];
  for (const x of inl) {
    if (x.t === 'text') {
      if (x.code) {
        items.push({ text: x.s, font: fontOf(hand, { mono: true, size }), extraWidth: 6, break: x.s.length < 24 ? 'never' : 'normal' });
        metas.push({ kind: 'code' });
      } else {
        items.push({ text: x.s, font: fontOf(hand, { b: x.b || isHead, size }) });
        metas.push({ kind: 'text', b: x.b || isHead, i: x.i, ref: x.ref });
        if (x.ref !== undefined) {
          const pg = refsPage.get(x.ref);
          items.push({ text: pg ? `p.${pg}` : '↗', font: `400 ${Math.round(size * 0.62)}px ${F.type}`, break: 'never', extraWidth: 4 });
          metas.push({ kind: 'reftag', ref: x.ref });
        }
      }
    } else {
      const uni = texToUnicode(x.tex);
      if (uni !== null) {
        items.push({ text: uni, font: fontOf(hand, { size }), break: uni.length < 16 ? 'never' : 'normal' });
        metas.push({ kind: 'mathtext' });
      } else {
        const idx = items.length;
        items.push({ width: 10 });
        metas.push({ kind: 'mathbox' });
        mathJobs.push(typeset(x.tex, false, Math.round(size * 0.92)).then((m) => {
          items[idx] = { width: Math.min(m.w, width - indent) };
          metas[idx].html = m.html;
          metas[idx].h = m.h;
          metas[idx].depth = m.depth;
        }));
      }
    }
  }
  await Promise.all(mathJobs);
  if (!items.length) return { key: '', el, lines, height: 0, refs };
  await ensureFonts([...new Set(items.filter((i) => i.font).map((i) => i.font))], inl.map((x) => (x.t === 'text' ? x.s : '')).join(''));

  const prepared = prepareRichInline(items);
  let cursor: any = undefined;
  let row = 0;
  const maxW = Math.max(40, width - indent);
  for (;;) {
    const range = layoutNextRichInlineLineRange(prepared, maxW, cursor);
    if (!range) break;
    const ml = materializeRichInlineLineRange(prepared, range);
    const top = row * L;
    const pad = row === 0 && b.t === 'li' ? 22 : 0;
    const line = h('div', { class: 'hw-line', style: `top:${top}px;left:${indent - pad}px;height:${L}px;line-height:${L}px;padding-left:${pad}px;--pad:${pad}px` });
    const rot = rng.j(0.32), dy = rng.j(0.7);
    line.style.transform = `translateY(${dy.toFixed(2)}px) rotate(${rot.toFixed(2)}deg)`;
    for (const fr of ml.fragments) {
      const meta = metas[fr.itemIndex];
      const item = items[fr.itemIndex];
      let span: HTMLElement;
      if (meta.kind === 'mathbox') {
        span = h('span', { class: 'hw-mathbox', html: meta.html || '', style: `width:${item.width}px;font-size:${Math.round(size * 0.92)}px` });
      } else if (meta.kind === 'reftag') {
        span = h('span', { class: 'hw-reftag', style: `font:${item.font}`, dataset: { ref: String(meta.ref) } }, fr.text);
      } else {
        span = h('span', { class: 'hw-f', style: `font:${item.font}` }, fr.text);
        if (meta.kind === 'code') span.classList.add('hw-code-inline');
        if (meta.b && !isHead) span.classList.add('hw-b');
        if (meta.i) span.classList.add('hw-i');
        if (meta.kind === 'mathtext') span.classList.add('hw-mt');
        if (meta.ref !== undefined) {
          span.classList.add('hw-ref');
          span.dataset.ref = String(meta.ref);
          refs.push([meta.ref, span]);
        }
      }
      if (fr.gapBefore) span.style.marginLeft = fr.gapBefore.toFixed(2) + 'px';
      const jitter = rng.j(0.45);
      if (Math.abs(jitter) > 0.05 && meta.kind !== 'mathbox') span.style.transform = `translateY(${jitter.toFixed(2)}px)`;
      line.append(span);
    }
    if (pad && b.t === 'li') {
      const bullet = /^\d|^[a-z][.)]/.test(b.marker)
        ? h('span', { class: 'hw-bullet num', style: `font:${fontOf(hand, { size: Math.round(size * 0.9) })};left:0` }, b.marker)
        : h('span', { class: 'hw-bullet dot', style: `left:8px;top:${L / 2 + rng.j(1)}px;transform:rotate(${rng.j(30)}deg)` });
      line.append(bullet);
    }
    el.append(line);
    lines.push({ el: line, x: indent, y: top, w: Math.max(6, ml.width), base: L * 0.69 });
    cursor = range.end;
    row++;
  }
  if (isHead && lines.length) {
    const last = lines[lines.length - 1];
    const svg = h('div', { class: 'hw-head-ul', html: `<svg width="${last.w + 10}" height="10"><path d="${underlinePath(0, last.w + 4, 5, rng, false)}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`, style: `top:${last.y + L - 6}px;left:${last.x - 2}px` });
    el.append(svg);
  }
  if (b.t === 'quote') el.append(h('div', { class: 'hw-quote-bar', style: `height:${row * L - 8}px` }));
  return { key: '', el, lines, height: row * L, refs };
}

/* ---------------------------------------------------------------------------------------------- */

export interface MessageOpts {
  animate: boolean;
  pen?: HTMLElement | null;
  onGrow?: (height: number) => void;
  onDone?: () => void;
}

/** A message on the sheet: re-layouts incrementally while streaming and writes itself out. */
export class MessageView {
  el: HTMLDivElement;
  body: HTMLDivElement;
  height = 0;
  parsed: Parsed = { blocks: [], refs: [], visibleLength: 0 };
  refEls = new Map<number, HTMLElement>();
  writer: Writer;
  private blocks: BlockOut[] = [];
  private pending: { text: string; streaming: boolean } | null = null;
  private running = false;
  private source = '';
  private finalCalled = false;

  constructor(public hand: Hand, public width: number, public seed: string, private opts: MessageOpts) {
    this.body = h('div', { class: 'hw-body' });
    this.el = h('div', { class: `hw-msg hand-${hand.name}`, style: `color:${hand.color}` }, this.body);
    this.writer = new Writer(opts.pen || null, opts.animate, () => opts.onDone?.());
  }

  /** Feed the full text so far. Re-renders are serialized and coalesced. */
  update(text: string, streaming: boolean) {
    this.source = text;
    this.pending = { text, streaming };
    if (!streaming) this.finalCalled = true;
    if (!this.running) void this.loop();
  }

  private async loop() {
    this.running = true;
    while (this.pending) {
      const job = this.pending;
      this.pending = null;
      try {
        await this.render(job.text, job.streaming);
      } catch (e) {
        console.warn('handwriting render failed', e);
      }
    }
    this.running = false;
    if (this.finalCalled) this.writer.streaming = false;
    this.writer.kick();
  }

  private async render(text: string, streaming: boolean) {
    const parsed = parseReply(text, streaming);
    this.parsed = parsed;
    const refsPage = new Map(parsed.refs.map((r) => [r.id, r.page]));
    const keys = parsed.blocks.map((b) => hashStr(JSON.stringify(b)).toString(36));
    // Reuse every block whose content did not change.
    let firstChanged = 0;
    while (firstChanged < this.blocks.length && firstChanged < keys.length && this.blocks[firstChanged].key === keys[firstChanged]) firstChanged++;
    const fresh: BlockOut[] = [];
    for (let i = firstChanged; i < parsed.blocks.length; i++) {
      const rng = new Rng(hashStr(this.seed + ':' + i));
      const out = await renderBlock(parsed.blocks[i], this.width, this.hand, rng, refsPage);
      out.key = keys[i];
      fresh.push(out);
    }
    for (let i = firstChanged; i < this.blocks.length; i++) this.blocks[i].el.remove();
    this.blocks = [...this.blocks.slice(0, firstChanged), ...fresh];
    // Stack blocks: paragraphs are separated by one ruled line, list items sit tight.
    let y = 0;
    const allLines: LineMeta[] = [];
    this.refEls.clear();
    this.blocks.forEach((bo, i) => {
      const b = parsed.blocks[i];
      const prev = parsed.blocks[i - 1];
      if (i > 0 && !(b.t === 'li' && prev?.t === 'li')) y += this.hand.line * (b.t === 'li' || prev?.t === 'li' || b.t === 'math' || prev?.t === 'math' ? 0.5 : 1);
      y = Math.round(y / (this.hand.line / 2)) * (this.hand.line / 2);
      bo.el.style.top = y + 'px';
      if (!bo.el.isConnected) this.body.append(bo.el);
      for (const l of bo.lines) allLines.push({ ...l, y: l.y + y });
      for (const [id, el] of bo.refs) this.refEls.set(id, el);
      y += bo.height;
    });
    this.height = Math.max(this.hand.line, y);
    this.body.style.height = this.height + 'px';
    this.writer.setLines(allLines, streaming || !this.finalCalled);
    this.opts.onGrow?.(this.height);
  }

  /** Reveal everything now (opening an old conversation, or the reader is impatient). */
  finish() { this.writer.finish(); }
  get text() { return this.source; }
}

/* ---------------------------------------------------------------------------------------------- */

/** Moves a pen along lines, uncovering them with a soft mask. Speed adapts to how much is waiting. */
export class Writer {
  private lines: LineMeta[] = [];
  private idx = 0;
  private px = 0;
  private stop: (() => void) | null = null;
  private lift = 0;           // pen travelling to the next line (ms left)
  streaming = true;
  done = false;
  base = 420;                 // px/s

  constructor(private pen: HTMLElement | null, private animate: boolean, private onDone: () => void) {}

  setLines(lines: LineMeta[], streaming: boolean) {
    // Keep progress: lines before the current one stay revealed; the current one keeps its reveal width.
    const prevIdx = this.idx;
    this.lines = lines;
    this.streaming = streaming;
    if (!this.animate) {
      for (const l of lines) this.show(l);
      if (!streaming && !this.done) { this.done = true; this.onDone(); }
      return;
    }
    this.idx = Math.min(prevIdx, lines.length);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (i < this.idx) this.show(l);
      else if (i === this.idx) this.partial(l, this.px);
      else this.hide(l);
    }
    this.kick();
  }

  private show(l: LineMeta) {
    l.el.classList.remove('hw-hidden', 'hw-writing');
    l.el.style.removeProperty('--p');
  }
  private hide(l: LineMeta) {
    l.el.classList.add('hw-hidden');
    l.el.classList.remove('hw-writing');
  }
  private partial(l: LineMeta, px: number) {
    l.el.classList.remove('hw-hidden');
    l.el.classList.add('hw-writing');
    l.el.style.setProperty('--p', px.toFixed(1) + 'px');
  }

  kick() {
    if (!this.animate || this.stop) return;
    if (this.idx >= this.lines.length && !this.streaming) { this.complete(); return; }
    this.stop = onFrame((_, dt) => this.step(dt));
  }

  private backlog() {
    let rest = 0;
    for (let i = this.idx; i < this.lines.length; i++) rest += this.lines[i].w;
    return rest - this.px;
  }

  private step(dt: number): boolean {
    if (this.idx >= this.lines.length) {
      if (!this.streaming) { this.complete(); this.stop = null; return false; }
      this.penIdle(true);
      this.stop = null;
      return false;          // wait for more text; setLines() kicks us again
    }
    this.penIdle(false);
    if (this.lift > 0) {
      this.lift -= dt;
      this.placePen(true);
      return true;
    }
    const backlog = this.backlog();
    // Aim to finish what is waiting within ~2.2 s, never slower than a brisk hand.
    const speed = Math.max(this.base, backlog / (this.streaming ? 3.2 : 2.2));
    const l = this.lines[this.idx];
    this.px += (speed * dt) / 1000;
    if (this.px >= l.w) {
      this.show(l);
      this.idx++;
      this.px = 0;
      this.lift = speed > 1400 ? 0 : 70;
      if (this.idx < this.lines.length) this.partial(this.lines[this.idx], 0);
    } else {
      this.partial(l, this.px);
    }
    this.placePen(false);
    return true;
  }

  private placePen(lifting: boolean) {
    const pen = this.pen;
    if (!pen) return;
    const l = this.lines[Math.min(this.idx, this.lines.length - 1)];
    if (!l) return;
    const x = l.x + (this.idx < this.lines.length ? this.px : l.w);
    const wob = lifting ? -5 : Math.sin(performance.now() / 38) * 1.4;
    const y = l.y + l.base + wob;
    pen.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    pen.classList.add('on');
  }

  private penIdle(idle: boolean) {
    this.pen?.classList.toggle('thinking', idle);
  }

  finish() {
    for (const l of this.lines) this.show(l);
    this.idx = this.lines.length;
    this.px = 0;
    if (!this.streaming) this.complete();
  }

  private complete() {
    if (this.done) return;
    this.done = true;
    this.stop?.();
    this.stop = null;
    if (this.pen) { this.pen.classList.remove('on', 'thinking'); }
    this.onDone();
  }
}
