// The paper's sections on an index card (from the PDF outline, or detected headings): jump anywhere.
import type { Section } from '../pdf/doc';
import { h } from '../util/dom';
import { ICONS } from './icons';

export class Toc {
  el: HTMLDivElement;
  private list: HTMLDivElement;
  onJump: (s: Section) => void = () => {};

  constructor(root: HTMLElement) {
    this.list = h('div', { class: 'toc-list' });
    const close = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起' });
    close.addEventListener('click', () => this.hide());
    this.el = h('div', { class: 'card toc' }, close, h('div', { class: 'card-title' }, '目录'), this.list);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    root.append(this.el);
  }

  get open() { return this.el.classList.contains('on'); }
  hide() { this.el.classList.remove('on'); }

  show(sections: Section[], currentPage: number) {
    this.el.classList.add('on');
    if (!sections.length) {
      this.list.replaceChildren(h('div', { class: 'toc-empty' }, '这篇论文没有可识别的目录。'));
      return;
    }
    let current = 0;
    sections.forEach((s, i) => { if (s.page <= currentPage) current = i; });
    this.list.replaceChildren(...sections.map((s, i) => {
      const row = h('button', { class: `toc-row lv${Math.min(2, s.level)}${i === current ? ' here' : ''}`, type: 'button' },
        h('span', { class: 'toc-t' }, s.title),
        h('span', { class: 'toc-dots' }),
        h('span', { class: 'toc-p' }, String(s.page + 1)));
      row.addEventListener('click', () => { this.hide(); this.onJump(s); });
      return row;
    }));
    (this.list.querySelector('.here') as HTMLElement | null)?.scrollIntoView({ block: 'center' });
  }
}
