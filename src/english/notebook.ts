import { api } from '../api';
import type { PaperMeta } from '../types';
import { h } from '../util/dom';
import { englishApi } from './api';
import { EnglishProgressView } from './progress';
import type { EnglishDraft, EnglishEntry, EnglishProgress, EnglishSelection } from './types';

const kinds = { word: '单词', phrase: '短语', sentence: '句子' };
const button = (label: string, fn: () => void, cls = '') => h('button', { type: 'button', class: cls, onclick: fn }, label);
const select = (label: string, options: [string, string][], value: string, change: (v: string) => void) => h('select', { 'aria-label': label, onchange: (e: Event) => change((e.target as HTMLSelectElement).value) },
  ...options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));

interface NotebookHost {
  currentPaper(): PaperMeta | null;
  ensureText(meta: PaperMeta, progress: (value: Partial<EnglishProgress>) => void, signal: AbortSignal): Promise<void>;
  openSource(paperId: string, page: number, text: string): Promise<void>;
}
export class EnglishNotebook {
  el: HTMLDivElement;
  private content = h('div', { class: 'en-content' });
  private tabs = h('nav', { class: 'en-tabs', 'aria-label': '英语笔记分页' });
  private status = h('div', { class: 'en-status', role: 'status', 'aria-live': 'polite' });
  private progress = new EnglishProgressView();
  private tab: 'library' | 'extract' | 'selection' = 'library';
  private entries: EnglishEntry[] = [];
  private papers: PaperMeta[] = [];
  private paperId = '';
  private query = '';
  private count = '40';
  private filter = '';
  private category = 'all';
  private state = 'learning';
  private sort = 'latest';
  private drafts: EnglishDraft[] = [];
  private selected = new Set<number>();
  private collectionId = '';
  private selection: EnglishSelection | null = null;
  private translation = '';
  private selectedText = '';
  private ctl: AbortController | null = null;
  private busy = false;
  private previousFocus: HTMLElement | null = null;

