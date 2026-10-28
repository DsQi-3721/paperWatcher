// One printed page lying on the desk: paper, a soft shadow, the pdf raster, and an ink layer
// (page-point coordinates) for marks, selection and hints. Margin notes live in their own layer.
import type { Slot } from '../desk/layout';
import { sheetOutline } from '../ink/sketch';
import { h, s } from '../util/dom';
import { Rng } from '../util/rng';

export class PageView {
  el: HTMLDivElement;
  sheet: HTMLDivElement;
  shadow: HTMLDivElement;
  ink: SVGSVGElement;
  /** Layers inside `ink`, bottom to top. */
  gHighlight: SVGGElement;
  gSelect: SVGGElement;
  gMarks: SVGGElement;
  gHint: SVGGElement;
  notes: HTMLDivElement;
  canvas: HTMLCanvasElement | null = null;
  scale = 0;          // raster scale currently shown (0 = none)
  slot: Slot = { x: 0, y: 0, w: 0, h: 0, rot: 0 };

  constructor(public index: number, public w: number, public hgt: number) {
    const rng = new Rng(index * 7919 + 17);
    this.shadow = h('div', { class: 'pg-shadow' });
    this.ink = s('svg', { class: 'pg-ink', viewBox: `0 0 ${w} ${hgt}`, width: w, height: hgt, preserveAspectRatio: 'none' });
    this.gHighlight = s('g', { class: 'g-hl' });
    this.gSelect = s('g', { class: 'g-sel' });
    this.gMarks = s('g', { class: 'g-marks' });
    this.gHint = s('g', { class: 'g-hint' });
    this.ink.append(
      s('path', { class: 'pg-outline', d: sheetOutline({ x: 0.4, y: 0.4, w: w - 0.8, h: hgt - 0.8 }, rng, 0.5) }),
      this.gHighlight, this.gSelect, this.gMarks, this.gHint,
    );
    this.notes = h('div', { class: 'pg-notes' });
    this.sheet = h('div', { class: 'pg-sheet' }, h('div', { class: 'pg-print' }), this.ink, this.notes);
    this.el = h('div', { class: 'page', dataset: { i: String(index) } }, this.shadow, this.sheet,
      h('div', { class: 'pg-num' }, String(index + 1)));
    this.el.style.width = w + 'px';
    this.el.style.height = hgt + 'px';
  }

  setSlot(slot: Slot) {
    this.slot = slot;
    this.el.style.left = slot.x + 'px';
    this.el.style.top = slot.y + 'px';
    this.el.style.rotate = slot.rot ? `${slot.rot}deg` : '';
  }

  /** Show a rendered page. Only the very first print of a page may ink in (once, never again: a fade tied to
   *  CSS state would restart whenever that state changes); sharper re-renders swap in silently. */
  setRaster(canvas: HTMLCanvasElement, scale: number, fade = false) {
    const first = !this.canvas && !this.el.classList.contains('printed');
    canvas.className = 'pg-raster';
    const old = this.canvas;
    if (old) {
      old.replaceWith(canvas);
      // the print at the old resolution gives its pixels back at once (tens of MB at reading zoom), instead of
      // whenever the garbage collector gets to the detached element
      old.width = old.height = 0;
    } else this.sheet.insertBefore(canvas, this.ink);
    this.canvas = canvas;
    this.scale = scale;
    this.el.classList.add('printed');
    if (first && fade) canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
  }

  dropRaster() {
    if (!this.canvas) return;
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.canvas.remove();
    this.canvas = null;
    this.scale = 0;
  }

  /** Page-local point (page points) for a world point, accounting for rotation. */
  toLocal(wx: number, wy: number) {
    const { x, y, w, h: hh, rot } = this.slot;
    if (!rot) return { x: wx - x, y: wy - y };
    const cx = x + w / 2, cy = y + hh / 2;
    const a = (-rot * Math.PI) / 180;
    const dx = wx - cx, dy = wy - cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a) + w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + hh / 2 };
  }

  /** World point for a page-local point. */
  toWorld(px: number, py: number) {
    const { x, y, w, h: hh, rot } = this.slot;
    if (!rot) return { x: x + px, y: y + py };
    const a = (rot * Math.PI) / 180;
    const dx = px - w / 2, dy = py - hh / 2;
    return { x: x + w / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: y + hh / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
  }
}
