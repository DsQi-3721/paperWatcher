// Gestures on the desk: wheel/trackpad pan, pinch and ctrl-wheel zoom, drag-to-pan with inertia,
// space or middle-button panning, touch pinch. Pointer gestures that start on paper content can be
// claimed by a delegate (text selection, region capture, clicking notes) — everything else pans.
import { clamp } from '../util/dom';
import type { Pt } from '../util/geom';
import type { Camera } from './camera';

export interface PointerDelegate {
  down(e: PointerEvent, w: Pt): boolean;
  move(e: PointerEvent, w: Pt): void;
  up(e: PointerEvent, w: Pt): void;
  cancel(): void;
  hover(e: PointerEvent | null, w: Pt | null): void;
  /** A tap on bare desk (a pan gesture that never moved). */
  click?(e: PointerEvent, w: Pt): void;
}

export class Input {
  /** Off on the home desk, where the 3D scene takes the pointer (src/scene/orbit.ts). */
  enabled = true;
  spaceDown = false;
  private mode: 'none' | 'pan' | 'own' | 'pinch' = 'none';
  private last: Pt = { x: 0, y: 0 };
  private downAt: Pt = { x: 0, y: 0 };
  private vel: Pt = { x: 0, y: 0 };
  private lastT = 0;
  private touches = new Map<number, Pt>();
  private pinchStart: { d: number; c: Pt } | null = null;
  private activeId = -1;
  private hoverQueued = false;
  private hoverEv: PointerEvent | null = null;
  private gestureScale = 1;

  constructor(private cam: Camera, private el: HTMLElement, private delegate: PointerDelegate) {
    el.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', () => { if (this.mode === 'none') delegate.hover(null, null); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keep the browser from page-zooming when the reader pinches anywhere on the app.
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    // Safari trackpad pinch.
    el.addEventListener('gesturestart' as any, (e: any) => { if (!this.enabled) return; e.preventDefault(); this.gestureScale = 1; });
    el.addEventListener('gesturechange' as any, (e: any) => {
      if (!this.enabled) return;
      e.preventDefault();
      const f = e.scale / this.gestureScale;
      this.cam.userAt = performance.now();
      this.gestureScale = e.scale;
      this.cam.zoomAt(e.clientX, e.clientY, f);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e) && this.enabled) {
        if (!this.spaceDown) { this.spaceDown = true; el.classList.add('space-pan'); }
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { this.spaceDown = false; el.classList.remove('space-pan'); }
    });
    window.addEventListener('blur', () => { this.spaceDown = false; el.classList.remove('space-pan'); });
  }

  private wheel(e: WheelEvent) {
    if (!this.enabled) return;
    e.preventDefault();
    // Resting fingers on a trackpad send a trickle of 1–3 px wheel events; during a camera flight they are
    // noise, not a wish to take over (otherwise the flight to an opening note stops halfway).
    if (this.cam.animating && !e.ctrlKey && !e.metaKey && e.deltaMode === 0 && Math.abs(e.deltaX) < 4 && Math.abs(e.deltaY) < 4) return;
    this.cam.userAt = performance.now();
    if (e.ctrlKey || e.metaKey) {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dz = clamp(-e.deltaY * unit * 0.0095, -0.35, 0.35);
      this.cam.zoomAt(e.clientX, e.clientY, Math.exp(dz));
      return;
    }
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 18; dy *= 18; } else if (e.deltaMode === 2) { dx *= this.cam.vw * 0.9; dy *= this.cam.vh * 0.9; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    this.cam.panBy(-dx, -dy);
  }

  private world(e: PointerEvent) {
    return this.cam.screenToWorld(e.clientX, e.clientY);
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.el.setPointerCapture(e.pointerId);
      if (this.touches.size === 2) {
        if (this.mode === 'own') this.delegate.cancel();
        this.mode = 'pinch';
        const [a, b] = [...this.touches.values()];
        this.pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), c: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        return;
      }
    }
    if (this.mode !== 'none' && this.mode !== 'pinch') return;
    if (e.button === 2) return;
    // A press catches a gliding desk; a running flight only stops once the reader actually drags.
    this.cam.stopFling();
    this.activeId = e.pointerId;
    this.last = { x: e.clientX, y: e.clientY };
    this.downAt = { x: e.clientX, y: e.clientY };
    this.vel = { x: 0, y: 0 };
    this.lastT = performance.now();
    const panOnly = this.spaceDown || e.button === 1;
    if (!panOnly && this.delegate.down(e, this.world(e))) {
      this.mode = 'own';
    } else {
      this.mode = 'pan';
      this.el.classList.add('panning');
      this.delegate.hover(null, null);
    }
    this.el.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.mode === 'pinch' && this.touches.size >= 2 && this.pinchStart) {
        this.cam.userAt = performance.now();
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.cam.panBy(c.x - this.pinchStart.c.x, c.y - this.pinchStart.c.y);
        this.cam.zoomAt(c.x, c.y, d / this.pinchStart.d);
        this.pinchStart = { d, c };
        return;
      }
    }
    if (this.mode === 'pan' && e.pointerId === this.activeId) {
      const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y;
      if (dx || dy) { this.cam.userAt = performance.now(); if (this.cam.animating) this.cam.stop(); }
      const now = performance.now();
      const dt = Math.max(1, now - this.lastT);
      this.vel = { x: 0.75 * (dx / dt) + 0.25 * this.vel.x, y: 0.75 * (dy / dt) + 0.25 * this.vel.y };
      this.lastT = now;
      this.last = { x: e.clientX, y: e.clientY };
      this.cam.panBy(dx, dy);
    } else if (this.mode === 'own' && e.pointerId === this.activeId) {
      // Selecting while the page glides away would be chaos: a drag on the paper holds the camera still.
      if (this.cam.animating && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 3) this.cam.stop();
      this.delegate.move(e, this.world(e));
    } else if (this.mode === 'none' && e.pointerType !== 'touch') {
      this.hoverEv = e;
      if (!this.hoverQueued) {
        this.hoverQueued = true;
        requestAnimationFrame(() => {
          this.hoverQueued = false;
          const ev = this.hoverEv;
          if (ev && this.mode === 'none') this.delegate.hover(ev, this.world(ev));
        });
      }
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.mode === 'pinch') {
        if (this.touches.size === 0) { this.mode = 'none'; this.pinchStart = null; }
        return;
      }
    }
    if (e.pointerId !== this.activeId) return;
    if (this.mode === 'pan') {
      this.el.classList.remove('panning');
      const still = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) < 4;
      if (!cancelled && still) this.delegate.click?.(e, this.world(e));
      else if (!cancelled && performance.now() - this.lastT < 60) this.cam.fling(this.vel.x, this.vel.y);
    } else if (this.mode === 'own') {
      if (cancelled) this.delegate.cancel();
      else this.delegate.up(e, this.world(e));
    }
    this.mode = 'none';
    this.activeId = -1;
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }
}

export function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}
