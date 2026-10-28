// Small DOM helpers so UI code stays declarative without a framework.
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, any> & { class?: string; style?: string | Record<string, string | number>; dataset?: Record<string, string> };

function applyProps(el: Element, props?: Props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') {
      if (typeof v === 'string') el.setAttribute('style', v);
      else for (const [sk, sv] of Object.entries(v)) (el as HTMLElement).style.setProperty(sk, String(sv));
    } else if (k === 'dataset') Object.assign((el as HTMLElement).dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && !(el instanceof SVGElement)) (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el: Element, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el, props || undefined);
  append(el, children);
  return el;
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props || undefined);
  append(el, children);
  return el;
}

export function esc(str: string) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Coalesces calls into one per animation frame. */
export function rafThrottle<T extends (...a: any[]) => void>(fn: T): T {
  let queued = false;
  let lastArgs: any[] = [];
  return ((...args: any[]) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  }) as T;
}

export function debounce<T extends (...a: any[]) => void>(fn: T, ms: number): T & { cancel(): void; flush(): void } {
  let t: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: any[] = [];
  const d = ((...args: any[]) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => { t = undefined; fn(...lastArgs); }, ms);
  }) as T & { cancel(): void; flush(): void };
  d.cancel = () => { clearTimeout(t); t = undefined; };
  d.flush = () => { if (t !== undefined) { clearTimeout(t); t = undefined; fn(...lastArgs); } };
  return d;
}

/** Runs work when the browser is idle (falls back to a timeout in Safari). */
export function idle(fn: () => void, timeout = 600) {
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: any) => number);
  if (ric) ric(fn, { timeout });
  else setTimeout(fn, 32);
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Presses that only put something away (a popover, a card): what lies under them does not act on them as well. */
export const dismissed = new WeakSet<Event>();

/** While a popover is open: a press anywhere but on it closes it, except on what `keep` says (the button that opens
 *  it, which toggles it instead). Returns the switch that stops listening. */
export function onPressOutside(el: Element, keep: (t: Element) => boolean, close: () => void): () => void {
  const fn = (e: PointerEvent) => {
    const t = e.target as Element | null;
    if (t && !el.contains(t) && !keep(t)) { dismissed.add(e); close(); }
  };
  addEventListener('pointerdown', fn, true);
  return () => removeEventListener('pointerdown', fn, true);
}

/** A button that must be pressed twice for something hard to undo: the first press arms it (it says what will happen,
 *  in red, for a few seconds), the second does it. A stray click never throws anything away. */
export function twice(label: string, armed: string, run: () => void | Promise<void>, opts: { cls?: string; title?: string; html?: string; ms?: number } = {}): HTMLButtonElement {
  const b = h('button', { class: `twice ${opts.cls || ''}`, type: 'button', title: opts.title || label }) as HTMLButtonElement;
  const idle = () => { if (opts.html) b.innerHTML = opts.html; else b.textContent = label; b.classList.remove('armed'); };
  idle();
  let t: ReturnType<typeof setTimeout> | undefined;
  b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (b.disabled) return;
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = armed;
      clearTimeout(t);
      t = setTimeout(idle, opts.ms ?? 3500);
      return;
    }
    clearTimeout(t);
    b.disabled = true;
    try { await run(); } finally { b.disabled = false; idle(); }
  });
  for (const ev of ['pointerdown', 'pointerup', 'dblclick']) b.addEventListener(ev, (e) => e.stopPropagation());
  return b;
}

/** The next frame (after this one has been laid out and painted). */
export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export function uid(prefix = '') {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
