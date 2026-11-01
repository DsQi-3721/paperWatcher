import { h } from '../util/dom';
export const deskAction = (text: string, click: () => void, cls = '') => h('button', { type: 'button', class: cls, onclick: click }, text);

export class DeskPanel {
  el: HTMLDivElement;
  body = h('div', { class: 'da-body' });
  status = h('div', { class: 'da-status', role: 'status', 'aria-live': 'polite' });
  onOpen: () => void = () => {};
  private priorFocus: HTMLElement | null = null;
  constructor(root: HTMLElement, title: string, subtitle: string, cls: string) {
    const close = deskAction('关闭 ×', () => this.hide(), 'da-close');
    this.el = h('div', { class: `da-overlay ${cls}`, hidden: true }, h('section', { class: 'da-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', { class: 'da-header' }, h('div', null, h('h1', null, title), h('p', null, subtitle)), close), this.status, this.body));
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.el) this.hide(); });
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      if (e.key === 'Tab') {
        const nodes = [...this.el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]')].filter((n) => n.offsetParent !== null);
        if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
        else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
      }
    });
    root.append(this.el);
    document.addEventListener('focusin', (e) => {
      if (this.open && !this.el.contains(e.target as Node)) this.el.querySelector<HTMLButtonElement>('.da-close')?.focus();
    });
  }
  get open() { return !this.el.hidden; }
  openPanel() {
    if (!this.open) this.priorFocus = document.activeElement as HTMLElement;
    this.onOpen(); this.el.hidden = false; this.el.querySelector<HTMLButtonElement>('.da-close')?.focus();
  }
  hide() { const restore = this.el.contains(document.activeElement); this.el.hidden = true; if (restore) this.priorFocus?.focus(); }
  message(text: string, error = false) { this.status.textContent = text; this.status.classList.toggle('error', error); }
}
