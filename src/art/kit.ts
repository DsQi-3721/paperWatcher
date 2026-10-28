// Illustration kit for things on the desk, drawn like a cel-shaded 3D render: fine warm-black ink contours
// with a little natural wobble, clean flat colour in three tones per material (a pale top lit from above,
// the local colour on sides that face the light, a deeper, more saturated tone on sides that turn away),
// hatching in the material's own deep tone, and solid cobalt cast shadows from one light (upper left).
// Things have real height: the camera hangs above the middle of the desk, so tall things near the edges
// lean outward a little and show the side facing the middle (`lean` = outward shift per unit of height).
// Everything is emitted as SVG strings once; nothing here runs per frame.
import { Rng } from '../util/rng';

export const INK = '#231e16';
export const SHADOW = '#41538f';
/** Where a shadow falls, per unit of height (light from the upper left, fairly high). */
export const SUN = { x: 0.44, y: 0.56 };
/** Direction towards the light, in plan. */
export const LIGHT = { x: -0.62, y: -0.78 };

export interface V { x: number; y: number }
export type Tone = { l: string; m: string; d: string; dd: string };

export const P = {
  paper: '#fdfbf3',
  ceramic: { l: '#fffdf8', m: '#f2efe6', d: '#c9cce2', dd: '#9aa2cb' },
  mustard: { l: '#ffd96a', m: '#f4b829', d: '#c98a1c', dd: '#8a5a12' },
  tomato: { l: '#ff8f6e', m: '#ea6342', d: '#ac3a2c', dd: '#6e2420' },
  mint: { l: '#c6eed6', m: '#82c9a4', d: '#3d8c70', dd: '#22584a' },
  leaf: { l: '#bfe5a0', m: '#7fc477', d: '#3f8c5f', dd: '#245a48' },
  cobalt: { l: '#adc6f3', m: '#709ae0', d: '#4065b8', dd: '#273f80' },
  blush: { l: '#ffd3dc', m: '#f4a5ba', d: '#cb7291', dd: '#8a4463' },
  terra: { l: '#f8a677', m: '#e47a4c', d: '#b25036', dd: '#74301f' },
  wood: { l: '#f9ddb0', m: '#e9be82', d: '#c18751', dd: '#83542b' },
  metal: { l: '#f8fafc', m: '#d0d8e4', d: '#8f9dbe', dd: '#5c6990' },
  brass: { l: '#ffe292', m: '#eab246', d: '#b67b25', dd: '#7a4d16' },
  coffee: { l: '#bb8653', m: '#6c3e23', d: '#45261a', dd: '#2a1510' },
  dark: { l: '#6b6560', m: '#403b37', d: '#28241f', dd: '#171411' },
  graphite: '#3a3633',
};

let seq = 0;
export const uid = (p = 'a') => `${p}${(++seq).toString(36)}`;

export const f = (n: number) => (Math.round(n * 100) / 100).toString();
const pt = (p: V | [number, number]) => (Array.isArray(p) ? `${f(p[0])} ${f(p[1])}` : `${f(p.x)} ${f(p.y)}`);
export const poly = (pts: Array<[number, number]>) => 'M' + pts.map(pt).join('L') + 'Z';

/** Which of a material's tones a surface gets, by the direction its normal faces in plan. */
export function toneFor(t: Tone, nx: number, ny: number): string {
  const L = Math.hypot(nx, ny) || 1;
  const k = (nx * LIGHT.x + ny * LIGHT.y) / L;
  return k > 0.35 ? t.l : k > -0.3 ? t.m : t.d;
}

/** Slightly wavering polyline through points: a pen line, not a ruler line. */
export function inkPath(pts: Array<[number, number]>, rng: Rng, amp = 0.35, closed = false): string {
  if (!pts.length) return '';
  const out: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    out.push([x0 + rng.j(amp), y0 + rng.j(amp)]);
    const nxt = pts[(i + 1) % pts.length];
    if (i < pts.length - 1 || closed) {
      const [x1, y1] = nxt;
      const L = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.floor(L / 26);
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1);
        const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
        const w = rng.j(amp * 0.9);
        out.push([x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w]);
      }
    }
  }
  let d = `M${f(out[0][0])} ${f(out[0][1])}`;
  for (let i = 1; i < out.length; i++) d += `L${f(out[i][0])} ${f(out[i][1])}`;
  return closed ? d + 'Z' : d;
}

