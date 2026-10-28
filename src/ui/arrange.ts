// 摆放模式 (from the desk settings): move and turn anything on the desk. Point at something and its footprint is
// drawn on the desk; drag it to slide it, drag the little round handle to turn it (in 5° steps). Things that work
// together move together: a shared paper with its stationery (the pencil keeps writing on its quiz). The 数学小测
// group only slides along the front edge (the ruler twangs over it) and the 英语默写 group only along the 三八线 (the
// eraser counts what crosses it). Nothing may leave the desk or sit on something else: a place like that shows red
// and the thing goes back when let go. Arrows nudge the chosen one, R / Shift+R turn it, ⌘Z undoes; Esc or 完成
// leaves. The camera still turns and zooms as usual (drag the bare desk).
import * as E from '../scene/engine/index.js';
import { ARRANGE, DESK_SIZE, nudgeUV, setArrange, setNudge, type Nudge, type Unit } from '../scene/layout';
import type { DeskHome } from '../scene/home';
import { h, s } from '../util/dom';

type Quad = Array<[number, number]>;
const nudgeOf = (id: string): Nudge => ({ ...(ARRANGE[id] ?? { du: 0, dv: 0, rot: 0 }) });
const SNAP = 5, MARGIN = 6;

export class Arrange {
  on = false;
  /** the arrangement changed (save it) */
  onSave?: (place: Record<string, Nudge>) => void;
  onExit?: () => void;
  private overlay: SVGSVGElement;
  private gOut: SVGGElement;
  private handle: SVGGElement;
  private tag: HTMLDivElement;
  private bar: HTMLDivElement;
  private undoB: HTMLButtonElement;
  private hover: Unit | null = null;
  private sel: Unit | null = null;
  private bad = false;
  private drag: { unit: Unit; mode: 'move' | 'turn'; at: [number, number]; n0: Nudge; ang0: number; ok: Nudge; pid: number; ignore: Set<Unit> } | null = null;
  private undos: Array<Record<string, Nudge>> = [];

  constructor(host: HTMLElement, private home: DeskHome) {
    this.gOut = s('g', { class: 'ar-outlines' });
    this.handle = s('g', { class: 'ar-handle' },
      s('line', { class: 'ar-stem' }), s('circle', { class: 'ar-knob', r: 13 }),
      s('path', { class: 'ar-glyph', d: 'M-5.5 -1.5 A6 6 0 1 1 -3.4 4.6 M-5.5 -1.5 l-0.6 -4.2 M-5.5 -1.5 l3.9 -1.3' }));
    this.overlay = s('svg', { class: 'arrange-overlay', width: '100%', height: '100%' }, this.gOut, this.handle);
    this.tag = h('div', { class: 'ar-tag' });
    const btn = (label: string, title: string, on: () => void, cls = '') => {
      const b = h('button', { class: 'ar-btn ' + cls, type: 'button', title }, label) as HTMLButtonElement;
      b.addEventListener('click', (e) => { e.stopPropagation(); on(); });
      return b;
    };
    this.undoB = btn('撤销', '撤销上一步（⌘Z）', () => this.undo());
    this.bar = h('div', { class: 'arrange-bar' },
      h('span', { class: 'ar-title' }, '摆放模式'),
      h('span', { class: 'ar-hint' }, '拖动挪位置 · 拖圆点转方向 · 同一张纸上的文具一起挪'),
      this.undoB, btn('全部复位', '所有东西放回原来的位置', () => this.resetAll()), btn('完成', '完成摆放（Esc）', () => this.exit(), 'done'));
    for (const t of ['pointerdown', 'click', 'dblclick']) this.bar.addEventListener(t, (e) => e.stopPropagation());
    host.append(this.overlay, this.tag, this.bar);
    const el = home.scene.el;
    el.addEventListener('pointerdown', this.down, { capture: true });
    el.addEventListener('pointermove', this.move, { capture: true });
    el.addEventListener('pointerup', this.up, { capture: true });
    el.addEventListener('pointercancel', this.up, { capture: true });
    el.addEventListener('wheel', this.wheel, { capture: true, passive: false });
    this.handle.addEventListener('pointerdown', (e) => this.startTurn(e as PointerEvent));
    addEventListener('keydown', this.key);
    home.scene.frameHooks.add(() => { if (this.on) this.draw(); });
  }

