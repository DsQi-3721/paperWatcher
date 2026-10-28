// Doodles on the printed page for every annotation: underline / circle / margin bracket / box / marker,
// drawn on like a pen stroke, plus the AI's gist pencilled in the margin with a little leader line.
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import { ensureFonts } from '../ink/handwriting';
import { bracket, markerBand, roughEllipse, roughRect, smoothPath, underline } from '../ink/sketch';
import type { PageText } from '../pdf/textmodel';
import type { Reader } from '../reader';
import { C, F, HIGHLIGHTS, type HighlightColor } from '../theme';
import type { Annotation } from '../types';
import { h, s } from '../util/dom';
import type { Pt, Rect } from '../util/geom';
import { inflate, unionAll } from '../util/geom';
import { hashStr, Rng } from '../util/rng';

export interface MarkGeo { page: number; rects: Rect[]; bbox: Rect; end: Pt; side: 'left' | 'right' }

export interface MarksCtx {
  reader(): Reader | null;
  text(page: number): PageText | undefined;
}

const NOTE_FONT_SIZE = 8.6;
const NOTE_LINE = 10.6;

export class Marks {
  geo = new Map<string, MarkGeo[]>();
  private groups = new Map<string, SVGGElement[]>();
  private notes = new Map<string, { el: HTMLElement; page: number; leader: SVGPathElement | null; rect: Rect }>();
  private hoverId: string | null = null;
  private noteGen = new Map<string, number>();
  private flags = new Map<string, HTMLElement>();
  private paperOrder: string[] = [];

  constructor(private ctx: MarksCtx) {}

  /** Geometry of an annotation on each page it touches (page points). */
  computeGeo(a: Annotation): MarkGeo[] {
    const out: MarkGeo[] = [];
    if (a.anchor.kind === 'region') {
      const r = a.anchor.rect;
      const pt = this.ctx.text(a.anchor.page);
      const side = pt && r.x + r.w / 2 < pt.w / 2 && (pt.columns.length > 1) ? 'left' : 'right';
      out.push({ page: a.anchor.page, rects: [r], bbox: r, end: side === 'left' ? { x: r.x, y: r.y + Math.min(30, r.h / 2) } : { x: r.x + r.w, y: r.y + Math.min(30, r.h / 2) }, side });
    } else if (a.anchor.kind === 'paper') {
      // Whole-paper threads are flags sticking out of the top edge of page 1.
      const v = this.ctx.reader()?.views[0];
      if (!v) return out;
      if (!this.paperOrder.includes(a.id)) this.paperOrder.push(a.id);
      const idx = this.paperOrder.indexOf(a.id);
      const r = { x: v.w - 74 - idx * 66, y: -24, w: 58, h: 26 };
      out.push({ page: 0, rects: [r], bbox: r, end: { x: r.x + r.w, y: r.y + 8 }, side: 'right' });
    } else if (a.anchor.kind === 'text') {
      for (const rg of a.anchor.ranges) {
        const pt = this.ctx.text(rg.page);
        if (!pt) continue;
        const rects = pt.rangeRects(rg.start, rg.end);
        if (!rects.length) continue;
        const bbox = unionAll(rects)!;
        const li = pt.lineOf[Math.min(rg.start, pt.lineOf.length - 1)];
        const col = pt.lines[li]?.col ?? -1;
        const side: 'left' | 'right' = pt.columns.length > 1 && col === 0 ? 'left' : 'right';
        const first = rects[0];
        const end = side === 'left' ? { x: first.x, y: first.y + first.h * 0.6 } : { x: rects[rects.length - 1].x + rects[rects.length - 1].w, y: rects[rects.length - 1].y + rects[rects.length - 1].h * 0.6 };
        out.push({ page: rg.page, rects, bbox, end, side });
      }
    }
    return out;
  }

