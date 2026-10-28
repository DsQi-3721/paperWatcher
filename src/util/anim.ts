// One shared requestAnimationFrame loop that only runs while something is animating (energy first).
type FrameFn = (now: number, dt: number) => boolean | void; // return false to stop

const active = new Set<FrameFn>();
let raf = 0;
let last = 0;

function loop(now: number) {
  const dt = last ? Math.min(64, now - last) : 16;
  last = now;
  for (const fn of [...active]) {
    let keep: boolean | void;
    try {
      keep = fn(now, dt);
    } catch (e) {
      console.error(e);
      keep = false;
    }
    if (keep === false) active.delete(fn);
  }
  if (active.size) raf = requestAnimationFrame(loop);
  else { raf = 0; last = 0; }
}

/** Calls fn every frame until it returns false or the returned stop() is called. */
export function onFrame(fn: FrameFn): () => void {
  active.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => active.delete(fn);
}

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export interface Tween { cancel(): void; done: Promise<boolean> }

/** Animates a 0→1 progress value. Resolves true when finished, false when cancelled. */
export function tween(duration: number, onUpdate: (p: number, raw: number) => void, easing: (t: number) => number = ease.inOutCubic, delay = 0): Tween {
  let resolve!: (v: boolean) => void;
  const done = new Promise<boolean>((r) => (resolve = r));
  let start = -1;
  let stopped = false;
  const stop = onFrame((now) => {
    if (stopped) return false;
    if (start < 0) start = now + delay;
    const raw = Math.min(1, Math.max(0, (now - start) / Math.max(1, duration)));
    if (now < start) return true;
    onUpdate(easing(raw), raw);
    if (raw >= 1) {
      resolve(true);
      return false;
    }
    return true;
  });
  return {
    cancel() {
      if (stopped) return;
      stopped = true;
      stop();
      resolve(false);
    },
    done,
  };
}

/** Critically-damped-ish spring stepper for physical motion. */
export class Spring {
  x: number;
  v = 0;
  target: number;
  constructor(x: number, public k = 170, public d = 22) {
    this.x = x;
    this.target = x;
  }
  step(dtMs: number) {
    const dt = Math.min(0.032, dtMs / 1000);
    const a = -this.k * (this.x - this.target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return Math.abs(this.v) > 0.01 || Math.abs(this.x - this.target) > 0.01;
  }
}

export const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
