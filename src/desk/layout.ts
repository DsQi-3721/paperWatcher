// Where the pages lie on the desk for each reading layout.
import type { LayoutMode } from '../types';
import type { Rect } from '../util/geom';
import { Rng } from '../util/rng';
import type { PageSize } from '../pdf/doc';

export interface Slot { x: number; y: number; w: number; h: number; rot: number }

export const PAGE_GAP = 34;

export function computeLayout(sizes: PageSize[], mode: LayoutMode): { slots: Slot[]; bounds: Rect } {
  const slots: Slot[] = [];
  if (mode === 'column') {
    let y = 0;
    for (const s of sizes) {
      slots.push({ x: -s.w / 2, y, w: s.w, h: s.h, rot: 0 });
      y += s.h + PAGE_GAP;
    }
  } else if (mode === 'spread') {
    let y = 0;
    const gap = 16;
    for (let i = 0; i < sizes.length; i += 2) {
      const a = sizes[i], b = sizes[i + 1];
      slots.push({ x: -a.w - gap / 2, y, w: a.w, h: a.h, rot: 0 });
      if (b) slots.push({ x: gap / 2, y, w: b.w, h: b.h, rot: 0 });
      y += Math.max(a.h, b?.h ?? 0) + PAGE_GAP * 1.4;
    }
  } else {
    const n = sizes.length;
    const cols = Math.max(2, Math.min(6, Math.round(Math.sqrt(n * 1.7))));
    const cw = Math.max(...sizes.map((s) => s.w)) + 44;
    const rng = new Rng(97);
    let y = 0;
    for (let r = 0; r * cols < n; r++) {
      let rowH = 0;
      for (let c = 0; c < cols && r * cols + c < n; c++) {
        const s = sizes[r * cols + c];
        slots.push({
          x: (c - (cols - 1) / 2) * cw - s.w / 2 + rng.j(6),
          y: y + rng.j(6),
          w: s.w, h: s.h,
          rot: rng.j(0.9),
        });
        rowH = Math.max(rowH, s.h);
      }
      y += rowH + 52;
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of slots) {
    x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x + s.w); y1 = Math.max(y1, s.y + s.h);
  }
  return { slots, bounds: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}