  constructor(root: HTMLElement, private host: NotebookHost) {
    const close = button('关闭 ×', () => this.hide(), 'en-close');
    this.el = h('div', { class: 'en-overlay', hidden: true }, h('section', { class: 'en-notebook', role: 'dialog', 'aria-modal': 'true', 'aria-label': '英语笔记' },
      h('header', { class: 'en-header' }, h('div', null, h('div', { class: 'en-eyebrow' }, 'MY ENGLISH NOTEBOOK'), h('h1', null, '英语笔记'), h('p', null, '从读过的论文里，收集自己的英语。')), close),
      this.tabs, this.status, this.progress.el, this.content));
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.el) this.hide(); });
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      if (e.key === 'Tab') {
        const focusable = [...this.el.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,select,[tabindex="0"]')].filter((x) => x.offsetParent !== null);
        const first = focusable[0], last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    });
    root.append(this.el);
  }
  get open() { return !this.el.hidden; }
  async show(tab: 'library' | 'extract' | 'selection' = 'library') {
    if (!this.open) this.previousFocus = document.activeElement as HTMLElement;
    this.el.hidden = false;
    this.tab = tab;
    this.render();
    this.el.querySelector<HTMLButtonElement>('.en-close')?.focus();
    try {
      [this.entries, this.papers] = await Promise.all([englishApi.list(), api.papers()]);
      if (!this.paperId) this.paperId = this.host.currentPaper()?.id || this.papers[0]?.id || '';
      if (this.open) this.render();
    } catch (e: any) { this.message(e.message, true); }
  }
  hide() { const restore = this.el.contains(document.activeElement); this.el.hidden = true; if (restore) this.previousFocus?.focus(); }
  private message(text: string, error = false) { this.status.textContent = text; this.status.classList.toggle('error', error); }
  private render() {
    const hadFocus = this.el.contains(document.activeElement);
    this.tabs.replaceChildren(...([['library', '我的词本'], ['extract', '从论文收集'], ['selection', '选区与翻译']] as const).map(([key, label]) => {
      const b = button(label, () => { this.tab = key; this.render(); }, this.tab === key ? 'active' : '');
      b.setAttribute('aria-pressed', String(this.tab === key)); return b;
    }));
    this.content.replaceChildren(this.tab === 'library' ? this.library() : this.tab === 'extract' ? this.extract() : this.selectionPane());
    if (hadFocus && !this.el.contains(document.activeElement)) this.tabs.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  }
  private library() {
    const total = this.entries.length, learned = this.entries.filter((x) => x.learned).length;
    const list = h('div', { class: 'en-list', 'aria-label': '收藏词条' });
    const paint = () => {
      const q = this.filter.toLowerCase().trim();
      const entries = this.entries.filter((e) => (this.category === 'all' || this.category === e.kind)
        && (this.state === 'all' || e.learned === (this.state === 'learned'))
        && (!q || `${e.english} ${e.chinese} ${e.meaningZh} ${e.meaningEn} ${e.sources.map((s) => s.title).join(' ')}`.toLowerCase().includes(q)))
        .sort((a, b) => this.sort === 'frequency' ? b.collectionCount - a.collectionCount || b.collectedAt - a.collectedAt : b.collectedAt - a.collectedAt);
      list.replaceChildren(...entries.map((e) => this.entryCard(e)));
      if (!entries.length) list.append(h('div', { class: 'en-empty' }, h('h2', null, total ? '这里还没有匹配的内容' : '第一句话，从一篇论文开始'), h('p', null, total ? '试试切换分类、学习状态或搜索词。' : '选择一篇论文，让 AI 挑出值得积累的单词、短语和句子；也可以在阅读时随手收藏。'), button('从论文收集 →', () => { this.tab = 'extract'; this.render(); }, 'primary')));
    };
    const search = h('input', { type: 'search', value: this.filter, placeholder: '搜索英文、中文或来源论文', 'aria-label': '搜索词本', oninput: (e: Event) => { this.filter = (e.target as HTMLInputElement).value; paint(); } });
    const tools = h('div', { class: 'en-filters' }, search,
      select('词条分类', [['all', '所有分类'], ['word', '单词'], ['phrase', '短语'], ['sentence', '句子']], this.category, (v) => { this.category = v; paint(); }),
      select('学习状态', [['learning', '学习中'], ['learned', '已记住'], ['all', '全部状态']], this.state, (v) => { this.state = v; paint(); }),
      select('词本排序', [['latest', '最新收集'], ['frequency', '收集频率']], this.sort, (v) => { this.sort = v; paint(); }));
    paint();
    return h('div', null, h('div', { class: 'en-summary' }, h('strong', null, `${total} 项收藏`), h('span', null, `${total - learned} 项学习中 · ${learned} 项已记住`), button('＋ 从论文收集', () => { this.tab = 'extract'; this.render(); }, 'primary')), tools, list);
  }
  private entryCard(e: EnglishEntry) {
    const card = this.draftCard(e);
    const date = new Date(e.collectedAt).toLocaleDateString('zh-CN');
    const actions = h('div', { class: 'en-entry-actions' }, h('span', null, `收藏 ${e.collectionCount} 次 · ${date}`),
      button(e.learned ? '重新学习' : '记住了 ✓', () => void this.patch(e, { learned: !e.learned }), e.learned ? 'learned' : ''),
      button('删除', () => void this.remove(e), 'danger'));
    card.append(actions);
    if (e.sources.length > 1) card.append(h('details', { class: 'en-sources' }, h('summary', null, `查看全部 ${e.sources.length} 条原文例句`), ...e.sources.map((source) => this.sourceView(source))));
    return card;
  }
  private sourceView(source: EnglishDraft['source']) {
    return h('div', { class: 'en-example' }, h('p', { class: 'en-example-en', lang: 'en' }, source.exampleEn), h('p', { class: 'en-example-zh', lang: 'zh' }, source.exampleZh),
      button(`${source.title} · p.${source.page} ↗`, () => { void this.host.openSource(source.paperId, source.page, source.exampleEn).then(() => this.hide()).catch((e) => this.message(e.message, true)); }, 'en-source-link'),
      h('span', { class: 'en-occurrences' }, `原文出现 ${source.occurrences} 次`));
  }
  private draftCard(e: EnglishDraft) {
    return h('article', { class: 'en-entry' }, h('div', { class: 'en-entry-top' }, h('span', { class: `en-kind ${e.kind}` }, kinds[e.kind]), h('h2', { lang: 'en' }, e.english)),
      h('p', { class: 'en-chinese', lang: 'zh' }, e.chinese), h('p', { class: 'en-meaning', lang: 'en' }, e.meaningEn), h('p', { class: 'en-meaning', lang: 'zh' }, e.meaningZh), this.sourceView(e.source));
  }
  private async patch(e: EnglishEntry, patch: { learned?: boolean; deleted?: boolean }) {
    try { await englishApi.patch(e.id, patch); this.entries = await englishApi.list(); this.render(); this.message(patch.learned ? '已移到“已记住”，随时可以重新学习。' : '已恢复到学习中。'); }
    catch (err: any) { this.message(err.message, true); }
  }
  private async remove(e: EnglishEntry) {
    try {
      await englishApi.patch(e.id, { deleted: true }); this.entries = await englishApi.list(); this.render();
      this.status.replaceChildren(document.createTextNode(`已删除“${e.english.slice(0, 40)}” `), button('撤销', () => {
        void englishApi.patch(e.id, { deleted: false }).then(async () => { this.entries = await englishApi.list(); this.render(); this.message('词条已恢复'); }).catch((err) => this.message(err.message, true));
      }));
    } catch (err: any) { this.message(err.message, true); }
  }
  private extract() {
    const paper = select('选择论文', this.papers.length ? this.papers.map((p) => [p.id, p.title]) : [['', '先导入一篇论文']], this.paperId, (v) => { this.paperId = v; });
    const query = h('textarea', { value: this.query, rows: 2, placeholder: '可选：例如“机器学习的专业术语”“表达对比与局限的句子”“适合我的学术英语高频词”', 'aria-label': '选词 query', oninput: (e: Event) => { this.query = (e.target as HTMLTextAreaElement).value; } });
    const run = button('AI 选词', () => void this.generate('extract'), 'primary'); run.disabled = this.busy || !this.papers.length;
    const quantity = h('input', { type: 'number', min: 1, step: 1, inputMode: 'numeric', value: this.count, 'aria-label': '提取数量', oninput: (e: Event) => { this.count = (e.target as HTMLInputElement).value; } });
    run.addEventListener('click', () => quantity.reportValidity());
    const fieldset = h('fieldset', { disabled: this.busy, class: 'en-extract-form' },
      h('label', null, h('span', null, '选择一篇论文'), paper),
      h('label', null, h('span', null, '这次想学什么？'), query),
      h('div', { class: 'en-inline' }, h('label', { class: 'en-quantity' }, h('span', null, '目标数量'), quantity, h('span', null, '项')), run,
        h('span', null, '单词 · 短语 · 句子，均附双语释义与原文例句')));
    const wrapper = h('div', null, fieldset, this.busy ? button('取消生成', () => this.ctl?.abort()) : null);
    if (this.drafts.length) wrapper.append(this.preview());
    else wrapper.append(h('div', { class: 'en-empty compact' }, 'AI 会结合出现频率、专业重要性和你的 query 选取内容。生成后可勾选，再加入词本。'));
    return wrapper;
  }
  private preview() {
    const count = h('strong', null, `已选 ${this.selected.size} / ${this.drafts.length} 项`);
    const save = button('加入词本', () => void this.collectDrafts(), 'primary');
    save.disabled = this.busy || !this.selected.size;
    const list = h('div', { class: 'en-list en-preview' });
    this.drafts.forEach((draft, i) => {
      const check = h('input', { type: 'checkbox', checked: this.selected.has(i), 'aria-label': `收藏 ${draft.english}`, onchange: () => {
        if (check.checked) this.selected.add(i); else this.selected.delete(i);
        count.textContent = `已选 ${this.selected.size} / ${this.drafts.length} 项`; save.disabled = !this.selected.size || this.busy;
      } });
      list.append(h('div', { class: 'en-candidate' }, check, this.draftCard(draft)));
    });
    return h('div', null, h('div', { class: 'en-preview-actions' }, count, button('全选', () => { this.selected = new Set(this.drafts.map((_, i) => i)); this.render(); }), button('取消全选', () => { this.selected.clear(); this.render(); }), save), list);
  }
  async learnSelection(selection: EnglishSelection, translate = false) {
    if (this.busy) { await this.show(this.tab); this.message('先等待当前任务完成，或点击取消生成。'); return; }
    this.selection = { ...selection }; this.translation = ''; this.selectedText = ''; this.drafts = [];
    await this.show('selection');
    await this.generate(translate ? 'translate' : 'selection', !translate);
  }
  private selectionPane() {
    if (!this.selection) return h('div', { class: 'en-empty' }, h('h2', null, '在论文中划出一段英文'), h('p', null, '选中单词、短语或句子后，点“加入词本”或“翻译”。翻译后还可以在英文原文中再次划选并收藏。'));
    const original = h('div', { class: 'en-original', lang: 'en', tabindex: 0, 'aria-label': '选中英文原文' }, this.selection.text);
    const hint = h('span', { class: 'en-picked' }, this.selectedText ? `已划选：${this.selectedText}` : '可在上方原文中再次划选；未划选时收藏整段。');
    const pick = () => {
      const range = window.getSelection();
      if (range && original.contains(range.anchorNode) && original.contains(range.focusNode)) {
        this.selectedText = range.toString().trim();
        hint.textContent = this.selectedText ? `已划选：${this.selectedText}` : '未划选时收藏整段。';
      }
    };
    original.addEventListener('mouseup', pick); original.addEventListener('keyup', pick);
    const translate = button(this.translation ? '重新翻译' : '翻译片段', () => void this.generate('translate'));
    const add = button('收藏选中英文 / 整段', () => void this.generate('selection', true), 'primary');
    translate.disabled = add.disabled = this.busy;
    return h('div', null, h('p', { class: 'en-context' }, `${this.selection.title}${this.selection.page ? ` · p.${this.selection.page}` : ''}`), h('h2', { class: 'en-section-title' }, '英文原文'), original,
      h('div', { class: 'en-selection-actions' }, hint, translate, add, this.busy ? button('取消生成', () => this.ctl?.abort()) : null),
      this.translation ? h('div', { class: 'en-translation' }, h('h2', { class: 'en-section-title' }, '中文翻译'), h('p', { lang: 'zh' }, this.translation)) : null,
      ...this.drafts.map((d) => this.draftCard(d)));
  }
  private async generate(mode: 'extract' | 'selection' | 'translate', autoCollect = false) {
    if (this.busy) return;
    const target = mode === 'extract' ? Number(this.count) : 1;
    if (!Number.isSafeInteger(target) || target < 1) { this.message('提取数量请输入大于 0 的整数', true); return; }
    const source = this.selection;
    const paper = mode === 'extract' ? this.papers.find((p) => p.id === this.paperId) : this.papers.find((p) => p.id === source?.paperId);
    if (!paper) { this.message('请先选择一篇论文', true); return; }
    const text = mode === 'translate' ? source?.text : this.selectedText || source?.text;
    this.busy = true; const ctl = this.ctl = new AbortController();
    if (mode === 'extract') { this.drafts = []; this.selected.clear(); }
    this.collectionId = crypto.randomUUID();
    this.render(); this.progress.start(mode, target);
    this.message('');
    let saving = false;
    try {
      await this.host.ensureText(paper, (p) => this.progress.update(p), ctl.signal);
      ctl.signal.throwIfAborted();
      const result = await englishApi.generate({ mode, paperId: paper.id, query: this.query, count: target, text }, ctl.signal,
        (p) => this.progress.update(p), (entry) => { if (mode === 'extract') { this.selected.add(this.drafts.length); this.drafts.push(entry); } });
      if (mode === 'translate') this.translation = result.translation || '';
      else { this.drafts = result.entries; this.selected = new Set(this.drafts.map((_, i) => i)); }
      if (autoCollect) {
        saving = true;
        this.progress.update({ phase: 'saving', text: '正在保存到词本…' });
        await englishApi.collect(result.entries, this.collectionId);
        this.entries = await englishApi.list(); this.drafts = result.entries;
        this.message('已加入词本，双语释义和原句一并保存。');
      } else this.message(result.warning || (mode === 'translate' ? '翻译完成。可以在英文原文中划选后收藏。' : `已生成 ${result.entries.length} 项，勾选后加入词本。`));
      this.progress.finish(result.warning ? '本次选词已结束，相关内容不足目标数量' : mode === 'translate' ? '翻译完成' : '生成与原句核对完成', result.entries.length);
      if (autoCollect) this.progress.dismiss();
    } catch (e: any) {
      const partial = mode === 'extract' ? this.drafts.length : 0;
      const msg = (ctl.signal.aborted ? '已取消生成。' : `${e.message}。`) + (saving ? '请在“我的词本”中检查保存结果。' : partial ? `已保留 ${partial} 项核对完成的内容，可先加入词本。` : '词本未改变。');
      this.message(msg, !ctl.signal.aborted);
      this.progress.finish(ctl.signal.aborted ? '已取消' : '生成未完成', partial, true);
    }
    finally {
      this.busy = false; this.ctl = null; this.render();
      if (this.open && this.tab === 'extract' && this.drafts.length) this.content.querySelector('.en-preview-actions')?.scrollIntoView({ block: 'start' });
    }
  }
  private async collectDrafts() {
    if (this.busy || !this.selected.size) return;
    this.busy = true; this.render();
    try {
      const result = await englishApi.collect(this.drafts.filter((_, i) => this.selected.has(i)), this.collectionId, (done) => this.message(`已保存 ${done} / ${this.selected.size} 项…`));
      this.entries = await englishApi.list(); this.drafts = []; this.selected.clear(); this.tab = 'library'; this.state = 'all'; this.filter = ''; this.category = 'all';
      this.progress.dismiss();
      this.content.scrollTop = 0;
      this.message(`已收藏 ${result.length} 项；相同英文已合并并累计收集次数。`);
    } catch (e: any) { this.message(e.message, true); }
    finally { this.busy = false; this.render(); }
  }
}
