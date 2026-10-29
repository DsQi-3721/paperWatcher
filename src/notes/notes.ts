// Annotations and their conversations: create from a selection, place a scratch sheet beside the page,
// pull the camera back to frame both, stream the AI's answer as handwriting, pencil the gist into the
// margin and draw arrows from its references back to the paper. Persisted per paper on the local server.
import { api } from '../api';
import type { Desk } from '../desk/desk';
import type { View } from '../desk/camera';
import { parseReply, replyToPlain } from '../ink/markdown';
import type { PaperDoc } from '../pdf/doc';
import type { PageText } from '../pdf/textmodel';
import type { Reader } from '../reader';
import { C } from '../theme';
import type { Anchor, Annotation, MarkStyle, Message, Settings, SheetPaper } from '../types';
import { debounce, uid } from '../util/dom';
import { inflate, union, type Pt, type Rect } from '../util/geom';
import { hashStr, Rng } from '../util/rng';
import type { Arrows } from './arrows';
import type { Marks } from './marks';
import type { Preview } from './preview';
import { findQuote } from './refs';
import { Sheet, SHEET_W } from './sheet';

export interface SelectionInfo {
  kind: string; page?: number; pageEnd?: number; text?: string; context?: string; section?: string; label?: string; caption?: string;
}

export interface NotesHost {
  desk: Desk;
  marks: Marks;
  arrows: Arrows;
  preview: Preview;
  reader(): Reader | null;
  doc(): PaperDoc | null;
  text(page: number): PageText | undefined;
  settings(): Settings | null;
  describe(anchor: Anchor): Promise<SelectionInfo>;
  images(anchor: Anchor): Promise<string[]>;
  outline(): Promise<string>;
  ensurePaperText(): Promise<void>;
  toast(msg: string, kind?: 'info' | 'error' | 'ok'): void;
  aiActivity(delta: number): void;
  onNotesChanged(): void;
  /** A sheet was opened, closed, moved or grew: on-screen helpers re-check where it is. */
  onSheet(): void;
  english(anchor: Anchor): void;
}

const PAPERS: SheetPaper[] = ['lined', 'grid', 'legal', 'dot', 'lined', 'grid'];

export class Notes {
  list: Annotation[] = [];
  sheets = new Map<string, Sheet>();
  openId: string | null = null;
  paperId: string | null = null;
  private returnView: View | null = null;
  private openedAt = 0;
  /** When the current sheet was opened (desk taps right after are part of the same gesture). */
  openedAtTime = 0;
  private hoverArrows = new Set<string>();
  private followAt = 0;
  private running = new Map<string, AbortController>();
  /** Erased notes, newest last, with the paper they were erased from (⌘Z only ever restores into that paper). */
  private undoStack: Array<{ paperId: string | null; a: Annotation }> = [];
  private loaded = false;
  private saveSoon = debounce(() => this.save(), 700);

  constructor(private host: NotesHost) {}

  async load(paperId: string) {
    this.reset();
    let list: Annotation[] = [];
    try {
      const f = await api.notes(paperId);
      list = Array.isArray(f.annotations) ? f.annotations : [];
      this.loaded = true;
    } catch (e: any) {
      // Never overwrite notes we could not read: this session stays read-only for notes.
      this.loaded = false;
      this.host.toast('读不到这篇论文的笔记，这次的改动不会保存：' + (e?.message || e), 'error');
    }
    // Answers interrupted by a reload stay as they were; empty AI placeholders are dropped.
    for (const a of list) a.messages = a.messages.filter((m) => m.role === 'user' || m.text || m.error);
    this.list = list;
    this.paperId = paperId;
  }

  reset() {
    // Pending edits belong to the paper being put away: write them now, then forget the timer.
    this.saveSoon.flush();
    this.saveSoon.cancel();
    this.loaded = false;
    for (const c of this.running.values()) c.abort();
    this.running.clear();
    for (const s of this.sheets.values()) s.dispose();
    this.sheets.clear();
    this.host.arrows.clear('', false);
    this.hoverArrows.clear();
    this.list = [];
    this.openId = null;
    this.returnView = null;
    this.paperId = null;
  }

