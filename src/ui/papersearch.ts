import { findText } from '../english/search';
import type { PaperDoc } from '../pdf/doc';
import type { Reader } from '../reader';
import { h, s } from '../util/dom';
interface Hit { page: number; start: number; end: number }
export class PaperSearch {
  el: HTMLDivElement;
  private input = h('input', { type: 'search', placeholder: '搜索整篇论文', 'aria-label': '搜索论文正文' });
  private status = h('span', { class: 'ps-status', role: 'status', 'aria-live': 'polite' });
  private caseSensitive = false;
  private wholeWord = false;
  private hits: Hit[] = [];
  private current = -1;
  private seq = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private groups: SVGGElement[] = [];
  private previousFocus: HTMLElement | null = null;
  constructor(root: HTMLElement, private doc: () => PaperDoc | null, private reader: () => Reader | null, private beforeJump: () => void) {
    const btn = (label: string, title: string, fn: () => void) => h('button', { type: 'button', title, 'aria-label': title, onclick: fn }, label);
    const check = (label: string, on: (v: boolean) => void) => {
      const input = h('input', { type: 'checkbox', onchange: () => { on(input.checked); void this.search(); } });
      return h('label', null, input, label);
    };
    this.el = h('div', { class: 'paper-search', role: 'search', hidden: true }, h('div', { class: 'ps-main' }, this.input, this.status,
      btn('↑', '上一个结果 (Shift+Enter)', () => this.step(-1)), btn('↓', '下一个结果 (Enter)', () => this.step(1)), btn('×', '关闭搜索 (Esc)', () => this.hide())),
      h('div', { class: 'ps-options' }, check('区分大小写', (v) => this.caseSensitive = v), check('完整单词', (v) => this.wholeWord = v), h('span', null, '⌘F / Ctrl+F')));
    this.input.addEventListener('input', () => { clearTimeout(this.timer); this.seq++; this.timer = setTimeout(() => void this.search(), 160); });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); this.input.select(); }
    });
    root.append(this.el);
  }
  get open() { return !this.el.hidden; }
  show(query?: string) {
    if (!this.doc()) return;
    if (!this.open) this.previousFocus = document.activeElement as HTMLElement;
    this.el.hidden = false;
    if (query !== undefined) this.input.value = query;
    this.input.focus(); this.input.select();
    void this.search();
  }
  hide() {
    this.el.hidden = true; this.seq++; clearTimeout(this.timer); this.clearMarks(); this.hits = []; this.current = -1;
    this.previousFocus?.focus();
  }
  private clearMarks() { this.groups.forEach((g) => g.remove()); this.groups = []; }
  private async search() {
    const seq = ++this.seq, doc = this.doc();
    this.clearMarks(); this.hits = []; this.current = -1;
    const query = this.input.value.trim();
    if (!query || !doc) { this.status.textContent = ''; return; }
    this.status.textContent = '搜索中…';
    try {
      const hits: Hit[] = [];
      for (let page = 0; page < doc.numPages && hits.length < 2000; page++) {
        const pt = await doc.text(page);
        if (seq !== this.seq || doc !== this.doc() || !this.open) return;
        hits.push(...findText(pt.text, query, { caseSensitive: this.caseSensitive, wholeWord: this.wholeWord, limit: 2000 - hits.length }).map((r) => ({ page, ...r })));
      }
      this.hits = hits;
      this.current = hits.length ? 0 : -1;
      this.jump();
    } catch { if (seq === this.seq) this.status.textContent = '读取文字失败'; }
  }
  private step(delta: number) {
    if (!this.hits.length) return;
    this.current = (this.current + delta + this.hits.length) % this.hits.length;
    this.jump();
  }
  private jump() {
    this.clearMarks();
    const reader = this.reader(), doc = this.doc();
    this.status.textContent = this.hits.length ? `${this.current + 1} / ${this.hits.length}${this.hits.length === 2000 ? '+' : ''}` : '无匹配';
    if (!reader || !doc || this.current < 0) return;
    const groups = new Map<number, SVGGElement>();
    for (const [i, hit] of this.hits.entries()) {
      const view = reader.views[hit.page], text = doc.texts[hit.page];
      if (!view || !text) continue;
      let group = groups.get(hit.page);
      if (!group) { group = s('g', { class: 'g-search', 'pointer-events': 'none' }); view.ink.append(group); groups.set(hit.page, group); this.groups.push(group); }
      for (const r of text.rangeRects(hit.start, hit.end)) group.append(s('rect', { x: r.x - 1, y: r.y - 1, width: r.w + 2, height: r.h + 2, rx: 1,
        fill: i === this.current ? '#ef8851' : '#f5d95b', 'fill-opacity': i === this.current ? '.52' : '.35', stroke: i === this.current ? '#aa431b' : 'none', 'stroke-width': '.8' }));
    }
    const hit = this.hits[this.current], rect = doc.texts[hit.page]?.rangeRects(hit.start, hit.end)[0];
    if (!rect) return;
    this.beforeJump();
    const camera = reader.desk.camera;
    camera.panTo(reader.viewForPage(hit.page, true, Math.max(0, rect.y - 130 / camera.view.z), camera.view.z));
  }
}
