// Putting books on the shelf (from the textbook's fan, or a book file dropped on the window): a card with three ways
// in — files from this computer, a download link, or an online catalog: Project Gutenberg's public-domain books
// (including Chinese classics) or any OPDS catalog the student adds, such as their own Calibre library.
import { BOOK_ACCEPT } from '../books/formats/index';
import { BUILTIN_CATALOGS, fileLabel, loadFeed, searchUrl, type OpdsEntry, type OpdsFeed } from '../books/opds';
import type { Shelf } from '../books/shelf';
import type { BookMeta } from '../books/types';
import { h } from '../util/dom';
import { ICONS } from './icons';

type Tab = 'file' | 'link' | 'web';
interface Catalog { id: string; name: string; start: string; search?: string; note?: string; quick?: Array<[string, string]>; mine?: boolean }
const MINE_KEY = 'pw.book.catalogs';
/** catalog pages kept for "back" (the catalog's first page always stays): browsing on and on does not pile them up */
const FEEDS_MAX = 30;

export class BookImport {
  el: HTMLDivElement;
  /** a book is on the shelf now ("read it" was pressed, or it was the only one added) */
  onRead?: (m: BookMeta) => void;
  private tab: Tab = 'file';
  private body: HTMLDivElement;
  private tabs = new Map<Tab, HTMLButtonElement>();
  private status: HTMLDivElement;
  private bar: HTMLDivElement;
  private cat: Catalog = BUILTIN_CATALOGS[0];
  private feeds: OpdsFeed[] = [];
  private busy = false;
  private ctl: AbortController | null = null;

