// Precise selection on the printed pages. Text is selected as exact character ranges from the text model
// (word-snapped while dragging, like a good word processor); clicks are smart (2× word, 3× sentence,
// 4× paragraph, one click on a heading = its section, on an equation/figure = that object); dragging on
// blank paper or with the scissors draws a capture box. What the AI receives is exactly what was picked.
import type { Figure } from '../pdf/figures';
import type { PageText } from '../pdf/textmodel';
import type { Reader } from '../reader';
import type { FigureKind, TextRange, Unit } from '../types';
import { s } from '../util/dom';
import { contains, type Pt, type Rect } from '../util/geom';
import { Rng } from '../util/rng';
import { roughRect, smoothPath } from '../ink/sketch';

export type Tool = 'pen' | 'highlighter' | 'scissors' | 'eraser' | 'hand';

export type Selection =
  | { kind: 'text'; ranges: TextRange[]; unit: Unit }
  | { kind: 'region'; page: number; rect: Rect; figKind: FigureKind; label?: string; caption?: string };

interface Caret { page: number; off: number }

export interface SelCtx {
  reader(): Reader | null;
  text(page: number): PageText | undefined;
  figures(page: number): Figure[] | undefined;
  sectionRange(page: number, y: number): Promise<TextRange[] | null>;
  tool(): Tool;
  markAt(page: number, x: number, y: number): string | null;   // annotation id under the point
  onSelect(sel: Selection | null, final: boolean): void;
  onMarkClick(id: string, e: PointerEvent): void;
  onMarkHover(id: string | null, e: PointerEvent | null): void;
  onErase(id: string): void;
  onHover(page: number, x: number, y: number, kind: 'text' | 'figure' | 'mark' | 'paper' | 'none', fig?: Figure): void;
}

type Snap = 'char' | 'word' | 'sentence' | 'paragraph';

const cmp = (a: Caret, b: Caret) => a.page - b.page || a.off - b.off;

export class SelectionController {
  sel: Selection | null = null;
  private drag: null | {
    mode: 'text' | 'region' | 'mark' | 'erase';
    start: Pt;           // screen
    page: number;
    local: Pt;
    anchor?: Caret;
    anchorSpan?: [Caret, Caret];
    snap: Snap;
    moved: boolean;
    clicks: number;
    fig?: Figure;
    markId?: string;
    shift: boolean;
  } = null;
  private last = { t: 0, x: 0, y: 0, n: 0 };
  private rng = new Rng(3);

  constructor(private ctx: SelCtx) {}

  /* ---------------- pointer ---------------- */

