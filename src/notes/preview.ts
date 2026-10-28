// Hovering a doodle: the conversation appears beside it on a slip of tracing paper.
// Calm by design: it shows after the pointer rests on the mark, stays where it appeared (it does not chase
// the pointer), stays while the pointer rests on the mark or inside the slip, fades after a short grace
// period once the pointer has left both, and gets out of the way the moment anything else happens.
import { HAND_AI, HAND_USER, MessageView } from '../ink/handwriting';
import type { Annotation } from '../types';
import { h } from '../util/dom';
import type { Rect } from '../util/geom';

const W = 320;                // slip width; the text column is W - 62 (labels sit in a 38 px gutter)
const DWELL_MS = 320;     // the pointer must rest this long on a mark
const GRACE_MS = 520;     // after leaving both the mark and the slip
const STILL_PX = 7;       // how far the pointer may wander while resting
const FADE_MS = 200;      // matches the card's opacity transition

export class Preview {
  el: HTMLDivElement;
  private card: HTMLDivElement;
  private inner: HTMLDivElement;
  private shownId: string | null = null;
  private pendingId: string | null = null;
  private restAt = { x: 0, y: 0 };
  private dwell: ReturnType<typeof setTimeout> | undefined;
  private grace: ReturnType<typeof setTimeout> | undefined;
  private inside = false;
  private overId: string | null = null;   // the mark under the pointer right now
  private swap: ReturnType<typeof setTimeout> | undefined;
  onOpen: (id: string) => void = () => {};

  constructor(root: HTMLElement) {
    this.inner = h('div', { class: 'pv-inner' });
    this.card = h('div', { class: 'pv-card' }, this.inner, h('div', { class: 'pv-hint' }, '点一下展开完整对话'));
    this.el = h('div', { class: 'preview' }, this.card);
    this.el.addEventListener('pointerenter', () => { this.inside = true; this.cancelGrace(); });
    this.el.addEventListener('pointerleave', () => { this.inside = false; if (this.shownId) this.startGrace(); });
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.addEventListener('click', () => { const id = this.shownId; this.dismiss(); if (id) this.onOpen(id); });
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    root.append(this.el);
  }

  get visible() { return !!this.shownId; }

  /** Called with every hover update from the page: the mark under the pointer (or none). */
  hover(a: Annotation | null, x: number, y: number, markRect: Rect | null) {
    this.overId = a?.id ?? null;
    if (this.shownId) {
      if (a && a.id === this.shownId) { this.cancelGrace(); this.cancelDwell(); return; }  // still on its mark
      if (!this.inside) this.startGrace();                                                 // drifted away
      if (a) this.rest(a, x, y, markRect);                                                 // maybe another mark next
      else this.cancelDwell();
      return;
    }
    if (!a) { this.cancelDwell(); return; }
    this.rest(a, x, y, markRect);
  }

  /** Resting on a mark: show once the pointer has been (nearly) still long enough. */
  private rest(a: Annotation, x: number, y: number, markRect: Rect | null) {
    if (this.pendingId === a.id && Math.hypot(x - this.restAt.x, y - this.restAt.y) <= STILL_PX) return;
    this.cancelDwell();
    this.pendingId = a.id;
    this.restAt = { x, y };
    this.dwell = setTimeout(() => {
      this.dwell = undefined;
      this.pendingId = null;
      if (!this.shownId) { this.show(a, markRect, x, y); return; }
      // Another note's slip is still up: let it fade out completely first, never jump it across the page.
      this.dismiss();
      this.swap = setTimeout(() => { this.swap = undefined; if (this.overId === a.id) this.show(a, markRect, x, y); }, FADE_MS);
    }, DWELL_MS);
  }

  private show(a: Annotation, markRect: Rect | null, px: number, py: number) {
    const msgs = a.messages.filter((m) => m.text);
    if (!msgs.length) return;
    this.cancelGrace();
    if (this.shownId !== a.id) {
      this.inner.replaceChildren();
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
      const lastAi = [...msgs].reverse().find((m) => m.role === 'ai');
      if (msgs.length > 2) this.inner.append(h('div', { class: 'pv-more' }, `共 ${Math.ceil(msgs.length / 2)} 轮 · 最近一轮`));
      for (const m of [lastUser, lastAi]) {
        if (!m) continue;
        const v = new MessageView(m.role === 'user' ? HAND_USER : HAND_AI, W - 62, 'pv' + m.id, { animate: false });
        this.inner.append(h('div', { class: `pv-msg ${m.role}` }, h('span', { class: 'pv-who' }, m.role === 'user' ? '我' : 'AI'), v.el));
        v.update(m.text, false);
      }
    }
    this.shownId = a.id;
    this.place(markRect, px, py);
    this.el.classList.add('on');
  }

  /** Beside the mark (right of it, else left, else below), clamped to the window; fixed once placed. */
  private place(r: Rect | null, px: number, py: number) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = W, hh = 340, gap = 16;
    const m = r || { x: px - 4, y: py - 10, w: 8, h: 20 };
    let x = m.x + m.w + gap, y = m.y - 8;
    if (x + w > vw - 12) x = m.x - w - gap;
    if (x < 140) { x = Math.min(vw - w - 12, Math.max(140, m.x)); y = m.y + m.h + gap; }
    if (y + hh > vh - 70) y = Math.max(70, vh - 70 - hh);
    y = Math.max(70, y);
    this.el.style.left = Math.round(x) + 'px';
    this.el.style.top = Math.round(y) + 'px';
  }

  private startGrace() {
    if (this.grace) return;
    this.grace = setTimeout(() => { this.grace = undefined; if (!this.inside) this.dismiss(); }, GRACE_MS);
  }
  private cancelGrace() { clearTimeout(this.grace); this.grace = undefined; }
  private cancelDwell() {
    clearTimeout(this.dwell); this.dwell = undefined; this.pendingId = null;
    clearTimeout(this.swap); this.swap = undefined;
  }

  /** Anything else happened (click, scroll, key, selection, a sheet opened): fade away now. */
  dismiss() {
    this.cancelDwell();
    this.cancelGrace();
    this.inside = false;
    if (!this.shownId) return;
    this.shownId = null;
    this.el.classList.remove('on');
  }

  hide() { this.dismiss(); }
}
