// Labels on papers and books: a small card next to what is being labelled, with the tags it has (× takes one off), a
// box to write a new one (Enter), the tags already used in the library to pick from (most used first, narrowed as you
// type), and tags suggested from what is known about it (its topics, its field). For several at once the card only
// adds (or, opened to take off, lists the tags they have).
import { cleanTag, tagHue } from '../library/facets';
import { h, onPressOutside } from '../util/dom';
import { ICONS } from './icons';

export interface TagEditOpts {
  title: string;
  /** the tags it has (one item), or that every one of them has (several) */
  current: string[];
  /** taking off: the tags any of them has (several) */
  removable?: string[];
  /** every tag in the library, most used first */
  known: Array<{ tag: string; n: number }>;
  /** tags worth adding, from what is known about it */
  suggest?: string[];
  /** only take tags off (several at once) */
  removeOnly?: boolean;
  add(tag: string): Promise<void>;
  remove(tag: string): Promise<void>;
}

export const tagChip = (t: string, extra?: HTMLElement | null) =>
  h('span', { class: `tag-chip h${tagHue(t)}` }, h('span', { class: 'tag-t' }, '#' + t), extra || null);

export class TagEditor {
  el: HTMLDivElement;
  private o: TagEditOpts | null = null;
  private have: string[] = [];
  private input: HTMLInputElement;
  private chips: HTMLDivElement;
  private picks: HTMLDivElement;
  private head: HTMLSpanElement;
  private offOutside: (() => void) | null = null;
  private keep: Element | null = null;

  constructor(root: HTMLElement) {
    this.head = h('span', { class: 'te-title' });
    const close = h('button', { class: 'te-close', type: 'button', html: ICONS.close, title: '好了 (Esc)' });
    close.addEventListener('click', () => this.close());
    this.chips = h('div', { class: 'te-chips' });
    this.input = h('input', { class: 'te-input', type: 'text', placeholder: '写一个标签，回车', maxlength: '24', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    this.input.addEventListener('input', () => this.drawPicks());
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); const t = cleanTag(this.input.value); if (t) void this.add(t); }
    });
    this.picks = h('div', { class: 'te-picks' });
    this.el = h('div', { class: 'tag-edit', role: 'dialog', 'aria-label': '标签' },
      h('div', { class: 'te-head' }, this.head, close), this.chips, this.input, this.picks);
    for (const ev of ['pointerdown', 'wheel', 'click']) this.el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    root.append(this.el);
  }

  get open() { return this.el.classList.contains('on'); }

  /** Open beside `at` (a rectangle on screen); `keep`: pressing it does not close the card (what opened it). */
  show(at: DOMRect, o: TagEditOpts, keep?: Element | null) {
    this.o = o;
    this.keep = keep ?? null;
    this.have = [...(o.removeOnly ? o.removable || [] : o.current)];
    this.head.textContent = o.title;
    this.el.classList.toggle('remove-only', !!o.removeOnly);
    this.input.value = '';
    this.draw();
    this.el.classList.add('on');
    // under the anchor if there is room, else above; kept on screen
    const w = Math.min(340, innerWidth - 20);
    this.el.style.width = w + 'px';
    const hgt = this.el.offsetHeight || 220;
    const x = Math.max(10, Math.min(innerWidth - w - 10, at.left));
    const y = at.bottom + 8 + hgt < innerHeight - 10 ? at.bottom + 8 : Math.max(10, at.top - 8 - hgt);
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    this.offOutside?.();
    this.offOutside = onPressOutside(this.el, (t) => !!this.keep?.contains(t), () => this.close());
    removeEventListener('keydown', this.esc, true);
    addEventListener('keydown', this.esc, true);
    if (!o.removeOnly) setTimeout(() => { if (this.open) this.input.focus({ preventScroll: true }); }, 40);
  }

  /** Esc closes it before anything else on the page sees the key (a fan, a book). */
  private esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.open) return;
    e.stopPropagation();
    e.preventDefault();
    this.close();
  };

  close() {
    if (!this.open) return;
    removeEventListener('keydown', this.esc, true);
    this.el.classList.remove('on');
    this.offOutside?.();
    this.offOutside = null;
    this.o = null;
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  private async add(t: string) {
    const o = this.o;
    if (!o || this.have.some((x) => x.toLowerCase() === t.toLowerCase())) { this.input.value = ''; this.drawPicks(); return; }
    this.have.push(t);
    this.input.value = '';
    this.draw();
    try { await o.add(t); } catch { this.have = this.have.filter((x) => x !== t); this.draw(); }
  }
  private async remove(t: string) {
    const o = this.o;
    if (!o) return;
    this.have = this.have.filter((x) => x !== t);
    this.draw();
    try { await o.remove(t); } catch { this.have.push(t); this.draw(); }
  }

  private draw() {
    const o = this.o;
    if (!o) return;
    this.chips.replaceChildren(...this.have.map((t) => {
      const x = h('button', { class: 'te-x', type: 'button', title: o.removeOnly ? '从选中的都撕掉' : '撕掉', html: ICONS.close });
      x.addEventListener('click', () => void this.remove(t));
      return tagChip(t, x);
    }), ...(this.have.length ? [] : [h('span', { class: 'te-none' }, o.removeOnly ? '选中的都没有标签' : '还没有标签')]));
    this.drawPicks();
  }

  /** Tags to pick: the library's (narrowed by what is typed) and the suggested ones, minus those it has. */
  private drawPicks() {
    const o = this.o;
    if (!o || o.removeOnly) { this.picks.replaceChildren(); return; }
    const q = cleanTag(this.input.value).toLowerCase(), has = new Set(this.have.map((x) => x.toLowerCase()));
    const known = o.known.filter((k) => !has.has(k.tag.toLowerCase()) && (!q || k.tag.toLowerCase().includes(q))).slice(0, 14);
    const sug = (o.suggest || []).filter((t) => !has.has(t.toLowerCase()) && !known.some((k) => k.tag.toLowerCase() === t.toLowerCase()) && (!q || t.toLowerCase().includes(q))).slice(0, 6);
    const pick = (t: string, n?: number) => {
      const b = h('button', { class: `te-pick h${tagHue(t)}`, type: 'button' }, '#' + t, n ? h('span', { class: 'te-n' }, String(n)) : null);
      b.addEventListener('click', () => void this.add(t));
      return b;
    };
    const typed = q && !o.known.some((k) => k.tag.toLowerCase() === q) && !has.has(q) ? [(() => {
      const b = h('button', { class: 'te-pick new', type: 'button' }, `＋ 新标签「${cleanTag(this.input.value)}」`);
      b.addEventListener('click', () => void this.add(cleanTag(this.input.value)));
      return b;
    })()] : [];
    this.picks.replaceChildren(
      ...typed,
      ...(known.length ? [h('span', { class: 'te-l' }, q ? '用过的' : '常用'), ...known.map((k) => pick(k.tag, k.n))] : []),
      ...(sug.length ? [h('span', { class: 'te-l' }, '建议'), ...sug.map((t) => pick(t))] : []),
    );
  }
}