  down(e: PointerEvent, w: Pt): boolean {
    const tool = this.ctx.tool();
    if (tool === 'hand' || e.button !== 0) return false;
    const reader = this.ctx.reader();
    if (!reader) return false;
    const hit = reader.pageAt(w);
    if (!hit) return false;
    const page = hit.view.index;
    const now = performance.now();
    const near = Math.hypot(e.clientX - this.last.x, e.clientY - this.last.y) < 6;
    const clicks = now - this.last.t < 420 && near ? this.last.n + 1 : 1;
    this.last = { t: now, x: e.clientX, y: e.clientY, n: clicks };
    const base = { start: { x: e.clientX, y: e.clientY }, page, local: { x: hit.x, y: hit.y }, moved: false, clicks, shift: e.shiftKey, snap: 'char' as Snap };

    if (tool === 'eraser') {
      const id = this.ctx.markAt(page, hit.x, hit.y);
      if (id) this.ctx.onErase(id);
      this.drag = { ...base, mode: 'erase' };
      return true;
    }

    const markId = tool === 'pen' && clicks === 1 && !e.shiftKey ? this.ctx.markAt(page, hit.x, hit.y) : null;
    const pt = this.ctx.text(page);
    if (tool !== 'scissors' && pt) {
      const onText = pt.lineAt(hit.x, hit.y, 1.5) >= 0;
      if (onText || (e.shiftKey && this.sel?.kind === 'text')) {
        const caret: Caret = { page, off: pt.caretAt(hit.x, hit.y) };
        if (e.shiftKey && this.sel?.kind === 'text') {
          const r0 = this.sel.ranges[0];
          this.drag = { ...base, mode: 'text', anchor: { page: r0.page, off: r0.start }, snap: 'word' };
          this.extendTo(caret);
          return true;
        }
        if (markId) { this.drag = { ...base, mode: 'mark', markId, anchor: caret }; return true; }
        let span: [Caret, Caret] | undefined;
        let snap: Snap = 'char';
        if (clicks === 2) { snap = 'word'; const [a, b] = pt.wordAt(Math.min(caret.off, pt.text.length - 1)); span = [{ page, off: a }, { page, off: b }]; }
        else if (clicks === 3) { snap = 'sentence'; const [a, b] = pt.sentenceAt(caret.off); span = [{ page, off: a }, { page, off: b }]; }
        else if (clicks >= 4) { snap = 'paragraph'; const p = pt.paras[pt.paraIndexAt(caret.off)]; span = [{ page, off: p.start }, { page, off: p.end }]; }
        this.drag = { ...base, mode: 'text', anchor: caret, anchorSpan: span, snap };
        if (span) this.setText([{ page, start: span[0].off, end: span[1].off }], this.unitFor(snap, page, span[0].off, span[1].off), false);
        return true;
      }
    }
    if (markId) { this.drag = { ...base, mode: 'mark', markId }; return true; }
    const fig = this.ctx.figures(page)?.find((f) => contains(f.rect, hit.x, hit.y));
    this.drag = { ...base, mode: 'region', fig };
    return true;
  }

