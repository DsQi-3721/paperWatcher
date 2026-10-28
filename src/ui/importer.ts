// Bringing a new paper to the desk: a small card (opened from the blank sheet on the desk, the corner button or the
// envelope while reading) with a link line and a "local PDF" button; or drag & drop a PDF anywhere, or ⌘V a link.
// While fetching, a pencil draws the progress line. (Papers read before are on the piles: clicking one fans them out.)
import { api } from '../api';
import type { PaperMeta } from '../types';
import { h, onPressOutside } from '../util/dom';
import { ICONS } from './icons';

export interface ImporterHost {
  open(meta: PaperMeta, via: 'url' | 'file' | 'library'): void;
  toast(msg: string, kind?: 'info' | 'error' | 'ok'): void;
  /** e-book files dropped on the window (they go on the textbook's shelf) */
  books?: (files: File[]) => void;
}

export class Importer {
  el: HTMLDivElement;
  private input: HTMLInputElement;
  private file: HTMLInputElement;
  private progress: HTMLDivElement;
  private status: HTMLDivElement;
  private busy = false;
  private ctl: AbortController | null = null;
  mode: 'hidden' | 'popover' = 'hidden';
  /** What opens the card (the envelope, the corner button, the blank sheet): pressing one toggles the card instead of
   *  counting as a press outside it. Elements, or selectors for things that are redrawn (the desk's sheet). */
  triggers: Array<Element | string> = [];
  private at: 'anchored' | 'corner' | 'top' | null = null;
  private offOutside: (() => void) | null = null;

