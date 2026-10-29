// A sheet of scratch paper lying next to the page: the conversation about one annotation, written by hand —
// the reader in blue ballpoint, the AI in pencil — with a handwriting composer at the bottom.
import { HAND_AI, HAND_USER, MessageView } from '../ink/handwriting';
import { replyToPlain } from '../ink/markdown';
import type { Annotation, Message, SheetPaper } from '../types';
import { h } from '../util/dom';
import type { Pt, Rect } from '../util/geom';
import { ICONS, penSvg } from '../ui/icons';
import { Composer } from './composer';

export const SHEET_W = 470;
const LINE = 26;
const CONTENT_X = 58;
const CONTENT_W = SHEET_W - CONTENT_X - 26;

export interface SheetCtx {
  zoom(): number;
  ask(a: Annotation, question: string): void;
  close(a: Annotation): void;
  erase(a: Annotation): void;
  copy(a: Annotation): void;
  english(a: Annotation): void;
  moved(a: Annotation, x: number, y: number): void;
  grew(a: Annotation): void;
  retry(a: Annotation): void;
  cancel(a: Annotation): void;
  label(a: Annotation): string;
  refHover(a: Annotation, msgId: string, refId: number, on: boolean): void;
  refClick(a: Annotation, msgId: string, refId: number): void;
  composerFocus(a: Annotation): void;
}

export interface AiWriting {
  feed(textSoFar: string): void;
  status(text: string): void;
  done(text: string): Promise<void>;
  error(message: string): void;
}

export class Sheet {
  el: HTMLDivElement;
  paper: HTMLDivElement;
  convo: HTMLDivElement;
  composer: Composer;
  x = 0; y = 0; rot = 0;
  views = new Map<string, { view: MessageView; wrap: HTMLDivElement }>();
  private shadow: HTMLDivElement;
  private dragging: { sx: number; sy: number; x: number; y: number; id: number } | null = null;
  private hiding: Animation | null = null;
  /** 'shown' while open; 'hiding' during the slide-away; 'hidden' once off the desk. */
  state: 'shown' | 'hiding' | 'hidden' = 'hidden';
  height = 200;

