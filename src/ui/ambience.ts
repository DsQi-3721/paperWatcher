// The light round whatever is being read (papers and books): the desk behind it blurred and dimmed, warmer or not,
// darker at the corners, and the page itself a little dimmer at night; and the immersive mode, which tucks the
// reading tools into the screen's edges until the pointer goes there (F toggles it). Kept in the browser, the same for
// papers and books. The desk scene only blurs once the camera has come down (`.scene.reading`), so the paper lands
// on a sharp desk and the room goes soft round it.
import { h } from '../util/dom';

export interface AmbienceSettings {
  /** blur of the desk behind the page, px */
  blur: number;
  /** brightness of the desk behind, 0.35..1.1 */
  bright: number;
  /** warm light, 0..1 */
  warm: number;
  /** darker corners, 0..1 */
  vignette: number;
  /** brightness of the page itself, 0.55..1 (night reading) */
  page: number;
  /** tools tucked into the edges */
  immersive: boolean;
}
export const AMBIENCE_DEFAULT: AmbienceSettings = { blur: 7, bright: 0.88, warm: 0.15, vignette: 0.35, page: 1, immersive: false };
const KEY = 'pw.reading.ambience';
type Edge = 'top' | 'bottom' | 'left' | 'right';
const EDGES: Edge[] = ['top', 'bottom', 'left', 'right'];
/** how close to an edge the pointer must come to bring its tools back, and how far it may wander before they go */
const NEAR: Record<Edge, number> = { top: 64, bottom: 72, left: 56, right: 56 }, KEEP: Record<Edge, number> = { top: 150, bottom: 150, left: 190, right: 190 };

export class Ambience {
  s: AmbienceSettings;
  private reading = false;
  private shown = new Set<Edge>();
  private hideT: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(s: AmbienceSettings) => void>();
  private veil: HTMLDivElement;

  constructor(scene: HTMLElement) {
    this.s = load();
    this.veil = h('div', { class: 'rd-veil', 'aria-hidden': 'true' });
    scene.append(this.veil);
    addEventListener('pointermove', this.track, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => this.hideSoon());
    this.apply();
  }

  /** Reading started or stopped: the light and the immersive mode only apply while something is open. */
  setReading(on: boolean) {
    this.reading = on;
    document.body.classList.toggle('reading-open', on);
    if (!on) this.reveal(new Set());
    this.apply();
  }

  set(patch: Partial<AmbienceSettings>) {
    this.s = { ...this.s, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode */ }
    this.apply();
    for (const f of this.listeners) f(this.s);
  }
  onChange(f: (s: AmbienceSettings) => void) { this.listeners.add(f); return () => this.listeners.delete(f); }

  get immersive() { return this.s.immersive; }
  setImmersive(on: boolean) { if (on !== this.s.immersive) this.set({ immersive: on }); }
  toggleImmersive() { this.setImmersive(!this.s.immersive); return this.s.immersive; }

  private apply() {
    const r = document.documentElement.style, s = this.s;
    r.setProperty('--rd-blur', `${s.blur.toFixed(1)}px`);
    r.setProperty('--rd-bright', s.bright.toFixed(3));
    r.setProperty('--rd-warm', s.warm.toFixed(3));
    r.setProperty('--rd-vig', s.vignette.toFixed(3));
    r.setProperty('--rd-page', s.page.toFixed(3));
    document.body.classList.toggle('dim-pages', s.page < 0.995);
    document.body.classList.toggle('immersive', this.reading && s.immersive);
  }

