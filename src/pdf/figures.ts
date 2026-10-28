// Finds figures, tables, algorithms and display equations on a page so they can be picked with one click.
// Works on pixels, so vector plots and raster images are found alike: render the page small, erase body
// text, label the remaining ink, then attach captions ("Figure 3: …") and booktabs rules for tables.
import type { FigureKind } from '../types';
import type { Rect } from '../util/geom';
import { union, unionAll } from '../util/geom';
import type { PageText } from './textmodel';

export interface Figure {
  kind: FigureKind;
  label?: string;
  rect: Rect;          // page points, caption included
  caption?: string;
}

const SCALE = 0.5;       // render scale for detection (1 px = 2 pt)
const CELL = 3;          // px per grid cell (6 pt)

export function detectFigures(canvas: HTMLCanvasElement, pt: PageText): Figure[] {
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = g.getImageData(0, 0, W, H).data;
  const ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const r = data[p], gg = data[p + 1], b = data[p + 2];
    const mn = Math.min(r, gg, b), mx = Math.max(r, gg, b);
    ink[i] = mn < 215 || mx - mn > 40 ? 1 : 0;
  }

  // Erase prose: lines in multi-line paragraphs or long lines. Short isolated text (axis labels, legends) stays.
  const longLine = new Uint8Array(pt.lines.length);
  for (const p of pt.paras) {
    const multi = p.l1 > p.l0;
    for (let li = p.l0; li <= p.l1; li++) {
      const l = pt.lines[li];
      const len = l.end - l.start;
      if ((multi && p.kind !== 'equation') || len > 40 || p.kind === 'caption' || p.kind === 'heading' || p.kind === 'margin') longLine[li] = 1;
    }
  }
  pt.lines.forEach((l, li) => {
    if (!longLine[li]) return;
    const x0 = Math.max(0, Math.floor(l.x0 * SCALE) - 1), x1 = Math.min(W - 1, Math.ceil(l.x1 * SCALE) + 1);
    const y0 = Math.max(0, Math.floor(l.y0 * SCALE) - 1), y1 = Math.min(H - 1, Math.ceil(l.y1 * SCALE) + 1);
    for (let y = y0; y <= y1; y++) ink.fill(0, y * W + x0, y * W + x1 + 1);
  });

  // Coarse grid + one cell of dilation.
  const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
  const grid = new Uint8Array(GW * GH);
  for (let y = 0; y < H; y++) {
    const gy = (y / CELL) | 0;
    for (let x = 0; x < W; x++) if (ink[y * W + x]) grid[gy * GW + ((x / CELL) | 0)] = 1;
  }
  const dil = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++)
    for (let x = 0; x < GW; x++) {
      if (!grid[y * GW + x]) continue;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < GW && ny < GH) dil[ny * GW + nx] = 1;
        }
    }

  // Connected components.
  const label = new Int32Array(GW * GH).fill(-1);
  const comps: Array<{ x0: number; y0: number; x1: number; y1: number; n: number }> = [];
  const stack: number[] = [];
  for (let i = 0; i < GW * GH; i++) {
    if (!dil[i] || label[i] >= 0) continue;
    const id = comps.length;
    const c = { x0: GW, y0: GH, x1: 0, y1: 0, n: 0 };
    label[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!;
      const x = j % GW, y = (j / GW) | 0;
      c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const nb = [j - 1, j + 1, j - GW, j + GW];
      for (let k = 0; k < 4; k++) {
        const q = nb[k];
        if (q < 0 || q >= GW * GH) continue;
        if ((k === 0 && x === 0) || (k === 1 && x === GW - 1)) continue;
        if (dil[q] && label[q] < 0) { label[q] = id; stack.push(q); }
      }
    }
    comps.push(c);
  }

  const toPt = (c: { x0: number; y0: number; x1: number; y1: number }): Rect => ({
    x: (c.x0 * CELL) / SCALE, y: (c.y0 * CELL) / SCALE,
    w: ((c.x1 - c.x0 + 1) * CELL) / SCALE, h: ((c.y1 - c.y0 + 1) * CELL) / SCALE,
  });
  const graphics: Rect[] = [];
  const rules: Rect[] = [];
  for (const c of comps) {
    const r = toPt(c);
    if (r.h <= 14 && r.w >= 50) { rules.push(r); continue; }
    if (r.w < 36 || r.h < 26 || r.w * r.h < 2600) continue;
    if (r.y < pt.h * 0.04 || r.y + r.h > pt.h * 0.985) continue;   // running heads, arXiv stamps
    graphics.push(r);
  }
  // Merge graphics that overlap or nearly touch (subfigures).
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < graphics.length; i++)
      for (let j = i + 1; j < graphics.length; j++) {
        const a = graphics[i], b = graphics[j];
        const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
        const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
        if (gapX < 10 && gapY < 10) {
          graphics[i] = union(a, b)!;
          graphics.splice(j, 1);
          merged = true;
          break outer;
        }
      }
  }

  const figs: Figure[] = [];
  const used = new Set<number>();
  const caps = pt.paras.filter((p) => p.kind === 'caption');
  for (const cp of caps) {
    const capText = pt.slice(cp.start, cp.end);
    const m = /^\s*(figure|fig\.?|table|tab\.?|algorithm|alg\.?|listing)\s*([a-z]?\d+[a-z]?|[ivx]+)/i.exec(capText);
    if (!m) continue;
    const word = m[1].toLowerCase();
    const kind: FigureKind = word.startsWith('tab') ? 'table' : word.startsWith('alg') || word === 'listing' ? 'algorithm' : 'figure';
    const nice = kind === 'table' ? 'Table' : kind === 'algorithm' ? 'Algorithm' : 'Figure';
    const lbl = `${nice} ${m[2]}`;
    const capRect: Rect = { x: cp.x0, y: cp.y0, w: cp.x1 - cp.x0, h: cp.y1 - cp.y0 };
    const xOverlap = (r: Rect) => Math.max(0, Math.min(r.x + r.w, capRect.x + capRect.w) - Math.max(r.x, capRect.x)) / Math.max(1, Math.min(r.w, capRect.w));

    if (kind === 'figure') {
      // Graphic(s) right above the caption (or below, for some styles).
      let best = -1, bestGap = Infinity;
      graphics.forEach((g, i) => {
        if (used.has(i) || xOverlap(g) < 0.3) return;
        const above = capRect.y - (g.y + g.h);
        const below = g.y - (capRect.y + capRect.h);
        const gap = above >= -8 && above < 70 ? above : below >= -8 && below < 40 ? below + 30 : Infinity;
        if (gap < bestGap) { bestGap = gap; best = i; }
      });
      if (best >= 0) {
        used.add(best);
        // Pull in further graphics stacked above the same caption (multi-row figures).
        let rect = graphics[best];
        graphics.forEach((g, i) => {
          if (used.has(i) || xOverlap(g) < 0.3) return;
          if (g.y + g.h <= rect.y + 4 && rect.y - (g.y + g.h) < 30) { used.add(i); rect = union(rect, g)!; }
        });
        figs.push({ kind, label: lbl, rect: pad(union(rect, capRect)!), caption: capText });
      }
    } else {
      // Tables/algorithms: booktabs rules below (caption on top) or above (caption below).
      const below = rules.filter((r) => xOverlap(r) > 0.3 && r.y >= capRect.y + capRect.h - 4 && r.y - (capRect.y + capRect.h) < 420).sort((a, b) => a.y - b.y);
      const above = rules.filter((r) => xOverlap(r) > 0.3 && r.y + r.h <= capRect.y + 4 && capRect.y - r.y < 420).sort((a, b) => b.y - a.y);
      const chain = (list: Rect[], down: boolean) => {
        if (!list.length) return [] as Rect[];
        const first = list[0];
        const gap0 = down ? first.y - (capRect.y + capRect.h) : capRect.y - (first.y + first.h);
        if (gap0 > 40) return [];
        const out = [first];
        for (let i = 1; i < list.length; i++) {
          const prev = out[out.length - 1];
          const gap = down ? list[i].y - prev.y : prev.y - list[i].y;
          if (gap > 260 || Math.abs(list[i].w - first.w) > first.w * 0.5) break;
          out.push(list[i]);
        }
        return out;
      };
      let rs = chain(below, true);
      if (rs.length < 2) { const up = chain(above, false); if (up.length >= 2) rs = up; }
      let rect: Rect | null = null;
      if (rs.length >= 2) {
        rect = unionAll(rs)!;
        // include graphics (e.g. bar charts in tables) inside the span
        graphics.forEach((g, i) => { if (!used.has(i) && g.y >= rect!.y - 4 && g.y + g.h <= rect!.y + rect!.h + 4) { used.add(i); rect = union(rect, g); } });
      } else {
        // No rules: take the non-prose lines right below the caption.
        const lines = pt.lines.filter((l) => l.y0 >= capRect.y + capRect.h - 2 && l.y0 < capRect.y + capRect.h + 200 && l.x1 > capRect.x - 20 && l.x0 < capRect.x + capRect.w + 20);
        const body: Rect[] = [];
        let lastY = capRect.y + capRect.h;
        for (const l of lines.sort((a, b) => a.y0 - b.y0)) {
          if (l.y0 - lastY > l.size * 2.2) break;
          const para = pt.paras[pt.paraIndexAt(l.start)];
          if (para.kind === 'body' && para.l1 - para.l0 >= 2) break;
          body.push({ x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 });
          lastY = l.y1;
        }
        if (body.length >= 2) rect = unionAll(body);
      }
      if (rect) figs.push({ kind, label: lbl, rect: pad(union(rect, capRect)!), caption: capText });
    }
  }
  // Uncaptioned graphics that are clearly figures.
  graphics.forEach((g, i) => {
    if (used.has(i)) return;
    if (g.w * g.h < 9000 || g.w < 70 || g.h < 50) return;
    if (figs.some((f) => overlaps(f.rect, g, 0.5))) return;
    figs.push({ kind: 'graphic', rect: pad(g) });
  });
  // Display equations.
  for (const p of pt.paras) {
    if (p.kind !== 'equation') continue;
    let r: Rect = { x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0 };
    // Stacked fractions and big operators come out as separate short lines: gather the whole display.
    const size = pt.lines[p.l0]?.size || pt.bodySize;
    for (let grow = 0; grow < 3; grow++) {
      for (const q of pt.paras) {
        if (q === p || q.kind === 'caption' || q.kind === 'heading' || q.kind === 'margin') continue;
        if (q.kind === 'body' && q.l1 > q.l0) continue;
        const qr = { x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 };
        const vOverlap = qr.y < r.y + r.h + size * 0.5 && qr.y + qr.h > r.y - size * 0.5;
        const hNear = qr.x < r.x + r.w + size * 6 && qr.x + qr.w > r.x - size * 6;
        if (vOverlap && hNear && qr.h < size * 3) r = union(r, qr)!;
      }
    }
    if (r.w < 40 || r.h < 7) continue;
    if (figs.some((f) => overlaps(f.rect, r, 0.5))) continue;
    const num = /\(\s*(\d+[a-z]?|[A-Z]\.\d+)\s*\)\s*$/.exec(pt.text.slice(pt.lines[p.l1].start, pt.lines[p.l1].end));
    figs.push({ kind: 'equation', label: num ? `Eq. (${num[1]})` : 'Equation', rect: pad(r, 3) });
  }
  return figs;
}

function pad(r: Rect, p = 4): Rect {
  return { x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p };
}

function overlaps(a: Rect, b: Rect, frac: number) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return false;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h) > frac;
}

export const FIGURE_SCALE = SCALE;
