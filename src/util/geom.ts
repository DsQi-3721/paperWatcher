export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export function union(a: Rect | null | undefined, b: Rect | null | undefined): Rect | null {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function unionAll(rs: Rect[]): Rect | null {
  return rs.reduce<Rect | null>((acc, r) => union(acc, r), null);
}

export function inflate(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x - dx, y: r.y - dy, w: r.w + 2 * dx, h: r.h + 2 * dy };
}

export function contains(r: Rect, x: number, y: number) {
  return x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function overlapArea(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function center(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from a point to a rectangle (0 inside). */
export function distToRect(r: Rect, x: number, y: number) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** Point on the rectangle's border closest to p. */
export function nearestOnRect(r: Rect, p: Pt): Pt {
  const x = Math.max(r.x, Math.min(p.x, r.x + r.w));
  const y = Math.max(r.y, Math.min(p.y, r.y + r.h));
  if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) {
    const dl = x - r.x, dr = r.x + r.w - x, dt = y - r.y, db = r.y + r.h - y;
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: r.x, y };
    if (m === dr) return { x: r.x + r.w, y };
    if (m === dt) return { x, y: r.y };
    return { x, y: r.y + r.h };
  }
  return { x, y };
}
