// The desk's own settings, from the corner pill: how much the lines wobble, paper grain on or off, the desk's top,
// and for each piece of stationery whether it is out on the desk and its colour. Kept in the browser.
import { BACKDROPS } from '../scene/backdrops';
import { eraserInitials, LOOK_DEFAULT, type DeskLook } from '../scene/scene';
import type { DeskObject } from '../scene/types';
import { h } from '../util/dom';

const KEY = 'pw.desk.look';
const PAL_ORDER = ['mustard', 'tomato', 'mint', 'cobalt', 'blush'];
const PAL_HEX: Record<string, string> = { mustard: '#f4b829', tomato: '#ef6a4c', mint: '#93d3b0', cobalt: '#76a0e2', blush: '#f3a6bb' };

export function loadLook(): DeskLook {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { ...LOOK_DEFAULT, ...v, hidden: Array.isArray(v.hidden) ? v.hidden : [], pal: v.pal && typeof v.pal === 'object' ? v.pal : {},
      place: v.place && typeof v.place === 'object' ? v.place : {} };
  } catch { /* fresh */ }
  return { ...LOOK_DEFAULT, hidden: [], pal: {}, place: {} };
}
const saveLook = (l: DeskLook) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* private mode */ } };

export class DeskSettings {
  el: HTMLDivElement;
  open = false;
  /** the 摆放模式 button */
  onArrange?: () => void;
  private body: HTMLDivElement;

  constructor(host: HTMLElement, private objects: () => DeskObject[], private woods: Record<string, { name: string; top: { l: string } }>,
    private get: () => DeskLook, private set: (l: DeskLook) => void) {
    const close = h('button', { class: 'card-close', type: 'button', html: '×', title: '收起' });
    close.addEventListener('click', () => this.hide());
    this.body = h('div', { class: 'ds-body' });
    this.el = h('div', { class: 'card desk-settings' }, close, h('div', { class: 'card-title' }, '桌面设置'), this.body);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    host.append(this.el);
  }

  toggle() { if (this.open) this.hide(); else this.show(); }
  show() { this.open = true; this.render(); this.el.classList.add('on'); }
  hide() { this.open = false; this.el.classList.remove('on'); }

  /** Change the saved look from elsewhere (arrange mode saving where things are). */
  patch(f: (l: DeskLook) => void) { this.change(f); if (this.open) this.render(); }

  private change(f: (l: DeskLook) => void) {
    const l = { ...this.get(), hidden: [...this.get().hidden], pal: { ...this.get().pal }, place: { ...(this.get().place || {}) } };
    f(l);
    saveLook(l);
    this.set(l);
  }