  draw(a: Annotation, animate = false) {
    this.remove(a.id, false);
    const reader = this.ctx.reader();
    if (!reader) return;
    const geos = this.computeGeo(a);
    this.geo.set(a.id, geos);
    const groups: SVGGElement[] = [];
    const rng = new Rng(hashStr(a.id));
    geos.forEach((g, gi) => {
      const v = reader.views[g.page];
      if (!v) return;
      const grp = s('g', { class: `mark style-${a.style}${a.messages.length ? ' has-thread' : ''}`, dataset: { id: a.id } });
      const ink = a.style === 'highlight' ? 'none' : C.userInk;
      const strokeW = 1.25;
      const addStroke = (d: string, extra: Record<string, any> = {}) => {
        const p = s('path', { d, fill: 'none', stroke: ink, 'stroke-width': strokeW, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'ink', ...extra });
        grp.append(p);
        return p;
      };
      if (a.style === 'highlight') {
        const color = HIGHLIGHTS[(a.color as HighlightColor)] || HIGHLIGHTS.yellow;
        for (const r of g.rects) grp.append(s('path', { d: markerBand(r, rng), fill: color, class: 'band' }));
      } else if (a.style === 'underline' || a.style === 'wavy') {
        for (const r of g.rects) addStroke(underline(r.x, r.x + r.w, r.y + r.h * 0.96, rng, a.style === 'wavy'));
      } else if (a.style === 'circle') {
        const b = g.bbox;
        addStroke(roughEllipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 4.5, b.h / 2 + 3.2, rng), { 'stroke-width': 1.15 });
      } else if (a.style === 'bracket') {
        const pt = this.ctx.text(g.page);
        const b = g.bbox;
        const col = pt?.columns[g.side === 'left' || (pt?.columns.length ?? 1) === 1 ? 0 : 1];
        const x = g.side === 'left' || (pt?.columns.length ?? 1) === 1 ? (col ? col.x0 : b.x) - 7 : (col ? col.x1 : b.x + b.w) + 7;
        const dir = g.side === 'left' || (pt?.columns.length ?? 1) === 1 ? 'left' : 'right';
        addStroke(bracket(x, b.y - 1, b.y + b.h + 1, dir, rng, 5), { 'stroke-width': 1.5 });
        g.end = { x, y: b.y + Math.min(b.h / 2, 40) };
        if (gi === 0 && a.anchor.kind === 'text' && a.anchor.unit === 'section') {
          addStroke(`M${x - (dir === 'left' ? 9 : -9)} ${b.y + 4}l${dir === 'left' ? 4 : -4} 4`, { 'stroke-width': 1.3 });
        }
      } else if (a.style === 'box') {
        addStroke(roughRect(inflate(g.bbox, 2), rng, { amp: 0.9, over: 4, passes: 1 }), { 'stroke-width': 1.35 });
        if (a.anchor.kind === 'region' && a.anchor.label) {
          const lb = s('text', { x: g.bbox.x + 2, y: g.bbox.y - 4, class: 'mark-label' });
          lb.textContent = a.anchor.label;
          grp.append(lb);
        }
      }
      if (a.anchor.kind === 'paper') {
        this.flags.get(a.id)?.remove();
        const flag = h('div', { class: 'paper-flag', style: `left:${g.bbox.x}px;top:${g.bbox.y}px;width:${g.bbox.w}px;height:${g.bbox.h}px;rotate:${rng.j(4).toFixed(1)}deg` }, '整篇');
        if (animate) flag.classList.add('pop');
        v.notes.append(flag);
        this.flags.set(a.id, flag);
      }
      v.gMarks.append(grp);
      groups.push(grp);
      if (animate) animateDraw(grp, gi * 140);
    });
    this.groups.set(a.id, groups);
    this.drawNote(a, animate);
  }

  remove(id: string, animate = true) {
    const gs = this.groups.get(id);
    if (gs) {
      for (const g of gs) {
        if (animate) {
          g.classList.add('erasing');
          setTimeout(() => g.remove(), 420);
        } else g.remove();
      }
    }
    this.groups.delete(id);
    const flag = this.flags.get(id);
    if (flag) { if (animate) { flag.classList.add('erasing'); setTimeout(() => flag.remove(), 420); } else flag.remove(); this.flags.delete(id); }
    if (animate) this.paperOrder = this.paperOrder.filter((x) => x !== id);
    const n = this.notes.get(id);
    if (n) {
      if (animate) { n.el.classList.add('erasing'); n.leader?.classList.add('erasing'); setTimeout(() => { n.el.remove(); n.leader?.remove(); }, 420); }
      else { n.el.remove(); n.leader?.remove(); }
    }
    this.notes.delete(id);
    this.geo.delete(id);
  }

  clearAll() {
    for (const id of [...this.groups.keys()]) this.remove(id, false);
    // margin notes still being laid out (waiting for fonts) see their generation gone and give up
    this.noteGen.clear();
    this.paperOrder = [];
  }

  /** Annotation under a page point: its doodle, or its margin note. */
  hit(page: number, x: number, y: number): string | null {
    let best: string | null = null;
    let bestArea = Infinity;
    for (const [id, geos] of this.geo) {
      for (const g of geos) {
        if (g.page !== page) continue;
        for (const r of g.rects) {
          const rr = inflate(r, 1.5, 1);
          if (x >= rr.x && x <= rr.x + rr.w && y >= rr.y && y <= rr.y + rr.h) {
            // regions only react near their outline so the figure itself stays clickable
            const grp = this.groups.get(id)?.[0];
            if (grp?.classList.contains('style-box')) {
              const inner = inflate(r, -10, -10);
              if (inner.w > 0 && inner.h > 0 && x > inner.x && x < inner.x + inner.w && y > inner.y && y < inner.y + inner.h) continue;
            }
            const area = r.w * r.h;
            if (area < bestArea) { bestArea = area; best = id; }
          }
        }
      }
    }
    if (best) return best;
    for (const [id, n] of this.notes) {
      if (n.page !== page) continue;
      const r = inflate(n.rect, 3);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return id;
    }
    return null;
  }

  setHover(id: string | null) {
    if (this.hoverId === id) return;
    if (this.hoverId) {
      for (const g of this.groups.get(this.hoverId) || []) g.classList.remove('hover');
      this.notes.get(this.hoverId)?.el.classList.remove('hover');
      this.flags.get(this.hoverId)?.classList.remove('hover');
    }
    this.hoverId = id;
    if (id) {
      for (const g of this.groups.get(id) || []) g.classList.add('hover');
      this.notes.get(id)?.el.classList.add('hover');
      this.flags.get(id)?.classList.add('hover');
    }
  }

  setActive(id: string | null) {
    for (const [gid, gs] of this.groups) for (const g of gs) g.classList.toggle('active', gid === id);
    for (const [nid, n] of this.notes) n.el.classList.toggle('active', nid === id);
  }

  setPending(id: string, pending: boolean) {
    for (const g of this.groups.get(id) || []) g.classList.toggle('pending', pending);
    const n = this.notes.get(id);
    if (n) n.el.classList.toggle('pending', pending);
  }

  /* ---------------- margin notes ---------------- */

  noteRect(id: string): { page: number; rect: Rect } | null {
    const n = this.notes.get(id);
    return n ? { page: n.page, rect: n.rect } : null;
  }

  async drawNote(a: Annotation, animate: boolean) {
    const reader = this.ctx.reader();
    const geo = this.geo.get(a.id)?.[0];
    if (!reader || !geo) return;
    const gen = (this.noteGen.get(a.id) || 0) + 1;
    this.noteGen.set(a.id, gen);
    const old = this.notes.get(a.id);
    old?.el.remove();
    old?.leader?.remove();
    this.notes.delete(a.id);
    const hasAi = a.messages.some((m) => m.role === 'ai' && m.text);
    const pending = a.messages.length > 0 && a.messages[a.messages.length - 1].role === 'user';
    if (!hasAi && !pending) return;
    const text = (a.margin || '').trim() || (hasAi ? gistFrom(a.messages.filter((m) => m.role === 'ai').pop()!.text) : '');
    const v = reader.views[geo.page];
    const pt = this.ctx.text(geo.page);
    if (!v || !pt) return;

    // Margin box for this side of the page.
    const cols = pt.columns.length ? pt.columns : [{ x0: 60, x1: v.w - 60 }];
    const left = geo.side === 'left';
    const textEdge = left ? Math.min(...cols.map((c) => c.x0)) : Math.max(...cols.map((c) => c.x1));
    const room = left ? textEdge - 8 : v.w - textEdge - 8;
    const overflow = room < 62;
    const width = overflow ? Math.max(70, Math.min(132, room + 64)) : Math.min(room - 2, 150);
    const x = left ? textEdge - 7 - width : textEdge + 7;
    const font = `400 ${NOTE_FONT_SIZE}px ${F.ai}`;

    const el = h('div', { class: `mnote${overflow ? ' stuck' : ''}${pending ? ' pending' : ''} ${left ? 'left' : 'right'}`, dataset: { id: a.id } });
    let lines: string[] = [];
    if (text) {
      await ensureFonts([font], text);
      const prep = prepareWithSegments(text, font);
      lines = layoutWithLines(prep, width - (overflow ? 10 : 2), NOTE_LINE).lines.map((l) => l.text);
      if (lines.length > 6) { lines = lines.slice(0, 6); lines[5] = lines[5].replace(/.{0,2}$/, '…'); }
      // A newer drawing of this note started while fonts were loading: let it win.
      if (this.noteGen.get(a.id) !== gen || !this.geo.has(a.id)) return;
      const stale = this.notes.get(a.id);
      if (stale) { stale.el.remove(); stale.leader?.remove(); this.notes.delete(a.id); }
    }
    const rng = new Rng(hashStr(a.id + 'n'));
    const hgt = Math.max(1, lines.length) * NOTE_LINE + (overflow ? 8 : 2);
    // Stack below earlier notes on the same side of this page.
    let y = Math.max(4, geo.end.y - NOTE_LINE * 0.8);
    const others = [...this.notes.values()].filter((n) => n.page === geo.page && (n.el.classList.contains('left') === left)).map((n) => n.rect).sort((p, q) => p.y - q.y);
    for (const r of others) if (y < r.y + r.h + 4 && y + hgt > r.y - 4) y = r.y + r.h + 5;
    y = Math.min(y, v.hgt - hgt - 4);
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: width + 'px', transform: `rotate(${rng.j(overflow ? 2.2 : 1.2).toFixed(2)}deg)` });
    if (pending && !text) {
      el.innerHTML = '<span class="mn-scribble"><i></i><i></i><i></i></span>';
    } else {
      lines.forEach((t, i) => {
        const ln = h('div', { class: 'mn-line', style: `font:${font};line-height:${NOTE_LINE}px;transform:translateX(${rng.j(0.8).toFixed(1)}px)` }, t);
        if (animate) { ln.style.animationDelay = `${300 + i * 160}ms`; ln.classList.add('write-in'); }
        el.append(ln);
      });
    }
    v.notes.append(el);
    const rect = { x, y, w: width, h: hgt };
    // Leader: from the note to the mark.
    const from = { x: left ? x + width : x, y: y + Math.min(hgt / 2, 8) };
    const to = geo.end;
    let leader: SVGPathElement | null = null;
    if (Math.hypot(from.x - to.x, from.y - to.y) > 6) {
      const mx = (from.x + to.x) / 2 + rng.j(3), my = (from.y + to.y) / 2 + rng.j(4) - 3;
      leader = s('path', { d: smoothPath([from, { x: mx, y: my }, { x: to.x + (left ? -2 : 2), y: to.y }]), class: 'mn-leader' + (animate ? ' draw' : '') }) as SVGPathElement;
      v.gMarks.append(leader);
      if (animate) animateDraw(leader, 200);
    }
    this.notes.set(a.id, { el, page: geo.page, leader, rect });
  }
}

