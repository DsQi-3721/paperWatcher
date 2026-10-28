// The sticky-note pad: an index of every annotation on this paper.
import { replyToPlain } from '../ink/markdown';
import type { Annotation } from '../types';
import { h } from '../util/dom';
import { ICONS } from './icons';

export class NotesList {
  el: HTMLDivElement;
  private list: HTMLDivElement;
  onOpen: (a: Annotation) => void = () => {};
  onExport: () => void = () => {};
  onAskPaper: () => void = () => {};

  constructor(root: HTMLElement) {
    this.list = h('div', { class: 'nl-list' });
    const close = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起' });
    close.addEventListener('click', () => this.hide());
    const exp = h('button', { class: 'nl-export', type: 'button', html: `${ICONS.download}<span>导出全部笔记 (.md)</span>` });
    exp.addEventListener('click', () => this.onExport());
    const askPaper = h('button', { class: 'nl-paper', type: 'button', html: `${ICONS.sparkle}<span>问问整篇论文</span>` });
    askPaper.addEventListener('click', () => { this.hide(); this.onAskPaper(); });
    this.el = h('div', { class: 'card noteslist' }, close, h('div', { class: 'card-title' }, '这篇论文的笔记'), askPaper, this.list, exp);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    root.append(this.el);
  }

  get open() { return this.el.classList.contains('on'); }
  hide() { this.el.classList.remove('on'); }

  show(list: Annotation[], label: (a: Annotation) => string) {
    this.el.classList.add('on');
    const sorted = [...list].sort((a, b) => page(a) - page(b) || a.createdAt - b.createdAt);
    if (!sorted.length) {
      this.list.replaceChildren(h('div', { class: 'nl-empty' }, '还没有笔记。用铅笔划一句话，问问 AI 吧。'));
      return;
    }
    this.list.replaceChildren(...sorted.map((a) => {
      const ai = [...a.messages].reverse().find((m) => m.role === 'ai' && m.text);
      const gist = a.margin || (ai ? replyToPlain(ai.text).slice(0, 80) : a.style === 'highlight' ? '（高亮）' : '（还没问）');
      const row = h('button', { class: `nl-row style-${a.style}`, type: 'button' },
        h('span', { class: 'nl-ref' }, label(a)),
        h('span', { class: 'nl-gist' }, gist),
        h('span', { class: 'nl-count' }, a.messages.length ? `${Math.ceil(a.messages.length / 2)} 轮` : ''),
      );
      row.addEventListener('click', () => { this.hide(); this.onOpen(a); });
      return row;
    }));
  }
}

function page(a: Annotation) {
  return a.anchor.kind === 'text' ? a.anchor.ranges[0]?.page ?? 0 : a.anchor.kind === 'region' ? a.anchor.page : -1;
}