  private render() {
    const look = this.get();
    // wobble
    const wob = h('input', { type: 'range', min: '0', max: '7', step: '0.1', value: String(look.wobble) }) as HTMLInputElement;
    const wobV = h('span', { class: 'ds-val' }, look.wobble.toFixed(1));
    wob.addEventListener('input', () => { wobV.textContent = (+wob.value).toFixed(1); });
    wob.addEventListener('change', () => this.change((l) => { l.wobble = +wob.value; }));
    // grain
    const grain = h('button', { class: 'ds-tog', type: 'button', 'aria-pressed': String(look.grain) }, look.grain ? '开' : '关');
    grain.addEventListener('click', () => { this.change((l) => { l.grain = !l.grain; }); this.render(); });
    // what lies behind the desk
    const bgs = h('div', { class: 'ds-bgs' }, ...BACKDROPS.map((b) => {
      const el = h('button', { class: 'ds-bg', type: 'button', title: b.name, 'aria-pressed': String(look.bg === b.id) },
        h('span', { class: 'ds-bg-pic', html: b.thumb() }), h('span', { class: 'ds-bg-name' }, b.name));
      el.addEventListener('click', () => { this.change((l) => { l.bg = b.id; }); this.render(); });
      return el;
    }));
    const motion = h('button', { class: 'ds-tog', type: 'button', 'aria-pressed': String(look.bgMotion) }, look.bgMotion ? '开' : '关');
    motion.addEventListener('click', () => { this.change((l) => { l.bgMotion = !l.bgMotion; }); this.render(); });
    // desk tops
    const woods = h('div', { class: 'ds-row' }, ...Object.entries(this.woods).map(([k, w]) => {
      const b = h('button', { class: 'ds-wood', type: 'button', title: w.name, 'aria-pressed': String(look.wood === k), style: `--c:${w.top.l}` }, w.name);
      b.addEventListener('click', () => { this.change((l) => { l.wood = k; }); this.render(); });
      return b;
    }));
    // each piece of stationery: out or not, its colour
    const rows = this.objects().map((o) => {
      const shown = !look.hidden.includes(o.id);
      const chk = h('button', { class: 'ds-chk', type: 'button', 'aria-pressed': String(shown), title: shown ? '收起来' : '拿出来' }, shown ? '✓' : '');
      chk.addEventListener('click', () => { this.change((l) => { l.hidden = shown ? [...l.hidden, o.id] : l.hidden.filter((x) => x !== o.id); }); this.render(); });
      const cur = look.pal[o.id] || o.st.pal;
      const sw = h('span', { class: 'ds-sws' }, ...PAL_ORDER.map((p) => {
        const b = h('button', { class: 'ds-sw', type: 'button', title: p, 'aria-pressed': String(cur === p), style: `background:${PAL_HEX[p]}` });
        b.addEventListener('click', () => { this.change((l) => { l.pal[o.id] = p; }); this.render(); });
        return b;
      }));
      return h('div', { class: 'ds-obj' + (shown ? '' : ' off') }, chk, h('span', { class: 'ds-name' }, o.title), sw);
    });
    // the initials under the eraser's sleeve (kept only in this browser, like the rest of these settings)
    const initials = h('input', { class: 'ds-initials', type: 'text', value: eraserInitials(look.eraserName), maxlength: '4', spellcheck: false, autocomplete: 'off',
      title: '橡皮套下面写的名字缩写：1–4 个大写字母（只存在这台电脑的浏览器里）' }) as HTMLInputElement;
    initials.addEventListener('input', () => { const v = initials.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); if (v !== initials.value) initials.value = v; });
    const saveInitials = () => { const v = eraserInitials(initials.value); initials.value = v; if (v !== eraserInitials(this.get().eraserName)) this.change((l) => { l.eraserName = v; }); };
    initials.addEventListener('change', saveInitials);
    initials.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') initials.blur(); });
    const reset = h('button', { class: 'ds-reset', type: 'button' }, '恢复默认');
    reset.addEventListener('click', () => { this.change((l) => { Object.assign(l, { ...LOOK_DEFAULT, hidden: [], pal: {}, place: {} }); }); this.render(); });
    const moved = Object.keys(look.place || {}).length;
    const arrange = h('button', { class: 'ds-arrange', type: 'button', title: '拖动桌上的东西，换个地方放' },
      h('span', { class: 'ds-arr-t' }, '摆放模式'), h('span', { class: 'ds-arr-s' }, moved ? `已经挪过 ${moved} 样东西` : '自己挪一挪桌上的东西'));
    arrange.addEventListener('click', (e) => { e.stopPropagation(); this.onArrange?.(); });
    this.body.replaceChildren(
      arrange,
      h('div', { class: 'ds-sec' }, h('label', {}, '手绘抖动'), h('div', { class: 'ds-row' }, wob, wobV)),
      h('div', { class: 'ds-sec' }, h('label', {}, '纸面颗粒'), grain),
      h('div', { class: 'ds-sec' }, h('label', {}, '桌面'), woods),
      h('div', { class: 'ds-sec col' }, h('label', {}, '背景'), bgs),
      h('div', { class: 'ds-sec' }, h('label', {}, '背景动效'), motion),
      h('div', { class: 'ds-sec col' }, h('label', {}, '桌上的文具'), h('div', { class: 'ds-objs' }, ...rows)),
      h('div', { class: 'ds-sec' }, h('label', {}, '橡皮上的名字'), initials),
      reset,
    );
  }
}
