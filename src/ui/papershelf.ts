// The shelf of papers, while reading: every paper brought to the desk, on a card under the little pile of papers in
// the top left. Find one by its title, authors or arXiv number, sort them, and read it instead of this one without
// going back to the desk. Rows are made as the list is scrolled (a big library costs no more to open than a small
// one) and first pages load only when their row comes into view.
import type { PaperMeta } from '../types';
import { h, onPressOutside } from '../util/dom';
import { ICONS } from './icons';

type Sort = 'recent' | 'added' | 'title';
const SORTS: Array<[Sort, string]> = [['recent', '最近读的'], ['added', '新放上的'], ['title', '按标题']];
/** rows made at a time; more when the end of the list comes into view */
const BATCH = 40;
const TITLES = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

/** When, in words: 刚刚 · 5 分钟前 · 3 小时前 · 昨天 · 4 天前 · 10月3日 · 2025年5月2日. */
function ago(t: number, now = Date.now()) {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const d = new Date(t), n = new Date(now);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000);
  if (days <= 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return d.getFullYear() === n.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export class PaperShelf {
  el: HTMLDivElement;
  /** a paper was picked (not the one open) */
  onPick: (m: PaperMeta) => void = () => {};
  /** the ＋ at the bottom: bring a new paper */
  onImport: () => void = () => {};
  /** what opens the card (its pile of papers): pressing it toggles the card, it is not a press outside */
  trigger: Element | null = null;
  private list: HTMLDivElement;
  private count: HTMLSpanElement;
  private search: HTMLInputElement;
  private sortBs = new Map<Sort, HTMLButtonElement>();
  private more: HTMLDivElement;
  private io: IntersectionObserver;
  private papers: PaperMeta[] = [];
  private words = new Map<string, string>();
  private shown: PaperMeta[] = [];
  private made = 0;
  private sel = -1;
  private sort: Sort = 'recent';
  private current: string | null = null;
  private sig = '';
  private offOutside: (() => void) | null = null;

  constructor(root: HTMLElement, private thumb: (m: PaperMeta) => string | undefined) {
    const close = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起 (Esc)' });
    close.addEventListener('click', () => this.hide());
    this.count = h('span', { class: 'ps-count' });
    this.search = h('input', { class: 'ps-search', type: 'search', placeholder: '找一篇：标题、作者或 arXiv 编号', spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    this.search.addEventListener('input', () => { this.sel = -1; this.render(); });
    this.search.addEventListener('keydown', (e) => this.key(e));
    const sorts = h('div', { class: 'ps-sorts', role: 'group', 'aria-label': '排序' }, h('span', { class: 'ps-sort-l' }, '排序'), ...SORTS.map(([k, label]) => {
      const b = h('button', { class: 'ps-sort', type: 'button', 'aria-pressed': String(k === this.sort) }, label) as HTMLButtonElement;
      b.addEventListener('click', () => { if (k === this.sort) return; this.sort = k; for (const [kk, bb] of this.sortBs) bb.setAttribute('aria-pressed', String(kk === k)); this.sel = -1; this.render(); this.list.scrollTop = 0; });
      this.sortBs.set(k, b);
      return b;
    }));
    this.list = h('div', { class: 'ps-list', role: 'listbox', 'aria-label': '论文' });
    this.more = h('div', { class: 'ps-more' });
    const add = h('button', { class: 'ps-add', type: 'button', html: `${ICONS.plus}<span>放一篇新论文</span>` });
    add.addEventListener('click', () => { this.hide(); this.onImport(); });
    this.el = h('div', { class: 'card shelf', role: 'dialog', 'aria-label': '书架' },
      close,
      h('div', { class: 'card-title' }, '书架', this.count),
      this.search,
      sorts,
      this.list,
      h('div', { class: 'ps-foot' }, add),
    );
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    // the next rows once the end of the list comes into view (watched only while the card is open)
    this.io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) this.grow(); }, { root: this.list, rootMargin: '300px 0px' });
    root.append(this.el);
  }

  get open() { return this.el.classList.contains('on'); }

  /** Open on these papers (`current`: the one being read). */
  show(papers: PaperMeta[], current: string | null) {
    this.current = current;
    this.search.value = '';
    this.sel = -1;
    this.set(papers, true);
    this.el.classList.add('on');
    this.list.scrollTop = 0;
    this.offOutside?.();
    this.offOutside = onPressOutside(this.el, (t) => !!this.trigger?.contains(t), () => this.hide());
    setTimeout(() => { if (this.open) this.search.focus({ preventScroll: true }); }, 60);
  }

  /** A fresher list from the server, while open: redrawn only if something on it changed. */
  update(papers: PaperMeta[]) {
    if (!this.open) return;
    const top = this.list.scrollTop;
    if (this.set(papers)) this.list.scrollTop = top;
  }

  hide() {
    if (!this.open) return;
    this.el.classList.remove('on');
    this.io.disconnect();
    this.offOutside?.();
    this.offOutside = null;
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  /** Take a list; false if it is the one shown already (`fresh`: draw it anyway, from the top). */
  private set(papers: PaperMeta[], fresh = false) {
    const sig = papers.map((m) => `${m.id}:${m.openedAt ?? ''}:${m.thumb ?? ''}:${m.notes ?? ''}:${m.pages ?? ''}:${m.title}`).join('|');
    if (sig === this.sig && !fresh) return false;
    this.sig = sig;
    this.papers = papers;
    this.words = new Map(papers.map((m) => [m.id, [m.title, ...(m.authors || []), m.arxivId || '', m.fileName || ''].join(' ').toLowerCase()]));
    this.count.textContent = papers.length ? ` · ${papers.length} 篇` : '';
    this.render();
    return true;
  }

  private render() {
    const q = this.search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const recent = (m: PaperMeta) => m.openedAt || m.addedAt || 0;
    const list = q.length ? this.papers.filter((m) => { const w = this.words.get(m.id) || ''; return q.every((x) => w.includes(x)); }) : this.papers.slice();
    if (this.sort === 'recent') list.sort((a, b) => recent(b) - recent(a));
    else if (this.sort === 'added') list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    else list.sort((a, b) => TITLES.compare(a.title, b.title));
    this.shown = list;
    this.made = 0;
    this.io.disconnect();
    this.list.replaceChildren();
    if (!list.length) {
      this.list.append(h('div', { class: 'ps-empty' }, this.papers.length ? '没有找到这样的论文。' : '桌上还没有论文。'));
      return;
    }
    this.grow();
  }

  /** The next rows. */
  private grow() {
    const end = Math.min(this.shown.length, this.made + BATCH);
    if (end <= this.made) return;
    const rows: HTMLElement[] = [];
    for (let i = this.made; i < end; i++) rows.push(this.row(this.shown[i], i));
    this.made = end;
    this.more.remove();
    this.list.append(...rows);
    if (this.made < this.shown.length) {
      this.list.append(this.more);
      this.io.observe(this.more);
    } else this.io.disconnect();
  }

  private row(m: PaperMeta, i: number) {
    const here = m.id === this.current, url = this.thumb(m);
    const pic = url
      ? h('img', { class: 'ps-pic', src: url, alt: '', loading: 'lazy', decoding: 'async', draggable: false })
      : h('span', { class: 'ps-pic blank' });
    const who = (m.authors || []).slice(0, 3).join(', ') + ((m.authors?.length || 0) > 3 ? ' 等' : '');
    const facts = [m.pages ? `${m.pages} 页` : '', m.notes ? `${m.notes} 条笔记` : '', m.openedAt ? `读于 ${ago(m.openedAt)}` : `放上 ${ago(m.addedAt)}`].filter(Boolean).join(' · ');
    const el = h('button', { class: `ps-row${here ? ' here' : ''}${i === this.sel ? ' sel' : ''}`, type: 'button', role: 'option', 'aria-current': here ? 'true' : undefined, 'data-i': String(i), title: m.title },
      pic,
      h('span', { class: 'ps-t' }, m.title || m.fileName || '无题'),
      who ? h('span', { class: 'ps-a' }, who) : null,
      h('span', { class: 'ps-m' }, facts, here ? h('span', { class: 'ps-here' }, '正在读') : null),
    );
    el.addEventListener('click', () => this.pick(m));
    return el;
  }

  private pick(m: PaperMeta) {
    this.hide();
    if (m.id !== this.current) this.onPick(m);
  }

  /** In the search box: ↑ ↓ choose, Enter reads it (the first one if none is chosen), Esc closes. */
  private key(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = this.shown[Math.max(0, this.sel)];
      if (m) this.pick(m);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!this.shown.length) return;
    this.sel = Math.max(0, Math.min(this.shown.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1)));
    while (this.sel >= this.made) this.grow();
    for (const r of this.list.querySelectorAll('.ps-row.sel')) r.classList.remove('sel');
    const row = this.list.querySelector(`.ps-row[data-i="${this.sel}"]`);
    row?.classList.add('sel');
    row?.scrollIntoView({ block: 'nearest' });
  }
}
