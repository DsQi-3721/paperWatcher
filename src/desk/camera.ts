// The camera looks straight down at the desk. View = world point at the viewport centre + zoom.
// The whole world is one CSS-transformed layer, so panning and zooming are compositor work only.
import { onFrame, tween, ease, type Tween } from '../util/anim';
import { clamp } from '../util/dom';
import type { Pt, Rect } from '../util/geom';

export interface View { x: number; y: number; z: number }

type Listener = (v: View) => void;

export class Camera {
  view: View = { x: 0, y: 0, z: 1 };
  vw = window.innerWidth;
  vh = window.innerHeight;
  minZ = 0.05;
  maxZ = 10;
  bounds: Rect | null = null;
  moving = false;
  /** performance.now() of the last pan/zoom made by the reader (not by animations). */
  userAt = 0;

  private listeners = new Set<Listener>();
  private settleListeners = new Set<() => void>();
  private anim: Tween | null = null;
  private flingStop: (() => void) | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private shakeOff: Pt = { x: 0, y: 0 };

  constructor(public world: HTMLElement, public viewport: HTMLElement) {
    this.measure();
    new ResizeObserver(() => {
      this.measure();
      this.set({}, true);
    }).observe(viewport);
  }

  private measure() {
    const r = this.viewport.getBoundingClientRect();
    this.vw = r.width || window.innerWidth;
    this.vh = r.height || window.innerHeight;
  }

  onChange(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onSettle(fn: () => void) { this.settleListeners.add(fn); return () => this.settleListeners.delete(fn); }

  /** Moves the camera. User input cancels running flights unless `keepAnim`. */
  set(v: Partial<View>, keepAnim = false) {
    if (!keepAnim) this.stop();
    const z = clamp(v.z ?? this.view.z, this.minZ, this.maxZ);
    const p = this.clampXY(v.x ?? this.view.x, v.y ?? this.view.y, z);
    this.view = { x: p.x, y: p.y, z };
    this.apply();
  }

  private clampXY(x: number, y: number, z: number): Pt {
    const b = this.bounds;
    if (!b) return { x, y };
    const hw = this.vw / 2 / z, hh = this.vh / 2 / z;
    // Keep at least a third of the viewport over the desk.
    const x0 = b.x - hw * 0.34, x1 = b.x + b.w + hw * 0.34;
    const y0 = b.y - hh * 0.34, y1 = b.y + b.h + hh * 0.34;
    return {
      x: x1 - x0 < hw * 2 ? b.x + b.w / 2 : clamp(x, x0 + hw, x1 - hw),
      y: y1 - y0 < hh * 2 ? b.y + b.h / 2 : clamp(y, y0 + hh, y1 - hh),
    };
  }

  private transformFor(v: View, shake: Pt = { x: 0, y: 0 }) {
    const tx = this.vw / 2 - v.x * v.z + shake.x;
    const ty = this.vh / 2 - v.y * v.z + shake.y;
    return `translate(${tx}px, ${ty}px) scale(${v.z})`;
  }

  private apply() {
    this.world.style.transform = this.transformFor(this.view, this.shakeOff);
    if (!this.moving) {
      this.moving = true;
      this.world.style.willChange = 'transform';
      document.documentElement.classList.add('cam-moving');
    }
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.settle(), 180);
    for (const l of this.listeners) l(this.view);
  }

  private settle() {
    if (this.anim || this.flingStop || this.glideAnim) {
      this.settleTimer = setTimeout(() => this.settle(), 120);
      return;
    }
    this.moving = false;
    // Dropping will-change lets the browser re-raster text and ink crisply at the final zoom.
    this.world.style.willChange = '';
    document.documentElement.classList.remove('cam-moving');
    for (const l of this.settleListeners) l();
  }

  stop() {
    this.anim?.cancel();
    this.anim = null;
    this.glideAnim?.finish();
    this.target = null;
    this.stopFling();
  }

  /** Catch a gliding desk without cancelling a deliberate flight (e.g. to an opening note). */
  stopFling() {
    this.flingStop?.();
    this.flingStop = null;
  }

  get animating() { return !!this.anim; }

  screenToWorld(sx: number, sy: number): Pt {
    const { x, y, z } = this.view;
    return { x: (sx - this.vw / 2) / z + x, y: (sy - this.vh / 2) / z + y };
  }