  enter() {
    if (this.on) return;
    this.on = true;
    const hm = this.home;
    hm.menu.close();
    hm.menu.hush();
    hm.fan.close();
    hm.arranging = true;
    hm.orbit.keysOff = () => !!this.sel;
    hm.scene.el.classList.add('arranging');
    document.body.classList.add('arranging');
    this.undos = [];
    this.updateUndo();
    this.draw();
  }
  exit() {
    if (!this.on) return;
    this.on = false;
    this.drag = null;
    this.hover = this.sel = null;
    this.home.arranging = false;
    this.home.orbit.keysOff = undefined;
    this.home.scene.el.classList.remove('arranging', 'ar-over');
    document.body.classList.remove('arranging');
    this.draw();
    this.onExit?.();
  }

  /* ---------- geometry ---------- */
  private deskAt(e: { clientX: number; clientY: number }): [number, number] {
    const p = this.home.scene.unprojectAt(e.clientX, e.clientY, E.DESK_Z);
    return [-p[1], p[0]];
  }
  /** A unit's footprint now (or with a trial nudge): one quad per thing in it, in desk (u, v). */
  private quads(unit: Unit, n?: Nudge): Quad[] {
    return this.home.scene.footprintParts(unit, n ?? ARRANGE[unit.id]);
  }
  /** The units this one already touches where it is (those never stop it from moving). */
  private touching(unit: Unit) {
    const mine = this.quads(unit), out = new Set<Unit>();
    for (const other of this.home.scene.units()) if (other !== unit && mine.some((a) => this.quads(other).some((b) => Arrange.overlap(a, b)))) out.add(other);
    return out;
  }
  private static overlap(a: Quad, b: Quad) {
    for (const q of [a, b]) for (let i = 0; i < 4; i++) {
      const p0 = q[i], p1 = q[(i + 1) % 4], nx = p1[1] - p0[1], ny = p0[0] - p1[0];
      const pa = a.map(([x, y]) => x * nx + y * ny), pb = b.map(([x, y]) => x * nx + y * ny);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
    return true;
  }
  /** Can the unit lie here: on the desk, and on nothing else (but what it touched already)? */
  private fits(unit: Unit, n: Nudge, ignore: Set<Unit> = this.touching(unit)) {
    const L = DESK_SIZE.L / 2 - MARGIN, D = DESK_SIZE.D / 2 - MARGIN, mine = this.quads(unit, n);
    // the ruler hangs over the front edge on purpose: its group is only kept from leaving the desk sideways
    for (const q of mine) for (const [u, v] of q) if (Math.abs(u) > L || (unit.lock !== 'u' && Math.abs(v) > D)) return false;
    for (const other of this.home.scene.units()) {
      if (other === unit || ignore.has(other)) continue;
      const theirs = this.quads(other);
      for (const a of mine) for (const b of theirs) if (Arrange.overlap(a, b)) return false;
    }
    return true;
  }
  private constrain(unit: Unit, n: Nudge): Nudge {
    if (unit.lock === 'u') return { du: n.du, dv: 0, rot: 0 };
    if (unit.lock === 'v') return { du: 0, dv: n.dv, rot: 0 };
    return n;
  }
  private nameOf(unit: Unit) {
    if (unit.name) return unit.name;
    const o = this.home.scene.objects.find((x) => x.id === unit.objs[0]);
    return o?.title ?? unit.id;
  }

  /* ---------- pointer ---------- */
  private down = (e: PointerEvent) => {
    if (!this.on || e.button !== 0) return;
    const unit = this.home.scene.unitAt(e.target as Element);
    if (!unit) { this.sel = null; this.draw(); return; }
    e.stopImmediatePropagation();
    e.preventDefault();
    this.sel = unit;
    const n0 = nudgeOf(unit.id);
    this.drag = { unit, mode: 'move', at: this.deskAt(e), n0, ang0: 0, ok: n0, pid: e.pointerId, ignore: this.touching(unit) };
    try { this.home.scene.el.setPointerCapture(e.pointerId); } catch { /* gone */ }
    this.home.scene.el.classList.add('ar-dragging');
    this.draw();
  };
  private startTurn(e: PointerEvent) {
    if (!this.on || !this.sel || this.sel.lock) return;
    e.stopPropagation();
    e.preventDefault();
    const unit = this.sel, n0 = nudgeOf(unit.id);
    const [u, v] = this.deskAt(e), c = [unit.pivot[0] + n0.du, unit.pivot[1] + n0.dv];
    this.drag = { unit, mode: 'turn', at: [u, v], n0, ang0: Math.atan2(v - c[1], u - c[0]), ok: n0, pid: e.pointerId, ignore: this.touching(unit) };
    try { this.home.scene.el.setPointerCapture(e.pointerId); } catch { /* gone */ }
    this.home.scene.el.classList.add('ar-dragging');
  }
  private move = (e: PointerEvent) => {
    if (!this.on) return;
    const d = this.drag;
    if (!d) {
      const u = this.home.scene.unitAt(e.target as Element);
      if (u !== this.hover) { this.hover = u; this.home.scene.el.classList.toggle('ar-over', !!u); this.draw(); }
      return;
    }
    if (e.pointerId !== d.pid) return;
    e.stopImmediatePropagation();
    const [u, v] = this.deskAt(e);
    let n: Nudge;
    if (d.mode === 'move') n = { ...d.n0, du: d.n0.du + u - d.at[0], dv: d.n0.dv + v - d.at[1] };
    else {
      const c = [d.unit.pivot[0] + d.n0.du, d.unit.pivot[1] + d.n0.dv];
      const da = (Math.atan2(v - c[1], u - c[0]) - d.ang0) * 180 / Math.PI;
      n = { ...d.n0, rot: Math.round((d.n0.rot + da) / SNAP) * SNAP };
    }
    n = this.constrain(d.unit, n);
    this.apply(d.unit, n);
    this.bad = !this.fits(d.unit, n, d.ignore);
    if (!this.bad) d.ok = n;
    this.draw();
  };
  private up = (e: PointerEvent) => {
    const d = this.drag;
    if (!this.on || !d || e.pointerId !== d.pid) return;
    e.stopImmediatePropagation();
    this.drag = null;
    this.home.scene.el.classList.remove('ar-dragging');
    const wasBad = this.bad, cur = nudgeOf(d.unit.id), end = wasBad ? d.ok : cur;
    this.bad = false;
    const moved = end.du !== d.n0.du || end.dv !== d.n0.dv || end.rot !== d.n0.rot;
    // a place it doesn't fit: it slides back to the last place it did, then that counts
    if (wasBad) this.settle(d.unit, cur, d.ok, () => { if (moved) this.commit(d.unit, d.n0); });
    else if (moved) this.commit(d.unit, d.n0);
    this.draw();
  };
  private wheel = (e: WheelEvent) => {
    if (!this.on) return;
    const unit = this.home.scene.unitAt(e.target as Element);
    if (!unit || unit.lock) return;
    // over a thing: the wheel turns it instead of zooming
    e.preventDefault();
    e.stopImmediatePropagation();
    this.sel = unit;
    this.turnBy(unit, Math.sign(e.deltaY || e.deltaX) * SNAP);
  };
  private key = (e: KeyboardEvent) => {
    if (!this.on) return;
    const t = e.target as HTMLElement;
    if (t && (t.isContentEditable || /input|textarea|select/i.test(t.tagName))) return;
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); this.exit(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
    const u = this.sel;
    if (!u) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); if (!u.lock) this.turnBy(u, e.shiftKey ? -15 : 15); return; }
    const step = e.shiftKey ? 50 : 10, mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = mv[e.key];
    if (!m) return;
    e.preventDefault();
    const n0 = nudgeOf(u.id), n = this.constrain(u, { ...n0, du: n0.du + m[0], dv: n0.dv + m[1] });
    if (this.fits(u, n)) { this.apply(u, n); this.commit(u, n0); } else this.nope(u);
    this.draw();
  };
  private turnBy(u: Unit, deg: number) {
    const n0 = nudgeOf(u.id), n = { ...n0, rot: n0.rot + deg };
    if (this.fits(u, n)) { this.apply(u, n); this.commit(u, n0); } else this.nope(u);
    this.draw();
  }

  /* ---------- changes ---------- */
  private apply(unit: Unit, n: Nudge) {
    setNudge(unit.id, n);
    this.home.scene.moved(unit);
  }
  /** Back to the last good place, eased. */
  private settle(unit: Unit, from: Nudge, to: Nudge, done?: () => void) {
    const t0 = performance.now(), ms = 220;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      this.apply(unit, { du: from.du + (to.du - from.du) * e, dv: from.dv + (to.dv - from.dv) * e, rot: from.rot + (to.rot - from.rot) * e });
      this.draw();
      if (k < 1) requestAnimationFrame(step); else { this.apply(unit, to); this.draw(); done?.(); }
    };
    requestAnimationFrame(step);
  }
  private nope(u: Unit) {
    this.sel = u;
    this.bad = true;
    this.draw();
    setTimeout(() => { this.bad = false; this.draw(); }, 260);
  }
  private commit(unit: Unit, before: Nudge) {
    const snap = { ...ARRANGE };
    if (before.du || before.dv || before.rot) snap[unit.id] = before; else delete snap[unit.id];
    this.undos.push(snap);
    if (this.undos.length > 60) this.undos.shift();
    this.updateUndo();
    this.onSave?.({ ...ARRANGE });
  }
  private undo() {
    const prev = this.undos.pop();
    if (!prev) return;
    setArrange(prev);
    this.home.scene.render();
    this.updateUndo();
    this.onSave?.({ ...ARRANGE });
    this.draw();
  }
  private resetAll() {
    if (!Object.keys(ARRANGE).length) return;
    this.undos.push({ ...ARRANGE });
    setArrange({});
    this.home.scene.render();
    this.updateUndo();
    this.onSave?.({});
    this.draw();
  }
  private updateUndo() { this.undoB.disabled = !this.undos.length; }

  /* ---------- drawing the outlines ---------- */
  private draw() {
    const show = this.on;
    this.overlay.classList.toggle('on', show);
    this.bar.classList.toggle('on', show);
    const scene = this.home.scene, units = show ? [this.sel, this.hover !== this.sel ? this.hover : null].filter(Boolean) as Unit[] : [];
    let out = '';
    for (const u of units) {
      const bad = this.bad && u === this.sel;
      for (const q of this.quads(u)) {
        // a little bigger than the thing, so the outline sits round it on the desk
        const cu = q.reduce((a, p) => a + p[0], 0) / 4, cv = q.reduce((a, p) => a + p[1], 0) / 4;
        const big = q.map(([a, b]) => { const dx = a - cu, dy = b - cv, L = Math.hypot(dx, dy) || 1; return [a + dx / L * 9, b + dy / L * 9]; });
        const pts = scene.projectAt(big.map(([a, b]) => [b, -a, E.DESK_Z + 0.5]));
        out += `<path class="ar-out${u === this.sel ? ' sel' : ''}${bad ? ' bad' : ''}" d="M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L')}Z"/>`;
      }
    }
    this.gOut.innerHTML = out;
    // the turn handle: beyond the far side of the chosen thing, on a short stem from its middle
    const u = show ? this.sel : null;
    if (u && !u.lock) {
      const n = ARRANGE[u.id], [, v0] = scene.baseFootprint(u);
      const [cu, cv] = nudgeUV(n, u.pivot, u.pivot[0], u.pivot[1]), [hu, hv] = nudgeUV(n, u.pivot, u.pivot[0], Math.min(v0, u.pivot[1] - 30) - 42);
      const [p0, p1] = scene.projectAt([[cv, -cu, E.DESK_Z + 1], [hv, -hu, E.DESK_Z + 1]]);
      this.handle.querySelector('.ar-stem')!.setAttribute('x1', String(p0.x - p1.x));
      this.handle.querySelector('.ar-stem')!.setAttribute('y1', String(p0.y - p1.y));
      this.handle.setAttribute('transform', `translate(${p1.x.toFixed(1)} ${p1.y.toFixed(1)})`);
      this.handle.classList.add('on');
    } else this.handle.classList.remove('on');
    // the name of what is pointed at (or chosen), and what it can do
    const named = show ? (this.hover ?? this.sel) : null;
    if (named) {
      const r = this.quads(named)[0], pts = scene.projectAt(r.map(([a, b]) => [b, -a, E.DESK_Z]));
      const x = pts.reduce((a, p) => a + p.x, 0) / 4, y = Math.min(...pts.map((p) => p.y));
      this.tag.textContent = this.nameOf(named) + (named.lock === 'u' ? ' · 只能沿桌边左右挪' : named.lock === 'v' ? ' · 只能沿三八线前后挪' : '') + (this.bad && named === this.sel ? ' · 这里放不下' : '');
      this.tag.style.transform = `translate(${Math.round(x)}px, ${Math.round(y - 14)}px) translate(-50%, -100%)`;
      this.tag.classList.add('on');
      this.tag.classList.toggle('bad', this.bad && named === this.sel);
    } else this.tag.classList.remove('on');
  }
}
