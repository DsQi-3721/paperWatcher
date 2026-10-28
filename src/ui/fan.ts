// The papers read so far, held like a hand of cards: clicking a pile on the desk lifts its sheets off and spreads
// them in an arc, each card one paper (its first page and its title), overlapping. The card under the pointer is
// drawn out of the hand and the others make a little room round it; clicking it opens that paper.
// Which card is under the pointer goes by the pointer's angle round the hand's pivot, not by the cards' own (moving)
// outlines: a card drawn out never hides its neighbour, and a card rising off the pointer never flickers back.
// A big pile is dealt a hand at a time (下一手 / 上一手); the deck can be sorted or shuffled. A click anywhere off
// the cards, the 收起 button or Esc puts the hand back on the pile.
// The same hand holds the books from the desk's textbook (CardFan with a book deck: covers, authors, how far read).
import type { BookMeta } from '../books/types';
import type { PaperMeta } from '../types';
import { h } from '../util/dom';

export type FanSort = 'recent' | 'oldest' | 'title' | 'size' | 'author';
const PULL = 54, LIFT = 1.07;

/** What the cards of a deck show, and how it can be sorted. */
export interface FanDeck<T> {
  /** what the hand is called (for screen readers) */
  name: string;
  title(m: T): string;
  /** the small line under the title */
  sub(m: T): string;
  thumb(m: T): string | undefined;
  /** last read (or added) */
  readAt(m: T): number;
  added(m: T): number;
  size(m: T): number;
  author(m: T): string;
  /** how far read, 0..1 (a little bar on the card) */
  progress?(m: T): number | undefined;
  /** a corner label (the format) */
  badge?(m: T): string | undefined;
  /** card width / height */
  aspect: number;
  sorts: Array<[FanSort, string]>;
  /** what the shuffle button says when hovered */
  shuffleTitle: string;
  /** the counting word (篇 for papers, 本 for books) */
  unit: string;
  /** more buttons for the bar (before 收起) */
  extra?: Array<{ label: string; title: string; cls?: string; on: () => void }>;
  /** taking one off for good (right-click a card): what the button says, and doing it */
  remove?: { label: string; confirm: string; run(m: T): Promise<void> };
}

interface Geom { cx: number; cy: number; R: number; step: number; a0: number; n: number; cw: number; ch: number }
interface Card<T> { el: HTMLElement; m: T }

// one collator each, made once (localeCompare would make one for every comparison of a big library's sort)
const BASE = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base' }), FULL = new Intl.Collator('zh-Hans-CN');

export class CardFan<T> {
  el: HTMLDivElement;
  open = false;
  onPick?: (m: T) => void;
  private veil: HTMLDivElement;
  private handEl: HTMLDivElement;
  private bar: HTMLDivElement;
  private info: HTMLSpanElement;
  private prevB: HTMLButtonElement;
  private nextB: HTMLButtonElement;
  private sortBs = new Map<FanSort, HTMLButtonElement>();
  private given: T[] = [];
  private deck: T[] = [];
  private sort: FanSort = 'recent';
  private shuffled = false;
  private hand = 0;
  private perHand = 30;
  private cards: Array<Card<T>> = [];
  private sel = -1;
  private g: Geom | null = null;
  private from: DOMRect | null = null;
  private fromDeg = 0;
  /** Bumped by every deal / close, so cards still flying back never clear a hand dealt after them. */
  private gen = 0;
  private busy = false;
  private touch = false;
  private wheelAcc = 0;