/** A circle drawn by hand: radius breathes a little, the stroke closes on itself. */
export function inkCircle(cx: number, cy: number, r: number, rng: Rng, amp = 0.3): string {
  const n = Math.max(28, Math.round(r * 0.9));
  const ph = rng.range(0, 6.28);
  let d = '';
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r + Math.sin(a * 3 + ph) * amp + Math.sin(a * 7 + ph * 2) * amp * 0.4;
    d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
  }
  return d + 'Z';
}

export function circlePath(cx: number, cy: number, r: number) {
  return `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
}

export function ringPath(cx: number, cy: number, r0: number, r1: number) {
  return circlePath(cx, cy, r1) + ' ' + circlePath(cx, cy, r0);
}

const circlePts = (c: V, r: number, n = 72): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [c.x + Math.cos((i / n) * Math.PI * 2) * r, c.y + Math.sin((i / n) * Math.PI * 2) * r]);

/** Parallel hatch lines over a box, at an angle (degrees), clipped to a shape. */
export function hatch(shape: string, box: [number, number, number, number], o: { gap?: number; angle?: number; width?: number; opacity?: number; color?: string; rng?: Rng } = {}): string {
  const id = uid('h');
  const [x, y, w, h] = box;
  const gap = o.gap ?? 3.2, ang = ((o.angle ?? 38) * Math.PI) / 180;
  const cx = x + w / 2, cy = y + h / 2, R = Math.hypot(w, h) / 2 + 2;
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
  const rng = o.rng || new Rng(7);
  let lines = '';
  for (let t = -R; t <= R; t += gap * (0.85 + rng.next() * 0.3)) {
    const px = cx + nx * t, py = cy + ny * t;
    const a = rng.range(0.82, 1);
    lines += `M${f(px - ux * R * a)} ${f(py - uy * R * a)}L${f(px + ux * R * a)} ${f(py + uy * R * a)}`;
  }
  return `<clipPath id="${id}"><path d="${shape}" clip-rule="evenodd"/></clipPath><path d="${lines}" clip-path="url(#${id})" fill="none" stroke="${o.color ?? INK}" stroke-width="${o.width ?? 0.55}" stroke-opacity="${o.opacity ?? 0.5}" stroke-linecap="round"/>`;
}

/** Stipple dots inside a shape (soil, rubber, felt). */
export function stipple(shape: string, box: [number, number, number, number], n: number, rng: Rng, o: { r?: number; color?: string; opacity?: number } = {}): string {
  const id = uid('s');
  let dots = '';
  const [x, y, w, h] = box;
  for (let i = 0; i < n; i++) {
    const r = (o.r ?? 0.6) * rng.range(0.6, 1.3);
    dots += circlePath(x + rng.next() * w, y + rng.next() * h, r);
  }
  return `<clipPath id="${id}"><path d="${shape}"/></clipPath><path d="${dots}" clip-path="url(#${id})" fill="${o.color ?? INK}" fill-opacity="${o.opacity ?? 0.45}"/>`;
}

/** Shadow of an upright cylinder of the given height: the base circle swept along the light. */
export function cylinderShadow(cx: number, cy: number, r: number, height: number): string {
  const dx = SUN.x * height, dy = SUN.y * height;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const a1 = { x: cx + nx * r, y: cy + ny * r }, a2 = { x: cx - nx * r, y: cy - ny * r };
  const b1 = { x: a1.x + dx, y: a1.y + dy }, b2 = { x: a2.x + dx, y: a2.y + dy };
  return `M${f(a1.x)} ${f(a1.y)}L${f(b1.x)} ${f(b1.y)}A${f(r)} ${f(r)} 0 0 0 ${f(b2.x)} ${f(b2.y)}L${f(a2.x)} ${f(a2.y)}A${f(r)} ${f(r)} 0 0 1 ${f(a1.x)} ${f(a1.y)}Z`;
}

/** Shadow of a convex flat shape lifted to a height: hull of the outline and its offset copy. */
export function hullShadow(pts: Array<[number, number]>, height: number): string {
  const dx = SUN.x * height, dy = SUN.y * height;
  const all = [...pts, ...pts.map(([x, y]) => [x + dx, y + dy] as [number, number])];
  return poly(convexHull(all));
}

export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

/** A flat cel-shaded cast shadow: one solid shape in shadow blue. */
export function castShadow(d: string, opacity = 1): string {
  return `<path d="${d}" fill="${SHADOW}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''}/>`;
}