  byId(id: string) { return this.list.find((a) => a.id === id) || null; }

  /** Draw every annotation's doodles (once the pages' text models exist). */
  drawAll(page?: number) {
    for (const a of this.list) {
      if (page !== undefined && !touches(a, page)) continue;
      this.host.marks.draw(a, false);
    }
  }

  async save() {
    const id = this.paperId, list = this.list;
    if (!id || !this.loaded) return;
    try {
      await api.saveNotes(id, { version: 1, annotations: list });
    } catch (e) {
      console.warn('save failed', e);
    }
    this.host.onNotesChanged();
  }

  create(anchor: Anchor, style: MarkStyle, color: string): Annotation {
    const now = Date.now();
    const a: Annotation = { id: uid('n'), anchor, style, color, messages: [], createdAt: now, updatedAt: now };
    this.list.push(a);
    this.host.marks.draw(a, true);
    this.saveSoon();
    return a;
  }

  erase(id: string) {
    const a = this.byId(id);
    if (!a) return;
    this.running.get(id)?.abort();
    if (this.openId === id) this.close(false);
    this.host.marks.remove(id, true);
    const sh = this.sheets.get(id);
    if (sh) { sh.dispose(); this.sheets.delete(id); }
    this.list = this.list.filter((x) => x.id !== id);
    this.undoStack.push({ paperId: this.paperId, a });
    if (this.undoStack.length > 20) this.undoStack.shift();
    this.saveSoon();
    this.host.toast(a.messages.length ? '擦掉了一条笔记 · ⌘Z 撤销' : '擦掉了 · ⌘Z 撤销');
  }

  undo() {
    // the last note erased from this paper (one erased from another paper must never land in this one)
    let k = this.undoStack.length - 1;
    while (k >= 0 && this.undoStack[k].paperId !== this.paperId) k--;
    if (k < 0) return false;
    const a = this.undoStack.splice(k, 1)[0].a;
    this.list.push(a);
    this.host.marks.draw(a, true);
    this.saveSoon();
    return true;
  }

  /* ---------------- sheets & camera ---------------- */

  private markWorldRect(a: Annotation): Rect | null {
    const reader = this.host.reader();
    const geos = this.host.marks.geo.get(a.id);
    if (!reader || !geos?.length) return null;
    const g = geos[0];
    const v = reader.views[g.page];
    const p0 = v.toWorld(g.bbox.x, g.bbox.y), p1 = v.toWorld(g.bbox.x + g.bbox.w, g.bbox.y + g.bbox.h);
    return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
  }

  private anchorPage(a: Annotation): number {
    if (a.anchor.kind === 'region') return a.anchor.page;
    if (a.anchor.kind === 'text') return a.anchor.ranges[0]?.page ?? 0;
    return 0;
  }

  /** Where the sheet lies: beside the page, level with the mark, on the outer side. */
  private placeSheet(a: Annotation, sheet: Sheet) {
    const reader = this.host.reader()!;
    const page = this.anchorPage(a);
    const slot = reader.slots[page];
    const rng = new Rng(hashStr(a.id));
    const paper = a.sheet?.paper ?? PAPERS[hashStr(a.id) % PAPERS.length];
    if (a.sheet && (a.sheet.dx || a.sheet.dy)) {
      sheet.setPos(slot.x + a.sheet.dx, slot.y + a.sheet.dy, a.sheet.rot);
      return;
    }
    const mr = this.markWorldRect(a) || { x: slot.x + slot.w, y: slot.y + 80, w: 0, h: 0 };
    // The sheet lies on the side of the column the mark is in, so the arrow never crosses the text.
    const geo = this.host.marks.geo.get(a.id)?.[0];
    let left = reader.layout === 'column' && geo?.side === 'left';
    if (reader.layout === 'spread') left = page % 2 === 0;
    const x = left ? slot.x - SHEET_W - 46 : slot.x + slot.w + 46 + rng.range(0, 14);
    const y = Math.max(slot.y - 40, Math.min(mr.y - 70 + rng.j(18), slot.y + slot.h - 260));
    const rot = rng.j(1.6);
    sheet.setPos(x, y, rot);
    a.sheet = { dx: x - slot.x, dy: y - slot.y, rot, paper };
  }

