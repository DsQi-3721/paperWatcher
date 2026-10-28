// Moving round the desk by hand: drag to turn round it, right-drag / shift-drag / two fingers to slide, wheel /
// pinch to come closer (at the pointer), double-click to go back to the first view, arrow keys to turn. A press that
// hardly moves is a tap, handed to onTap with what was under the pointer when it went down. While moving, the scene
// draws quick frames; a crisp one follows once the camera has been still for a moment.
import * as E from './engine/index.js';
import type { DeskScene, View } from './scene';

const TAP_PX = 5, TAP_MS = 450, SETTLE_MS = 140;

export class OrbitInput {
  enabled = true;
  /** while this says so, the arrow keys are someone else's (arrange mode nudging a thing) */
  keysOff?: () => boolean;
  onTap?: (target: Element, e: PointerEvent) => void;
  onMove?: () => void;
  private pts = new Map<number, { x: number; y: number }>();
  private mode: 'orbit' | 'pan' | null = null;
  private start: { x: number; y: number; t: number; target: Element; view: View; moved: boolean } | null = null;
  private pinch: { d: number; mx: number; my: number } | null = null;
  private settleT: ReturnType<typeof setTimeout> | undefined;

  constructor(private scene: DeskScene, private el: HTMLElement) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('dblclick', (e) => { if (this.enabled && !(e.target as Element).closest('[data-obj],[data-paper]')) { this.onMove?.(); void this.scene.tween(this.scene.defaultView(), 700); } });
    el.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    addEventListener('keydown', this.key);
  }

  /** The camera moves at once (so the next pointer event adds to it), but the desk is redrawn once per screen frame:
   *  a mouse or trackpad can send several events in one. */
  private set(v: Partial<View>) {
    this.scene.stopTween();
    this.scene.view = this.clamp({ ...this.scene.view, ...v });
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.scene.render('draft'); this.onMove?.(); });
    clearTimeout(this.settleT);
    this.settleT = setTimeout(() => {
      if (this.frame) { cancelAnimationFrame(this.frame); this.frame = 0; }
      if (this.scene.needsFinal()) this.scene.render('final');
      this.onMove?.();
    }, SETTLE_MS);
  }
  private frame = 0;
  private clamp(v: View): View { return this.scene.clampView(v); }

  /** A slide on the screen (px) as a move of the pivot across its own level (so the camera keeps its height). */
  private planeDelta(sx: number, sy: number, view = this.scene.view) {
    E.setCam(view.yaw, view.pitch);
    const k = E.CAM_K * view.zoom;
    // screen x of a world step = k * (R . w), screen y = k * (-U . w); solve for w = (a, b, 0)
    const yr = view.yaw * Math.PI / 180, pr = view.pitch * Math.PI / 180;
    const R = [Math.sin(yr), -Math.cos(yr)], D = [Math.sin(pr) * Math.cos(yr), Math.sin(pr) * Math.sin(yr)];
    const det = R[0] * D[1] - R[1] * D[0];
    if (Math.abs(det) < 1e-6) return [0, 0];
    const X = sx / k, Y = sy / k;
    return [(X * D[1] - R[1] * Y) / det, (R[0] * Y - X * D[0]) / det];
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.el.setPointerCapture(e.pointerId); } catch { /* gone */ }
    if (this.pts.size === 2) {
      const [a, b] = [...this.pts.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      this.mode = 'pan';
      if (this.start) this.start.moved = true;
      return;
    }
    this.mode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
    this.start = { x: e.clientX, y: e.clientY, t: performance.now(), target: e.target as Element, view: { ...this.scene.view }, moved: false };
  };

  private move = (e: PointerEvent) => {
    if (!this.enabled || !this.pts.has(e.pointerId) || !this.start) return;
    const prev = this.pts.get(e.pointerId)!;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.start.moved && Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) < TAP_PX) return;
    this.start.moved = true;
    this.el.classList.add('dragging');
    if (this.pinch && this.pts.size === 2) {
      const [a, b] = [...this.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.zoomAt(mx, my, d / this.pinch.d, { dx: mx - this.pinch.mx, dy: my - this.pinch.my });
      this.pinch = { d, mx, my };
      return;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y, v = this.scene.view;
    if (this.mode === 'orbit') this.set({ yaw: v.yaw - dx * 0.32, pitch: v.pitch + dy * 0.25 });
    else { const [a, b] = this.planeDelta(dx, dy); this.set({ cx: v.cx - a, cy: v.cy - b }); }
  };

  private up = (e: PointerEvent) => {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    if (this.pts.size < 2) this.pinch = null;
    if (this.pts.size) return;
    this.el.classList.remove('dragging');
    const s = this.start;
    this.start = null;
    this.mode = null;
    if (s && !s.moved && performance.now() - s.t < TAP_MS && this.enabled) this.onTap?.(s.target, e);
  };

  /** Come closer to (or back from) the point under (sx, sy), keeping it under the pointer. */
  private zoomAt(sx: number, sy: number, factor: number, pan?: { dx: number; dy: number }) {
    const v = this.scene.view, r = this.el.getBoundingClientRect();
    const z1 = this.clamp({ ...v, zoom: v.zoom * factor }).zoom;
    const [a, b] = this.planeDelta(sx - r.left - r.width / 2, sy - r.top - r.height / 2);
    const k = 1 - v.zoom / z1;
    let cx = v.cx + a * k, cy = v.cy + b * k;
    if (pan) { const [pa, pb] = this.planeDelta(pan.dx, pan.dy, { ...v, zoom: z1 }); cx -= pa; cy -= pb; }
    this.set({ zoom: z1, cx, cy });
  }

  private wheel = (e: WheelEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    // a pinch on a trackpad arrives as ctrl+wheel; a mouse wheel or two-finger scroll zooms too, more gently
    const k = e.ctrlKey ? 0.012 : e.deltaMode === 1 ? 0.06 : 0.0022;
    this.zoomAt(e.clientX, e.clientY, Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * k));
  };

  private key = (e: KeyboardEvent) => {
    if (!this.enabled || e.metaKey || e.ctrlKey || e.altKey || this.keysOff?.()) return;
    const t = e.target as HTMLElement;
    if (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName))) return;
    const v = this.scene.view;
    const step: Record<string, Partial<View>> = {
      ArrowLeft: { yaw: v.yaw + 15 }, ArrowRight: { yaw: v.yaw - 15 }, ArrowUp: { pitch: v.pitch + 8 }, ArrowDown: { pitch: v.pitch - 8 },
      '=': { zoom: v.zoom * 1.25 }, '+': { zoom: v.zoom * 1.25 }, '-': { zoom: v.zoom / 1.25 },
    };
    const to = step[e.key];
    if (!to) return;
    e.preventDefault();
    void this.scene.tween(this.clamp({ ...v, ...to }), 260);
  };
}