  worldToScreen(wx: number, wy: number): Pt {
    const { x, y, z } = this.view;
    return { x: (wx - x) * z + this.vw / 2, y: (wy - y) * z + this.vh / 2 };
  }

  /** The world rectangle currently visible. */
  visibleRect(margin = 0): Rect {
    const { x, y, z } = this.view;
    const w = this.vw / z, h = this.vh / z;
    return { x: x - w / 2 - margin, y: y - h / 2 - margin, w: w + 2 * margin, h: h + 2 * margin };
  }

  panBy(dx: number, dy: number) {
    const z = this.view.z;
    this.set({ x: this.view.x - dx / z, y: this.view.y - dy / z });
  }

  zoomAt(sx: number, sy: number, factor: number) {
    const z0 = this.view.z;
    const z1 = clamp(z0 * factor, this.minZ, this.maxZ);
    if (z1 === z0) return;
    const w = this.screenToWorld(sx, sy);
    this.set({ z: z1, x: w.x - (sx - this.vw / 2) / z1, y: w.y - (sy - this.vh / 2) / z1 });
  }

  /** Smallest view that shows the rect with padding (screen px). */
  fit(r: Rect, pad = 48, maxZ = this.maxZ, padRight = pad): View {
    return this.fitInset(r, { l: pad, r: padRight, t: pad, b: pad }, maxZ);
  }

  /** Like fit(), with separate insets for each screen edge (to keep clear of on-screen UI). */
  fitInset(r: Rect, ins: { l: number; r: number; t: number; b: number }, maxZ = this.maxZ): View {
    const z = clamp(Math.min((this.vw - ins.l - ins.r) / r.w, (this.vh - ins.t - ins.b) / r.h), this.minZ, maxZ);
    return { x: r.x + r.w / 2 - (ins.l - ins.r) / 2 / z, y: r.y + r.h / 2 - (ins.t - ins.b) / 2 / z, z };
  }

  /** Smooth flight using the van Wijk–Nuij optimal zoom path (zooms out for long trips). */
  flyTo(target: View, opts: { duration?: number; maxDuration?: number } = {}): Promise<boolean> {
    this.stop();
    const z1 = clamp(target.z, this.minZ, this.maxZ);
    const t1 = this.clampXY(target.x, target.y, z1);
    const p0 = { x: this.view.x, y: this.view.y, w: this.vw / this.view.z };
    const p1 = { x: t1.x, y: t1.y, w: this.vw / z1 };
    const interp = zoomInterpolator(p0, p1);
    const dur = opts.duration ?? clamp(interp.S * 520, 320, opts.maxDuration ?? 1300);
    this.target = { x: t1.x, y: t1.y, z: z1 };
    const t = tween(dur, (k) => {
      const p = interp.at(k);
      this.set({ x: p.x, y: p.y, z: this.vw / p.w }, true);
    }, ease.inOutCubic);
    this.anim = t;
    return t.done.then((ok) => {
      if (this.anim === t) { this.anim = null; this.target = null; }
      return ok;
    });
  }

  /** A straight glide with no zoom bump in between (page flips): only the paper slides, the zoom the reader
   *  chose is kept exactly. Starting a new glide mid-way continues smoothly from where the paper is. */
  panTo(target: View, opts: { duration?: number } = {}): Promise<boolean> {
    this.stop();
    const z0 = this.view.z;
    const z1 = clamp(target.z, this.minZ, this.maxZ);
    const t1 = this.clampXY(target.x, target.y, z1);
    const x0 = this.view.x, y0 = this.view.y;
    const dist = Math.hypot((t1.x - x0) * z1, (t1.y - y0) * z1);
    const dur = opts.duration ?? clamp(180 + dist * 0.12, 220, 520);
    this.target = { x: t1.x, y: t1.y, z: z1 };
    const t = tween(dur, (k) => {
      this.set({ x: x0 + (t1.x - x0) * k, y: y0 + (t1.y - y0) * k, z: z0 * Math.pow(z1 / z0, k) }, true);
    }, ease.outCubic);
    this.anim = t;
    return t.done.then((ok) => {
      if (this.anim === t) { this.anim = null; this.target = null; }
      return ok;
    });
  }

