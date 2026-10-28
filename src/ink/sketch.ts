// Hand-drawn geometry. Everything is generated once from a seed, so the wobble costs nothing at runtime
// (no SVG turbulence filters) and a doodle looks the same every time it is redrawn.
import { getStroke } from 'perfect-freehand';
import type { Pt, Rect } from '../util/geom';
import { Rng } from '../util/rng';

const f = (n: number) => (Math.round(n * 10) / 10).toString();

/** Catmull-Rom spline through the points as cubic Béziers. */
export function smoothPath(pts: Pt[], closed = false): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${f(pts[0].x)} ${f(pts[0].y)}`;
  if (pts.length === 2) return `M${f(pts[0].x)} ${f(pts[0].y)}L${f(pts[1].x)} ${f(pts[1].y)}`;
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${f(P[1].x)} ${f(P[1].y)}`;
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    d += `C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return closed ? d + 'Z' : d;
}

/** Points along a line with a slight bow and low-frequency wobble, like a quick pen stroke. */
export function wobblePoints(a: Pt, b: Pt, rng: Rng, amp = 1.2, bow = 0.012): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const n = Math.max(2, Math.min(14, Math.round(L / 28)));
  const bowAmt = rng.j(1) * bow * L;
  const ph1 = rng.range(0, Math.PI * 2), ph2 = rng.range(0, Math.PI * 2);
  const k1 = rng.range(0.8, 1.6), k2 = rng.range(2.2, 3.6);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const w = Math.sin(Math.PI * t) * bowAmt + amp * (0.7 * Math.sin(ph1 + t * Math.PI * k1) + 0.3 * Math.sin(ph2 + t * Math.PI * k2)) * Math.min(1, 4 * t * (1 - t) + 0.25);
    pts.push({ x: a.x + dx * t + nx * w, y: a.y + dy * t + ny * w });
  }
  return pts;
}

export function wobblyLine(a: Pt, b: Pt, rng: Rng, amp = 1.2, bow = 0.012) {
  return smoothPath(wobblePoints(a, b, rng, amp, bow));
}

/** A box drawn as four strokes that overshoot at the corners. */
export function roughRect(r: Rect, rng: Rng, o: { amp?: number; over?: number; passes?: number } = {}): string {
  const amp = o.amp ?? 1.1;
  const over = o.over ?? Math.min(6, Math.min(r.w, r.h) * 0.06 + 1.5);
  const passes = o.passes ?? 1;
  const { x, y, w, h } = r;
  let d = '';
  for (let p = 0; p < passes; p++) {
    const j = () => rng.j(over * 0.5);
    const sides: [Pt, Pt][] = [
      [{ x: x - over * rng.next(), y: y + j() }, { x: x + w + over * rng.next(), y: y + j() }],
      [{ x: x + w + j(), y: y - over * rng.next() }, { x: x + w + j(), y: y + h + over * rng.next() }],
      [{ x: x + w + over * rng.next(), y: y + h + j() }, { x: x - over * rng.next(), y: y + h + j() }],
      [{ x: x + j(), y: y + h + over * rng.next() }, { x: x + j(), y: y - over * rng.next() }],
    ];
    for (const [a, b] of sides) d += wobblyLine(a, b, rng, amp, 0.008);
  }
  return d;
}

/** A closed wobbly outline for paper sheets (no overshoot). */
export function sheetOutline(r: Rect, rng: Rng, amp = 0.9): string {
  const { x, y, w, h } = r;
  const corners = [
    { x: x + rng.j(0.6), y: y + rng.j(0.6) },
    { x: x + w + rng.j(0.6), y: y + rng.j(0.6) },
    { x: x + w + rng.j(0.6), y: y + h + rng.j(0.6) },
    { x: x + rng.j(0.6), y: y + h + rng.j(0.6) },
  ];
  let pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const seg = wobblePoints(corners[i], corners[(i + 1) % 4], rng, amp, 0.003);
    pts = pts.concat(seg.slice(0, -1));
  }
  // Straight-ish segments joined at sharp corners: draw as a polyline of short smooth runs.
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${f(pts[i].x)} ${f(pts[i].y)}`;
  return d + 'Z';
}