/** Rotate a list of points about the origin (degrees). */
export function rot(pts: Array<[number, number]>, deg: number, ox = 0, oy = 0): Array<[number, number]> {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [ox + (x - ox) * c - (y - oy) * s, oy + (x - ox) * s + (y - oy) * c]);
}

/** Shift points by lean·z: where a point at height z lands in the picture. */
export const up = (pts: Array<[number, number]>, lean: V, z: number): Array<[number, number]> =>
  pts.map(([x, y]) => [x + lean.x * z, y + lean.y * z]);

export const svg = (vb: [number, number, number, number], body: string, cls = '') =>
  `<svg class="art ${cls}" viewBox="${vb.map(f).join(' ')}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" overflow="visible">${body}</svg>`;

/** Where light still reaches the desk inside a hollow cylinder (a tape core): the overlap of the opening and
 *  the opening shifted against the light. Everything else inside is shade. */
export function litLens(cx: number, cy: number, r: number, height: number): string {
  const dx = -SUN.x * height, dy = -SUN.y * height;
  const d = Math.hypot(dx, dy);
  if (d >= 2 * r) return '';
  const mx = cx + dx / 2, my = cy + dy / 2;
  const hh = Math.sqrt(r * r - (d / 2) ** 2);
  const ux = -dy / d, uy = dx / d;
  const p1 = [mx + ux * hh, my + uy * hh], p2 = [mx - ux * hh, my - uy * hh];
  return `M${f(p1[0])} ${f(p1[1])}A${f(r)} ${f(r)} 0 0 1 ${f(p2[0])} ${f(p2[1])}A${f(r)} ${f(r)} 0 0 1 ${f(p1[0])} ${f(p1[1])}Z`;
}

/** A small irregular blob (crumbs, pebbles, shavings' bits). */
export function blob(cx: number, cy: number, r: number, rng: Rng, n = 6): string {
  const ph = rng.range(0, 6.28);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2, rr = r * rng.range(0.65, 1.15);
    d += (i ? 'L' : 'M') + f(cx + Math.cos(a) * rr) + ' ' + f(cy + Math.sin(a) * rr);
  }
  return d + 'Z';
}

/* ---------------- solids ---------------- */

export interface Solid { svg: string; top: V; topPath: string; silhouette: string }

/**
 * An upright cylinder or frustum (radius r0 at z0, r1 at z1) standing at c: its wall in the material's mid tone,
 * the half turned from the light in the shade tone (optionally hatched), a glint where it turns to the light,
 * then the top face. Returns the top's centre and outline so the caller can draw on it.
 */
