// The library on a card: every paper (or book) on the desk, to find one, sort them out and read another without going
// back to the desk. Opened from the little pile of papers while reading (L), from the book reader's 书架, or from a
// fan's 整理 on the desk.
//   - On the left, the groups the library falls into by itself (read or not, notes, tags, field, topics, years,
//     authors; for books how far read, kind, language, authors: src/library/facets.ts). Pick one to see only those.
//   - A search over titles, authors, tags, arXiv numbers…; for papers also through their text (在正文里找).
//   - Each row: its first page or cover, title, authors, what is known; its tags (click one to see those); 标签 to
//     label it, 扔 to throw it away (pressed twice). The one being read can't be thrown away from here.
//   - 多选: tick several, then label, unlabel or throw them away together.
//   - 垃圾桶: what was thrown away. Put it back as it was (notes, place, tags), or clear its files now (they go by
//     themselves after 30 days); a cleared one keeps its record, to bring it back by importing it again.
// Rows are made as the list scrolls and pictures load when their row comes near, so a big library opens as fast as a
// small one.
import type { LibKind } from '../api';
import { findGroup, matches, tagCounts, type Group, type Section } from '../library/facets';
import { h, onPressOutside, twice } from '../util/dom';
import { ICONS } from './icons';
import { tagChip, type TagEditor } from './tagedit';

export interface LibraryConfig<T> {
  kind: LibKind;
  /** what the card says: 论文书架 / 书架; the things in it (论文 / 读物) and how they are counted (篇 / 本) */
  title: string;
  noun: string;
  unit: string;
  id(m: T): string;
  name(m: T): string;
  who(m: T): string;
  facts(m: T, now: number): string;
  pic(m: T): string | undefined;
  /** the picture's width / height */
  aspect: number;
  badge?(m: T): string | undefined;
  /** a little bar: how far read (books) */
  progress?(m: T): number | undefined;
  words(m: T): string;
  tags(m: T): string[];
  sections(list: T[], now: number): Array<Section<T>>;
  sorts: Array<[string, string, (a: T, b: T) => number]>;
  /** tags worth adding to this one */
  suggest?(m: T): string[];
  importLabel: string;
  /** through the papers' own text */
  fullText?(q: string): Promise<Array<{ id: string; snippet: string; hits: number }>>;
  /** sort the library some more by itself (papers: arXiv's fields and years) */
  enrich?: { label: string; title: string; run(): Promise<string> };
}

export interface LibraryHost<T> {
  /** the list as last known */
  list(): T[];
  /** a fresh one from the server */
  refresh(): Promise<T[]>;
  /** the one being read, if any */
  current(): string | null;
  pick(m: T): void;
  setTags(ids: string[], op: 'tag' | 'untag', tags: string[]): Promise<void>;
  trash(items: T[]): Promise<void>;
  bin(): Promise<T[]>;
  binPic(m: T): string | undefined;
  restore(m: T): Promise<void>;
  purge(m: T): Promise<void>;
  forget(m: T): Promise<void>;
  emptyBin(): Promise<number>;
  /** bring a cleared one back: download it again, or ask for the file */
  reimport(m: T): void;
  importNew(): void;
}

type Trashed<T> = T & { trashedAt?: number; purgedAt?: number };
const BATCH = 40;
const DAY = 86_400_000;
const KEEP_DAYS = 30;

