import { h } from '../util/dom';
import { deskApi } from './api';
import { deskAction, DeskPanel } from './panel';
import type { PlannerData, TodoItem } from './types';

export function localDay() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export class PlannerPanel extends DeskPanel {
  private data: PlannerData | null = null;
  private date = localDay();
  private queue: Promise<unknown> = Promise.resolve();
  private loadSequence = 0;
  onChange: (data: PlannerData) => void = () => {};
  constructor(root: HTMLElement) { super(root, '每日待办', '按天记录，左边可以翻看最近 30 天。', 'da-planner'); }
  async show() { this.date = localDay(); this.openPanel(); await this.load(); }
  private async load() {
    const sequence = ++this.loadSequence;
    try { const data = await deskApi.planner(this.date); if (sequence !== this.loadSequence) return; this.data = data; this.render(); this.onChange(this.data); }
    catch (e: any) { this.message(e.message, true); }
  }
  private run(action: () => Promise<unknown>, after?: () => void) {
    this.queue = this.queue.then(async () => { try { await action(); await this.load(); this.message('已保存'); after?.(); } catch (e: any) { this.message(e.message, true); } });
  }
  private render() {
    const d = this.data; if (!d) return;
    const history = h('nav', { class: 'da-days', 'aria-label': '近30天待办历史' }, h('h2', null, '最近 30 天'));
    for (const day of d.history) {
      const b = deskAction('', () => { this.date = day.date; this.message(''); void this.load(); }, day.date === d.date ? 'active' : '');
      b.append(h('span', null, day.date === d.today ? '今天' : day.date.slice(5).replace('-', ' / ')), h('small', null, day.total ? `${day.done} / ${day.total}` : '—'));
      b.setAttribute('aria-label', `${day.date}${day.date === d.today ? ' 今天' : ''}，完成 ${day.done} / ${day.total} 项`);
      b.setAttribute('aria-current', String(day.date === d.date)); history.append(b);
    }
    const dayInput = h('input', { type: 'date', value: d.date, max: d.today, min: d.history.at(-1)?.date, 'aria-label': '待办日期', onchange: () => { if (dayInput.value) { this.date = dayInput.value; void this.load(); } } });
    const add = h('input', { type: 'text', class: 'da-handwriting', maxLength: 300, placeholder: '今天想做什么？写下后按回车', 'aria-label': '新待办' });
    const form = h('form', { class: 'da-todo-add' }, add, h('button', { type: 'submit', class: 'primary' }, '添加'));
    form.addEventListener('submit', (event) => { event.preventDefault(); const text = add.value.trim(), date = d.date; if (!text) return; add.value = ''; this.run(() => deskApi.addTodo(date, text), () => this.body.querySelector<HTMLInputElement>('[aria-label="新待办"]')?.focus()); });
    const list = h('div', { class: 'da-todos', 'aria-label': `${d.date} 的待办` }, ...d.items.map((item) => this.row(item, d.date)));
    if (!d.items.length) list.append(h('div', { class: 'da-empty' }, d.date === d.today ? '今天还是空白的一页。先写一件要做的事吧。' : '这一天没有记录待办。'));
    const done = d.items.filter((x) => x.done).length;
    const page = h('div', { class: 'da-planner-page' }, h('div', { class: 'da-day-heading' }, dayInput, h('strong', null, `完成 ${done} / ${d.items.length} 项`)), form, list);
    this.body.replaceChildren(h('div', { class: 'da-planner-layout' }, history, page));
  }
  private row(item: TodoItem, date: string) {
    const check = h('input', { type: 'checkbox', checked: item.done, 'aria-label': `完成：${item.text}`, onchange: () => this.run(() => deskApi.patchTodo(date, item.id, { done: check.checked })) });
    const text = h('input', { type: 'text', class: 'da-handwriting', value: item.text, maxLength: 300, 'aria-label': `编辑待办：${item.text}` });
    text.addEventListener('change', () => { const value = text.value.trim(); if (value && value !== item.text) this.run(() => deskApi.patchTodo(date, item.id, { text: value })); else text.value = item.text; });
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') text.blur(); });
    const remove = deskAction('删除', () => this.run(() => deskApi.patchTodo(date, item.id, { deleted: true }), () => {
      this.status.replaceChildren(document.createTextNode('已删除这项待办 '), deskAction('撤销', () => this.run(() => deskApi.patchTodo(date, item.id, { deleted: false }))));
    }), 'quiet');
    return h('div', { class: `da-todo${item.done ? ' done' : ''}` }, check, text, remove);
  }
}