export function cylinder(o: {
  c: V; r0: number; r1?: number; z0?: number; z1: number; lean: V; wall: Tone; top?: string | null;
  rng: Rng; stroke?: number; hatchShade?: boolean; topStroke?: number;
}): Solid {
  const r1 = o.r1 ?? o.r0, z0 = o.z0 ?? 0;
  const b = { x: o.c.x + o.lean.x * z0, y: o.c.y + o.lean.y * z0 };
  const t = { x: o.c.x + o.lean.x * o.z1, y: o.c.y + o.lean.y * o.z1 };
  const sil = poly(convexHull([...circlePts(b, o.r0), ...circlePts(t, r1)]));
  // the half of each rim facing away from the light, and the band between them
  const away = (c: V, r: number) => circlePts(c, r, 72).filter(([x, y]) => (x - c.x) * LIGHT.x + (y - c.y) * LIGHT.y < 0.02 * r);
  const shade = poly(convexHull([...away(b, o.r0), ...away(t, r1)]));
  const sw = o.stroke ?? 1.3;
  let s = `<path d="${sil}" fill="${o.wall.m}"/>`;
  s += `<path d="${shade}" fill="${o.wall.d}"/>`;
  if (o.hatchShade) {
    const minX = Math.min(b.x - o.r0, t.x - r1), minY = Math.min(b.y - o.r0, t.y - r1);
    const maxX = Math.max(b.x + o.r0, t.x + r1), maxY = Math.max(b.y + o.r0, t.y + r1);
    s += hatch(shade, [minX, minY, maxX - minX, maxY - minY], { gap: 2.3, angle: 58, width: 0.5, opacity: 0.45, color: o.wall.dd, rng: o.rng });
  }
  // a glint where the wall turns towards the light
  const g0 = { x: b.x + LIGHT.x * o.r0 * 0.8, y: b.y + LIGHT.y * o.r0 * 0.8 }, g1 = { x: t.x + LIGHT.x * r1 * 0.8, y: t.y + LIGHT.y * r1 * 0.8 };
  if (Math.hypot(g1.x - g0.x, g1.y - g0.y) > 4) s += `<path d="M${pt(g0)}L${pt(g1)}" stroke="${o.wall.l}" stroke-width="${f(Math.min(o.r0, r1) * 0.1)}" stroke-linecap="round"/>`;
  s += `<path d="${sil}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  const topPath = inkCircle(t.x, t.y, r1, o.rng, 0.2);
  if (o.top !== null) s += `<path d="${topPath}" fill="${o.top ?? o.wall.l}" stroke="${INK}" stroke-width="${f(o.topStroke ?? sw * 0.85)}"/>`;
  return { svg: s, top: t, topPath, silhouette: sil };
}

/**
 * An extruded convex polygon (footprint in plan, any winding) from z0 to z1: the side faces that turn towards
 * the middle of the view, in tones by the way they face the light, then the top face.
 */
export function prism(o: {
  pts: Array<[number, number]>; z0?: number; z1: number; lean: V; tone: Tone; top?: string | null; rng: Rng;
  stroke?: number; sideDetail?: (face: Array<[number, number]>, nx: number, ny: number) => string;
}): Solid & { topPts: Array<[number, number]> } {
  const z0 = o.z0 ?? 0;
  // clockwise on screen (y down, positive shoelace area), so that (ey, -ex) points outward
  let pts = o.pts;
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; area += x0 * y1 - x1 * y0; }
  if (area < 0) pts = [...pts].reverse();
  const base = up(pts, o.lean, z0), top = up(pts, o.lean, o.z1);
  const sw = o.stroke ?? 1.3;
  let s = '';
  let edges = '';
  const lx = o.lean.x * (o.z1 - z0), ly = o.lean.y * (o.z1 - z0);
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1];
    const nx = ey, ny = -ex;
    if (nx * lx + ny * ly >= -1e-6) continue;      // this face turns away from the camera
    const face: Array<[number, number]> = [base[i], base[j], top[j], top[i]];
    s += `<path d="${poly(face)}" fill="${toneFor(o.tone, nx, ny)}" stroke="${toneFor(o.tone, nx, ny)}" stroke-width=".4"/>`;
    if (o.sideDetail) s += o.sideDetail(face, nx, ny);
    edges += `M${pt(base[i])}L${pt(top[i])}`;
  }
  const sil = poly(convexHull([...base, ...top]));
  if (edges) s += `<path d="${edges}" stroke="${INK}" stroke-width="${f(sw * 0.55)}" stroke-opacity=".7" stroke-linecap="round"/>`;
  s += `<path d="${sil}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  const topPath = poly(top);
  if (o.top !== null) s += `<path d="${topPath}" fill="${o.top ?? o.tone.l}" stroke="${INK}" stroke-width="${f(sw * 0.85)}" stroke-linejoin="round"/>`;
  const cx = top.reduce((a, p) => a + p[0], 0) / top.length, cy = top.reduce((a, p) => a + p[1], 0) / top.length;
  return { svg: s, top: { x: cx, y: cy }, topPath, silhouette: sil, topPts: top };
}

/** A rounded rectangle footprint (w × h centred on 0,0, corner radius r) as polygon points, rotated. */
export function roundRect(w: number, h: number, r: number, deg = 0, steps = 4): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const corners: Array<[number, number, number]> = [[w / 2 - r, -h / 2 + r, -90], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 90], [-w / 2 + r, -h / 2 + r, 180]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = ((a0 + (90 * i) / steps) * Math.PI) / 180;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return rot(out, deg);
}

export { Rng };