  constructor(public a: Annotation, private ctx: SheetCtx, paper: SheetPaper) {
    this.shadow = h('div', { class: 'sh-shadow' });
    const tape = h('div', { class: 'sh-tape', title: '拖动这张纸' });
    const btn = (icon: string, title: string, fn: () => void, cls = '') => {
      const b = h('button', { class: 'sh-btn ' + cls, title, html: icon, type: 'button' });
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    const head = h('div', { class: 'sh-head' },
      h('span', { class: 'sh-ref' }, ctx.label(a)),
      h('span', { class: 'sh-tools' },
        ...(a.anchor.kind === 'text' ? [btn('<span style="font-size:12px">Aa</span>', '将原文选区加入英语词本', () => ctx.english(a))] : []),
        btn(ICONS.copy, '复制这段对话', () => ctx.copy(a)),
        btn(ICONS.trash, '擦掉这条笔记', () => ctx.erase(a)),
        btn(ICONS.close, '收起 (Esc)', () => ctx.close(a), 'close'),
      ),
    );
    this.convo = h('div', { class: 'sh-convo' });
    this.composer = new Composer(HAND_USER, a.messages.length ? '接着问…' : '在这里写下你的问题…');
    this.composer.onSend = (t) => ctx.ask(a, t);
    this.composer.onEscape = () => ctx.close(a);
    this.composer.onFocus = () => ctx.composerFocus(a);
    const compose = h('div', { class: 'sh-compose' }, h('span', { class: 'sh-who user' }, '我'), this.composer.el);
    this.paper = h('div', { class: `sh-paper paper-${paper}` }, tape, head, this.convo, compose);
    this.el = h('div', { class: 'sheet', dataset: { id: a.id } }, this.shadow, this.paper);
    this.el.style.width = SHEET_W + 'px';

    // Interactions stay on the sheet: no desk panning, no page selection underneath.
    this.el.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      e.stopPropagation();
      if (t.closest('button, textarea, .hw-body')) return;
      if (t.closest('.sh-tape, .sh-head') || t === this.paper || t.closest('.sh-who')) this.startDrag(e);
    });
    this.el.addEventListener('pointermove', (e) => this.moveDrag(e));
    this.el.addEventListener('pointerup', (e) => this.endDrag(e));
    this.el.addEventListener('pointercancel', (e) => this.endDrag(e));
    this.el.addEventListener('lostpointercapture', () => this.endDragNow());
    this.el.addEventListener('dblclick', (e) => e.stopPropagation());
    // References inside the AI's writing: hover shows the arrow, click travels to the words.
    const refOf = (t: EventTarget | null) => {
      const el = (t as HTMLElement | null)?.closest?.('.hw-ref, .hw-reftag') as HTMLElement | null;
      const wrap = el?.closest('.sh-msg') as HTMLElement | null;
      if (!el || !wrap?.dataset.mid) return null;
      return { mid: wrap.dataset.mid, ref: Number(el.dataset.ref) };
    };
    this.el.addEventListener('pointerover', (e) => { const r = refOf(e.target); if (r) ctx.refHover(this.a, r.mid, r.ref, true); });
    this.el.addEventListener('pointerout', (e) => { const r = refOf(e.target); if (r) ctx.refHover(this.a, r.mid, r.ref, false); });
    this.el.addEventListener('click', (e) => { const r = refOf(e.target); if (r) { e.stopPropagation(); ctx.refClick(this.a, r.mid, r.ref); } });
  }

  setPos(x: number, y: number, rot = this.rot) {
    this.x = x; this.y = y; this.rot = rot;
    this.el.style.left = x + 'px';
    this.el.style.top = y + 'px';
    this.el.style.rotate = rot.toFixed(2) + 'deg';
  }

  get rect(): Rect {
    return { x: this.x, y: this.y, w: SHEET_W, h: this.height };
  }

  private startDrag(e: PointerEvent) {
    this.dragging = { sx: e.clientX, sy: e.clientY, x: this.x, y: this.y, id: e.pointerId };
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add('lifted');
  }
  private moveDrag(e: PointerEvent) {
    const d = this.dragging;
    if (!d || d.id !== e.pointerId) return;
    // The button was released somewhere we did not hear about: stop, never let the sheet follow the mouse.
    if ((e.buttons & 1) === 0) { this.endDrag(e); return; }
    const z = this.ctx.zoom();
    this.setPos(d.x + (e.clientX - d.sx) / z, d.y + (e.clientY - d.sy) / z);
    this.ctx.moved(this.a, this.x, this.y);
  }
  private endDrag(e: PointerEvent) {
    const d = this.dragging;
    if (!d || d.id !== e.pointerId) return;
    this.endDragNow();
    this.ctx.moved(this.a, this.x, this.y);
  }

  private endDragNow() {
    const d = this.dragging;
    if (!d) return;
    this.dragging = null;
    this.el.classList.remove('lifted');
    try { this.el.releasePointerCapture(d.id); } catch { /* ignore */ }
  }

  /** Lays down every message already in the thread (instantly, or with a quick write-in). */
  renderAll(quick = false) {
    this.convo.replaceChildren();
    this.views.clear();
    for (const m of this.a.messages) {
      if (m.role === 'ai' && !m.text && !m.error) continue;
      const v = this.addMessage(m, false);
      if (quick) v.view.el.classList.add('quick-in');
    }
    this.measure();
  }

  private addMessage(m: Message, animate: boolean, pen?: HTMLElement) {
    const hand = m.role === 'user' ? HAND_USER : HAND_AI;
    const wrap = h('div', { class: `sh-msg ${m.role}`, dataset: { mid: m.id } }, h('span', { class: `sh-who ${m.role}` }, m.role === 'user' ? '我' : 'AI'));
    if (m.role === 'ai') wrap.append(h('span', { class: 'sh-arrow', html: '<svg viewBox="0 0 30 22"><path d="M4 3 Q4 15 22 15 M17 10 L23 15 L17 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' }));
    const view = new MessageView(hand, CONTENT_W, m.id, {
      animate,
      pen,
      onGrow: () => { this.measure(); this.ctx.grew(this.a); },
    });
    wrap.append(view.el);
    if (pen) wrap.append(pen);
    if (m.error) wrap.append(this.errorLine(m.error));
    this.convo.append(wrap);
    view.update(m.text, false);
    this.views.set(m.id, { view, wrap });
    return { view, wrap };
  }

  private errorLine(msg: string) {
    const retry = h('button', { class: 'sh-retry', type: 'button' }, '再试一次');
    retry.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.retry(this.a); });
    return h('div', { class: 'sh-error' }, h('span', null, '（没写成：' + msg.slice(0, 160) + '）'), retry);
  }

  /** The reader's question: instant when it was just typed here, written by pen for quick actions. */
  addUser(m: Message, written: boolean) {
    const pen = written ? h('div', { class: 'sh-pen user-pen', html: penSvg('ballpoint') }) : undefined;
    const { view } = this.addMessage(m, written, pen);
    view.update(m.text, false);
    this.measure();
  }

  /** Starts the AI's answer: the pencil hovers and thinks, then writes as text streams in. */
  startAi(m: Message): AiWriting {
    const pen = h('div', { class: 'sh-pen ai-pen on thinking', html: penSvg('pencil') });
    const status = h('div', { class: 'sh-status' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), h('span', { class: 'txt' }, '想一想…'));
    const cancel = h('button', { class: 'sh-cancel', type: 'button', title: '停下' }, '停');
    cancel.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.cancel(this.a); });
    status.append(cancel);
    let resolveDone: () => void = () => {};
    const doneP = new Promise<void>((r) => (resolveDone = r));
    const view = new MessageView(HAND_AI, CONTENT_W, m.id, {
      animate: true,
      pen,
      onGrow: () => { this.measure(); this.ctx.grew(this.a); },
      onDone: () => resolveDone(),
    });
    const wrap = h('div', { class: 'sh-msg ai writing', dataset: { mid: m.id } },
      h('span', { class: 'sh-who ai' }, 'AI'),
      h('span', { class: 'sh-arrow', html: '<svg viewBox="0 0 30 22"><path d="M4 3 Q4 15 22 15 M17 10 L23 15 L17 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
      view.el, pen, status);
    this.convo.append(wrap);
    this.views.set(m.id, { view, wrap });
    this.composer.setBusy(true);
    this.measure();
    let started = false;
    return {
      feed: (text) => {
        if (!started && text.trim()) { started = true; status.classList.add('writing'); }
        view.update(text, true);
      },
      status: (t) => { (status.querySelector('.txt') as HTMLElement).textContent = t; },
      done: async (text) => {
        view.update(text, false);
        await doneP;
        status.remove();
        wrap.classList.remove('writing');
        this.composer.setBusy(false);
        this.measure();
      },
      error: (msg) => {
        status.remove();
        pen.remove();
        wrap.classList.remove('writing');
        wrap.append(this.errorLine(msg));
        this.composer.setBusy(false);
        this.measure();
      },
    };
  }

  measure() {
    // Sum of known heights (no forced layout): head 2 lines, messages, composer.
    let hgt = LINE * 3;
    for (const { view, wrap } of this.views.values()) {
      hgt += Math.max(LINE, view.height) + LINE;
      if (wrap.querySelector('.sh-error')) hgt += LINE * 2;
      if (wrap.querySelector('.sh-status')) hgt += LINE;
    }
    hgt += LINE * 2 + 10;
    this.height = Math.max(LINE * 7, hgt);
    this.paper.style.minHeight = this.height + 'px';
  }

  /** Sheet-local position of a reference inside the AI's text. */
  refLocal(msgId: string, refId: number): Pt | null {
    const v = this.views.get(msgId);
    const el = v?.view.refEls.get(refId);
    if (!el) return null;
    const local = offsetWithin(el, this.el);
    if (!local) return null;
    return { x: local.x, y: local.y + el.offsetHeight * 0.62 };
  }

  /** Bottom of the written part (sheet-local y), for keeping the pen in view. */
  get writtenBottom() {
    return this.height - 26 * 2;
  }

  /** Where the thread arrow lands: the left edge beside the first question. */
  entryPoint(): Pt {
    return this.toWorld(-2, LINE * 3.5);
  }

  toWorld(lx: number, ly: number): Pt {
    const a = (this.rot * Math.PI) / 180;
    const cx = SHEET_W / 2, cy = this.height / 2;
    const dx = lx - cx, dy = ly - cy;
    return { x: this.x + cx + dx * Math.cos(a) - dy * Math.sin(a), y: this.y + cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }

  plainText() {
    return this.a.messages.map((m) => `${m.role === 'user' ? '我' : 'AI'}：${m.role === 'ai' ? replyToPlain(m.text) : m.text}`).join('\n\n');
  }

  /** Placed onto the desk from slightly above. Safe to call at any moment, even mid slide-away. */
  show(parent: HTMLElement) {
    // Whatever was fading it out must not win: cancel by handle (a detached element reports no animations).
    this.hiding?.cancel();
    this.hiding = null;
    if (!this.el.isConnected) parent.append(this.el);
    for (const an of this.el.getAnimations()) an.cancel();
    this.state = 'shown';
    this.el.classList.remove('leaving');
    this.el.animate([
      { transform: 'translate(-26px, -34px) scale(1.07)', opacity: 0 },
      { transform: 'translate(-4px, -6px) scale(1.012)', opacity: 1, offset: 0.7 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
    this.shadow.animate([
      { transform: 'translate(26px, 34px)', opacity: 0.4 },
      { transform: 'translate(7px, 9px)', opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  /** Off the desk right now, no animation (erase, paper switch). */
  dispose() {
    this.endDragNow();
    this.hiding?.cancel();
    this.hiding = null;
    for (const an of this.el.getAnimations()) an.cancel();
    this.el.remove();
    this.state = 'hidden';
  }

  /** Screen-independent check used by the camera helpers. */
  get visibleState() { return this.state; }

  /** Lifted off and slid away, then taken off the desk — unless it was reopened meanwhile. */
  hide() {
    if (this.state !== 'shown') return;
    this.state = 'hiding';
    this.endDragNow();
    this.el.classList.add('leaving');
    const a = this.el.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: 'translate(40px, -24px) scale(1.04)', opacity: 0 },
    ], { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    this.hiding = a;
    a.finished.then(() => {
      if (this.hiding !== a || this.state !== 'hiding') return;
      this.hiding = null;
      this.state = 'hidden';
      this.el.remove();
      a.cancel();
    }, () => { /* cancelled by show() */ });
  }
}

function offsetWithin(el: HTMLElement, root: HTMLElement): Pt | null {
  let x = 0, y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return n === root ? { x, y } : null;
}