  /** Where the running glide/flight is heading (null when the camera is still). */
  target: View | null = null;

  private glideAnim: Animation | null = null;

  /**
   * The same flight as flyTo(), but run by the compositor (Web Animations) instead of per-frame script. The
   * browser then rasterizes the paper once at the largest zoom of the trip, so a big zoom-in (the opening
   * shot) stays sharp all the way instead of arriving blurry and sharpening at the end.
   */
  glide(target: View, duration: number): Promise<void> {
    this.stop();
    const z1 = clamp(target.z, this.minZ, this.maxZ);
    const t1 = this.clampXY(target.x, target.y, z1);
    const to: View = { x: t1.x, y: t1.y, z: z1 };
    const interp = zoomInterpolator({ x: this.view.x, y: this.view.y, w: this.vw / this.view.z }, { x: to.x, y: to.y, w: this.vw / to.z });
    const N = 18;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      const p = interp.at(ease.inOutCubic(i / N));
      frames.push({ transform: this.transformFor({ x: p.x, y: p.y, z: this.vw / p.w }), offset: i / N });
    }
    this.target = to;
    this.moving = true;
    clearTimeout(this.settleTimer);
    this.world.style.willChange = 'transform';
    document.documentElement.classList.add('cam-moving');
    const anim = this.world.animate(frames, { duration, fill: 'forwards' });
    this.glideAnim = anim;
    return anim.finished.then(() => undefined, () => undefined).then(() => {
      if (this.glideAnim !== anim) return;
      this.glideAnim = null;
      this.target = null;
      // hand over to the inline transform in the same frame, then let the camera settle as usual
      this.view = to;
      this.apply();
      anim.cancel();
    });
  }

  /** Inertial pan after a drag; velocity in screen px per ms. */
  fling(vx: number, vy: number) {
    const speed = Math.hypot(vx, vy);
    if (speed < 0.15) return;
    let v = { x: vx, y: vy };
    this.flingStop?.();
    const stop = onFrame((_, dt) => {
      const decay = Math.exp(-dt / 280);
      v = { x: v.x * decay, y: v.y * decay };
      this.panByKeep(v.x * dt, v.y * dt);
      if (Math.hypot(v.x, v.y) < 0.02) {
        this.flingStop = null;
        return false;
      }
    });
    this.flingStop = stop;
  }

  private panByKeep(dx: number, dy: number) {
    const z = this.view.z;
    this.set({ x: this.view.x - dx / z, y: this.view.y - dy / z }, true);
  }

  /** A tiny thud, e.g. when a paper stack lands. */
  shake(amp = 3, ms = 220) {
    const start = performance.now();
    onFrame((now) => {
      const t = (now - start) / ms;
      if (t >= 1) {
        this.shakeOff = { x: 0, y: 0 };
        this.apply();
        return false;
      }
      const a = amp * (1 - t) * (1 - t);
      this.shakeOff = { x: Math.sin(t * 38) * a, y: Math.cos(t * 31) * a * 0.8 };
      this.apply();
    });
  }
}

/** d3-style interpolateZoom on (center x, center y, view width). */
function zoomInterpolator(p0: { x: number; y: number; w: number }, p1: { x: number; y: number; w: number }) {
  const rho = 1.35, rho2 = rho * rho, rho4 = rho2 * rho2;
  const ux0 = p0.x, uy0 = p0.y, w0 = p0.w;
  const ux1 = p1.x, uy1 = p1.y, w1 = p1.w;
  const dx = ux1 - ux0, dy = uy1 - uy0;
  const d2 = dx * dx + dy * dy;
  if (d2 < 1e-6) {
    const S = Math.abs(Math.log(w1 / w0)) / rho;
    return {
      S: Math.max(S, 0.3),
      at: (t: number) => ({ x: ux0 + t * dx, y: uy0 + t * dy, w: w0 * Math.pow(w1 / w0, t) }),
    };
  }
  const d1 = Math.sqrt(d2);
  const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
  const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
  const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
  const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
  const S = (r1 - r0) / rho;
  return {
    S,
    at: (t: number) => {
      const s = t * S;
      const coshr0 = Math.cosh(r0);
      const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
      return { x: ux0 + u * dx, y: uy0 + u * dy, w: (w0 * coshr0) / Math.cosh(rho * s + r0) };
    },
  };
}