  private ensureSheet(a: Annotation): Sheet {
    let sh = this.sheets.get(a.id);
    if (sh) return sh;
    const paper = a.sheet?.paper ?? (a.anchor.kind === 'region' ? 'grid' : PAPERS[hashStr(a.id) % PAPERS.length]);
    sh = new Sheet(a, {
      zoom: () => this.host.desk.camera.view.z,
      ask: (ann, q) => this.ask(ann.id, q, { typed: true }),
      close: () => this.close(),
      english: (ann) => this.host.english(ann.anchor),
      erase: (ann) => this.erase(ann.id),
      copy: (ann) => {
        const s = this.sheets.get(ann.id);
        if (s) navigator.clipboard.writeText(s.plainText()).then(() => this.host.toast('对话已复制', 'ok'));
      },
      moved: (ann, x, y) => {
        const slot = this.host.reader()?.slots[this.anchorPage(ann)];
        if (slot && ann.sheet) { ann.sheet.dx = x - slot.x; ann.sheet.dy = y - slot.y; }
        this.drawConnector(ann, false);
        this.drawRefs(ann, false);
        this.saveSoon();
        this.host.onSheet();
      },
      grew: (ann) => { if (this.openId === ann.id) { this.drawConnector(ann, false); this.followPen(ann); this.host.onSheet(); } },
      retry: (ann) => this.retry(ann.id),
      cancel: (ann) => this.running.get(ann.id)?.abort(),
      label: (ann) => this.label(ann),
      refHover: (ann, mid, ref, on) => {
        const key = `r:${ann.id}:${mid}:${ref}`;
        // Hovering a reference adds its arrow for the moment; arrows that were already there stay.
        if (on) {
          if (!this.host.arrows.has(key) && this.drawRef(ann, mid, ref, true, 0, 'h')) this.hoverArrows.add(key);
        } else if (this.hoverArrows.has(key)) {
          this.hoverArrows.delete(key);
          this.host.arrows.clear(key, true);
        }
      },
      refClick: (ann, mid, ref) => this.showRefTarget(ann, mid, ref),
      composerFocus: (ann) => this.ensureComposerVisible(ann),
    }, paper);
    if (!a.sheet) a.sheet = { dx: 0, dy: 0, rot: 0, paper };
    this.sheets.set(a.id, sh);
    return sh;
  }

  label(a: Annotation): string {
    if (a.anchor.kind === 'paper') return '关于整篇论文';
    if (a.anchor.kind === 'region') return `p.${a.anchor.page + 1} · ${a.anchor.label || '框选区域'}`;
    const q = a.anchor.quote.replace(/\s+/g, ' ');
    return `p.${a.anchor.ranges[0].page + 1} · “${q.length > 42 ? q.slice(0, 40) + '…' : q}”`;
  }

  /** Open the conversation: sheet slides onto the desk, the camera pulls back to frame mark + sheet. */
  open(id: string, opts: { focus?: boolean; fly?: boolean } = {}) {
    const a = this.byId(id);
    const reader = this.host.reader();
    if (!a || !reader) return;
    if (this.openId && this.openId !== id) this.close(false, true);
    const wasOpen = this.openId === id;
    this.openId = id;
    this.host.preview.hide();
    const sh = this.ensureSheet(a);
    if (sh.state !== 'shown') {
      // Only a sheet that has fully left the desk is laid out afresh; one caught mid slide-away just comes back.
      // A sheet whose answer is still being written always keeps its live writing.
      if (sh.state === 'hidden') {
        this.placeSheet(a, sh);
        if (!this.running.has(id)) sh.renderAll(true);
      }
      sh.show(this.host.desk.sheets);
    }
    this.openedAtTime = performance.now();
    this.host.marks.setActive(id);
    this.openedAt = performance.now();
    sh.composer.setPlaceholder(a.messages.length ? '接着问…' : '在这里写下你的问题…');
    if (!wasOpen && !this.returnView) this.returnView = { ...this.host.desk.camera.view };
    if (opts.fly !== false) this.frame(a, !!opts.focus && a.messages.length > 0);
    this.drawConnector(a, true);
    setTimeout(() => this.drawRefs(a, true), 420);
    if (opts.focus) setTimeout(() => sh.composer.focus(), 380);
    this.host.onSheet();
  }