  /* ---------- immersive: tools come back where the pointer goes ---------- */
  private track = (e: PointerEvent) => {
    if (!this.reading || !this.s.immersive || e.pointerType === 'touch') return;
    const W = innerWidth, H = innerHeight, d: Record<Edge, number> = { top: e.clientY, bottom: H - e.clientY, left: e.clientX, right: W - e.clientX };
    const next = new Set<Edge>();
    for (const k of EDGES) if (d[k] < NEAR[k] || (this.shown.has(k) && d[k] < KEEP[k])) next.add(k);
    // an open card (contents, notes, settings) keeps everything where it is (looked for only when something would go)
    if ([...this.shown].some((k) => !next.has(k)) && document.querySelector('.card.on, .bk-panel.on')) for (const k of this.shown) next.add(k);
    if (next.size >= this.shown.size && [...next].every((k) => this.shown.has(k))) { if (next.size) clearTimeout(this.hideT); this.reveal(next); return; }
    // coming in at once, going after a moment (so a quick pass along an edge does not make things jump)
    const added = [...next].some((k) => !this.shown.has(k));
    if (added) { clearTimeout(this.hideT); this.reveal(new Set([...this.shown, ...next])); }
    else { clearTimeout(this.hideT); this.hideT = setTimeout(() => this.reveal(next), 650); }
  };
  private hideSoon() {
    if (!this.shown.size) return;
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { if (!document.querySelector('.card.on, .bk-panel.on')) this.reveal(new Set()); }, 900);
  }
  private reveal(edges: Set<Edge>) {
    this.shown = edges;
    for (const k of EDGES) document.body.classList.toggle('reveal-' + k, edges.has(k));
  }

  /* ---------- the settings, as a panel to put in a card ---------- */
  panel(): HTMLElement {
    const row = (label: string, key: keyof AmbienceSettings, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const v = this.s[key] as number;
      const out = h('span', { class: 'am-val' }, fmt(v));
      const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(v) }) as HTMLInputElement;
      input.addEventListener('input', () => { out.textContent = fmt(+input.value); this.set({ [key]: +input.value } as Partial<AmbienceSettings>); });
      return h('label', { class: 'am-row' }, h('span', { class: 'am-label' }, label), input, out);
    };
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const imm = h('button', { class: 'am-tog', type: 'button', 'aria-pressed': String(this.s.immersive) }, this.s.immersive ? '开' : '关') as HTMLButtonElement;
    imm.addEventListener('click', (e) => { e.stopPropagation(); const on = this.toggleImmersive(); imm.setAttribute('aria-pressed', String(on)); imm.textContent = on ? '开' : '关'; });
    const presets = h('div', { class: 'am-presets' }, ...([
      ['白天', { blur: 5, bright: 0.96, warm: 0.05, vignette: 0.2, page: 1 }],
      ['专注', { blur: 12, bright: 0.72, warm: 0.15, vignette: 0.55, page: 1 }],
      ['暖灯', { blur: 9, bright: 0.8, warm: 0.6, vignette: 0.45, page: 0.97 }],
      ['夜读', { blur: 14, bright: 0.45, warm: 0.35, vignette: 0.7, page: 0.82 }],
    ] as Array<[string, Partial<AmbienceSettings>]>).map(([name, p]) => {
      const b = h('button', { class: 'am-preset', type: 'button' }, name);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.set(p); el.replaceWith(this.panel()); });
      return b;
    }));
    const el = h('div', { class: 'ambience-panel' },
      presets,
      row('背景模糊', 'blur', 0, 24, 0.5, (v) => `${v.toFixed(0)} px`),
      row('背景亮度', 'bright', 0.35, 1.1, 0.01, pct),
      row('暖光', 'warm', 0, 1, 0.01, pct),
      row('四角暗角', 'vignette', 0, 1, 0.01, pct),
      row('页面亮度', 'page', 0.55, 1, 0.01, pct),
      h('div', { class: 'am-row' }, h('span', { class: 'am-label' }, '沉浸模式'), h('span', { class: 'am-hint' }, '工具收进屏幕边缘，鼠标移过去才出现 · F'), imm));
    return el;
  }
}

function load(): AmbienceSettings {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') return { ...AMBIENCE_DEFAULT, ...v };
  } catch { /* fresh */ }
  return { ...AMBIENCE_DEFAULT };
}
