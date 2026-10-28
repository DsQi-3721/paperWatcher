// Hand-drawn arrows in world space: from what was asked about to the scratch sheet, and from the AI's
// references back to the exact words on the page.
import { arrow, smoothPath } from '../ink/sketch';
import { s } from '../util/dom';
import type { Pt } from '../util/geom';
import { hashStr, Rng } from '../util/rng';
import { animateDraw } from './marks';

export interface ArrowOpts {
  color: string;
  width?: number;
  bend?: number;
  animate?: boolean;
  delay?: number;
  dashed?: boolean;
  head?: boolean;
  cls?: string;
}

export class Arrows {
  private items = new Map<string, SVGGElement>();

  constructor(private layer: SVGSVGElement) {}

  draw(key: string, from: Pt, to: Pt, o: ArrowOpts): SVGGElement {
    this.remove(key, false);
    const rng = new Rng(hashStr(key));
    const g = arrow(from, to, rng, o.bend ?? 0.2);
    const w = o.width ?? 1.8;
    const grp = s('g', { class: `arrow ${o.cls || ''}`, style: `color:${o.color}` });
    const common = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    grp.append(s('path', { ...common, d: g.body, 'stroke-width': w, ...(o.dashed ? { 'stroke-dasharray': '7 6' } : {}) }));
    // a faint second pass, as when a pen goes over a line twice
    const echo = arrow({ x: from.x + rng.j(1.2), y: from.y + rng.j(1.2) }, { x: to.x + rng.j(0.8), y: to.y + rng.j(0.8) }, rng, (o.bend ?? 0.2) * 1.04);
    grp.append(s('path', { ...common, d: echo.body, 'stroke-width': w * 0.55, opacity: 0.35, class: 'echo' }));
    if (o.head !== false) grp.append(s('path', { ...common, d: g.head, 'stroke-width': w * 1.05 }));
    // a tiny dot where the pen started
    grp.append(s('circle', { cx: from.x, cy: from.y, r: w * 1.1, fill: 'currentColor', class: 'arrow-dot' }));
    this.layer.append(grp);
    this.items.set(key, grp);
    if (o.animate) animateDraw(grp, o.delay ?? 0);
    return grp;
  }

  /** A loose curly bracket / underline hugging a target, drawn with the arrow (for refs). */
  scribble(key: string, pts: Pt[], color: string, animate = true, delay = 0) {
    this.remove(key, false);
    const p = s('path', { d: smoothPath(pts), fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linecap': 'round', opacity: 0.85 });
    const grp = s('g', { class: 'arrow scribble' }, p);
    this.layer.append(grp);
    this.items.set(key, grp);
    if (animate) animateDraw(grp, delay);
  }

  has(key: string) { return this.items.has(key); }

  remove(key: string, animate = true) {
    const g = this.items.get(key);
    if (!g) return;
    this.items.delete(key);
    if (!animate) { g.remove(); return; }
    g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }).onfinish = () => g.remove();
  }

  clear(prefix = '', animate = true) {
    for (const k of [...this.items.keys()]) if (k.startsWith(prefix)) this.remove(k, animate);
  }
}