  /** Camera framing for an open sheet (its top with the mark, or its bottom when about to write). */
  frame(a: Annotation, bottom = false) {
    const sh = this.sheets.get(a.id);
    let mr = this.markWorldRect(a);
    if (!sh) return;
    const cam = this.host.desk.camera;
    const full = sh.rect;
    const sr = bottom && full.h > 640 ? { ...full, y: full.y + full.h - 640, h: 640 } : { ...full, h: Math.min(full.h, 760) };
    if (mr && Math.abs(mr.y + mr.h / 2 - (sr.y + sr.h / 2)) > 900) mr = null;
    let r = union(sr, mr ? inflate(mr, 20) : null)!;
    // Show a little of the page around the mark so the reader keeps their place.
    const reader = this.host.reader();
    if (reader && mr) {
      const slot = reader.slots[this.anchorPage(a)];
      r = union(r, { x: slot.x, y: mr.y - 40, w: slot.w, h: 60 })!;
    }
    // keep clear of the pencil tray (left), the desk objects (top) and the page tag (bottom)
    const target = cam.fitInset(r, { l: 150, r: 40, t: 74, b: 76 }, Math.max(1.05, Math.min(1.6, cam.view.z)));
    cam.flyTo(target, { maxDuration: 900 });
  }

  close(flyBack = true, keepCamera = false) {
    const id = this.openId;
    if (!id) return;
    this.openId = null;
    const sh = this.sheets.get(id);
    // A note that was opened to ask something but never asked leaves no trace.
    const ann = this.byId(id);
    if (ann && !ann.messages.length && ann.style !== 'highlight' && !this.running.has(id) && !(sh?.composer.value.trim())) {
      this.host.marks.remove(id, true);
      this.list = this.list.filter((x) => x.id !== id);
      this.sheets.delete(id);
    }
    this.host.marks.setActive(null);
    this.host.arrows.clear('t:' + id, true);
    this.host.arrows.clear('r:' + id, true);
    sh?.hide();
    if (flyBack && !keepCamera && this.returnView) this.host.desk.camera.flyTo(this.returnView, { maxDuration: 800 });
    this.host.onSheet();
    if (!keepCamera) this.returnView = null;
    this.saveSoon();
  }

  /** Arrow from the doodle on the page (or its margin gist) to the sheet. */
  drawConnector(a: Annotation, animate: boolean) {
    const sh = this.sheets.get(a.id);
    const reader = this.host.reader();
    const g = this.host.marks.geo.get(a.id)?.[0];
    if (!sh || !reader || !g || this.openId !== a.id) return;
    const v = reader.views[g.page];
    const sheetLeftOfPage = sh.x < v.slot.x;
    // Start at the margin gist when there is one: mark → gist → full conversation.
    const note = this.host.marks.noteRect(a.id);
    let from: Pt;
    if (note && note.page === g.page) {
      const nr = note.rect;
      from = v.toWorld(sheetLeftOfPage ? nr.x - 3 : nr.x + nr.w + 3, nr.y + Math.min(nr.h / 2, 9));
    } else {
      from = v.toWorld(g.end.x + (g.side === 'left' ? -4 : 4), g.end.y);
    }
    const to = sheetLeftOfPage ? sh.toWorld(SHEET_W + 2, 26 * 3.5) : sh.entryPoint();
    this.host.arrows.draw('t:' + a.id, from, to, { color: C.userInk, width: 1.8, bend: from.y > to.y ? -0.2 : 0.2, animate });
  }

