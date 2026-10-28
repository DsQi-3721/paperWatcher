// Little sticky notes that pop onto the bottom of the screen and peel away.
import { h } from '../util/dom';

export class Toasts {
  el: HTMLDivElement;
  constructor(root: HTMLElement) {
    this.el = h('div', { class: 'toasts' });
    root.append(this.el);
  }
  show(msg: string, kind: 'info' | 'error' | 'ok' = 'info', ms = 2600) {
    const t = h('div', { class: `toast ${kind}`, style: `rotate:${(Math.random() * 3 - 1.5).toFixed(1)}deg` }, msg);
    this.el.append(t);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 420);
    }, kind === 'error' ? Math.max(ms, 5200) : ms);
  }
}