/** A loop drawn around something, ending past its start like a real pen circle. */
export function roughEllipse(cx: number, cy: number, rx: number, ry: number, rng: Rng, o: { overlap?: number; amp?: number } = {}): string {
  const overlap = o.overlap ?? rng.range(0.06, 0.16);
  const amp = o.amp ?? 0.05;
  const start = rng.range(-Math.PI * 0.95, -Math.PI * 0.55);
  const total = Math.PI * 2 * (1 + overlap);
  const n = Math.max(18, Math.round((rx + ry) / 3));
  const ph = rng.range(0, 6.28), k = rng.int(2, 3);
  const drift = { x: rng.j(rx * 0.05), y: rng.j(ry * 0.08) };
  const tilt = rng.j(0.08);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + total * t;
    const rr = 1 + amp * Math.sin(ph + a * k) + (t > 1 / (1 + overlap) ? 0.06 * (t - 0.9) * 10 : 0);
    const ex = Math.cos(a) * rx * rr, ey = Math.sin(a) * ry * rr;
    pts.push({
      x: cx + ex * Math.cos(tilt) - ey * Math.sin(tilt) + drift.x * t,
      y: cy + ex * Math.sin(tilt) + ey * Math.cos(tilt) + drift.y * t,
    });
  }
  return smoothPath(pts);
}

/** Underline: a single slightly bowed stroke, or a wavy one. */
export function underline(x1: number, x2: number, y: number, rng: Rng, wavy = false): string {
  if (!wavy) return wobblyLine({ x: x1 - rng.range(0, 2), y: y + rng.j(0.6) }, { x: x2 + rng.range(0, 3), y: y + rng.j(1) }, rng, 0.7, 0.01);
  const pts: Pt[] = [];
  const step = 3.2;
  const n = Math.max(2, Math.round((x2 - x1) / step));
  const amp = 1.6;
  for (let i = 0; i <= n; i++) {
    const x = x1 + ((x2 - x1) * i) / n;
    pts.push({ x, y: y + Math.sin(i * 1.7) * amp + rng.j(0.3) });
  }
  return smoothPath(pts);
}

/** A margin bracket spanning y1..y2. side = 'left' draws "[", 'right' draws "]". */
export function bracket(x: number, y1: number, y2: number, side: 'left' | 'right', rng: Rng, arm = 5): string {
  const s = side === 'left' ? 1 : -1;
  const top = { x: x + s * arm + rng.j(0.8), y: y1 + rng.j(0.8) };
  const tl = { x: x + rng.j(0.5), y: y1 + rng.j(0.5) };
  const bl = { x: x + rng.j(0.5), y: y2 + rng.j(0.5) };
  const bot = { x: x + s * arm + rng.j(0.8), y: y2 + rng.j(0.8) };
  return wobblyLine(top, tl, rng, 0.3, 0) + wobblyLine(tl, bl, rng, 0.8, 0.01) + wobblyLine(bl, bot, rng, 0.3, 0);
}

export interface ArrowGeom { body: string; head: string; end: Pt; dir: Pt; mid: Pt }

/** A curved hand-drawn arrow from a to b. bend > 0 bows to the left of the travel direction. */
export function arrow(a: Pt, b: Pt, rng: Rng, bend = 0.18, headSize?: number): ArrowGeom {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const k = bend * (0.85 + rng.next() * 0.3);
  const c1 = { x: a.x + dx * 0.3 + nx * L * k + rng.j(L * 0.02), y: a.y + dy * 0.3 + ny * L * k + rng.j(L * 0.02) };
  const c2 = { x: a.x + dx * 0.72 + nx * L * k * 0.8 + rng.j(L * 0.02), y: a.y + dy * 0.72 + ny * L * k * 0.8 + rng.j(L * 0.02) };
  const body = `M${f(a.x)} ${f(a.y)}C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(b.x)} ${f(b.y)}`;
  const tx = b.x - c2.x, ty = b.y - c2.y;
  const tl = Math.hypot(tx, ty) || 1;
  const dir = { x: tx / tl, y: ty / tl };
  const hs = headSize ?? Math.max(7, Math.min(15, L * 0.09));
  const ang = 0.42 + rng.j(0.06);
  const wing = (sgn: number) => {
    const ca = Math.cos(sgn * ang), sa = Math.sin(sgn * ang);
    const ux = -(dir.x * ca - dir.y * sa), uy = -(dir.x * sa + dir.y * ca);
    const len = hs * (0.9 + rng.next() * 0.2);
    return { x: b.x + ux * len, y: b.y + uy * len };
  };
  const w1 = wing(1), w2 = wing(-1);
  const head = `M${f(w1.x)} ${f(w1.y)}Q${f((w1.x + b.x) / 2 + rng.j(0.8))} ${f((w1.y + b.y) / 2 + rng.j(0.8))} ${f(b.x)} ${f(b.y)}Q${f((w2.x + b.x) / 2 + rng.j(0.8))} ${f((w2.y + b.y) / 2 + rng.j(0.8))} ${f(w2.x)} ${f(w2.y)}`;
  const mid = bezierPoint(a, c1, c2, b, 0.5);
  return { body, head, end: b, dir, mid };
}