/** When, in words: 刚刚 · 5 分钟前 · 3 小时前 · 昨天 · 4 天前 · 10月3日 · 2025年5月2日. */
export function ago(t: number, now = Date.now()) {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} 小时前`;
  const d = new Date(t), n = new Date(now);
  const days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY);
  if (days <= 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return d.getFullYear() === n.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export class LibraryCard<T> {
  el: HTMLDivElement;
  /** what opens the card (pressing one toggles the card, it is not a press outside): elements, or selectors for things
   *  made later (a fan's buttons, the book reader's 书架) */
  triggers: Array<Element | string> = [];
  private count: HTMLSpanElement;
  private search: HTMLInputElement;
  private textBtn: HTMLButtonElement | null = null;
  private side: HTMLDivElement;
  private list: HTMLDivElement;
  private bar: HTMLDivElement;
  private filterChip: HTMLSpanElement;
  private sortBs = new Map<string, HTMLButtonElement>();
  private selBtn: HTMLButtonElement;
  private foot: HTMLDivElement;
  private batchBar: HTMLDivElement;
  private binBtn: HTMLButtonElement;
  private body: HTMLDivElement;
  private binView: HTMLDivElement;
  private more: HTMLDivElement;
  private io: IntersectionObserver;
  private items: T[] = [];
  private words = new Map<string, string>();
  private sections: Array<Section<T>> = [];
  private group = 'all';
  private sort: string;
  private shown: T[] = [];
  private made = 0;
  private sel = -1;
  private selecting = false;
  private picked = new Set<string>();
  private lastTick = -1;
  /** a search through the text: the ids found, with a line round the first match */
  private textHits: Map<string, { snippet: string; hits: number }> | null = null;
  private textQ = '';
  private binList: Array<Trashed<T>> = [];
  private view: 'list' | 'bin' = 'list';
  private sig = '';
  private offOutside: (() => void) | null = null;
  /** a fresher list that came while a button was half pressed (it waits, so the button is not pulled away) */
  private waiting: T[] | null = null;
  private waitT: ReturnType<typeof setTimeout> | undefined;

  constructor(root: HTMLElement, private cfg: LibraryConfig<T>, private host: LibraryHost<T>, private tagEditor: TagEditor) {
    this.sort = cfg.sorts[0][0];
    const close = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起 (Esc)' });
    close.addEventListener('click', () => this.hide());
    this.count = h('span', { class: 'lib-count' });
    this.search = h('input', { class: 'lib-search', type: 'search', placeholder: `找${cfg.noun}：标题、作者、#标签${cfg.kind === 'papers' ? '、arXiv 编号、年份' : '、格式'}`, spellcheck: false, autocomplete: 'off' }) as HTMLInputElement;
    this.search.addEventListener('input', () => { this.sel = -1; this.clearText(false); this.render(); });
    this.search.addEventListener('keydown', (e) => this.key(e));
    const searchRow = h('div', { class: 'lib-searchrow' }, this.search);
    if (cfg.fullText) {
      this.textBtn = h('button', { class: 'lib-textbtn', type: 'button', title: '在每篇论文的正文里找这些词（慢一点）' }, '在正文里找') as HTMLButtonElement;
      this.textBtn.addEventListener('click', () => void this.findInText());
      searchRow.append(this.textBtn);
    }
    this.side = h('div', { class: 'lib-side', role: 'tree', 'aria-label': '分组' });
    this.filterChip = h('span', { class: 'lib-filter' });
    const sorts = h('span', { class: 'lib-sorts' }, ...cfg.sorts.map(([k, label]) => {
      const b = h('button', { class: 'lib-sort', type: 'button', 'aria-pressed': String(k === this.sort) }, label) as HTMLButtonElement;
      b.addEventListener('click', () => { if (k === this.sort) return; this.sort = k; for (const [kk, bb] of this.sortBs) bb.setAttribute('aria-pressed', String(kk === k)); this.render(); this.list.scrollTop = 0; });
      this.sortBs.set(k, b);
      return b;
    }));
    this.selBtn = h('button', { class: 'lib-selbtn', type: 'button', title: '勾选几篇一起贴标签或扔掉', 'aria-pressed': 'false' }, '多选') as HTMLButtonElement;
    this.selBtn.addEventListener('click', () => this.setSelecting(!this.selecting));
    this.bar = h('div', { class: 'lib-bar' }, this.filterChip, sorts, this.selBtn);
    this.list = h('div', { class: 'lib-list', role: 'listbox', 'aria-label': cfg.noun });
    this.more = h('div', { class: 'lib-more' });
    this.io = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) this.grow(); }, { root: this.list, rootMargin: '300px 0px' });
    this.body = h('div', { class: 'lib-body' }, this.side, h('div', { class: 'lib-main' }, this.bar, this.list));
    // the bottom: bring a new one, sort the library some more, the bin
    const add = h('button', { class: 'lib-btn add', type: 'button', html: `${ICONS.plus}<span>${cfg.importLabel}</span>` });
    add.addEventListener('click', () => { this.hide(); host.importNew(); });
    this.binBtn = h('button', { class: 'lib-btn bin', type: 'button', title: '扔掉的都在这里：放回去，或找回来重新导入', html: `${ICONS.trash}<span>垃圾桶</span>` }) as HTMLButtonElement;
    this.binBtn.addEventListener('click', () => void this.showBin());
    const footKids: HTMLElement[] = [add];
    if (cfg.enrich) {
      const en = h('button', { class: 'lib-btn enrich', type: 'button', title: cfg.enrich.title, html: `${ICONS.sparkle}<span>${cfg.enrich.label}</span>` }) as HTMLButtonElement;
      en.addEventListener('click', async () => {
        en.disabled = true;
        const span = en.querySelector('span')!;
        span.textContent = '正在整理…';
        try { span.textContent = await cfg.enrich!.run(); await this.reload(); }
        catch (e) { span.textContent = '没整理成：' + ((e as Error).message || e); }
        finally { setTimeout(() => { en.disabled = false; span.textContent = cfg.enrich!.label; }, 4000); }
      });
      footKids.push(en);
    }
    this.foot = h('div', { class: 'lib-foot' }, ...footKids, h('span', { class: 'lib-sp' }), this.binBtn);
    this.batchBar = h('div', { class: 'lib-foot lib-batch' });
    this.binView = h('div', { class: 'lib-binview' });
    this.el = h('div', { class: `card library ${cfg.kind}`, role: 'dialog', 'aria-label': cfg.title },
      close,
      h('div', { class: 'card-title' }, cfg.title, this.count),
      searchRow,
      this.body,
      this.binView,
      this.foot,
      this.batchBar,
    );
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    root.append(this.el);
  }

  get open() { return this.el.classList.contains('on'); }
  /** showing the bin (not the list) */
  get inBin() { return this.view === 'bin'; }

  /** Open on the list as known (`bin`: straight into the bin); a fresher one follows if anything changed. */
  show(opts: { bin?: boolean; group?: string } = {}) {
    this.search.value = '';
    this.sel = -1;
    this.clearText(false);
    this.setSelecting(false);
    if (opts.group) this.group = opts.group;
    this.set(this.host.list(), true);
    this.view = 'list';
    this.el.classList.remove('in-bin');
    this.el.classList.add('on');
    this.list.scrollTop = 0;
    this.offOutside?.();
    this.offOutside = onPressOutside(this.el, (t) => this.triggers.some((x) => (typeof x === 'string' ? !!t.closest(x) : x.contains(t))) || this.tagEditor.el.contains(t) || !!t.closest('.toast'), () => this.hide());
    removeEventListener('keydown', this.esc, true);
    addEventListener('keydown', this.esc, true);
    void this.host.refresh().then((l) => { if (this.open) this.set(l); }).catch(() => {});
    void this.countBin();
    if (opts.bin) void this.showBin();
    else setTimeout(() => { if (this.open && this.view === 'list') this.search.focus({ preventScroll: true }); }, 60);
  }

  /** Esc: the tag card first, then a search, then the card (before the page or a book sees the key). */
  private esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !this.open) return;
    e.stopPropagation();
    e.preventDefault();
    if (this.tagEditor.open) this.tagEditor.close();
    else if (this.view === 'list' && (this.search.value || this.textHits)) { this.search.value = ''; this.clearText(false); this.render(); }
    else if (this.view === 'bin') { this.view = 'list'; this.el.classList.remove('in-bin'); this.render(); }
    else this.hide();
  };

  hide() {
    if (!this.open) return;
    removeEventListener('keydown', this.esc, true);
    this.el.classList.remove('on');
    this.io.disconnect();
    this.tagEditor.close();
    this.offOutside?.();
    this.offOutside = null;
    if (this.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  /** The list changed (something labelled, thrown away, imported): drawn again where it was. */
  update(list?: T[]) {
    if (!this.open) return;
    const top = this.list.scrollTop;
    if (this.set(list ?? this.host.list())) this.list.scrollTop = top;
    void this.countBin();
    if (this.view === 'bin' && !this.binView.querySelector('.twice.armed:not(:disabled)')) void this.showBin();
  }

  private async reload() { this.update(await this.host.refresh()); }

  /** Take a list; false if it is the one shown already (`fresh`: draw it anyway). */
  private set(list: T[], fresh = false) {
    const c = this.cfg;
    // a button pressed once (扔 / 扔掉 N 篇) waiting for its second press: the list is redrawn after, not under it
    if (!fresh && this.body.querySelector('.twice.armed:not(:disabled)') || !fresh && this.batchBar.querySelector('.twice.armed:not(:disabled)')) {
      this.waiting = list;
      clearTimeout(this.waitT);
      this.waitT = setTimeout(() => { const l = this.waiting; this.waiting = null; if (l && this.open) { const top = this.list.scrollTop; if (this.set(l)) this.list.scrollTop = top; } }, 3700);
      return false;
    }
    this.waiting = null;
    const sig = list.map((m) => `${c.id(m)}:${c.tags(m).join(',')}:${c.facts(m, 0)}:${c.name(m)}:${c.pic(m) ?? ''}`).join('|');
    if (sig === this.sig && !fresh) return false;
    this.sig = sig;
    this.items = list;
    this.words = new Map(list.map((m) => [c.id(m), c.words(m)]));
    this.sections = c.sections(list, Date.now());
    if (!findGroup(this.sections, this.group)) this.group = 'all';
    for (const id of [...this.picked]) if (!this.words.has(id)) this.picked.delete(id);
    this.count.textContent = list.length ? ` · ${list.length} ${c.unit}` : '';
    this.drawSide();
    this.render();
    return true;
  }

  /* ---------- the groups ---------- */
  private drawSide() {
    const kids: HTMLElement[] = [];
    for (const s of this.sections) {
      kids.push(h('div', { class: 'lib-sec' }, s.title));
      for (const g of s.groups) {
        const b = h('button', { class: 'lib-grp' + (g.key === this.group ? ' on' : '') + (s.key === 'tag' && g.key !== 'tag:-' ? ' tag' : ''), type: 'button', role: 'treeitem', 'aria-selected': String(g.key === this.group), title: g.label },
          h('span', { class: 'lib-gl' }, g.label), h('span', { class: 'lib-gn' }, String(g.n)));
        b.addEventListener('click', () => this.setGroup(g.key === this.group && g.key !== 'all' ? 'all' : g.key));
        kids.push(b);
      }
    }
    this.side.replaceChildren(...kids);
  }
  private setGroup(key: string) {
    this.group = key;
    this.sel = -1;
    for (const b of this.side.querySelectorAll('.lib-grp')) b.classList.remove('on');
    this.drawSide();
    this.render();
    this.list.scrollTop = 0;
  }

  /* ---------- the list ---------- */
  private render() {
    const c = this.cfg, g = findGroup(this.sections, this.group) as Group<T> | null;
    const q = this.search.value.trim();
    let list = this.items.filter((m) => (!g || g.test(m)) && (this.textHits ? this.textHits.has(c.id(m)) : !q || matches(this.words.get(c.id(m)) || '', q)));
    const cmp = c.sorts.find(([k]) => k === this.sort)?.[2] ?? c.sorts[0][2];
    list = this.textHits ? list.sort((a, b) => this.textHits!.get(c.id(b))!.hits - this.textHits!.get(c.id(a))!.hits) : list.sort(cmp);
    this.shown = list;
    this.made = 0;
    this.lastTick = -1;
    this.io.disconnect();
    this.list.replaceChildren();
    // what is being looked at: a group, a search, a search through the text
    const label = this.textHits ? `正文里有「${this.textQ}」：${list.length} ${c.unit}` : g && g.key !== 'all' ? `${g.label} · ${list.length} ${c.unit}` : q ? `找到 ${list.length} ${c.unit}` : '';
    this.filterChip.replaceChildren(...(label ? [h('span', {}, label), (() => {
      const x = h('button', { class: 'lib-fx', type: 'button', title: '看全部', html: ICONS.close });
      x.addEventListener('click', () => { this.clearText(false); this.search.value = ''; this.setGroup('all'); });
      return x;
    })()] : []));
    if (this.textBtn) this.textBtn.hidden = !q || !!this.textHits;
    if (!list.length) {
      const msg = !this.items.length ? `桌上还没有${c.noun}。` : this.textHits ? `没有哪篇的正文里同时有这些词。` : `没有找到这样的${c.noun}。`;
      this.list.append(h('div', { class: 'lib-empty' }, msg));
      this.drawBatch();
      return;
    }
    this.grow();
    this.drawBatch();
  }

  private grow() {
    const end = Math.min(this.shown.length, this.made + BATCH);
    if (end <= this.made) return;
    const rows: HTMLElement[] = [];
    const now = Date.now();
    for (let i = this.made; i < end; i++) rows.push(this.row(this.shown[i], i, now));
    this.made = end;
    this.more.remove();
    this.list.append(...rows);
    if (this.made < this.shown.length) { this.list.append(this.more); this.io.observe(this.more); }
    else this.io.disconnect();
  }

  private pic(url: string | undefined, badge?: string, progress?: number) {
    const style = `--ar:${this.cfg.aspect}`;
    const box = h('span', { class: 'lib-pic', style },
      url ? h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', draggable: false }) : h('span', { class: 'lib-blank' }));
    if (badge) box.append(h('span', { class: 'lib-badge' }, badge));
    if (progress != null) box.append(h('span', { class: 'lib-prog', style: `--p:${Math.max(0, Math.min(1, progress)).toFixed(3)}` }));
    return box;
  }

  private row(m: T, i: number, now: number) {
    const c = this.cfg, id = c.id(m), here = id === this.host.current();
    const tags = c.tags(m), hit = this.textHits?.get(id);
    const el = h('div', {
      class: `lib-row${here ? ' here' : ''}${i === this.sel ? ' sel' : ''}${this.picked.has(id) ? ' picked' : ''}`,
      role: 'option', tabindex: '-1', 'data-i': String(i), 'aria-current': here ? 'true' : undefined, title: c.name(m),
    });
    if (this.selecting) {
      const box = h('span', { class: 'lib-tick', 'aria-hidden': 'true' });
      el.append(box);
    }
    el.append(this.pic(c.pic(m), c.badge?.(m), c.progress?.(m)));
    const text = h('span', { class: 'lib-text' },
      h('span', { class: 'lib-t' }, c.name(m)),
      c.who(m) ? h('span', { class: 'lib-a' }, c.who(m)) : null,
      h('span', { class: 'lib-m' }, c.facts(m, now), here ? h('span', { class: 'lib-here' }, '正在读') : null),
      hit ? h('span', { class: 'lib-snip' }, '…' + hit.snippet + '…', hit.hits > 1 ? h('span', { class: 'lib-hits' }, ` ${hit.hits} 处`) : null) : null,
    );
    if (tags.length) {
      const tg = h('span', { class: 'lib-tags' }, ...tags.map((t) => {
        const chip = tagChip(t);
        chip.title = `只看 #${t}`;
        chip.addEventListener('click', (e) => { e.stopPropagation(); this.setGroup('tag:' + t.toLowerCase()); });
        return chip;
      }));
      text.append(tg);
    }
    el.append(text);
    // its own buttons: label it, throw it away (not the one being read)
    const acts = h('span', { class: 'lib-acts' });
    const tagB = h('button', { class: 'lib-act', type: 'button', title: '贴标签', html: `${ICONS.tag}<span>标签</span>` });
    tagB.addEventListener('click', (e) => { e.stopPropagation(); this.editTags([m], tagB); });
    acts.append(tagB);
    if (!here) acts.append(twice('扔', '确定扔掉？', () => this.host.trash([m]), { cls: 'lib-act danger', title: `扔进垃圾桶（按两下）：${c.name(m)}`, html: `${ICONS.trash}<span>扔</span>` }));
    el.append(acts);
    el.addEventListener('click', (e) => {
      if (this.selecting) { this.tick(id, i, e.shiftKey); return; }
      if (here) { this.hide(); return; }
      this.hide();
      this.host.pick(m);
    });
    return el;
  }

  /* ---------- several at once ---------- */
  private setSelecting(on: boolean) {
    this.selecting = on;
    this.selBtn.setAttribute('aria-pressed', String(on));
    this.selBtn.textContent = on ? '完成' : '多选';
    this.el.classList.toggle('selecting', on);
    if (!on) this.picked.clear();
    if (this.items.length) this.render();
  }
  private tick(id: string, i: number, range: boolean) {
    const ids = range && this.lastTick >= 0 ? this.shown.slice(Math.min(i, this.lastTick), Math.max(i, this.lastTick) + 1).map((m) => this.cfg.id(m)) : [id];
    const on = !this.picked.has(id);
    for (const x of ids) { if (on) this.picked.add(x); else this.picked.delete(x); }
    this.lastTick = i;
    for (const r of this.list.querySelectorAll<HTMLElement>('.lib-row')) {
      const m = this.shown[+r.dataset.i!];
      if (m) r.classList.toggle('picked', this.picked.has(this.cfg.id(m)));
    }
    this.drawBatch();
  }
  private drawBatch() {
    this.el.classList.toggle('batching', this.selecting);
    if (!this.selecting) { this.batchBar.replaceChildren(); return; }
    const c = this.cfg, cur = this.host.current();
    const chosen = this.items.filter((m) => this.picked.has(c.id(m)));
    const n = chosen.length;
    const all = h('button', { class: 'lib-btn', type: 'button' }, n === this.shown.length && n ? '全不选' : '全选这些');
    all.addEventListener('click', () => {
      if (n === this.shown.length && n) this.picked.clear(); else for (const m of this.shown) this.picked.add(c.id(m));
      this.render();
    });
    const tagB = h('button', { class: 'lib-btn', type: 'button', html: `${ICONS.tag}<span>贴标签</span>` }) as HTMLButtonElement;
    tagB.disabled = !n;
    tagB.addEventListener('click', () => this.editTags(chosen, tagB));
    const untagB = h('button', { class: 'lib-btn', type: 'button' }, '撕标签') as HTMLButtonElement;
    untagB.disabled = !chosen.some((m) => c.tags(m).length);
    untagB.addEventListener('click', () => this.editTags(chosen, untagB, true));
    const throwable = chosen.filter((m) => c.id(m) !== cur);
    const trashB = twice(`扔掉 ${throwable.length} ${c.unit}`, `确定扔掉这 ${throwable.length} ${c.unit}？`, async () => {
      await this.host.trash(throwable);
      this.picked.clear();
    }, { cls: 'lib-btn danger', title: '扔进垃圾桶（按两下）' + (throwable.length < n ? '；正在读的那篇不会扔' : '') });
    trashB.disabled = !throwable.length;
    this.batchBar.replaceChildren(h('span', { class: 'lib-bn' }, n ? `选了 ${n} ${c.unit}` : '点选，Shift 连选'), all, tagB, untagB, h('span', { class: 'lib-sp' }), trashB);
  }

  /** The tag card for one or several. */
  private editTags(list: T[], anchor: HTMLElement, removeOnly = false) {
    const c = this.cfg, ids = list.map((m) => c.id(m));
    if (!ids.length) return;
    const one = list.length === 1 ? list[0] : null;
    const common = one ? c.tags(one) : (c.tags(list[0]) || []).filter((t) => list.every((m) => c.tags(m).some((x) => x.toLowerCase() === t.toLowerCase())));
    const any = [...new Map(list.flatMap((m) => c.tags(m)).map((t) => [t.toLowerCase(), t])).values()];
    this.tagEditor.show(anchor.getBoundingClientRect(), {
      title: removeOnly ? `从选中的 ${list.length} ${c.unit}撕标签` : one ? `标签 · ${c.name(one)}` : `给 ${list.length} ${c.unit}贴标签`,
      current: removeOnly ? [] : common,
      removable: any,
      removeOnly,
      known: tagCounts(this.items, (m) => c.tags(m)),
      suggest: one ? c.suggest?.(one) : undefined,
      add: (t) => this.host.setTags(ids, 'tag', [t]),
      remove: (t) => this.host.setTags(ids, 'untag', [t]),
    }, anchor);
  }

  /* ---------- through the text (papers) ---------- */
  private async findInText() {
    const q = this.search.value.trim();
    if (!q || !this.cfg.fullText || !this.textBtn) return;
    this.textBtn.disabled = true;
    this.textBtn.textContent = '在找…';
    try {
      const hits = await this.cfg.fullText(q);
      this.textHits = new Map(hits.map((x) => [x.id, x]));
      this.textQ = q;
      this.render();
    } catch { this.textBtn.textContent = '没找成'; }
    finally { if (this.textBtn) { this.textBtn.disabled = false; if (this.textBtn.textContent === '在找…') this.textBtn.textContent = '在正文里找'; } }
  }
  private clearText(redraw = true) {
    if (!this.textHits) return;
    this.textHits = null;
    this.textQ = '';
    if (this.textBtn) this.textBtn.textContent = '在正文里找';
    if (redraw) this.render();
  }

  /** In the search box: ↑ ↓ choose, Enter reads it (the first if none is chosen), Esc closes. */
  private key(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = this.shown[Math.max(0, this.sel)];
      if (m && !this.selecting) { const here = this.cfg.id(m) === this.host.current(); this.hide(); if (!here) this.host.pick(m); }
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!this.shown.length) return;
    this.sel = Math.max(0, Math.min(this.shown.length - 1, this.sel + (e.key === 'ArrowDown' ? 1 : -1)));
    while (this.sel >= this.made) this.grow();
    for (const r of this.list.querySelectorAll('.lib-row.sel')) r.classList.remove('sel');
    const row = this.list.querySelector(`.lib-row[data-i="${this.sel}"]`);
    row?.classList.add('sel');
    row?.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- the bin ---------- */
  private async countBin() {
    try { this.binList = (await this.host.bin()) as Array<Trashed<T>>; } catch { this.binList = []; }
    const n = this.binList.length;
    this.binBtn.querySelector('span')!.textContent = n ? `垃圾桶 · ${n}` : '垃圾桶';
    return this.binList;
  }

  private async showBin() {
    this.view = 'bin';
    this.tagEditor.close();
    this.el.classList.add('in-bin');
    const c = this.cfg, list = await this.countBin();
    if (this.view !== 'bin') return;
    const back = h('button', { class: 'lib-back', type: 'button' }, `‹ 回${c.title}`);
    back.addEventListener('click', () => { this.view = 'list'; this.el.classList.remove('in-bin'); this.render(); });
    const now = Date.now();
    const kept = list.filter((m) => !m.purgedAt), gone = list.filter((m) => m.purgedAt);
    const row = (m: Trashed<T>) => {
      const left = Math.max(0, Math.ceil(((m.trashedAt || now) + KEEP_DAYS * DAY - now) / DAY));
      const when = m.purgedAt ? `扔于 ${ago(m.trashedAt || m.purgedAt, now)} · 文件已清除，只留着记录` : `扔于 ${ago(m.trashedAt || now, now)} · ${left} 天后清除文件`;
      const acts = h('span', { class: 'lib-binacts' });
      if (!m.purgedAt) {
        const put = h('button', { class: 'lib-btn', type: 'button', title: '放回去，笔记和读到的地方都还在' }, '放回');
        put.addEventListener('click', async () => { put.setAttribute('disabled', ''); await this.host.restore(m); });
        acts.append(put, twice('清除文件', '确定清除？', () => this.host.purge(m), { cls: 'lib-btn danger', title: '现在就清除它的文件（按两下）；记录会留下，以后可以重新导入找回' }));
      } else {
        const again = h('button', { class: 'lib-btn', type: 'button', title: '再导入一次同一个文件：笔记、标签、读到的地方都会回来' }, '重新导入');
        again.addEventListener('click', () => { this.host.reimport(m); });
        acts.append(again, twice('抹掉记录', '确定抹掉？', () => this.host.forget(m), { cls: 'lib-btn danger', title: '连记录也不要了（按两下）' }));
      }
      return h('div', { class: 'lib-row bin' + (m.purgedAt ? ' gone' : '') },
        this.pic(this.host.binPic(m), c.badge?.(m)),
        h('span', { class: 'lib-text' },
          h('span', { class: 'lib-t' }, c.name(m)),
          c.who(m) ? h('span', { class: 'lib-a' }, c.who(m)) : null,
          h('span', { class: 'lib-m' }, when),
          c.tags(m).length ? h('span', { class: 'lib-tags' }, ...c.tags(m).map((t) => tagChip(t))) : null),
        acts);
    };
    const empty = twice('清空垃圾桶', `确定清除这 ${kept.length} ${c.unit}的文件？`, async () => { await this.host.emptyBin(); }, { cls: 'lib-btn danger', title: '清除垃圾桶里所有文件（按两下）；记录都会留下' });
    empty.disabled = !kept.length;
    this.binView.replaceChildren(
      h('div', { class: 'lib-binhead' }, back, h('span', { class: 'lib-bintitle' }, `垃圾桶${list.length ? ' · ' + list.length : ''}`)),
      h('div', { class: 'lib-binnote' }, `扔掉的${c.noun}先放在这里，放回去时笔记、标签、读到的地方都还在；${KEEP_DAYS} 天后自动清除文件，也可以现在清除。清除后记录一直留着，重新导入同一个文件就都回来了。`),
      h('div', { class: 'lib-list bin' },
        ...(kept.length ? [h('div', { class: 'lib-sec' }, `可以放回的 · ${kept.length}`), ...kept.map(row)] : []),
        ...(gone.length ? [h('div', { class: 'lib-sec' }, `清除记录 · ${gone.length}`), ...gone.map(row)] : []),
        ...(list.length ? [] : [h('div', { class: 'lib-empty' }, '垃圾桶是空的。')])),
      h('div', { class: 'lib-foot' }, h('span', { class: 'lib-sp' }), empty),
    );
  }
}
