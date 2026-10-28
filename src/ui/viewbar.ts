// A few ways of looking at the desk, one click each (bottom right on the home page), so nobody has to drag the desk
// round to see it from the front again: the student's own seat (the first view), straight down, the deskmate's seat,
// the teacher's desk at the front of the room, head down on the desk (eye to eye with the stationery) and the left
// end; and a turn of 45° either way. Keys 1–6 do the same. The camera eases there; a drag afterwards is free again.
import type { DeskHome } from '../scene/home';
import { h } from '../util/dom';

const VIEWS: Array<[id: string, label: string, title: string]> = [
  ['seat', '我的座位', '回到最开始的视角（1）'],
  ['top', '俯视', '从正上方看整张桌子（2）'],
  ['mate', '同桌视角', '坐到同桌那边看（3）'],
  ['teacher', '讲台视角', '老师站在讲台上往下看——一清二楚（4）'],
  ['nap', '趴桌视角', '趴在桌上，和文具平视（5）'],
  ['side', '侧面', '从桌子左边看过去（6）'],
];

export class ViewBar {
  el: HTMLDivElement;
  private btns = new Map<string, HTMLButtonElement>();

  constructor(host: HTMLElement, private home: DeskHome) {
    const turn = (d: number, label: string, title: string) => {
      const b = h('button', { class: 'vb-btn turn', type: 'button', title }, label);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.turn(d); });
      return b;
    };
    this.el = h('div', { class: 'view-bar', role: 'toolbar', 'aria-label': '视角' },
      turn(45, '↺', '向左转 45°'),
      ...VIEWS.map(([id, label, title]) => {
        const b = h('button', { class: 'vb-btn', type: 'button', title }, label) as HTMLButtonElement;
        b.addEventListener('click', (e) => { e.stopPropagation(); this.go(id); });
        this.btns.set(id, b);
        return b;
      }),
      turn(-45, '↻', '向右转 45°'));
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('dblclick', (e) => e.stopPropagation());
    host.append(this.el);
    addEventListener('keydown', (e) => {
      if (this.home.mode !== 'home' || !this.home.orbit.enabled || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName))) return;
      const i = +e.key - 1;
      if (Number.isInteger(i) && i >= 0 && i < VIEWS.length) { e.preventDefault(); this.go(VIEWS[i][0]); }
    });
    home.onUserMove = () => this.mark(null);
    this.mark('seat');
  }

  go(id: string) {
    if (this.home.mode !== 'home' || !this.home.orbit.enabled) return;
    const s = this.home.scene;
    this.mark(id);
    void s.tween(s.presetView(id), 650).then(() => this.home.menu.place());
  }
  private turn(d: number) {
    if (this.home.mode !== 'home' || !this.home.orbit.enabled) return;
    const s = this.home.scene;
    this.mark(null);
    void s.tween(s.clampView({ ...s.view, yaw: s.view.yaw + d }), 420).then(() => this.home.menu.place());
  }
  private mark(id: string | null) { for (const [k, b] of this.btns) b.setAttribute('aria-pressed', String(k === id)); }
}