export function bezierPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Closed outline of a pressure-shaped ink stroke through the points. */
export function inkStroke(points: Array<[number, number] | [number, number, number]>, size = 3, o: { thinning?: number; taper?: number; smoothing?: number } = {}): string {
  const stroke = getStroke(points as number[][], {
    size,
    thinning: o.thinning ?? 0.55,
    smoothing: o.smoothing ?? 0.6,
    streamline: 0.45,
    simulatePressure: points[0]?.length !== 3,
    start: { taper: o.taper ?? size * 2, cap: true },
    end: { taper: o.taper ?? size * 2.5, cap: true },
  });
  if (!stroke.length) return '';
  let d = `M${f(stroke[0][0])} ${f(stroke[0][1])}Q`;
  for (let i = 0; i < stroke.length; i++) {
    const [x0, y0] = stroke[i];
    const [x1, y1] = stroke[(i + 1) % stroke.length];
    d += `${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)} `;
  }
  return d + 'Z';
}

/** A highlighter swipe over a line box: a slightly irregular band with rounded, uneven ends. */
export function markerBand(r: Rect, rng: Rng): string {
  const pad = r.h * 0.12;
  const x1 = r.x - rng.range(0.5, 2.5), x2 = r.x + r.w + rng.range(0.5, 3);
  const y1 = r.y + pad * 0.3 + rng.j(0.6), y2 = r.y + r.h - pad * 0.2 + rng.j(0.6);
  const tilt = rng.j(0.6);
  const top = wobblePoints({ x: x1 + 1.5, y: y1 + tilt }, { x: x2 - 1, y: y1 - tilt }, rng, 0.35, 0.002);
  const bot = wobblePoints({ x: x2 - 1.5, y: y2 - tilt }, { x: x1 + 1, y: y2 + tilt }, rng, 0.35, 0.002);
  const capR = { x: x2 + rng.range(0.5, 2), y: (y1 + y2) / 2 + rng.j(1) };
  const capL = { x: x1 - rng.range(0.2, 1.5), y: (y1 + y2) / 2 + rng.j(1) };
  return smoothPath([...top, capR, ...bot, capL], true);
}

/** Parallel hatch strokes clipped by the caller; used for coloured-pencil fills. */
export function hatch(r: Rect, rng: Rng, gap = 4, angle = -0.9): string {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const diag = Math.hypot(r.w, r.h);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  let d = '';
  for (let o = -diag / 2; o <= diag / 2; o += gap * (0.85 + rng.next() * 0.3)) {
    const ax = cx + -sin * o - cos * diag / 2, ay = cy + cos * o - sin * diag / 2;
    const bx = cx + -sin * o + cos * diag / 2, by = cy + cos * o + sin * diag / 2;
    d += `M${f(ax + rng.j(1))} ${f(ay + rng.j(1))}L${f(bx + rng.j(1))} ${f(by + rng.j(1))}`;
  }
  return d;
}

/** Torn / perforated top edge for a pad sheet, as a closed path around the sheet. */
export function tornSheet(r: Rect, rng: Rng, torn: 'top' | 'none' = 'top'): string {
  const { x, y, w, h } = r;
  const pts: Pt[] = [];
  if (torn === 'top') {
    const n = Math.round(w / 7);
    for (let i = 0; i <= n; i++) pts.push({ x: x + (w * i) / n, y: y + (i % 2 ? rng.range(0.5, 2.6) : rng.range(-0.4, 1.0)) });
  } else {
    pts.push({ x, y }, { x: x + w, y });
  }
  pts.push({ x: x + w + rng.j(0.4), y: y + h }, { x: x + rng.j(0.4), y: y + h });
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${f(pts[i].x)} ${f(pts[i].y)}`;
  return d + 'Z';
}

export { Rng };