  move(e: PointerEvent, w: Pt) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < 4) return;
    const reader = this.ctx.reader();
    if (!reader) return;
    if (!d.moved && d.mode === 'mark') {
      // Dragging from a mark selects text instead of opening the note.
      d.mode = d.anchor ? 'text' : 'region';
    }
    d.moved = true;
    if (d.mode === 'erase') {
      const hit = reader.pageAt(w);
      if (hit) { const id = this.ctx.markAt(hit.view.index, hit.x, hit.y); if (id) this.ctx.onErase(id); }
      return;
    }
    if (d.mode === 'text') {
      const hit = reader.pageAt(w, 60) || this.nearestPage(w);
      if (!hit) return;
      const pt = this.ctx.text(hit.view.index);
      if (!pt) return;
      this.extendTo({ page: hit.view.index, off: pt.caretAt(hit.x, hit.y) });
    } else if (d.mode === 'region') {
      const v = reader.views[d.page];
      const l = v.toLocal(w.x, w.y);
      const x = Math.max(0, Math.min(v.w, l.x)), y = Math.max(0, Math.min(v.hgt, l.y));
      const rect = { x: Math.min(d.local.x, x), y: Math.min(d.local.y, y), w: Math.abs(x - d.local.x), h: Math.abs(y - d.local.y) };
      this.sel = { kind: 'region', page: d.page, rect, figKind: 'region' };
      this.render();
      this.ctx.onSelect(this.sel, false);
    }
  }

  async up(_e: PointerEvent, _w: Pt) {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.mode === 'erase') return;
    if (d.mode === 'mark' && !d.moved) { this.ctx.onMarkClick(d.markId!, _e); return; }
    if (d.mode === 'text') {
      if (!d.moved && d.clicks === 1 && !d.shift) {
        // A plain click: smart pick on headings, equations and figures; otherwise just clear.
        const pt = this.ctx.text(d.page);
        if (pt) {
          const caret = pt.caretAt(d.local.x, d.local.y);
          const para = pt.paras[pt.paraIndexAt(Math.min(caret, Math.max(0, pt.text.length - 1)))];
          if (para?.kind === 'heading') {
            const ranges = await this.ctx.sectionRange(d.page, para.y0);
            if (ranges?.length) { this.setText(ranges, 'section', true); return; }
          }
          const fig = this.ctx.figures(d.page)?.find((f) => contains(f.rect, d.local.x, d.local.y) && (f.kind !== 'equation' || para?.kind === 'equation'));
          if (fig) { this.setRegion(d.page, fig.rect, fig.kind, fig.label, fig.caption); return; }
        }
        this.clear();
        return;
      }
      if (this.sel?.kind === 'text') {
        const r = this.sel.ranges;
        const total = r.reduce((n, x) => n + (x.end - x.start), 0);
        if (total <= 0) { this.clear(); return; }
        this.sel.unit = this.classify(d.snap);
        this.ctx.onSelect(this.sel, true);
        this.render();
      }
      return;
    }
    if (d.mode === 'region') {
      if (!d.moved) {
        if (d.fig) this.setRegion(d.page, d.fig.rect, d.fig.kind, d.fig.label, d.fig.caption);
        else this.clear();
        return;
      }
      const sel = this.sel;
      if (sel?.kind !== 'region' || sel.rect.w < 8 || sel.rect.h < 8) { this.clear(); return; }
      // A box drawn around a detected figure becomes that figure.
      const f = this.ctx.figures(d.page)?.find((f) => iou(f.rect, sel.rect) > 0.55);
      if (f) this.setRegion(d.page, f.rect, f.kind, f.label, f.caption);
      else this.setRegion(d.page, sel.rect, 'region');
    }
  }

  cancel() {
    this.drag = null;
  }

  hover(e: PointerEvent | null, w: Pt | null) {
    const reader = this.ctx.reader();
    if (!e || !w || !reader) { this.ctx.onMarkHover(null, null); this.ctx.onHover(-1, 0, 0, 'none'); return; }
    const hit = reader.pageAt(w);
    if (!hit) { this.ctx.onMarkHover(null, null); this.ctx.onHover(-1, 0, 0, 'none'); return; }
    const page = hit.view.index;
    const tool = this.ctx.tool();
    const markId = tool === 'pen' || tool === 'eraser' ? this.ctx.markAt(page, hit.x, hit.y) : null;
    this.ctx.onMarkHover(markId, e);
    if (markId) { this.ctx.onHover(page, hit.x, hit.y, 'mark'); return; }
    const pt = this.ctx.text(page);
    const onText = !!pt && pt.lineAt(hit.x, hit.y, 1.5) >= 0;
    const fig = this.ctx.figures(page)?.find((f) => contains(f.rect, hit.x, hit.y));
    if (tool === 'scissors') { this.ctx.onHover(page, hit.x, hit.y, fig ? 'figure' : 'paper', fig); return; }
    if (onText && !(fig && fig.kind !== 'equation' && !pt!.lineAt(hit.x, hit.y, 0))) {
      const para = pt!.paras[pt!.paraIndexAt(pt!.caretAt(hit.x, hit.y))];
      if (para?.kind === 'equation' && fig?.kind === 'equation') { this.ctx.onHover(page, hit.x, hit.y, 'figure', fig); return; }
      this.ctx.onHover(page, hit.x, hit.y, 'text');
      return;
    }
    this.ctx.onHover(page, hit.x, hit.y, fig ? 'figure' : 'paper', fig);
  }

  private nearestPage(w: Pt) {
    const reader = this.ctx.reader();
    if (!reader) return null;
    let best = -1, bd = Infinity;
    reader.slots.forEach((s, i) => {
      const dy = w.y < s.y ? s.y - w.y : w.y > s.y + s.h ? w.y - s.y - s.h : 0;
      const dx = w.x < s.x ? s.x - w.x : w.x > s.x + s.w ? w.x - s.x - s.w : 0;
      if (dx + dy < bd) { bd = dx + dy; best = i; }
    });
    if (best < 0) return null;
    const v = reader.views[best];
    const l = v.toLocal(w.x, w.y);
    return { view: v, x: Math.max(0, Math.min(v.w, l.x)), y: Math.max(0, Math.min(v.hgt, l.y)) };
  }

  /* ---------------- model ---------------- */

  private extendTo(focus: Caret) {
    const d = this.drag!;
    let a = d.anchor!, f = focus;
    let start: Caret, end: Caret;
    if (d.anchorSpan) {
      const [s0, e0] = d.anchorSpan;
      if (cmp(f, s0) < 0) { start = this.snapStart(f, d.snap); end = e0; }
      else if (cmp(f, e0) > 0) { start = s0; end = this.snapEnd(f, d.snap); }
      else { start = s0; end = e0; }
    } else {
      const fwd = cmp(f, a) >= 0;
      start = fwd ? a : f;
      end = fwd ? f : a;
      const pa = this.ctx.text(start.page), pb = this.ctx.text(end.page);
      // Snap to whole words once the drag leaves the starting word.
      if (pa && pb) {
        const wa = pa.wordAt(Math.min(start.off, pa.text.length - 1));
        const sameWord = start.page === end.page && end.off <= wa[1] && start.off >= wa[0];
        if (!sameWord) {
          d.snap = 'word';
          start = { page: start.page, off: Math.min(start.off, wa[0]) };
          const we = pb.wordAt(Math.max(0, Math.min(end.off - 1, pb.text.length - 1)));
          end = { page: end.page, off: Math.max(end.off, we[1]) };
        }
      }
    }
    const ranges = this.rangesBetween(start, end);
    this.sel = { kind: 'text', ranges, unit: 'passage' };
    this.render();
    this.ctx.onSelect(this.sel, false);
  }

  private snapStart(c: Caret, snap: Snap): Caret {
    const pt = this.ctx.text(c.page);
    if (!pt) return c;
    const i = Math.min(c.off, pt.text.length - 1);
    if (snap === 'sentence') return { page: c.page, off: pt.sentenceAt(i)[0] };
    if (snap === 'paragraph') return { page: c.page, off: pt.paras[pt.paraIndexAt(i)].start };
    return { page: c.page, off: pt.wordAt(i)[0] };
  }

  private snapEnd(c: Caret, snap: Snap): Caret {
    const pt = this.ctx.text(c.page);
    if (!pt) return c;
    const i = Math.max(0, Math.min(c.off - 1, pt.text.length - 1));
    if (snap === 'sentence') return { page: c.page, off: pt.sentenceAt(i)[1] };
    if (snap === 'paragraph') return { page: c.page, off: pt.paras[pt.paraIndexAt(i)].end };
    return { page: c.page, off: pt.wordAt(i)[1] };
  }

  private rangesBetween(a: Caret, b: Caret): TextRange[] {
    const out: TextRange[] = [];
    for (let p = a.page; p <= b.page; p++) {
      const pt = this.ctx.text(p);
      if (!pt) continue;
      const s0 = p === a.page ? a.off : 0;
      const e0 = p === b.page ? b.off : pt.text.length;
      if (e0 > s0) out.push({ page: p, start: s0, end: e0 });
    }
    return out;
  }

  private unitFor(snap: Snap, page: number, s0: number, e0: number): Unit {
    if (snap === 'sentence') return 'sentence';
    if (snap === 'paragraph') return 'paragraph';
    const pt = this.ctx.text(page);
    const words = pt ? pt.slice(s0, e0).split(/\s+/).filter(Boolean).length : 1;
    return words <= 1 ? 'word' : words <= 6 ? 'phrase' : 'passage';
  }

  private classify(snap: Snap): Unit {
    const sel = this.sel;
    if (sel?.kind !== 'text') return 'passage';
    if (snap === 'paragraph') return 'paragraph';
    const text = sel.ranges.map((r) => this.ctx.text(r.page)?.slice(r.start, r.end) || '').join(' ');
    const words = text.split(/\s+/).filter(Boolean).length;
    const cjk = (text.match(/[㐀-鿿]/g) || []).length;
    if (snap === 'sentence') return 'sentence';
    if (words <= 1 && cjk <= 4) return 'word';
    if (words <= 6 && cjk <= 12) return 'phrase';
    if (sel.ranges.length === 1) {
      const r = sel.ranges[0];
      const pt = this.ctx.text(r.page)!;
      const [a, b] = pt.sentenceAt(r.start);
      if (Math.abs(a - r.start) <= 2 && Math.abs(b - r.end) <= 3) return 'sentence';
      const p = pt.paras[pt.paraIndexAt(r.start)];
      if (Math.abs(p.start - r.start) <= 2 && Math.abs(p.end - r.end) <= 3) return 'paragraph';
    }
    return 'passage';
  }

  setText(ranges: TextRange[], unit: Unit, final = true) {
    this.sel = { kind: 'text', ranges, unit };
    this.render();
    this.ctx.onSelect(this.sel, final);
  }

  setRegion(page: number, rect: Rect, figKind: FigureKind, label?: string, caption?: string) {
    this.sel = { kind: 'region', page, rect, figKind, label, caption };
    this.render();
    this.ctx.onSelect(this.sel, true);
  }

  clear() {
    if (!this.sel) return;
    this.sel = null;
    this.render();
    this.ctx.onSelect(null, true);
  }

  /** Bounding rect of the selection on its last page (page points) — where the toolbar sits. */
  endRect(): { page: number; rect: Rect } | null {
    const sel = this.sel;
    if (!sel) return null;
    if (sel.kind === 'region') return { page: sel.page, rect: sel.rect };
    const r = sel.ranges[sel.ranges.length - 1];
    const rects = this.ctx.text(r.page)?.rangeRects(r.start, r.end) || [];
    if (!rects.length) return null;
    return { page: r.page, rect: rects[rects.length - 1] };
  }

  /* ---------------- drawing ---------------- */

  private touched = new Set<number>();

  render() {
    const reader = this.ctx.reader();
    if (!reader) return;
    for (const p of this.touched) reader.views[p]?.gSelect.replaceChildren();
    this.touched.clear();
    const sel = this.sel;
    if (!sel) return;
    if (sel.kind === 'text') {
      for (const r of sel.ranges) {
        const v = reader.views[r.page];
        const pt = this.ctx.text(r.page);
        if (!v || !pt) continue;
        this.touched.add(r.page);
        const rects = pt.rangeRects(r.start, r.end);
        let d = '';
        for (const rc of rects) d += softRect(rc, this.rng);
        v.gSelect.append(s('path', { d }));
      }
    } else {
      const v = reader.views[sel.page];
      if (!v) return;
      this.touched.add(sel.page);
      const r = sel.rect;
      const rng = new Rng(Math.round(r.x * 7 + r.y));
      v.gSelect.append(
        s('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'rgba(42,74,158,0.07)' }),
        s('path', { class: 'sel-edge', d: roughRect(r, rng, { amp: 0.6, over: 3 }), 'stroke-dasharray': '6 4' }),
      );
    }
  }
}

function softRect(r: Rect, rng: Rng) {
  const pad = 0.6;
  const x0 = r.x - pad, x1 = r.x + r.w + pad, y0 = r.y + r.h * 0.04, y1 = r.y + r.h * 0.98;
  return smoothPath([
    { x: x0 + 1.2, y: y0 + rng.j(0.3) }, { x: (x0 + x1) / 2, y: y0 + rng.j(0.4) }, { x: x1 - 1, y: y0 + rng.j(0.3) },
    { x: x1 + 0.6, y: (y0 + y1) / 2 }, { x: x1 - 1, y: y1 + rng.j(0.3) }, { x: (x0 + x1) / 2, y: y1 + rng.j(0.4) },
    { x: x0 + 1, y: y1 + rng.j(0.3) }, { x: x0 - 0.4, y: (y0 + y1) / 2 },
  ], true);
}

function iou(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const i = w * h;
  return i / (a.w * a.h + b.w * b.h - i);
}