  /** Persistent arrows for the first few references of the conversation. */
  drawRefs(a: Annotation, animate: boolean) {
    this.host.arrows.clear('r:' + a.id, false);
    for (const k of [...this.hoverArrows]) if (k.startsWith('r:' + a.id)) this.hoverArrows.delete(k);
    if (!this.sheets.get(a.id) || this.openId !== a.id) return;
    let k = 0;
    for (const m of a.messages) {
      if (m.role !== 'ai' || !m.text) continue;
      for (const ref of parseReply(m.text, false).refs) {
        if (k >= 3) return;
        if (this.drawRef(a, m.id, ref.id, animate, k * 260)) k++;
      }
    }
  }

  private refTarget(a: Annotation, msgId: string, refId: number) {
    const doc = this.host.doc();
    const reader = this.host.reader();
    const m = a.messages.find((x) => x.id === msgId);
    if (!doc || !reader || !m) return null;
    const ref = parseReply(m.text, false).refs.find((r) => r.id === refId);
    if (!ref) return null;
    const hit = findQuote(doc.texts, ref.quote, ref.page !== undefined ? ref.page - 1 : undefined);
    if (!hit) return null;
    const pt = this.host.text(hit.page);
    const v = reader.views[hit.page];
    const rects = pt?.rangeRects(hit.start, hit.end) || [];
    if (!pt || !v || !rects.length) return null;
    return { page: hit.page, v, rects };
  }

  /** One arrow from the sheet's edge (level with the reference) to the quoted words. */
  private drawRef(a: Annotation, msgId: string, refId: number, animate: boolean, delay = 0, tag = ''): boolean {
    const sh = this.sheets.get(a.id);
    if (!sh || this.openId !== a.id) return false;
    const t = this.refTarget(a, msgId, refId);
    const local = sh.refLocal(msgId, refId);
    if (!t || !local) return false;
    const { v, rects } = t;
    const sheetRight = sh.x > v.slot.x + v.slot.w / 2;
    // land on the end of the quote nearest to the sheet
    const r = sheetRight
      ? rects.reduce((b, rc) => (rc.x + rc.w > b.x + b.w ? rc : b), rects[0])
      : rects.reduce((b, rc) => (rc.x < b.x ? rc : b), rects[0]);
    const to = v.toWorld(sheetRight ? r.x + r.w + 4 : r.x - 4, r.y + r.h * 0.55);
    const from = sheetRight ? sh.toWorld(-6, local.y) : sh.toWorld(SHEET_W + 6, local.y);
    if (Math.abs(to.y - from.y) > 1800) return false;
    const key = `r:${a.id}:${msgId}:${refId}`;
    this.host.arrows.draw(key, from, to, { color: C.accent, width: 1.4, bend: to.y < from.y ? 0.14 : -0.14, animate, delay, cls: 'ref-arrow' + (tag ? ' hover' : '') });
    rects.slice(0, 3).forEach((rc, i) => {
      const p0 = v.toWorld(rc.x, rc.y + rc.h + 1.1), p1 = v.toWorld(rc.x + rc.w, rc.y + rc.h + 1.1);
      this.host.arrows.scribble(`${key}:u${i}`, [p0, { x: (p0.x + p1.x) / 2, y: p0.y + 0.9 }, p1], C.accent, animate, delay + 280 + i * 120);
    });
    return true;
  }

  /** Clicking a reference: travel to the quoted words and make them glow for a moment. */
  showRefTarget(a: Annotation, msgId: string, refId: number) {
    const t = this.refTarget(a, msgId, refId);
    if (!t) { this.host.toast('在论文里没找到这句引用'); return; }
    const { v, rects } = t;
    const cam = this.host.desk.camera;
    const r0 = rects[0];
    const p = v.toWorld(r0.x + r0.w / 2, r0.y + r0.h / 2);
    const sh = this.sheets.get(a.id);
    // keep the sheet in view when the words are close by, otherwise just go there
    const target = sh && Math.abs(p.y - (sh.y + 200)) < 900
      ? cam.fit(union({ x: p.x - 160, y: p.y - 60, w: 320, h: 120 }, { x: sh.x, y: Math.max(sh.y, p.y - 300), w: SHEET_W, h: 400 })!, 50, cam.view.z)
      : { x: p.x, y: p.y, z: Math.max(cam.view.z, 1.2) };
    cam.flyTo(target, { maxDuration: 800 });
    this.drawRef(a, msgId, refId, true, 0, 'h');
    this.hoverArrows.delete(`r:${a.id}:${msgId}:${refId}`);
    for (const rc of rects.slice(0, 4)) {
      const hl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      hl.setAttribute('x', String(rc.x - 1.5)); hl.setAttribute('y', String(rc.y - 1)); hl.setAttribute('width', String(rc.w + 3)); hl.setAttribute('height', String(rc.h + 2));
      hl.setAttribute('rx', '2'); hl.setAttribute('class', 'ref-flash');
      v.gHint.append(hl);
      setTimeout(() => hl.remove(), 2400);
    }
  }

