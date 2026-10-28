// A paper laid out on the desk: page views, layout, raster rendering and page navigation.
import type { Desk } from './desk/desk';
import { computeLayout, type Slot } from './desk/layout';
import type { PaperDoc } from './pdf/doc';
import { PageView } from './pdf/pageview';
import { Renderer } from './pdf/renderer';
import type { LayoutMode } from './types';
import { tween, ease } from './util/anim';
import type { Pt, Rect } from './util/geom';

export const SIDE_ROOM = 980;   // desk space beside the pages for scratch sheets and stationery

export class Reader {
  views: PageView[] = [];
  renderer: Renderer;
  slots: Slot[] = [];
  bounds: Rect = { x: 0, y: 0, w: 0, h: 0 };
  layout: LayoutMode;
  private onRenderedCbs: Array<(i: number) => void> = [];
  private layoutListeners: Array<() => void> = [];

  constructor(public desk: Desk, public doc: PaperDoc, layout: LayoutMode = 'column') {
    this.layout = layout;
    doc.sizes.forEach((sz, i) => {
      const v = new PageView(i, sz.w, sz.h);
      this.views.push(v);
      desk.pages.append(v.el);
    });
    this.renderer = new Renderer(doc, this.views, desk.camera, (i) => this.onRenderedCbs.forEach((f) => f(i)));
    this.applyLayout(layout, false);
  }

  onFirstRender(fn: (i: number) => void) { this.onRenderedCbs.push(fn); }
  onLayout(fn: () => void) { this.layoutListeners.push(fn); }

  /** Desk rectangle that fits the pages plus room on both sides. */
  deskFor(b: Rect): Rect {
    const side = this.layout === 'grid' ? 700 : SIDE_ROOM;
    return { x: b.x - side, y: b.y - 640, w: b.w + side * 2, h: b.h + 640 + 520 };
  }

  applyLayout(mode: LayoutMode, animate = true) {
    const prevSlots = this.slots;
    this.layout = mode;
    const { slots, bounds } = computeLayout(this.doc.sizes, mode);
    this.slots = slots;
    this.bounds = bounds;
    this.desk.setDeskRect(this.deskFor(bounds));
    if (!animate || !prevSlots.length) {
      this.views.forEach((v, i) => v.setSlot(slots[i]));
    } else {
      // Pages slide across the desk to their new spots, a few at a time.
      this.views.forEach((v, i) => {
        const from = prevSlots[i], to = slots[i];
        tween(560, (k) => {
          v.setSlot({
            x: from.x + (to.x - from.x) * k,
            y: from.y + (to.y - from.y) * k,
            w: to.w, h: to.h,
            rot: from.rot + (to.rot - from.rot) * k + Math.sin(k * Math.PI) * ((i % 2) - 0.5) * 2.4,
          });
        }, ease.inOutCubic, Math.min(i, 14) * 22).done.then(() => v.setSlot(to));
      });
    }
    this.layoutListeners.forEach((f) => f());
    this.renderer.kick();
  }

  /** Page under a world point (with page-local coordinates). */
  pageAt(p: Pt, slack = 0): { view: PageView; x: number; y: number } | null {
    for (let i = this.views.length - 1; i >= 0; i--) {
      const v = this.views[i];
      const s = v.slot;
      if (p.x < s.x - slack - 20 || p.x > s.x + s.w + slack + 20 || p.y < s.y - slack - 20 || p.y > s.y + s.h + slack + 20) continue;
      const l = v.toLocal(p.x, p.y);
      if (l.x >= -slack && l.y >= -slack && l.x <= v.w + slack && l.y <= v.hgt + slack) return { view: v, x: l.x, y: l.y };
    }
    return null;
  }

  /** Index of the page closest to the viewport centre (the one being read). */
  currentPage(): number {
    const c = this.desk.camera.view;
    let best = 0, bd = Infinity;
    this.slots.forEach((s, i) => {
      const dx = c.x < s.x ? s.x - c.x : c.x > s.x + s.w ? c.x - s.x - s.w : 0;
      const dy = c.y < s.y ? s.y - c.y : c.y > s.y + s.h ? c.y - s.y - s.h : 0;
      const d = dx * 0.5 + dy;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** Zoom that makes a page (or a spread) fill the width comfortably. */
  readingZoom(i = this.currentPage()) {
    const cam = this.desk.camera;
    const s = this.slots[i];
    if (this.layout === 'spread') {
      const pair = i % 2 === 0 ? [i, i + 1] : [i - 1, i];
      const a = this.slots[pair[0]], b = this.slots[pair[1]] || a;
      const w = b.x + b.w - a.x;
      return Math.min((cam.vw - 150) / w, (cam.vh - 40) / Math.max(a.h, b.h) * 1.9, 3.2);
    }
    if (this.layout === 'grid') return Math.min((cam.vw - 150) / (this.bounds.w + 80), 1.2);
    return Math.min((cam.vw - Math.max(470, cam.vw * 0.33)) / s.w, 1.65);
  }

  /** Puts page i at the top of the screen at reading zoom, or at a given zoom keeping the horizontal
   *  position (page flips slide the paper vertically and nothing else). */
  viewForPage(i: number, keepZoom = false, yInPage = 0, zoom?: number, keepX?: number) {
    const cam = this.desk.camera;
    const idx = Math.max(0, Math.min(i, this.slots.length - 1));
    const s = this.slots[idx];
    const z = zoom ?? (keepZoom ? cam.view.z : this.readingZoom(idx));
    if (this.layout === 'grid' && !keepZoom && zoom === undefined) {
      const f = cam.fit(this.bounds, 60);
      return { ...f, z: Math.min(f.z, z) };
    }
    let cx = s.x + s.w / 2;
    if (this.layout === 'spread') {
      const j = idx % 2 === 0 ? idx : idx - 1;
      const a = this.slots[j], b = this.slots[j + 1] || a;
      cx = (a.x + b.x + b.w) / 2;
    }
    if (keepX !== undefined && this.layout !== 'grid') cx = keepX;
    const topPad = 24 / z;
    const y = this.layout === 'grid' ? s.y + s.h / 2 : s.y + yInPage - topPad + cam.vh / 2 / z;
    return { x: cx, y, z };
  }

  goToPage(i: number, opts: { keepZoom?: boolean; instant?: boolean } = {}) {
    const cam = this.desk.camera;
    const v = opts.keepZoom ? this.viewForPage(i, true, 0, cam.view.z, cam.view.x) : this.viewForPage(i);
    if (opts.instant) cam.set(v);
    // Same zoom: glide the paper; a zoom change gets the travelling flight.
    else if (opts.keepZoom) return cam.panTo(v);
    else return cam.flyTo(v, { maxDuration: 900 });
  }

  pageRect(i: number): Rect {
    const s = this.slots[i];
    return { x: s.x, y: s.y, w: s.w, h: s.h };
  }

  destroy() {
    this.renderer.destroy();
    for (const v of this.views) { v.dropRaster(); v.el.remove(); }
    this.views = [];
    this.doc.destroy();
  }
}