  constructor(host: HTMLElement, private shelf: Shelf) {
    const close = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起' });
    close.addEventListener('click', () => this.hide());
    const tabRow = h('div', { class: 'bi-tabs' }, ...([['file', '本地文件'], ['link', '下载链接'], ['web', '在线书库']] as Array<[Tab, string]>).map(([k, label]) => {
      const b = h('button', { class: 'bi-tab', type: 'button' }, label) as HTMLButtonElement;
      b.addEventListener('click', () => this.setTab(k));
      this.tabs.set(k, b);
      return b;
    }));
    this.body = h('div', { class: 'bi-body' });
    this.bar = h('div', { class: 'bi-progress' }, h('span'));
    this.status = h('div', { class: 'bi-status' });
    this.el = h('div', { class: 'card bookimport' }, close, h('div', { class: 'card-title' }, '放读物上书架'), tabRow, this.body, this.bar, this.status);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.el.addEventListener('dragover', (e) => { e.preventDefault(); this.el.classList.add('drag'); });
    this.el.addEventListener('dragleave', () => this.el.classList.remove('drag'));
    this.el.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); this.el.classList.remove('drag'); const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) void this.addFiles(fs); });
    host.append(this.el);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.open) { e.stopPropagation(); this.hide(); } }, true);
  }

  get open() { return this.el.classList.contains('on'); }
  show(tab: Tab = this.tab) {
    this.el.classList.add('on');
    this.setTab(tab);
  }
  hide() { this.el.classList.remove('on'); this.ctl?.abort(); }

  private setTab(t: Tab) {
    this.tab = t;
    for (const [k, b] of this.tabs) b.setAttribute('aria-pressed', String(k === t));
    if (t === 'file') this.renderFile();
    else if (t === 'link') this.renderLink();
    else this.renderWeb();
  }
  private say(text: string, kind: 'info' | 'ok' | 'error' = 'info', action?: { label: string; on: () => void }) {
    this.status.className = 'bi-status ' + kind;
    this.status.replaceChildren(h('span', {}, text));
    if (action) { const b = h('button', { class: 'bi-act', type: 'button' }, action.label); b.addEventListener('click', action.on); this.status.append(b); }
  }
  private progress(f: number | null) {
    this.bar.classList.toggle('on', f != null);
    (this.bar.firstElementChild as HTMLElement).style.width = `${Math.round((f ?? 0) * 100)}%`;
  }
  private added(list: BookMeta[]) {
    this.progress(null);
    if (!list.length) return;
    const last = list[list.length - 1];
    this.say(list.length > 1 ? `${list.length} 本书放上书架了` : `《${last.title}》放上书架了`, 'ok', { label: '现在就读', on: () => { this.hide(); this.onRead?.(last); } });
  }

  /* ---------- files ---------- */
  private renderFile() {
    const input = h('input', { type: 'file', accept: BOOK_ACCEPT, multiple: true, hidden: true }) as HTMLInputElement;
    input.addEventListener('change', () => { const fs = [...(input.files || [])]; input.value = ''; if (fs.length) void this.addFiles(fs); });
    const zone = h('button', { class: 'bi-drop', type: 'button' },
      h('span', { class: 'bi-drop-t' }, '把电子书拖到这里，或点这里选文件'),
      h('span', { class: 'bi-drop-s' }, '小说 · 漫画 · 杂志：EPUB、MOBI、AZW3、TXT（GBK / Big5 也行）、PDF、CBZ、FB2、HTML、Markdown；可以一次选好几本'));
    zone.addEventListener('click', () => input.click());
    this.body.replaceChildren(zone, input);
  }
  /** Files from this computer (chosen, or dropped on the card or the window). */
  async addFiles(files: File[]) {
    if (this.busy) return;
    if (!this.open) this.show('file');
    this.busy = true;
    const done: BookMeta[] = [];
    // several books: the shelf's list is fetched once at the end, not once per book
    const batch = files.length > 1;
    try {
      for (const [i, f] of files.entries()) {
        this.progress(batch ? i / files.length : null);
        try { done.push(await this.shelf.addFile(f, f.name, (t) => this.say(batch ? `(${i + 1}/${files.length}) ${t}` : t), !batch)); }
        catch (e) { this.say(`《${f.name}》没放上去：${(e as Error).message}`, 'error'); if (files.length === 1) return; }
      }
      if (batch) await this.shelf.refresh();
      this.added(done);
    } finally { this.busy = false; this.progress(null); }
  }

  /* ---------- a download link ---------- */
  private renderLink() {
    const input = h('input', { class: 'bi-input', type: 'url', placeholder: '粘贴电子书的下载链接（epub / mobi / azw3 / txt / pdf / cbz …）', spellcheck: false }) as HTMLInputElement;
    const go = h('button', { class: 'bi-go', type: 'button' }, '获取');
    const run = () => { const u = input.value.trim(); if (u) void this.fetchUrl(u); };
    go.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    this.body.replaceChildren(h('div', { class: 'bi-row-form' }, input, go), h('div', { class: 'bi-note' }, '链接要直接指向书的文件（点开就开始下载的那种）。网页、需要登录或有 DRM 加密的书读不了。'));
    setTimeout(() => input.focus(), 50);
  }
  private async fetchUrl(url: string) {
    if (this.busy) return;
    this.busy = true;
    this.ctl = new AbortController();
    this.progress(0);
    try {
      const m = await this.shelf.addFromUrl(url, (e) => {
        if (e.type === 'status' && e.text) this.say(e.text);
        if (e.type === 'progress') { this.progress(e.total ? (e.loaded || 0) / e.total : 0.5); this.say(`正在下载… ${((e.loaded || 0) / 1e6).toFixed(1)} MB`); }
      }, this.ctl.signal);
      this.added([m]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.say((e as Error).message, 'error');
    } finally { this.busy = false; this.ctl = null; this.progress(null); }
  }

  /* ---------- online catalogs ---------- */
  private catalogs(): Catalog[] {
    let mine: Catalog[] = [];
    try { mine = JSON.parse(localStorage.getItem(MINE_KEY) || '[]'); } catch { /* none */ }
    return [...BUILTIN_CATALOGS, ...mine.map((c) => ({ ...c, mine: true }))];
  }
  private saveMine(list: Catalog[]) { try { localStorage.setItem(MINE_KEY, JSON.stringify(list.filter((c) => c.mine).map(({ id, name, start }) => ({ id, name, start })))); } catch { /* private */ } }

  private renderWeb() {
    const cats = this.catalogs();
    if (!cats.some((c) => c.id === this.cat.id)) this.cat = cats[0];
    const chips = h('div', { class: 'bi-cats' }, ...cats.map((c) => {
      const b = h('button', { class: 'bi-cat', type: 'button', 'aria-pressed': String(c.id === this.cat.id), title: c.start }, c.name);
      b.addEventListener('click', () => { this.cat = c; this.feeds = []; this.renderWeb(); void this.go(c.start); });
      if (c.mine) {
        const x = h('span', { class: 'bi-cat-x', title: '删掉这个书库' }, '×');
        x.addEventListener('click', (e) => { e.stopPropagation(); this.saveMine(cats.filter((y) => y.id !== c.id)); if (this.cat.id === c.id) this.cat = BUILTIN_CATALOGS[0]; this.renderWeb(); });
        b.append(x);
      }
      return b;
    }), (() => { const b = h('button', { class: 'bi-cat add', type: 'button' }, '＋ 添加书库'); b.addEventListener('click', () => this.renderAdd()); return b; })());
    const q = h('input', { class: 'bi-input', type: 'search', placeholder: `在 ${this.cat.name} 里找书（书名、作者）`, spellcheck: false }) as HTMLInputElement;
    const go = h('button', { class: 'bi-go', type: 'button' }, '搜索');
    const search = async () => {
      const words = q.value.trim();
      if (!words) return;
      try {
        const tpl = this.cat.search || this.feeds[this.feeds.length - 1]?.search;
        if (!tpl) { this.say('这个书库不支持搜索，点下面的分类浏览吧', 'error'); return; }
        void this.go(await searchUrl(tpl, words), true);
      } catch (e) { this.say((e as Error).message, 'error'); }
    };
    go.addEventListener('click', () => void search());
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') void search(); });
    const quick = h('div', { class: 'bi-quick' }, ...(this.cat.quick || []).map(([label, url]) => { const b = h('button', { class: 'bi-chip', type: 'button' }, label); b.addEventListener('click', () => void this.go(url, true)); return b; }));
    const note = this.cat.note ? h('div', { class: 'bi-note' }, this.cat.note) : h('div', { class: 'bi-note' }, '你添加的 OPDS 书库（比如自己的 Calibre 书库）。');
    this.body.replaceChildren(chips, h('div', { class: 'bi-row-form' }, q, go), quick, note, h('div', { class: 'bi-list' }));
    if (this.feeds.length) this.renderFeed(); else void this.go(this.cat.start);
  }
  private renderAdd() {
    const name = h('input', { class: 'bi-input', placeholder: '名字（比如：我的 Calibre）' }) as HTMLInputElement;
    const url = h('input', { class: 'bi-input', type: 'url', placeholder: 'OPDS 地址（比如 http://192.168.1.5:8080/opds）', spellcheck: false }) as HTMLInputElement;
    const ok = h('button', { class: 'bi-go', type: 'button' }, '添加');
    const cancel = h('button', { class: 'bi-chip', type: 'button' }, '取消');
    ok.addEventListener('click', async () => {
      const u = url.value.trim();
      if (!u) return;
      this.say('正在试着打开这个书库…');
      try {
        const feed = await loadFeed(u);
        const c: Catalog = { id: 'my-' + Date.now().toString(36), name: name.value.trim() || feed.title || '我的书库', start: u, mine: true };
        this.saveMine([...this.catalogs(), c]);
        this.cat = c;
        this.feeds = [feed];
        this.say(`加好了：${c.name}`, 'ok');
        this.renderWeb();
      } catch (e) { this.say((e as Error).message, 'error'); }
    });
    cancel.addEventListener('click', () => this.renderWeb());
    this.body.replaceChildren(h('div', { class: 'bi-add' }, h('div', { class: 'bi-note' }, '任何 OPDS 书库都可以：自己电脑或 NAS 上的 Calibre（内容服务器的 /opds）、学校或图书馆提供的书库等。'), name, url, h('div', { class: 'bi-row-form' }, ok, cancel)));
  }
  private async go(url: string, push = false) {
    const list = this.body.querySelector('.bi-list');
    if (list) list.replaceChildren(h('div', { class: 'bi-loading' }, '正在翻书库…'));
    this.say('');
    try {
      const feed = await loadFeed(url);
      if (push || !this.feeds.length) { this.feeds.push(feed); if (this.feeds.length > FEEDS_MAX) this.feeds.splice(1, 1); } else this.feeds[this.feeds.length - 1] = feed;
      this.renderFeed();
    } catch (e) {
      if (list) list.replaceChildren();
      this.say((e as Error).message, 'error');
    }
  }
  private renderFeed() {
    const list = this.body.querySelector('.bi-list');
    const feed = this.feeds[this.feeds.length - 1];
    if (!list || !feed) return;
    const head = h('div', { class: 'bi-feed-head' });
    if (this.feeds.length > 1) { const back = h('button', { class: 'bi-chip', type: 'button' }, '← 返回'); back.addEventListener('click', () => { this.feeds.pop(); this.renderFeed(); }); head.append(back); }
    head.append(h('span', { class: 'bi-feed-title' }, feed.title));
    const rows = feed.entries.map((e) => this.row(e));
    const more = feed.next ? (() => { const b = h('button', { class: 'bi-chip more', type: 'button' }, '下一页 ›'); b.addEventListener('click', () => { void this.go(feed.next!, true); }); return b; })() : null;
    list.replaceChildren(head, ...(rows.length ? rows : [h('div', { class: 'bi-loading' }, '这里没有书')]), ...(more ? [more] : []));
    list.scrollTop = 0;
  }
  private row(e: OpdsEntry) {
    const thumb = e.thumb ? h('img', { class: 'bi-thumb', src: e.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: 'bi-thumb none' }, e.files.length ? '书' : '›');
    const info = h('div', { class: 'bi-info' }, h('div', { class: 'bi-t' }, e.title), ...(e.author ? [h('div', { class: 'bi-a' }, e.author)] : []), ...(e.summary ? [h('div', { class: 'bi-s' }, e.summary)] : []));
    const row = h('div', { class: 'bi-entry' + (e.nav ? ' nav' : '') }, thumb, info);
    if (e.files.length) {
      const files = h('div', { class: 'bi-files' }, ...e.files.slice(0, 4).map((f, i) => {
        const b = h('button', { class: 'bi-file' + (i === 0 ? ' best' : ''), type: 'button', title: f.title || f.href }, fileLabel(f));
        b.addEventListener('click', (ev) => { ev.stopPropagation(); void this.fetchUrl(f.href); });
        return b;
      }));
      row.append(files);
    } else if (e.nav) {
      row.addEventListener('click', () => void this.go(e.nav!, true));
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
    }
    return row;
  }
}
