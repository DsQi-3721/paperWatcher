// Typing that looks like writing: a transparent textarea keeps native caret, selection and IME; a mirror
// paints the same text in handwriting where each new character inks in, IME composition is pencilled
// lightly until committed, and a pen sits at the caret.
import { esc, h } from '../util/dom';
import type { Hand } from '../ink/handwriting';
import { penSvg } from '../ui/icons';

export class Composer {
  el: HTMLDivElement;
  ta: HTMLTextAreaElement;
  private mirror: HTMLDivElement;
  private pen: HTMLDivElement;
  private sendBtn: HTMLButtonElement;
  private prev = '';
  private recent: Array<{ start: number; end: number; t: number }> = [];
  private composing: { start: number; end: number } | null = null;
  private busy = false;
  private raf = 0;
  onSend: (text: string) => void = () => {};
  onEscape: () => void = () => {};
  onFocus: () => void = () => {};

  constructor(private hand: Hand, placeholder: string) {
    const font = `${hand.weight} ${hand.size}px ${hand.family}`;
    const common = `font:${font};line-height:${hand.line}px;`;
    this.ta = h('textarea', { class: 'cmp-ta', rows: 1, spellcheck: false, style: common, 'aria-label': placeholder }) as HTMLTextAreaElement;
    this.mirror = h('div', { class: 'cmp-mirror', style: common + `color:${hand.color}`, dataset: { ph: placeholder } });
    this.pen = h('div', { class: 'cmp-pen', html: penSvg('ballpoint') });
    this.sendBtn = h('button', { class: 'cmp-send', type: 'button', title: '发送 (Enter)', html: '<span>问</span><svg viewBox="0 0 24 24"><path d="M3 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    this.el = h('div', { class: 'composer empty' }, this.mirror, this.ta, this.pen, this.sendBtn);

    this.ta.addEventListener('input', () => this.onInput());
    this.ta.addEventListener('compositionstart', () => { this.composing = { start: this.ta.selectionStart, end: this.ta.selectionStart }; });
    this.ta.addEventListener('compositionupdate', (e) => {
      const caret = this.ta.selectionStart;
      const len = (e as CompositionEvent).data?.length || 0;
      this.composing = { start: Math.max(0, caret - len), end: caret };
      this.schedule();
    });
    this.ta.addEventListener('compositionend', () => {
      if (this.composing) this.recent.push({ start: this.composing.start, end: this.ta.selectionStart, t: performance.now() });
      this.composing = null;
      this.prev = this.ta.value;
      this.schedule();
    });
    this.ta.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        this.send();
      } else if (e.key === 'Escape') {
        this.ta.blur();
        this.onEscape();
      }
    });
    this.ta.addEventListener('keyup', () => this.schedule());
    this.ta.addEventListener('click', () => this.schedule());
    this.ta.addEventListener('focus', () => { this.el.classList.add('focused'); this.schedule(); this.onFocus(); });
    this.ta.addEventListener('blur', () => this.el.classList.remove('focused'));
    this.sendBtn.addEventListener('click', () => this.send());
    for (const ev of ['pointerdown', 'wheel'] as const) {
      this.el.addEventListener(ev, (e) => { if (ev === 'pointerdown') e.stopPropagation(); }, { passive: true });
    }
    this.render();
  }

  private send() {
    const v = this.ta.value.trim();
    if (!v || this.busy) return;
    this.onSend(v);
  }

  focus() {
    this.ta.focus({ preventScroll: true });
  }

  setBusy(b: boolean) {
    this.busy = b;
    this.el.classList.toggle('busy', b);
  }

  clear() {
    this.ta.value = '';
    this.prev = '';
    this.recent = [];
    this.render();
  }

  get value() { return this.ta.value; }

  setPlaceholder(t: string) {
    this.mirror.dataset.ph = t;
    this.ta.setAttribute('aria-label', t);
  }

  private onInput() {
    const v = this.ta.value, p = this.prev;
    if (!this.composing) {
      let a = 0;
      while (a < p.length && a < v.length && p[a] === v[a]) a++;
      let b = 0;
      while (b < p.length - a && b < v.length - a && p[p.length - 1 - b] === v[v.length - 1 - b]) b++;
      const insEnd = v.length - b;
      const delta = v.length - p.length;
      // shift older animations that sit after the edit
      for (const r of this.recent) if (r.start >= a) { r.start += delta; r.end += delta; }
      if (insEnd > a) this.recent.push({ start: a, end: insEnd, t: performance.now() });
      this.prev = v;
    }
    this.schedule();
  }

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
  }

  private render() {
    const v = this.ta.value;
    const now = performance.now();
    this.recent = this.recent.filter((r) => now - r.t < 450 && r.end > r.start);
    const marks = new Array<string | null>(v.length + 1).fill(null);
    for (const r of this.recent) for (let i = r.start; i < r.end && i < v.length; i++) marks[i] = `-${Math.round(now - r.t)}ms`;
    let html = '';
    let i = 0;
    const caret = this.ta.selectionEnd;
    while (i < v.length) {
      if (i === caret) html += '<span class="cmp-caret"></span>';
      if (this.composing && i >= this.composing.start && i < this.composing.end) {
        let j = i;
        while (j < this.composing.end && j < v.length) j++;
        html += `<span class="cmp-composing">${esc(v.slice(i, j))}</span>`;
        i = j;
        continue;
      }
      if (marks[i]) {
        let j = i;
        while (j < v.length && marks[j] === marks[i] && !(this.composing && j >= this.composing.start && j < this.composing.end)) j++;
        // one span per character so each glyph inks in on its own
        for (let k = i; k < j; k++) html += v[k] === '\n' ? '\n' : `<span class="ink-new" style="animation-delay:${marks[i]}">${esc(v[k])}</span>`;
        i = j;
        continue;
      }
      let j = i;
      while (j < v.length && !marks[j] && j !== caret && !(this.composing && j >= this.composing.start && j < this.composing.end)) j++;
      html += esc(v.slice(i, j));
      i = j;
    }
    if (caret >= v.length) html += '<span class="cmp-caret"></span>';
    this.mirror.innerHTML = html + '​';
    this.el.classList.toggle('empty', !v);
    const hgt = Math.max(this.hand.line, this.mirror.offsetHeight);
    this.ta.style.height = hgt + 'px';
    const c = this.mirror.querySelector('.cmp-caret') as HTMLElement | null;
    if (c) this.pen.style.transform = `translate(${c.offsetLeft}px, ${c.offsetTop + this.hand.line * 0.72}px)`;
  }
}