function gistFrom(text: string) {
  const plain = text.replace(/<[^>]+>/g, '').replace(/[*_`$#>]/g, '').replace(/\s+/g, ' ').trim();
  const m = /^(.{8,80}?[。．.!?！？；;])/.exec(plain);
  return (m ? m[1] : plain.slice(0, 40) + (plain.length > 40 ? '…' : ''));
}

/** Pen-stroke reveal for every stroked path in a group (dash offset trick), bands sweep in. */
export function animateDraw(el: Element, delay = 0) {
  const paths = el instanceof SVGPathElement ? [el] : [...el.querySelectorAll('path')];
  paths.forEach((p, i) => {
    const path = p as SVGPathElement;
    if (path.classList.contains('band')) {
      path.animate([{ transform: 'scaleX(0)', opacity: 0.4 }, { transform: 'scaleX(1)', opacity: 1 }], { duration: 380, delay: delay + i * 90, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
      return;
    }
    let len = 0;
    try { len = path.getTotalLength(); } catch { /* not rendered */ }
    if (!len) return;
    path.style.strokeDasharray = `${len} ${len}`;
    const anim = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: Math.min(900, 240 + len * 1.6), delay: delay + i * 110, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'backwards' });
    anim.onfinish = () => { path.style.strokeDasharray = ''; };
  });
}
