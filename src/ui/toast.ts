// Little sticky notes that pop onto the bottom of the screen and peel away.
import { h } from '../util/dom';

export class Toasts {
  el: HTMLDivElement;
  constructor(root: HTMLElement) {
    this.el = h('div', { class: 'toasts' });
    root.append(this.el);
  }
  /** A note at the bottom; with `action`, a button on it (撤销…) that does something and takes the note away. */
  show(msg: string, kind: 'info' | 'error' | 'ok' = 'info', ms = 2600, action?: { label: string; run: () => void }) {
    const t = h('div', { class: `toast ${kind}${action ? ' has-act' : ''}`, style: `rotate:${(Math.random() * 3 - 1.5).toFixed(1)}deg` }, msg);
    const go = () => { t.classList.add('out'); setTimeout(() => t.remove(), 420); };
    if (action) {
      const b = h('button', { class: 'toast-act', type: 'button' }, action.label);
      b.addEventListener('click', (e) => { e.stopPropagation(); go(); action.run(); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      t.append(b);
    }
    this.el.append(t);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    setTimeout(go, kind === 'error' ? Math.max(ms, 5200) : ms);
  }
}