  constructor(root: HTMLElement, private host: ImporterHost) {
    this.input = h('input', { class: 'imp-url', type: 'text', placeholder: 'arxiv.org/abs/1706.03762 · 论文链接 · arXiv 编号 · DOI', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    this.file = h('input', { type: 'file', accept: 'application/pdf,.pdf', style: 'display:none' }) as HTMLInputElement;
    const go = h('button', { class: 'imp-go stamp', type: 'button' }, '取来');
    const local = h('button', { class: 'imp-local', type: 'button', html: `${ICONS.folder}<span>打开本地 PDF…</span>` });
    this.progress = h('div', { class: 'imp-progress', html: `<svg viewBox="0 0 300 24" preserveAspectRatio="none"><path class="track" d="M4 14 C60 9, 120 17, 180 12 S 260 15, 296 11"/><path class="bar" pathLength="100" d="M4 14 C60 9, 120 17, 180 12 S 260 15, 296 11"/></svg><span class="pencil-tip">${ICONS.pencil}</span>` });
    this.status = h('div', { class: 'imp-status' });
    const close = h('button', { class: 'imp-close', type: 'button', html: ICONS.close, title: '收起' });
    close.addEventListener('click', () => this.hide());
    this.el = h('div', { class: 'importer' },
      h('div', { class: 'imp-card' },
        close,
        h('div', { class: 'imp-title' }, h('span', { class: 't-zh' }, '放一篇论文上桌')),
        h('div', { class: 'imp-row' }, this.input, go),
        h('div', { class: 'imp-or' }, local, h('span', { class: 'imp-drop' }, '也可以直接把 PDF 拖到桌上')),
        this.progress, this.status,
      ),
      this.file,
    );
    go.addEventListener('click', () => this.fetchUrl(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.fetchUrl(this.input.value);
      if (e.key === 'Escape') this.hide();
    });
    local.addEventListener('click', () => this.file.click());
    this.file.addEventListener('change', () => {
      const f = this.file.files?.[0];
      if (f) this.uploadFile(f);
      this.file.value = '';
    });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    root.append(this.el);
    this.installDrop();
  }

  /** The card open where `anchor` says, or put away if it is open there already (its button pressed again). */
  toggle(anchor: DOMRect | 'corner' | 'top') {
    if (this.mode === 'popover' && this.at === (anchor instanceof DOMRect ? 'anchored' : anchor)) this.hide();
    else void this.show(anchor);
  }

  /** Open the card: beside a rectangle on screen (the blank sheet on the desk), at the corner button, or under the
   *  envelope while reading. A press anywhere else, Esc or its ✕ puts it away. */
  async show(anchor: DOMRect | 'corner' | 'top' = 'top') {
    this.mode = 'popover';
    this.at = anchor instanceof DOMRect ? 'anchored' : anchor;
    this.el.className = 'importer on popover';
    const card = this.el.firstElementChild as HTMLElement;
    this.offOutside?.();
    this.offOutside = onPressOutside(card, (t) => this.triggers.some((x) => (typeof x === 'string' ? !!t.closest(x) : x.contains(t))), () => this.hide());
    card.style.transform = '';
    if (anchor instanceof DOMRect) {
      // beside the sheet: to its right if it fits, else its left; level with it, kept on screen
      requestAnimationFrame(() => {
        const w = card.offsetWidth || 420, hh = card.offsetHeight || 300, m = 18;
        let x = anchor.right + m;
        if (x + w > innerWidth - 10) x = anchor.left - m - w;
        x = Math.max(10, Math.min(innerWidth - w - 10, x));
        const y = Math.max(10, Math.min(innerHeight - hh - 10, anchor.top + anchor.height / 2 - hh / 2));
        card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      });
      this.el.classList.add('anchored');
    } else this.el.classList.add(anchor);
    this.setProgress(null);
    setTimeout(() => this.input.focus({ preventScroll: true }), 60);
  }

  get open() { return this.mode === 'popover'; }

  hide() {
    if (this.busy) return;
    this.mode = 'hidden';
    this.at = null;
    this.offOutside?.();
    this.offOutside = null;
    this.el.classList.remove('on');
  }

  private setProgress(frac: number | null, text = '') {
    this.el.classList.toggle('loading', frac !== null);
    const bar = this.progress.querySelector('.bar') as SVGPathElement;
    const tip = this.progress.querySelector('.pencil-tip') as HTMLElement;
    const f = Math.max(0, Math.min(1, frac ?? 0));
    bar.style.strokeDashoffset = String(100 - f * 100);
    tip.style.left = `calc(${(f * 100).toFixed(1)}% - 6px)`;
    this.status.textContent = text;
  }

  async fetchUrl(url: string) {
    url = url.trim();
    if (!url || this.busy) return;
    this.busy = true;
    this.ctl = new AbortController();
    this.setProgress(0.02, '看看这是什么链接…');
    let meta: PaperMeta | null = null;
    let err = '';
    try {
      await api.fetchPaper(url, (e) => {
        if (e.type === 'status') this.setProgress(0.05, e.text === 'Downloading PDF…' ? '正在取 PDF…' : e.text);
        else if (e.type === 'progress') {
          const mb = (n: number) => (n / 1048576).toFixed(1) + ' MB';
          this.setProgress(e.total ? 0.08 + 0.9 * (e.loaded / e.total) : 0.5, `正在取 PDF · ${mb(e.loaded)}${e.total ? ' / ' + mb(e.total) : ''}`);
        } else if (e.type === 'done') meta = e.meta;
        else if (e.type === 'error') err = e.message;
      }, this.ctl.signal);
    } catch (e: any) {
      err = e?.message || String(e);
    }
    this.busy = false;
    if (meta) {
      this.setProgress(1, '取到了！');
      this.input.value = '';
      setTimeout(() => { this.hide(); this.host.open(meta!, 'url'); }, 260);
    } else {
      this.setProgress(null);
      this.status.textContent = '';
      this.host.toast('没取到：' + (err || '未知错误'), 'error');
    }
  }

  async uploadFile(f: File) {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { this.host.toast('这不是 PDF 文件', 'error'); return; }
    if (this.busy) return;
    this.busy = true;
    this.setProgress(0.4, `正在放上桌 · ${f.name}`);
    try {
      const meta = await api.upload(f, f.name);
      this.busy = false;
      this.setProgress(1, '');
      this.hide();
      this.host.open(meta, 'file');
    } catch (e: any) {
      this.busy = false;
      this.setProgress(null);
      this.host.toast('打不开这个文件：' + (e?.message || e), 'error');
    }
  }

  private installDrop() {
    const overlay = h('div', { class: 'drop-overlay' }, h('div', { class: 'drop-note' }, '松手，把它放到桌上'));
    document.body.append(overlay);
    let depth = 0;
    const isFile = (e: DragEvent) => [...(e.dataTransfer?.types || [])].includes('Files');
    window.addEventListener('dragenter', (e) => { if (!isFile(e)) return; depth++; overlay.classList.add('on'); e.preventDefault(); });
    window.addEventListener('dragover', (e) => { if (isFile(e)) e.preventDefault(); });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) overlay.classList.remove('on'); });
    window.addEventListener('drop', (e) => {
      depth = 0;
      overlay.classList.remove('on');
      if (!isFile(e)) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])];
      // e-books (novels, comics…) go on the textbook's shelf; a PDF is a paper for the desk
      const books = files.filter((x) => /\.(epub|mobi|azw3?|txt|cbz|fb2|html?|md|markdown)$/i.test(x.name));
      if (books.length && this.host.books) { this.host.books(books); return; }
      const f = files.find((x) => /\.pdf$/i.test(x.name) || x.type === 'application/pdf');
      if (f) this.uploadFile(f);
      else this.host.toast('论文请放 PDF；小说、漫画、杂志可以放 EPUB、MOBI、TXT、CBZ 等', 'error');
    });
    window.addEventListener('paste', (e) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const f = [...(e.clipboardData?.files || [])].find((x) => /\.pdf$/i.test(x.name));
      if (f) { e.preventDefault(); this.uploadFile(f); return; }
      const text = e.clipboardData?.getData('text/plain')?.trim() || '';
      if (/^(https?:\/\/|arxiv:|\d{4}\.\d{4,5}|10\.\d{4,9}\/)/i.test(text) && text.length < 500) {
        e.preventDefault();
        if (this.mode === 'hidden') void this.show(document.body.classList.contains('no-paper') ? 'corner' : 'top');
        this.input.value = text;
        this.fetchUrl(text);
      }
    });
  }
}