  constructor(host: HTMLElement, private cfg: FanDeck<T>) {
    this.veil = h('div', { class: 'fan-veil' });
    this.handEl = h('div', { class: 'fan-hand', role: 'listbox', 'aria-label': cfg.name });
    const pill = (label: string, title: string, on: () => void) => {
      const b = h('button', { class: 'fan-pill', type: 'button', title }, label) as HTMLButtonElement;
      b.addEventListener('click', (e) => { e.stopPropagation(); on(); });
      return b;
    };
    this.prevB = pill('‹ 上一手', '上一手（PageUp）', () => this.turn(-1));
    this.nextB = pill('下一手 ›', '下一手（PageDown）', () => this.turn(1));
    this.info = h('span', { class: 'fan-info' });
    const sorts = h('span', { class: 'fan-sorts' }, ...cfg.sorts.map(([k, label]) => { const b = pill(label, '排序：' + label, () => this.setSort(k)); this.sortBs.set(k, b); return b; }));
    const shuffle = pill('洗牌', cfg.shuffleTitle, () => { void this.shuffle(); });
    shuffle.classList.add('shuffle');
    const extra = (cfg.extra || []).map((x) => { const b = pill(x.label, x.title, () => x.on()); if (x.cls) b.classList.add(x.cls); return b; });
    const close = pill('收起 ×', '收起（Esc）', () => this.close());
    close.classList.add('close');
    this.bar = h('div', { class: 'fan-bar' }, h('span', { class: 'fan-pager' }, this.prevB, this.info, this.nextB), sorts, shuffle, ...extra, close);
    this.el = h('div', { class: 'fan' }, this.veil, this.handEl, this.bar);
    for (const t of ['pointerdown', 'pointerup', 'click', 'dblclick']) this.bar.addEventListener(t, (e) => e.stopPropagation());
    this.el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.hover(e.clientX, e.clientY); });
    this.el.addEventListener('pointerleave', () => { if (!this.touch) this.select(-1); });
    this.el.addEventListener('click', (e) => this.click(e));
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.touch = e.pointerType !== 'mouse'; });
    this.el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.el.addEventListener('contextmenu', (e) => this.askRemove(e));
    host.append(this.el);
    addEventListener('keydown', (e) => this.key(e));
    addEventListener('resize', () => { if (this.open && !this.busy) { this.measure(); this.layout(false); } });
  }

  /** Spread these (newest first) out of the pile whose top sheet is at `from` on screen. */
  show(papers: T[], from: DOMRect | null, fromDeg = 0) {
    if (this.open) this.clear();
    this.given = papers.slice();
    this.from = from;
    this.fromDeg = fromDeg;
    this.shuffled = false;
    this.order();
    this.hand = 0;
    this.open = true;
    this.busy = false;
    document.body.classList.add('fan-open');
    this.el.classList.remove('closing', 'pointing');
    this.el.classList.add('on');
    for (const a of [...this.veil.getAnimations(), ...this.bar.getAnimations()]) a.cancel();
    this.veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    this.bar.animate([{ opacity: 0, transform: 'translate(-50%, 16px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 260, delay: 120, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' });
    this.deal('pile');
  }

  /* ---------- the deck ---------- */
  private order() {
    const d = this.given.slice(), c = this.cfg;
    if (this.sort === 'recent') d.sort((a, b) => c.readAt(b) - c.readAt(a));
    else if (this.sort === 'oldest') d.sort((a, b) => c.added(a) - c.added(b));
    else if (this.sort === 'title') d.sort((a, b) => BASE.compare(c.title(a), c.title(b)));
    else if (this.sort === 'author') d.sort((a, b) => BASE.compare(c.author(a), c.author(b)) || FULL.compare(c.title(a), c.title(b)));
    else d.sort((a, b) => c.size(b) - c.size(a));
    this.deck = d;
    for (const [k, b] of this.sortBs) b.setAttribute('aria-pressed', String(!this.shuffled && k === this.sort));
  }
  private get hands() { return Math.max(1, Math.ceil(this.deck.length / this.perHand)); }

  private setSort(k: FanSort) {
    if (this.busy || (k === this.sort && !this.shuffled)) return;
    this.sort = k;
    this.shuffled = false;
    this.order();
    this.hand = 0;
    void this.collect('down').then(() => { if (this.open) this.deal('down'); });
  }
  private turn(dir: 1 | -1) {
    const to = this.hand + dir;
    if (this.busy || to < 0 || to >= this.hands) return;
    this.hand = to;
    void this.collect(dir > 0 ? 'left' : 'right').then(() => { if (this.open) this.deal(dir > 0 ? 'right' : 'left'); });
  }

  /** Riffle the whole deck: the hand comes together, splits in two, the halves riffle into one, a new hand is dealt. */
  private async shuffle() {
    if (this.busy || !this.cards.length || !this.g) return;
    this.busy = true;
    const g = this.g, cards = this.cards, n = cards.length, gen = this.gen;
    const sx = g.cx - g.cw / 2, sy = g.cy - g.R - g.ch / 2 + 20;
    const at = (dx: number, dy: number, deg: number) => `translate(${(sx + dx).toFixed(1)}px, ${(sy + dy).toFixed(1)}px) rotate(${deg.toFixed(1)}deg)`;
    this.sel = -1;
    this.el.classList.remove('pointing');
    cards.forEach((c, i) => { c.el.style.transition = 'none'; c.el.style.zIndex = String(i + 1); c.el.classList.remove('sel'); });
    const run = (list: Array<Promise<unknown>>) => Promise.all(list.map((p) => p.catch(() => {})));
    const tidy = (i: number) => at((i % 3 - 1) * 1.5, -i * .4, (i % 5 - 2) * .6);
    const half = Math.ceil(n / 2), side = (i: number) => (i < half ? -1 : 1), k = (i: number) => (i < half ? i : i - half);
    // together
    await run(cards.map((c, i) => c.el.animate([{ transform: c.el.style.transform }, { transform: tidy(i) }], { duration: 240, delay: i * 4, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished));
    if (gen !== this.gen) return;
    // split in two
    await run(cards.map((c, i) => c.el.animate([{ transform: tidy(i) }, { transform: at(side(i) * 92, -k(i) * .5, side(i) * 9) }], { duration: 180, easing: 'ease-out', fill: 'forwards' }).finished));
    if (gen !== this.gen) return;
    // riffle: the halves fall in, a card from each side in turn
    const beat = Math.max(8, 320 / n);
    await run(cards.map((c, i) => c.el.animate([
      { transform: at(side(i) * 92, -k(i) * .5, side(i) * 9) },
      { transform: at(side(i) * 30, -8 - k(i) * .3, side(i) * 3), offset: .55 },
      { transform: at(0, -(k(i) * 2 + (i < half ? 0 : 1)) * .4, 0) },
    ], { duration: 230, delay: (k(i) * 2 + (i < half ? 0 : 1)) * beat, easing: 'ease-in-out', fill: 'forwards' }).finished));
    if (gen !== this.gen) return;
    // a new order for the whole deck (Fisher-Yates) and a fresh hand off the top of it
    const d = this.given.slice();
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    this.deck = d;
    this.shuffled = true;
    for (const b of this.sortBs.values()) b.setAttribute('aria-pressed', 'false');
    this.hand = 0;
    this.cards = [];
    this.busy = false;
    this.deal('stack', { x: sx + g.cw / 2, y: sy + g.ch / 2 });
    for (const c of cards) c.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }).finished.then(() => c.el.remove(), () => c.el.remove());
  }

  /* ---------- dealing ---------- */
  private measure() {
    const vw = innerWidth, vh = innerHeight, small = vw < 640 || vh < 560;
    const cw = small ? 112 : 150, ch = Math.round(cw / this.cfg.aspect);
    const R = small ? Math.max(380, vh * .55) : Math.max(540, ch * 2.6), outer = R + ch / 2;
    // the hand never runs off the screen's sides, and each card keeps at least ~34 px of arc to point at
    const maxHalf = Math.asin(Math.max(.12, Math.min(.92, (vw / 2 - 24 - cw / 2) / outer))) * 180 / Math.PI;
    const spread = Math.min(108, maxHalf * 2), minStep = (34 / outer) * 180 / Math.PI;
    this.perHand = Math.max(6, Math.min(36, Math.floor(spread / minStep) + 1));
    const n = Math.min(this.perHand, Math.max(0, this.deck.length - this.hand * this.perHand));
    const step = n > 1 ? Math.min(8, spread / (n - 1)) : 0;
    // the middle card a little above the screen's middle, the bar of buttons below the hand
    const cy = Math.min(vh * .5 - 10 + R, vh - 96 - ch / 2 + R);
    this.g = { cx: vw / 2, cy, R, step, a0: -((n - 1) * step) / 2, n, cw, ch };
  }

  /** The cards of the current hand, flying in from the pile (or a side, the bottom, or the shuffled stack). */
  private deal(from: 'pile' | 'left' | 'right' | 'down' | 'stack', stack?: { x: number; y: number }) {
    this.measure();
    if (this.hand >= this.hands) { this.hand = this.hands - 1; this.measure(); }
    const g = this.g!, start = this.hand * this.perHand, list = this.deck.slice(start, start + g.n), gen = ++this.gen;
    this.sel = -1;
    this.el.classList.remove('pointing');
    this.cards = list.map((m, i) => {
      const el = this.card(m, i);
      el.style.setProperty('--cw', g.cw + 'px');
      el.style.setProperty('--ch', g.ch + 'px');
      this.handEl.append(el);
      return { el, m };
    });
    this.layout(false);
    this.updateBar();
    const f = this.from;
    this.cards.forEach((c, i) => {
      const rest = c.el.style.transform;
      let start0: string;
      if (from === 'pile' && f) start0 = `translate(${f.x + f.width / 2 - g.cw / 2}px, ${f.y + f.height / 2 - g.ch / 2}px) rotate(${this.fromDeg}deg) scale(${f.width / g.cw})`;
      else if (from === 'stack' && stack) start0 = `translate(${stack.x - g.cw / 2}px, ${stack.y - g.ch / 2}px) rotate(0deg)`;
      else if (from === 'left') start0 = `translate(${-g.cw - 40}px, ${g.cy - g.R}px) rotate(-30deg)`;
      else if (from === 'right') start0 = `translate(${innerWidth + 40}px, ${g.cy - g.R}px) rotate(30deg)`;
      else start0 = `translate(${g.cx - g.cw / 2}px, ${innerHeight + 40}px) rotate(0deg)`;
      c.el.animate([{ transform: start0, opacity: from === 'pile' ? .9 : 0 }, { transform: rest, opacity: 1 }],
        { duration: from === 'pile' ? 420 : 340, delay: Math.min(260, i * (from === 'pile' ? 16 : 10)), easing: 'cubic-bezier(.25, 1.1, .35, 1)', fill: 'backwards' })
        .finished.then(() => { if (gen === this.gen) c.el.style.transition = ''; }, () => {});
    });
  }

  /** Where every card of the hand rests, the selected one drawn out and its neighbours making room. */
  private layout(animate = true) {
    const g = this.g;
    if (!g) return;
    const gap = this.sel >= 0 ? Math.min(5, Math.max(1.5, g.step * 1.1)) : 0;
    this.cards.forEach((c, i) => {
      const on = i === this.sel, deg = g.a0 + i * g.step + (this.sel < 0 || on ? 0 : Math.sign(i - this.sel) * gap);
      const r = g.R + (on ? PULL : 0), t = deg * Math.PI / 180;
      const x = g.cx + r * Math.sin(t) - g.cw / 2, y = g.cy - r * Math.cos(t) - g.ch / 2;
      if (!animate) c.el.style.transition = 'none';
      else if (c.el.style.transition === 'none') c.el.style.transition = '';
      c.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${deg.toFixed(2)}deg) scale(${on ? LIFT : 1})`;
      c.el.style.zIndex = on ? '999' : String(i + 1);
      c.el.classList.toggle('sel', on);
      c.el.setAttribute('aria-selected', String(on));
    });
  }

  /** Put the hand away: to the pile (closing), off to a side (another hand), down (re-sorted), or just let it go
   *  where it is (a card was taken: the camera is about to move, so nothing flies back to where the pile was). */
  private collect(to: 'pile' | 'left' | 'right' | 'down' | 'fade', keep?: HTMLElement): Promise<void> {
    const cards = this.cards, g = this.g, f = this.from, cw = g?.cw ?? 150, ch = g?.ch ?? 212;
    this.cards = [];
    this.sel = -1;
    this.busy = to !== 'pile' && to !== 'fade';
    const n = cards.length;
    const all = cards.map((c, i) => {
      const gone = () => { c.el.remove(); };
      if (c.el === keep) return new Promise<void>((r) => setTimeout(() => { gone(); r(); }, 420));
      if (to === 'fade') {
        c.el.style.transition = 'none';
        return c.el.animate([{ opacity: 1 }, { opacity: 0, transform: `${c.el.style.transform} translateY(24px)` }], { duration: 160, delay: Math.min(60, i * 2), easing: 'ease-in', fill: 'forwards' }).finished.then(gone, gone);
      }
      let end: string;
      if (to === 'pile') end = f ? `translate(${f.x + f.width / 2 - cw / 2}px, ${f.y + f.height / 2 - ch / 2}px) rotate(${this.fromDeg}deg) scale(${f.width / cw})`
        : `${c.el.style.transform} translateY(80px)`;
      else if (to === 'left') end = `translate(${-cw - 60}px, ${(g?.cy ?? 0) - (g?.R ?? 0)}px) rotate(-30deg)`;
      else if (to === 'right') end = `translate(${innerWidth + 60}px, ${(g?.cy ?? 0) - (g?.R ?? 0)}px) rotate(30deg)`;
      else end = `translate(${(g?.cx ?? 0) - cw / 2}px, ${innerHeight + 60}px) rotate(0deg)`;
      c.el.style.transition = 'none';
      const order = to === 'left' ? i : n - 1 - i;
      return c.el.animate([{ transform: c.el.style.transform, opacity: 1 }, { transform: end, opacity: to === 'pile' ? 0 : .2 }],
        { duration: to === 'pile' ? 280 : 240, delay: Math.min(160, order * 6), easing: 'cubic-bezier(.5, 0, .7, .4)', fill: 'forwards' })
        .finished.then(gone, gone);
    });
    return Promise.all(all).then(() => { if (to !== 'pile' && to !== 'fade') this.busy = false; });
  }

  private card(m: T, i: number) {
    const c = this.cfg, url = c.thumb(m), title = c.title(m);
    const face = url ? h('img', { class: 'fc-img', src: url, alt: '', draggable: false, decoding: 'async' }) : h('div', { class: 'fc-blank' }, title);
    const el = h('div', { class: 'fan-card', role: 'option', 'aria-label': title, 'data-i': String(i) },
      face, h('span', { class: 'fc-title' }, title), h('span', { class: 'fc-meta' }, c.sub(m)));
    const badge = c.badge?.(m), prog = c.progress?.(m);
    if (badge) el.append(h('span', { class: 'fc-badge' }, badge));
    if (prog != null) el.append(h('span', { class: 'fc-prog', style: `--p:${Math.max(0, Math.min(1, prog)).toFixed(3)}` }));
    return el;
  }

  private updateBar() {
    const N = this.deck.length, a = this.hand * this.perHand + 1, b = Math.min(N, a + this.perHand - 1);
    const u = this.cfg.unit;
    this.info.textContent = this.hands > 1 ? `${a}–${b} / ${N} ${u}` : `${N} ${u}`;
    this.prevB.disabled = this.hand <= 0;
    this.nextB.disabled = this.hand >= this.hands - 1;
    this.bar.classList.toggle('one-hand', this.hands <= 1);
  }

  /* ---------- pointing ---------- */
  /** The card whose slot the point is in: by its angle round the pivot, within the band the cards lie in. */
  private hit(px: number, py: number) {
    const g = this.g;
    if (!g || !g.n || !this.cards.length) return -1;
    const dx = px - g.cx, dy = g.cy - py, r = Math.hypot(dx, dy);
    if (r < g.R - g.ch / 2 - 24 || r > g.R + g.ch / 2 + PULL + 30) return -1;
    const a = Math.atan2(dx, dy) * 180 / Math.PI;
    const half = Math.max(g.step / 2, ((g.cw * .38) / g.R) * 180 / Math.PI);
    if (a < g.a0 - half || a > g.a0 + (g.n - 1) * g.step + half) return -1;
    return g.n === 1 ? 0 : Math.max(0, Math.min(g.n - 1, Math.round((a - g.a0) / g.step)));
  }
  private select(i: number) {
    if (i === this.sel || this.busy) return;
    this.sel = i;
    this.layout();
    this.el.classList.toggle('pointing', i >= 0);
  }
  private hover(x: number, y: number) { if (this.open && !this.busy) this.select(this.hit(x, y)); }

  private click(e: MouseEvent) {
    if (this.el.querySelector('.fan-remove')) { this.el.querySelector('.fan-remove')!.remove(); return; }
    if (!this.open || this.busy) return;
    const i = this.hit(e.clientX, e.clientY);
    if (i < 0) { this.close(); return; }
    // a touch picks a card first (it is drawn out), a second touch on it opens it; a mouse opens at once
    if (this.touch && i !== this.sel) { this.select(i); return; }
    this.pick(i);
  }
  private wheel(e: WheelEvent) {
    if (!this.open) return;
    e.preventDefault();
    this.wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(this.wheelAcc) < 40) return;
    const d = Math.sign(this.wheelAcc), n = this.cards.length;
    this.wheelAcc = 0;
    this.select(Math.max(0, Math.min(n - 1, (this.sel < 0 ? (d > 0 ? -1 : n) : this.sel) + d)));
  }
  private key(e: KeyboardEvent) {
    if (!this.open) return;
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); this.close(); return; }
    if (this.busy) return;
    const n = this.cards.length;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); const d = k === 'ArrowRight' ? 1 : -1; this.select(Math.max(0, Math.min(n - 1, (this.sel < 0 ? (d > 0 ? -1 : n) : this.sel) + d))); }
    else if ((k === 'Enter' || k === ' ') && this.sel >= 0) { e.preventDefault(); this.pick(this.sel); }
    else if (k === 'PageDown' || k === ']') { e.preventDefault(); this.turn(1); }
    else if (k === 'PageUp' || k === '[') { e.preventDefault(); this.turn(-1); }
  }

  /** Right-click a card: a little button over it to take it off (pressed twice: once to arm, once to do it). */
  private askRemove(e: MouseEvent) {
    e.preventDefault();
    const rm = this.cfg.remove, i = this.hit(e.clientX, e.clientY), c = this.cards[i];
    this.el.querySelector('.fan-remove')?.remove();
    if (!rm || !c || this.busy) return;
    this.select(i);
    const b = h('button', { class: 'fan-remove', type: 'button', style: `left:${Math.round(e.clientX)}px;top:${Math.round(e.clientY)}px` }, rm.label) as HTMLButtonElement;
    let armed = false;
    b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    b.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!armed) { armed = true; b.textContent = rm.confirm; b.classList.add('armed'); return; }
      b.disabled = true;
      try {
        await rm.run(c.m);
        this.given = this.given.filter((x) => x !== c.m);
        this.deck = this.deck.filter((x) => x !== c.m);
        b.remove();
        if (!this.deck.length) { this.close(); return; }
        void this.collect('down').then(() => { if (this.open) this.deal('down'); });
      } catch { b.textContent = '没删掉'; }
    });
    this.el.append(b);
  }

  private pick(i: number) {
    const c = this.cards[i];
    if (!c) return;
    // the chosen one rises out of the hand and is taken; the rest go back on the pile
    this.select(i);
    c.el.style.zIndex = '1000';
    c.el.style.transition = 'none';
    const rest = c.el.style.transform;
    c.el.animate([{ transform: rest }, { transform: `${rest} translateY(-70px) scale(1.12)`, opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.4,0,.8,.5)', fill: 'forwards' });
    this.close(c.el, true);
    this.onPick?.(c.m);
  }

  /** Put the hand back on the pile (keep: a card that is not going back; taken: one was picked, the rest just go). */
  close(keep?: HTMLElement, taken = false) {
    if (!this.open) return;
    this.el.querySelector('.fan-remove')?.remove();
    this.open = false;
    document.body.classList.remove('fan-open');
    this.busy = false;
    const gen = ++this.gen;
    this.el.classList.remove('pointing');
    const a = this.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
    this.bar.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, 12px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    // the layer stops taking the pointer at once; it goes once the cards are back, unless a new hand was dealt meanwhile
    this.el.classList.add('closing');
    void this.collect(taken ? 'fade' : 'pile', keep).then(() => {
      if (gen !== this.gen) return;
      this.el.classList.remove('on', 'closing');
      a.cancel();
      for (const x of this.bar.getAnimations()) x.cancel();
    });
  }

  private clear() { this.cards = []; this.handEl.replaceChildren(); this.gen++; }
}

/** The papers read so far (the piles). */
export class PaperFan extends CardFan<PaperMeta> {
  constructor(host: HTMLElement, thumb: (m: PaperMeta) => string | undefined, remove?: FanDeck<PaperMeta>['remove']) {
    const readAt = (m: PaperMeta) => (m as PaperMeta & { openedAt?: number }).openedAt || m.addedAt || 0;
    super(host, {
      name: '读过的论文', aspect: 1 / 1.414, thumb, readAt, added: readAt,
      title: (m) => m.title, author: (m) => (m.authors || [])[0] || '', size: (m) => m.pages || 0,
      sub: (m) => [m.pages ? m.pages + ' 页' : '', m.notes ? `${m.notes} 条笔记` : ''].filter(Boolean).join(' · '),
      sorts: [['recent', '最近读的'], ['oldest', '最早读的'], ['title', '按标题'], ['size', '按页数']],
      shuffleTitle: '洗一洗，随便抽一篇', unit: '篇', remove,
    });
  }
}

const FORMAT_LABEL: Record<string, string> = { epub: 'EPUB', mobi: 'MOBI', azw3: 'AZW3', txt: 'TXT', pdf: 'PDF', cbz: '漫画', fb2: 'FB2', html: 'HTML', md: 'MD' };
/** The books on the desk's textbook (novels, comics, magazines). */
export class BookFan extends CardFan<BookMeta> {
  constructor(host: HTMLElement, cover: (m: BookMeta) => string | undefined, extra: FanDeck<BookMeta>['extra'], remove?: FanDeck<BookMeta>['remove']) {
    super(host, {
      name: '书架上的读物', aspect: 2 / 3, thumb: cover,
      readAt: (m) => m.openedAt || m.addedAt || 0, added: (m) => m.addedAt || 0,
      title: (m) => m.title, author: (m) => m.author || '', size: (m) => m.length || m.size || 0,
      sub: (m) => [m.author || '', m.progress ? `读到 ${Math.round(m.progress.percent * 100)}%` : '还没读'].filter(Boolean).join(' · '),
      progress: (m) => m.progress?.percent, badge: (m) => FORMAT_LABEL[m.format] || m.format.toUpperCase(),
      sorts: [['recent', '最近读的'], ['oldest', '最早放上的'], ['title', '按书名'], ['author', '按作者']],
      shuffleTitle: '洗一洗，随便抽一本', unit: '本', extra, remove,
    });
  }
}
