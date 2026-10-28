// The pencil tray on the left edge (tools) and the desk objects around the screen edges.
import type { Tool } from '../select/selection';
import { HIGHLIGHTS, type HighlightColor } from '../theme';
import { h } from '../util/dom';
import { ICONS, type IconName } from './icons';

interface ToolDef { id: Tool; icon: IconName; label: string; key: string }

const TOOLS: ToolDef[] = [
  { id: 'pen', icon: 'pencil', label: '铅笔 · 选取与提问', key: 'V' },
  { id: 'highlighter', icon: 'highlighter', label: '荧光笔 · 直接划重点', key: 'H' },
  { id: 'scissors', icon: 'scissors', label: '剪刀 · 框选图表/任意区域', key: 'S' },
  { id: 'eraser', icon: 'eraser', label: '橡皮 · 擦掉笔记', key: 'E' },
];

export class Tray {
  el: HTMLDivElement;
  private buttons = new Map<Tool, HTMLButtonElement>();
  private chips: HTMLDivElement;
  onTool: (t: Tool) => void = () => {};
  onColor: (c: HighlightColor) => void = () => {};
  color: HighlightColor = 'yellow';

  constructor(root: HTMLElement) {
    const slots = h('div', { class: 'tray-slots' });
    for (const t of TOOLS) {
      const b = h('button', { class: `tool tool-${t.id}`, type: 'button', 'aria-label': t.label, html: ICONS[t.icon] }) as HTMLButtonElement;
      b.append(h('span', { class: 'tool-tag' }, t.label, h('kbd', null, t.key)));
      b.addEventListener('click', () => this.onTool(t.id));
      this.buttons.set(t.id, b);
      slots.append(b);
    }
    this.chips = h('div', { class: 'hl-chips' });
    for (const c of Object.keys(HIGHLIGHTS) as HighlightColor[]) {
      const chip = h('button', { class: `hl-chip${c === this.color ? ' on' : ''}`, type: 'button', style: `--c:${HIGHLIGHTS[c]}`, title: c });
      chip.addEventListener('click', () => {
        this.color = c;
        this.chips.querySelectorAll('.hl-chip').forEach((x) => x.classList.toggle('on', x === chip));
        this.onColor(c);
      });
      this.chips.append(chip);
    }
    this.el = h('div', { class: 'tray' }, h('div', { class: 'tray-wood' }), slots, this.chips);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    root.append(this.el);
  }

  setTool(t: Tool) {
    for (const [id, b] of this.buttons) b.classList.toggle('active', id === t);
    this.el.classList.toggle('hl-open', t === 'highlighter');
  }
}

/** A labelled desk object button (envelope, books, lamp…). */
export function deskButton(icon: IconName, label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', { class: `dobj ${cls}`, type: 'button', 'aria-label': label, html: ICONS[icon] }) as HTMLButtonElement;
  b.append(h('span', { class: 'dobj-tag' }, label));
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}