  /** World rectangle of the open sheet, if any. */
  openSheetRect(): Rect | null {
    const sh = this.openId ? this.sheets.get(this.openId) : null;
    return sh && sh.state === 'shown' ? sh.rect : null;
  }

  /** Bring the open sheet back into view (from the off-screen tab). */
  reframe() {
    const a = this.openId ? this.byId(this.openId) : null;
    if (a) { this.openedAt = performance.now(); this.frame(a, this.running.has(a.id)); }
  }

  /** The composer must be on screen while the reader writes. */
  private ensureComposerVisible(a: Annotation) {
    const sh = this.sheets.get(a.id);
    const cam = this.host.desk.camera;
    if (!sh || cam.animating) return;
    const p = sh.toWorld(SHEET_W / 2, sh.height - 40);
    const sp = cam.worldToScreen(p.x, p.y);
    if (sp.y > 70 && sp.y < cam.vh - 90) return;
    cam.flyTo({ x: cam.view.x, y: cam.view.y + (sp.y - cam.vh * 0.68) / cam.view.z, z: cam.view.z }, { duration: 420 });
  }

  /** While the AI writes, keep the pen on screen unless the reader has taken the camera. */
  private followPen(a: Annotation) {
    const sh = this.sheets.get(a.id);
    const cam = this.host.desk.camera;
    if (!sh || !this.running.has(a.id) || cam.userAt > this.openedAt) return;
    const now = performance.now();
    if (now - this.followAt < 500 || cam.animating) return;
    const bottom = sh.toWorld(SHEET_W / 2, sh.writtenBottom);
    const sp = cam.worldToScreen(bottom.x, bottom.y);
    const limit = cam.vh - 110;
    if (sp.y <= limit) return;
    this.followAt = now;
    const dy = (sp.y - limit + cam.vh * 0.25) / cam.view.z;
    cam.flyTo({ x: cam.view.x, y: cam.view.y + dy, z: cam.view.z }, { duration: 650 });
  }

  /* ---------------- asking ---------------- */

