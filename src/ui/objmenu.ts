// What happens when a piece of stationery is clicked: a hand-drawn ink ring is drawn round it, and its actions pop
// out of it along an arc that hugs it (the real use first, then the school-days ones; a picker opens its choices
// beside it), with two small switches at the end of the arc (see-through, part labels). What the object then says
// comes out of it in a speech bubble, as if it were grumbling. The camera never moves for any of this; it all
// follows the object while the desk turns.
import { PALS } from '../scene/engine/index.js';
import type { DeskScene } from '../scene/scene';
import type { ButtonDef, DeskObject } from '../scene/types';
import { h, s } from '../util/dom';

const PILL_H = 30, GAP = 8;

interface Placed { el: HTMLElement; w: number }

export class ObjMenu {
  el: HTMLDivElement;
  obj: DeskObject | null = null;
  private ring: SVGSVGElement;
  private ringPath: SVGPathElement;
  private name: HTMLDivElement;
  private items: Placed[] = [];
  private chips: HTMLDivElement;
  private openChoice: { b: ButtonDef; el: HTMLElement } | null = null;
  private side = 1;
  private bubbles = new Map<DeskObject, { el: HTMLDivElement; t: ReturnType<typeof setTimeout> }>();

  constructor(private host: HTMLElement, private scene: DeskScene) {
    this.ringPath = s('path', { class: 'om-ring-path' });
    this.ring = s('svg', { class: 'om-ring', width: 1, height: 1 }, this.ringPath);
    this.name = h('div', { class: 'om-name' });
    this.chips = h('div', { class: 'om-chips' });
    this.el = h('div', { class: 'objmenu' }, this.ring, this.name, this.chips);
    this.el.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest('button')) e.stopPropagation(); });
    host.append(this.el);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.obj) this.close(); });
  }

  get open() { return !!this.obj; }

  show(obj: DeskObject) {
    if (this.obj === obj) return;
    if (this.obj) this.release(true);
    this.obj = obj;
    this.scene.focus = obj;
    this.openChoice = null;
    this.name.textContent = obj.title;
    // the ring takes the object's own colour (a pressed action lights up in it)
    this.el.style.setProperty('--accent', PALS[obj.st.pal]?.l ?? '#f4b829');
    this.build();
    this.el.classList.add('on');
    this.scene.render();
    this.place();
    this.popIn();
  }

  close() {
    if (!this.obj) return;
    this.release(false);
    this.scene.render();
  }

  /** Leaving an object: its labels go, its see-through closes, its actions fold back into it. */
  private release(instant: boolean) {
    const o = this.obj!;
    if (o.st.xrT) this.scene.setSeeThrough(o, false);
    this.scene.labelsOn = false;
    this.scene.focus = null;
    this.obj = null;
    this.chips.classList.remove('on');
    const old = this.items;
    this.items = [];
    const c = this.centre;
    if (instant || !c) { for (const it of old) it.el.remove(); this.el.classList.remove('on'); return; }
    old.forEach((it, i) => {
      const a = it.el.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(${c.x - it.w / 2}px, ${c.y - PILL_H / 2}px) scale(.4)` }],
        { duration: 160, delay: i * 12, easing: 'ease-in', fill: 'forwards' });
      a.finished.then(() => it.el.remove(), () => it.el.remove());
    });
    this.el.classList.remove('on');
  }

  private pill(label: string, cls: string, onClick: (el: HTMLElement) => void) {
    const el = h('button', { class: 'om-pill ' + cls, type: 'button', html: label });
    el.addEventListener('click', (e) => { e.stopPropagation(); onClick(el); });
    this.el.append(el);
    return el;
  }

  private build() {
    const o = this.obj!;
    for (const b of o.buttons) {
      const el = this.pill(b.label + (b.choices ? '<i>▾</i>' : ''), b.choices ? 'picker' : '', (pe) => {
        if (b.choices) { this.openChoice = this.openChoice?.b === b ? null : { b, el: pe }; this.buildChips(); return; }
        this.openChoice = null; this.buildChips();
        this.scene.press(o, b.label);
      });
      this.items.push({ el, w: 0 });
    }
    // the two switches, small and round, at the end of the arc
    if (o.seeThrough) {
      const x = this.pill('透视', 'tog', (pe) => { const on = !o.st.xrT; this.scene.setSeeThrough(o, on); pe.setAttribute('aria-pressed', String(on)); });
      x.setAttribute('aria-pressed', String(!!o.st.xrT));
      this.items.push({ el: x, w: 0 });
    }
    const l = this.pill('标签', 'tog', (pe) => { this.scene.labelsOn = !this.scene.labelsOn; pe.setAttribute('aria-pressed', String(this.scene.labelsOn)); this.scene.render(); });
    l.setAttribute('aria-pressed', String(this.scene.labelsOn));
    this.items.push({ el: l, w: 0 });
    for (const it of this.items) it.w = it.el.offsetWidth || 80;
  }

  private buildChips() {
    const o = this.obj, oc = this.openChoice;
    this.chips.classList.toggle('on', !!oc);
    if (!o || !oc?.b.choices) { this.chips.replaceChildren(); return; }
    this.chips.replaceChildren(...oc.b.choices(o.st).map((c) => {
      const el = h('button', { class: 'om-chip' + (c.current ? ' current' : c.disabled ? ' off' : ''), type: 'button', html: c.label });
      el.addEventListener('click', (e) => { e.stopPropagation(); this.openChoice = null; this.buildChips(); this.scene.press(o, `${oc.b.label}>${c.label}`); });
      return el;
    }));
    this.placeChips();
    this.chips.animate([{ opacity: 0, transform: `${this.chips.style.transform} scale(.85)` }, { opacity: 1, transform: this.chips.style.transform }], { duration: 160, easing: 'ease-out' });
  }

  /** Where the object is on screen: the middle of its box, and an ellipse round it. */
  private get centre() {
    if (!this.obj) return null;
    const r = this.scene.screenBox(this.obj);
    if (!r || !r.width) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, rx: Math.max(34, r.width / 2 + 16), ry: Math.max(28, r.height / 2 + 14) };
  }

  /** Lay the ring and the actions round the object (called on every redraw while it is open). */
  place() {
    const c = this.centre;
    if (!c) return;
    // the ink ring: a slightly wobbly loop round the object, overlapping where it closes, like a hand-drawn circle
    const pts: string[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = -0.35 + i / 40 * (Math.PI * 2 + 0.55), wob = 1 + 0.035 * Math.sin(t * 3 + 1.3);
      pts.push(`${(c.x + Math.cos(t) * c.rx * wob).toFixed(1)} ${(c.y + Math.sin(t) * c.ry * wob * (1 + i / 400)).toFixed(1)}`);
    }
    this.ringPath.setAttribute('d', 'M' + pts.join('L'));
    // the name, on the ring at its top left
    this.name.style.transform = `translate(${Math.round(c.x - c.rx * 0.7)}px, ${Math.round(c.y - c.ry - 26)}px)`;
    // actions down an arc on the side with room (the right if it fits), each one's inner end on a wider ellipse
    const n = this.items.length, total = n * PILL_H + (n - 1) * GAP, ry = Math.max(c.ry + 10, total / 2 + PILL_H * 0.6), rx = c.rx + 22;
    const wMax = Math.max(...this.items.map((it) => it.w));
    this.side = c.x + rx + wMax + 12 < innerWidth || c.x - rx - wMax - 12 < 0 ? 1 : -1;
    let y = Math.max(PILL_H / 2 + 8, Math.min(innerHeight - total - 8 + PILL_H / 2, c.y - total / 2 + PILL_H / 2));
    for (const it of this.items) {
      const dy = (y - c.y) / ry, x = c.x + this.side * rx * Math.sqrt(Math.max(0, 1 - dy * dy));
      const left = this.side > 0 ? x : x - it.w;
      it.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(y - PILL_H / 2)}px)`;
      y += PILL_H + GAP;
    }
    if (this.openChoice) this.placeChips();
    for (const [o, b] of this.bubbles) this.placeBubble(o, b.el);
  }

  /** A picker's choices: beside its pill, but clear of every action on the arc that shares their rows (the arc bulges
   *  out past the picker further down), on the screen, and above the actions if it has to overlap anything. */
  private placeChips() {
    const oc = this.openChoice;
    if (!oc) return;
    const r = oc.el.getBoundingClientRect(), w = this.chips.offsetWidth || 200, hh = this.chips.offsetHeight || 60;
    let y = Math.max(8, Math.min(innerHeight - hh - 8, r.top - 4));
    const rects = this.items.map((it) => it.el.getBoundingClientRect());
    const rows = (yy: number) => rects.filter((q) => q.bottom > yy - 4 && q.top < yy + hh + 4);
    const out = (yy: number) => this.side > 0 ? Math.max(r.right, ...rows(yy).map((q) => q.right)) + 10 : Math.min(r.left, ...rows(yy).map((q) => q.left)) - 10 - w;
    let x = out(y);
    if (x < 8 || x + w > innerWidth - 8) {
      // no room past the arc: on the object's side of the actions, or failing that under the whole column
      const inner = this.side > 0 ? Math.min(r.left, ...rows(y).map((q) => q.left)) - 10 - w : Math.max(r.right, ...rows(y).map((q) => q.right)) + 10;
      if (inner >= 8 && inner + w <= innerWidth - 8) x = inner;
      else { y = Math.min(innerHeight - hh - 8, Math.max(...rects.map((q) => q.bottom)) + 10); x = Math.max(8, Math.min(innerWidth - w - 8, r.left)); }
    }
    this.chips.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** Out of the object: each action springs from its middle to its place on the arc, one after another. */
  private popIn() {
    const c = this.centre;
    if (!c) return;
    // the ring is drawn round it in one stroke, then settles into its dashes
    const len = Math.ceil(this.ringPath.getTotalLength()) || 600;
    this.ringPath.animate([{ strokeDasharray: `${len} ${len}`, strokeDashoffset: len }, { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 }], { duration: 340, easing: 'ease-out' });
    this.name.animate([{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 220, delay: 120, easing: 'ease-out', fill: 'backwards' });
    this.items.forEach((it, i) => {
      const end = it.el.style.transform;
      it.el.animate([
        { transform: `translate(${c.x - it.w / 2}px, ${c.y - PILL_H / 2}px) scale(.3)`, opacity: 0 },
        { transform: end, opacity: 1 },
      ], { duration: 300, delay: 40 + i * 28, easing: 'cubic-bezier(.3, 1.45, .5, 1)', fill: 'backwards' });
    });
  }

  /** Refresh after the object changed (kept for the host; nothing on the ring shows its state). */
  refresh() {}

  /* ---------- speech bubbles ---------- */
  /** The object says something: a bubble out of it, its tail pointing at it; gone after a while. */
  flash(obj: DeskObject, text: string, ms = 2600) {
    let b = this.bubbles.get(obj);
    if (b) clearTimeout(b.t);
    else {
      const el = h('div', { class: 'om-bubble', role: 'status' });
      this.host.append(el);
      b = { el, t: 0 as unknown as ReturnType<typeof setTimeout> };
      this.bubbles.set(obj, b);
    }
    const el = b.el;
    el.textContent = text;
    el.classList.remove('out');
    this.placeBubble(obj, el);
    el.animate([{ transform: `${el.style.transform} scale(.6)`, opacity: 0 }, { transform: el.style.transform, opacity: 1 }],
      { duration: 260, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    b.t = setTimeout(() => {
      const a = el.animate([{ opacity: 1 }, { opacity: 0, transform: `${el.style.transform} translateY(-6px)` }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      a.finished.then(() => { el.remove(); this.bubbles.delete(obj); }, () => {});
    }, Math.max(1600, ms));
  }

  /** Everyone stops talking (the papers are fanned out, or a paper is opened). */
  hush() {
    for (const [o, b] of this.bubbles) {
      clearTimeout(b.t);
      b.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished.then(() => b.el.remove(), () => b.el.remove());
      this.bubbles.delete(o);
    }
  }

  /** Above the object (or below it, near the top of the screen), the tail on the object. */
  private placeBubble(obj: DeskObject, el: HTMLElement) {
    const r = this.scene.screenBox(obj);
    if (!r) return;
    const w = el.offsetWidth || 180, hh = el.offsetHeight || 40, cx = r.x + r.width / 2;
    const above = r.top - hh - 18 > 8;
    const x = Math.max(8, Math.min(innerWidth - w - 8, cx - w * 0.35));
    const y = above ? r.top - hh - 16 : r.bottom + 16;
    el.classList.toggle('below', !above);
    el.style.setProperty('--tail', `${Math.max(14, Math.min(w - 14, cx - x))}px`);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
}