  async ask(id: string, question: string, opts: { typed?: boolean } = {}) {
    const a = this.byId(id);
    const host = this.host;
    const settings = host.settings();
    if (!a || !settings || !this.paperId) return;
    if (this.running.has(id)) { host.toast('AI 还在写上一段…'); return; }
    if (this.openId !== id) this.open(id, { fly: true });
    const sh = this.ensureSheet(a);
    const now = Date.now();
    const userMsg: Message = { id: uid('m'), role: 'user', text: question, at: now };
    const firstTurn = !a.messages.some((m) => m.role === 'ai' && m.text);
    a.messages.push(userMsg);
    sh.addUser(userMsg, !opts.typed);
    if (opts.typed) sh.composer.clear();
    const aiMsg: Message = { id: uid('m'), role: 'ai', text: '', at: now };
    a.messages.push(aiMsg);
    a.updatedAt = now;
    const writing = sh.startAi(aiMsg);
    host.marks.draw(a, false);
    host.marks.setActive(this.openId);
    host.marks.setPending(a.id, true);
    host.aiActivity(+1);
    const ctl = new AbortController();
    this.running.set(id, ctl);
    this.saveSoon();
    setTimeout(() => this.drawConnector(a, false), 60);

    let text = '';
    let final = '';
    let error = '';
    const pid = this.paperId;
    const alive = () => this.paperId === pid && this.list.includes(a);
    try {
      await host.ensurePaperText();
      const provider = settings.provider;
      const sameProvider = a.provider === provider;
      const resume = sameProvider && !!a.sessionId && !firstTurn;
      const body = {
        paperId: this.paperId,
        threadId: a.id,
        provider,
        sessionId: resume ? a.sessionId : undefined,
        question,
        selection: resume ? undefined : await host.describe(a.anchor),
        images: resume ? [] : await host.images(a.anchor),
        history: a.messages.filter((m) => m !== aiMsg && m !== userMsg && m.text).map((m) => ({ role: m.role, text: m.role === 'ai' ? replyToPlain(m.text) : m.text })),
        outline: resume ? undefined : await host.outline(),
      };
      a.provider = provider;
      await api.ask(body, (e) => {
        if (e.type === 'delta') { text += e.text; aiMsg.text = text; writing.feed(text); }
        else if (e.type === 'tool') {
          // A tool call after some text means that text was a preamble: start the answer over.
          if (text.trim() && settings.provider === 'claude') { text = ''; aiMsg.text = ''; writing.feed(''); }
          writing.status(toolLabel(e.name, e.detail));
        } else if (e.type === 'status') writing.status(statusLabel(e.text));
        else if (e.type === 'session') a.sessionId = e.sessionId;
        else if (e.type === 'done') { final = e.text || text; if (e.sessionId) a.sessionId = e.sessionId; }
        else if (e.type === 'error') error = e.message;
      }, ctl.signal);
    } catch (e: any) {
      error = ctl.signal.aborted ? '已停下' : (e?.message || String(e));
    } finally {
      this.running.delete(id);
      host.aiActivity(-1);
    }
    if (!final && !error) final = text;
    // Erased while writing, or the paper was put away: nothing to draw any more.
    if (!alive()) return;
    if (error && !final) {
      aiMsg.error = error;
      writing.error(error);
      host.marks.setPending(a.id, false);
      host.marks.draw(a, false);
      this.saveSoon();
      return;
    }
    aiMsg.text = final;
    const parsed = parseReply(final, false);
    if (parsed.margin) a.margin = parsed.margin;
    a.updatedAt = Date.now();
    this.saveSoon();
    await writing.done(final);
    if (!alive()) return;
    sh.composer.setPlaceholder('接着问…');
    host.marks.setPending(a.id, false);
    host.marks.draw(a, false);
    await host.marks.drawNote(a, true);
    host.marks.setActive(this.openId);
    if (this.openId === id) { this.drawConnector(a, false); this.drawRefs(a, true); }
  }

  retry(id: string) {
    const a = this.byId(id);
    if (!a) return;
    const lastUser = [...a.messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // drop the failed answer and the question, then ask again
    const i = a.messages.lastIndexOf(lastUser);
    a.messages = a.messages.slice(0, i);
    const sh = this.sheets.get(id);
    sh?.renderAll(false);
    void this.ask(id, lastUser.text, { typed: true });
  }

  isRunning(id: string) { return this.running.has(id); }
}

function touches(a: Annotation, page: number) {
  if (a.anchor.kind === 'region') return a.anchor.page === page;
  if (a.anchor.kind === 'text') return a.anchor.ranges.some((r) => r.page === page);
  return false;
}

function toolLabel(name: string, detail?: string) {
  const d = detail ? String(detail).slice(0, 36) : '';
  switch (name) {
    case 'Read': return d ? `翻看 ${d}…` : '翻看论文…';
    case 'Grep': return d ? `在论文里找 “${d}”…` : '在论文里找…';
    case 'Glob': return '看看手边的资料…';
    case 'WebSearch': return d ? `上网查 “${d}”…` : '上网查一下…';
    case 'WebFetch': return '打开一个网页…';
    case 'Shell': return '翻阅论文…';
    default: return `${name}…`;
  }
}

function statusLabel(s: string) {
  if (s === 'thinking') return '想一想…';
  if (s === 'restarting conversation') return '重新接上对话…';
  return s.length > 60 ? s.slice(0, 58) + '…' : s;
}
