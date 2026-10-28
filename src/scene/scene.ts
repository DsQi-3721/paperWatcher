// The desk scene: one SVG drawing the desk top, its stationery and the piles of papers read, with the Colorfigures
// engine, for any camera (yaw, pitch, a pivot point, zoom). It renders only when asked: a camera change redraws
// everything, an animating object redraws only its own groups, and nothing runs while the desk is still. The
// hand-drawn filter stays on while the camera moves, so a moving desk looks like a still one.
import * as E from './engine/index.js';
import * as Props from './props.js';
import { DESK_SIZE, nudgedDef, nudgeUV, ARRANGE, PAPERS, PILE_SPOTS, READING_SPOT, setArrange, TEXTBOOK, type Nudge, type PaperDef, type Unit } from './layout';
import { paperTop, pileRender, planPiles, type PileMeta, type PilePlan } from './piles.js';
import { BackdropLayer } from './backdrops';
import { OBJECTS } from './objects/index';
import { advanceClock, makeObject, type ObjHost } from './runtime';
import { unitById, unitOfObj, unitOfPaper, UNITS } from './units';
import type { Box3, DeskObject, Rendered, V3 } from './types';

/** Camera: turn (yaw, deg), tilt (pitch, deg; 89.9 = straight down), the world point at the screen centre, px per unit. */
export interface View { yaw: number; pitch: number; cx: number; cy: number; cz: number; zoom: number }
export type Quality = 'draft' | 'final';

/** What the student can set (src/ui/desksettings.ts): the hand-drawn wobble, the paper grain, the desk's wood,
 *  which stationery is out, and each one's colour. */
export interface DeskLook { wobble: number; grain: boolean; wood: string; hidden: string[]; pal: Record<string, string>; bg: string; bgMotion: boolean;
  /** where the student moved things (arrange mode), by unit */
  place: Record<string, Nudge>;
  /** the initials under the eraser's sleeve (one to four capitals; TA, 'him / her', by default) */
  eraserName: string }
export const LOOK_DEFAULT: DeskLook = { wobble: 2.4, grain: true, wood: 'honey', hidden: [], pal: {}, bg: 'sunny', bgMotion: true, place: {}, eraserName: 'TA' };
/** Initials as the eraser writes them: capitals A–Z, at most four (TA if none are left). */
export const eraserInitials = (s: unknown) => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) : '') || 'TA';

interface Item { obj: DeskObject; r: Rendered | null; dirty: boolean; culled?: boolean; rest?: Box3; gG: SVGGElement; gS: SVGGElement; gB: SVGGElement }

const NS = 'http://www.w3.org/2000/svg';
const g = (cls: string) => { const e = document.createElementNS(NS, 'g') as SVGGElement; e.setAttribute('class', cls); return e; };
/** Ink weight for a zoom: about the figures' on-screen weight, held within bounds and in quarter-octave steps
 *  (so a small zoom change does not force a redraw). */
export const inkFor = (zoom: number) => {
  const k = Math.max(0.45, Math.min(0.9, 1.3 / zoom));
  return +Math.pow(2, Math.round(Math.log2(k) * 4) / 4).toFixed(4);
};
/** The hand-drawn look as an SVG filter: a slow warp of every line (wobble) and, if wanted, paper grain and blots. */
function handFilter(k: number, wobble: number, grain: boolean) {
  const warp = `<feTurbulence type="fractalNoise" baseFrequency="${(0.045 / k).toFixed(4)}" numOctaves="2" seed="4" result="warp"/>`
    + `<feDisplacementMap id="wob" in="SourceGraphic" in2="warp" scale="${(wobble * k).toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="wob"/>`;
  const tex = grain ? `<feTurbulence type="fractalNoise" baseFrequency="${(0.9 / k).toFixed(4)}" numOctaves="3" seed="11" result="n1"/>`
    + `<feColorMatrix in="n1" type="matrix" values=".24 0 0 0 .87  .24 0 0 0 .87  .24 0 0 0 .87  0 0 0 0 1" result="grain"/>`
    + `<feTurbulence type="fractalNoise" baseFrequency="${(0.012 / k).toFixed(4)}" numOctaves="2" seed="7" result="n2"/>`
    + `<feColorMatrix in="n2" type="matrix" values=".12 0 0 0 .93  .12 0 0 0 .93  .12 0 0 0 .93  0 0 0 0 1" result="blot"/>`
    + `<feBlend in="wob" in2="grain" mode="multiply" result="g1"/><feBlend in="g1" in2="blot" mode="multiply" result="g2"/>`
    + `<feComposite in="g2" in2="wob" operator="in"/>` : '';
  return `<filter id="hand" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">${warp}${tex}</filter>`;
}

export class DeskScene implements ObjHost {
  el: HTMLDivElement;
  svg: SVGSVGElement;
  /** what lies behind the desk */
  bg: BackdropLayer;
  items: Item[] = [];
  view: View = { yaw: 16, pitch: 44, cx: 0, cy: 0, cz: E.DESK_Z, zoom: 1 };
  vw = 0;
  vh = 0;
  quality: Quality = 'final';
  look: DeskLook = { ...LOOK_DEFAULT };
  /** The object whose labels are shown (with labelsOn). */
  focus: DeskObject | null = null;
  labelsOn = false;
  onFlash?: (obj: DeskObject, text: string, ms?: number) => void;
  onRendered?: () => void;
  /** Called after every full redraw (each frame of a camera move): things that ride along with the camera. */
  onFrame?: () => void;
  /** More of those, for things that stay (the arrange mode's outlines). */
  readonly frameHooks = new Set<() => void>();
  /** Milliseconds the last full / partial render took (for the perf checks). */
  timing = { full: 0, part: 0 };

  private defs: SVGDefsElement;
  private L: Record<'art' | 'desk' | 'papers' | 'ground' | 'shadow' | 'pileSh' | 'bodies' | 'labels', SVGGElement>;
  private piles: { plan: PilePlan[]; given?: PileMeta[]; hidden?: string; thumb: (m: PileMeta) => string | undefined; gs: Array<{ g: SVGGElement; box: Box3 }> } = { plan: [], thumb: () => undefined, gs: [] };
  private steps = new Map<(dt: number) => boolean | void, Item>();
  private raf = 0;
  private last = 0;
  private filterKey = '';

  constructor(host: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'scene';
    this.svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('class', 'scene-svg');
    // text drawn at its own size and scaled with the drawing: without this every word is shaped again (a new font
    // size) at each zoom step of a camera move, half the cost of a frame; it looks the same
    this.svg.setAttribute('text-rendering', 'geometricPrecision');
    this.defs = document.createElementNS(NS, 'defs') as SVGDefsElement;
    this.svg.append(this.defs);
    const L = {
      art: g('art'), desk: g('desk'), papers: g('papers'), ground: g('ground'), shadow: g('shadow'), pileSh: g('pile-sh'),
      bodies: g('bodies'), labels: g('labels'),
    };
    L.shadow.setAttribute('clip-path', 'url(#deskclip)');
    // every line is drawn with round joins and caps (the engine leaves them off each path to keep the drawing small)
    for (const k of ['art', 'labels'] as const) { L[k].setAttribute('stroke-linejoin', 'round'); L[k].setAttribute('stroke-linecap', 'round'); }
    L.shadow.append(L.pileSh);
    L.art.append(L.desk, L.papers, L.ground, L.shadow, L.bodies);
    this.svg.append(L.art, L.labels);
    this.L = L;
    this.el.append(this.svg);
    this.bg = new BackdropLayer(this.el, this.svg);
    host.append(this.el);
    this.measure();
    document.addEventListener('visibilitychange', () => this.resume());
    this.watchAttention();
    for (const e of OBJECTS) {
      const it: Item = { obj: null as unknown as DeskObject, r: null, dirty: true, gG: g('og'), gS: g('os'), gB: g('ob') };
      it.obj = makeObject(e.create, e.n, e.id, e.place, this);
      it.gB.dataset.obj = e.id;
      it.gG.dataset.obj = e.id;
      L.ground.append(it.gG);
      L.shadow.append(it.gS);
      L.bodies.append(it.gB);
      this.items.push(it);
    }
  }

  measure() {
    const r = this.el.getBoundingClientRect();
    this.vw = r.width || window.innerWidth;
    this.vh = r.height || window.innerHeight;
    this.bg?.resize();
  }

  get objects() { return this.items.map((i) => i.obj); }
  byId(id: string) { return this.items.find((i) => i.obj.id === id)?.obj ?? null; }
  private shown(it: Item) { return !this.look.hidden.includes(it.obj.id); }

  /** New settings: colours apply at once, a changed filter or set of objects redraws. */
  setLook(look: DeskLook) {
    this.look = { ...look, hidden: [...look.hidden], pal: { ...look.pal }, place: { ...(look.place || {}) } };
    Props.setWood(look.wood);
    setArrange(this.look.place);
    if (this.piles.given) this.piles.plan = planPiles(this.piles.given, this.pileSpots());
    this.bg.set(look.bg, look.bgMotion);
    for (const it of this.items) {
      const p = this.look.pal[it.obj.id];
      if (p && E.PALS[p]) it.obj.st.pal = p;
      if (it.obj.id === 'eraser') it.obj.st.name = eraserInitials(this.look.eraserName);
      const on = this.shown(it);
      it.culled = false;
      for (const el of [it.gB, it.gG, it.gS]) el.style.display = on ? '' : 'none';
      if (!on && this.focus === it.obj) this.focus = null;
    }
    this.filterKey = '';
    this.render();
  }

  /* ---------- camera ---------- */
  setView(v: Partial<View>, q: Quality = 'final') {
    this.view = { ...this.view, ...v };
    this.render(q);
  }

  /** The zoom at which the whole desk (and what stands on it) just fits the screen from this direction. */
  fitZoom(yaw = this.view.yaw, pitch = this.view.pitch) {
    const keep = { yaw: E.YAW, pitch: E.PITCH };
    E.setCam(yaw, pitch);
    const L = DESK_SIZE.L / 2, D = DESK_SIZE.D / 2, xs: number[] = [], ys: number[] = [];
    for (const u of [-L, L]) for (const v of [-D, D]) for (const z of [E.DESK_Z - Props.DESK.T, E.DESK_Z + 90]) { const q = E.P(v, -u, z); xs.push(q[0]); ys.push(q[1]); }
    E.setCam(keep.yaw, keep.pitch);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    return Math.min(this.vw * 0.94 / w, this.vh * 0.88 / h);
  }
  /** Keep the camera on the desk: never further out than the whole desk, never below it, the middle on the desk. */
  clampView(v: View): View {
    const pitch = Math.max(12, Math.min(89.9, v.pitch)), zmin = this.fitZoom(v.yaw, pitch);
    const zoom = Math.max(zmin, Math.min(zmin * 7, v.zoom)), k = Math.max(0, 1 - zmin / zoom);
    const cx = Math.max(-DESK_SIZE.D / 2 * k, Math.min(DESK_SIZE.D / 2 * k, v.cx)), cy = Math.max(-DESK_SIZE.L / 2 * k, Math.min(DESK_SIZE.L / 2 * k, v.cy));
    return { yaw: v.yaw, pitch, zoom, cx, cy, cz: E.DESK_Z };
  }
  /** The first view of the room: the whole desk, from the student's side and a little to the right. */
  defaultView(): View {
    return { yaw: 16, pitch: 44, cx: 0, cy: 0, cz: E.DESK_Z, zoom: this.fitZoom(16, 44) };
  }
  /** The views a click away (src/ui/viewbar.ts), each fitted to this screen and kept on the desk. */
  presetView(id: string): View {
    const fit = (yaw: number, pitch: number, k = 1, cx = 0, cy = 0) => this.clampView({ yaw, pitch, cx, cy, cz: E.DESK_Z, zoom: this.fitZoom(yaw, pitch) * k });
    switch (id) {
      case 'top': return fit(0, 89.9);
      case 'mate': return fit(-24, 40, 1.12, 30, -300);     // from the deskmate's seat, on their half
      case 'teacher': return fit(180, 36);                   // from the teacher's desk at the front of the room
      case 'nap': return fit(10, 12, 1.75, 240, 160);        // head down on the desk, eye to eye with the stationery
      case 'side': return fit(90, 28);                       // from the left end of the desk
      default: return this.defaultView();
    }
  }
  /** Straight down, close over the blank sheet where the paper is read: only a little clean desk round the paper,
   *  and never past the desk's edge. */
  topDownView(): View {
    const [u0, v0, u1, v1] = this.spotDef().rect, K = E.CAM_K;
    const zoom = Math.min(this.vw / (600 * K), this.vh / (390 * K));
    const hw = this.vw / zoom / K / 2, hh = this.vh / zoom / K / 2, L = DESK_SIZE.L / 2 - 6, D = DESK_SIZE.D / 2 - 6;
    const cu = Math.max(-L + hw, Math.min(L - hw, (u0 + u1) / 2)), cv = Math.max(-D + hh, Math.min(D - hh, (v0 + v1) / 2));
    return { yaw: 0, pitch: 89.9, cx: cv, cy: -cu, cz: E.DESK_Z, zoom };
  }

  private applyCamera(q: Quality) {
    const v = this.view;
    E.setCam(v.yaw, v.pitch);
    E.setLight(105);
    E.setOrigin(0, 0, [v.cx, v.cy], v.cz);
    if (q === 'final' || !this.filterKey) E.setInk(inkFor(v.zoom));
    // round things get fewer facets while the whole desk is in view (they are a few pixels across), all of them up close
    const near = v.zoom / this.fitZoom(v.yaw, v.pitch);
    E.setLod(Math.min(1, Math.max(0.5, Math.round(near * 0.55 * 10) / 10)));
    // whole units are finer than a pixel while the desk is seen whole; closer in, one decimal
    E.setPrec(v.zoom * E.CAM_K < 1.4 ? 1 : 10);
    // text under ~2.2 px on screen can't be read: left out
    E.setTextMin(2.2 / v.zoom);
    const [px, py] = E.P(v.cx, v.cy, v.cz), w = this.vw / v.zoom, h = this.vh / v.zoom;
    this.svg.setAttribute('viewBox', `${(px - w / 2).toFixed(2)} ${(py - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    // faces' seam outlines inherit their width from the drawing group (the engine leaves it off each face)
    this.L.art.setAttribute('stroke-width', (0.7 * E.INK_K).toFixed(3));
    const key = `${E.INK_K}|${this.look.wobble}|${this.look.grain}`;
    if (key !== this.filterKey) {
      this.filterKey = key;
      const on = this.look.wobble > 0 || this.look.grain;
      this.defs.innerHTML = (on ? handFilter(E.INK_K, this.look.wobble, this.look.grain) : '') + `<clipPath id="deskclip"><path/></clipPath>`;
      if (on) this.L.art.setAttribute('filter', 'url(#hand)'); else this.L.art.removeAttribute('filter');
    }
    this.defs.querySelector('#deskclip path')!.setAttribute('d', E.pd(Props.deskTopPts()));
  }

  /** Would a crisp redraw now differ from what is on the screen? Only if the camera moved since, or a zoom changed
   *  the ink's weight (quick frames keep the weight they started with); a turn by hand is already the finished picture. */
  needsFinal() {
    const v = this.view;
    return this.drawnAt !== `${v.yaw}|${v.pitch}|${v.cx}|${v.cy}|${v.cz}|${v.zoom}` || inkFor(v.zoom) !== E.INK_K || !this.filterKey;
  }
  private drawnAt = '';

  /** Redraw everything for the current camera. */
  render(q: Quality = 'final') {
    const t0 = performance.now();
    this.quality = q;
    { const v = this.view; this.drawnAt = `${v.yaw}|${v.pitch}|${v.cx}|${v.cy}|${v.cz}|${v.zoom}`; }
    this.applyCamera(q);
    const sk = E.inkScale;
    this.L.desk.innerHTML = sk(Props.desk());
    this.renderPapers();
    // objects wholly off the screen (the camera close over the desk, say) are skipped until they come back into view
    const v = this.view, [px0, py0] = E.P(v.cx, v.cy, v.cz), hw = this.vw / v.zoom / 2 * 1.08 + 30 / v.zoom, hh = this.vh / v.zoom / 2 * 1.08 + 30 / v.zoom;
    const offScreen = (b: Box3) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const z of [b[0][2], b[1][2]]) {
        const [X, Y] = E.P(x, y, z);
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      }
      return x1 < px0 - hw || x0 > px0 + hw || y1 < py0 - hh || y0 > py0 + hh;
    };
    for (const it of this.items) {
      if (!this.shown(it)) continue;
      const cull = !!it.r && !this.steps.size && offScreen(it.r.box);
      if (cull !== !!it.culled) { it.culled = cull; for (const el of [it.gB, it.gG, it.gS]) el.style.display = cull ? 'none' : ''; }
      if (cull) { it.dirty = true; continue; }
      this.renderItem(it);
    }
    this.renderPiles();
    this.sortBodies();
    this.drawLabels();
    this.bg.view(this.view.yaw, this.view.pitch);
    this.timing.full = performance.now() - t0;
    this.onRendered?.();
    this.onFrame?.();
    for (const f of this.frameHooks) f();
  }

  private renderItem(it: Item) {
    let r: Rendered;
    try { r = it.obj.render(); } catch (e) { console.error(`object ${it.obj.id}:`, e); return; }
    it.r = r;
    if (!it.rest && r.localBox && !this.steps.size) it.rest = r.localBox;
    it.dirty = false;
    const sk = (x: string) => E.mergeLines(E.inkScale(x));
    it.gG.innerHTML = sk(r.ground);
    it.gS.innerHTML = r.shadow;
    it.gB.innerHTML = sk(r.body);
    it.gB.style.setProperty('--accent', E.PALS[it.obj.st.pal]?.l ?? '#f4b829');
  }

  /** Bodies back to front. Boxes apart along an axis go by which side the camera is on. Boxes that overlap
   *  everywhere (things on the same sheet) go by the level axis they overlap least on, which only changes order
   *  when the camera crosses that axis, never suddenly in between. */
  private sortBodies() {
    const V = E.CAM_V;
    const all = [...this.items.filter((i) => i.r && this.shown(i) && !i.culled).map((i) => ({ g: i.gB, box: i.r!.box })), ...this.piles.gs];
    const cmp = (a: Box3, b: Box3) => {
      for (let k = 0; k < 3; k++) {
        if (a[1][k] <= b[0][k] + 1e-6) return V[k] >= 0 ? -1 : 1;
        if (b[1][k] <= a[0][k] + 1e-6) return V[k] >= 0 ? 1 : -1;
      }
      let best = 0, bestR = Infinity;
      for (let k = 0; k < 2; k++) {
        const ov = Math.min(a[1][k], b[1][k]) - Math.max(a[0][k], b[0][k]);
        const size = Math.max(1, Math.min(a[1][k] - a[0][k], b[1][k] - b[0][k]));
        if (ov / size < bestR) { bestR = ov / size; best = k; }
      }
      const da = (a[0][best] + a[1][best]) / 2, db = (b[0][best] + b[1][best]) / 2;
      if (Math.abs(da - db) > 0.5) return (da - db) * (V[best] >= 0 ? 1 : -1);
      return (a[0][2] + a[1][2]) - (b[0][2] + b[1][2]);
    };
    // insertion sort: stable, and a comparison that is not perfectly transitive cannot loop
    const order: typeof all = [];
    for (const it of all) {
      let i = order.length;
      while (i > 0 && cmp(order[i - 1].box, it.box) > 0) i--;
      order.splice(i, 0, it);
    }
    const kids = this.L.bodies.children;
    order.forEach((it, i) => { if (kids[i] !== it.g) this.L.bodies.insertBefore(it.g, kids[i] ?? null); });
  }

  /* ---------- paper piles ---------- */
  /** Show these papers on their piles (`hidden`: one still on its way there). */
  setPapers(papers: PileMeta[], opts: { hidden?: string; thumb: (m: PileMeta) => string | undefined }) {
    this.piles.given = papers;
    this.piles.plan = planPiles(papers, this.pileSpots());
    this.piles.hidden = opts.hidden;
    this.piles.thumb = opts.thumb;
    this.renderPiles();
    this.sortBodies();
  }
  /** The paper that was on its way has arrived: draw it on its pile. */
  showPaper(id: string) {
    if (this.piles.hidden !== id) return;
    this.piles.hidden = undefined;
    this.renderPiles();
    this.sortBodies();
  }
  get papersOnPiles() { return this.piles.plan.reduce((a, p) => a + p.items.length, 0); }
  private renderPiles() {
    const P0 = this.piles;
    for (const old of P0.gs) old.g.remove();
    P0.gs = [];
    let sh = '';
    P0.plan.forEach((pile, i) => {
      const r = pileRender(pile, { hidden: P0.hidden, thumb: P0.thumb, px: this.view.zoom });
      if (!r) return;
      const pg = g('pile');
      pg.dataset.pile = String(i);
      pg.innerHTML = E.inkScale(r.body);
      this.L.bodies.append(pg);
      P0.gs.push({ g: pg, box: r.box });
      sh += r.shadow;
    });
    this.L.pileSh.innerHTML = sh;
  }
  /** World points to client px for a view (the current one by default), without drawing anything. */
  projectAt(pts: V3[], v: View = this.view): Array<{ x: number; y: number }> {
    const keep = { yaw: E.YAW, pitch: E.PITCH, ox: E.OX, oy: E.OY, rc: E.RC, rcz: E.RCZ };
    E.setCam(v.yaw, v.pitch);
    E.setOrigin(0, 0, [v.cx, v.cy], v.cz);
    const r = this.svg.getBoundingClientRect(), [px0, py0] = E.P(v.cx, v.cy, v.cz);
    const out = pts.map((p) => { const [x, y] = E.P(...p); return { x: r.left + this.vw / 2 + (x - px0) * v.zoom, y: r.top + this.vh / 2 + (y - py0) * v.zoom }; });
    E.setCam(keep.yaw, keep.pitch);
    E.setOrigin(keep.ox, keep.oy, keep.rc as [number, number], keep.rcz);
    return out;
  }
  /** The world point at height z under a client-px point, for a view (the current one by default). */
  unprojectAt(sx: number, sy: number, z: number, v: View = this.view): V3 {
    const keep = { yaw: E.YAW, pitch: E.PITCH, ox: E.OX, oy: E.OY, rc: E.RC, rcz: E.RCZ };
    E.setCam(v.yaw, v.pitch);
    E.setOrigin(0, 0, [v.cx, v.cy], v.cz);
    const r = this.svg.getBoundingClientRect(), [px0, py0] = E.P(v.cx, v.cy, v.cz);
    const X = px0 + (sx - r.left - this.vw / 2) / v.zoom, Y = py0 + (sy - r.top - this.vh / 2) / v.zoom;
    // P is linear in (x, y) at a fixed z: P(x, y, z) = P(cx, cy, z) + K [R; D] (x - cx, y - cy)
    const [bx, by] = E.P(v.cx, v.cy, z), Rv = E.CAM_R, Dv = E.CAM_U.map((u) => -u), K = E.CAM_K;
    const a = K * Rv[0], b = K * Rv[1], c = K * Dv[0], d = K * Dv[1], det = a * d - b * c;
    const dx = X - bx, dy = Y - by;
    const out: V3 = Math.abs(det) < 1e-9 ? [v.cx, v.cy, z] : [v.cx + (d * dx - b * dy) / det, v.cy + (a * dy - c * dx) / det, z];
    E.setCam(keep.yaw, keep.pitch);
    E.setOrigin(keep.ox, keep.oy, keep.rc as [number, number], keep.rcz);
    return out;
  }
  /** Where world points' shadows fall on the desk top (the light the stationery's shadows use). */
  shadowOnDesk(pts: V3[]): V3[] {
    const k = E.SHADOW_LEN / E.SHADOW_K, [sx, sy] = E.yawTurn(E.SH), z0 = E.DESK_Z;
    return pts.map(([x, y, z]) => [x + (z - z0) * sx * k, y + (z - z0) * sy * k, z0] as V3);
  }
  /** The blank reading sheet's corners (world, top-left first). */
  spotCorners(): V3[] {
    const f = Props.paperFrame(this.spotDef());
    return [f.dk(0, 0, f.z), f.dk(f.w, 0, f.z), f.dk(f.w, f.h, f.z), f.dk(0, f.h, f.z)];
  }
  /** A paper's top sheet on its pile (world corners), or null. */
  pileCorners(id: string): V3[] | null { return paperTop(this.piles.plan, id); }
  /** The blank sheet on screen as the camera will show it from a view (for a paper to land on before it gets there). */
  readingSpotAt(v: View) { return this.quadOf(this.projectAt(this.spotCorners(), v)); }

  /** World corners -> a client-px rect, the angle of its first edge on screen (deg), and the sheet itself unturned. */
  private screenQuad(c: V3[]) {
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    return this.quadOf(c.map((p) => { const [x, y] = E.P(...p); return new DOMPoint(x, y).matrixTransform(m); }));
  }
  private quadOf(pts: Array<{ x: number; y: number }>) {
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const deg = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) * 180 / Math.PI;
    const w = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), hh = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
    const cx = pts.reduce((a, p) => a + p.x, 0) / 4, cy = pts.reduce((a, p) => a + p.y, 0) / 4;
    return { rect: new DOMRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)), deg, pts,
      sheet: new DOMRect(cx - w / 2, cy - hh / 2, w, hh) };
  }
  /** Where a paper's top sheet is on screen (for the stack flying back onto its pile). */
  pileTop(id: string) { const c = paperTop(this.piles.plan, id); return c ? this.screenQuad(c) : null; }
  /** The papers in a pile, from the bottom (read longest ago) to the top. */
  pileIds(i: number) { return this.piles.plan[i]?.items.map((it) => it.meta.id) ?? []; }
  /** The top of a pile on screen (where the fan of past papers comes out of). */
  pileScreen(i: number) {
    const p = this.piles.plan[i];
    if (!p) return null;
    const top = p.items[p.items.length - 1];
    return top ? this.pileTop(top.meta.id) : null;
  }
  /** Where the blank reading sheet is on screen (the paper lands there). */
  readingSpot() {
    const f = Props.paperFrame(this.spotDef());
    return this.screenQuad([f.dk(0, 0, f.z), f.dk(f.w, 0, f.z), f.dk(f.w, f.h, f.z), f.dk(0, f.h, f.z)]);
  }

  /* ---------- where things are (with the student's own arrangement) ---------- */
  /** The blank reading sheet where it lies now. */
  spotDef(): PaperDef { return nudgedDef(READING_SPOT, unitOfPaper.blank); }
  /** The pile spots where they are now. */
  pileSpots() {
    return PILE_SPOTS.map((sp, i) => {
      const n = ARRANGE['pile' + i];
      return n ? { ...sp, u: sp.u + n.du, v: sp.v + n.dv, turn: sp.turn + n.rot } : sp;
    });
  }
  /** What the textbook looks like: the book read last from the shelf (its cover and colour), or the 语文 textbook. */
  private shelfLook: { cover?: string; color?: string; title?: string } | null = null;
  setShelfLook(look: { cover?: string; color?: string; title?: string } | null) {
    const same = (a: typeof look, b: typeof look) => a === b || (!!a && !!b && a.cover === b.cover && a.color === b.color && a.title === b.title);
    if (same(look, this.shelfLook)) return;   // the shelf was looked at again, the textbook's cover is the same
    this.shelfLook = look;
    this.renderPapers();
  }
  private textbookDef(): PaperDef {
    const l = this.shelfLook;
    return l ? { ...TEXTBOOK, book: l.color || TEXTBOOK.book, cover: l.cover, title: l.title || TEXTBOOK.title } : TEXTBOOK;
  }
  /** The textbook's corners on screen (where a book comes out of / goes back to). */
  textbookQuad(v: View = this.view) {
    const f = Props.paperFrame(nudgedDef(TEXTBOOK, unitOfPaper.book));
    return this.quadOf(this.projectAt([f.dk(0, 0, f.z), f.dk(f.w, 0, f.z), f.dk(f.w, f.h, f.z), f.dk(0, f.h, f.z)], v));
  }
  private renderPapers() {
    const defs = [READING_SPOT, ...PAPERS, this.textbookDef()].map((d) => nudgedDef(d, unitOfPaper[d.id]));
    this.L.papers.innerHTML = E.inkScale(Props.chalkLine() + defs.map((d) => `<g data-paper="${d.id}">${Props.paper(d)}</g>`).join(''));
  }
  /** Arrange mode: which unit a pointer is on (an object, a paper, a pile), or null. */
  unitAt(target: Element | null): Unit | null {
    const o = target?.closest?.('[data-obj]') as SVGGElement | null;
    if (o) return unitOfObj[o.dataset.obj!] ?? null;
    const p = target?.closest?.('[data-paper]') as SVGGElement | null;
    if (p) return unitOfPaper[p.dataset.paper!] ?? null;
    const pl = target?.closest?.('[data-pile]') as SVGGElement | null;
    if (pl) { const plan = this.piles.plan[+pl.dataset.pile!]; return plan ? unitById('pile' + plan.i) ?? null : null; }
    return null;
  }
  /** A unit's footprint on the desk where the layout put it (desk u0, v0, u1, v1): its objects at rest, its papers. */
  baseFootprint(unit: Unit): [number, number, number, number] {
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    const add = (u: number, v: number) => { u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); };
    for (const id of unit.objs) {
      const it = this.items.find((i) => i.obj.id === id), b = it?.rest ?? it?.r?.localBox;
      if (b) { add(-b[1][1], b[0][0]); add(-b[0][1], b[1][0]); }
    }
    for (const pid of unit.papers) {
      const d = [READING_SPOT, ...PAPERS, TEXTBOOK].find((x) => x.id === pid);
      if (!d) continue;
      const f = Props.paperFrame(d);
      for (const [a, c] of [[0, 0], [f.w, 0], [f.w, f.h], [0, f.h]]) { const p = f.dk(a, c, 0); add(-p[1], p[0]); }
    }
    if (unit.pile != null) { const sp = PILE_SPOTS[unit.pile]; add(sp.u - 115, sp.v - 158); add(sp.u + 115, sp.v + 158); }
    if (!isFinite(u0)) { add(unit.pivot[0] - 20, unit.pivot[1] - 20); add(unit.pivot[0] + 20, unit.pivot[1] + 20); }
    return [u0, v0, u1, v1];
  }
  /** A unit's footprint where it is now (or with a trial nudge): four desk corners (u, v) round all of it. */
  footprint(unit: Unit, n: Nudge | undefined = ARRANGE[unit.id]): Array<[number, number]> {
    const [u0, v0, u1, v1] = this.baseFootprint(unit);
    return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => nudgeUV(n, unit.pivot, u, v));
  }
  /** The same, piece by piece: each object's box at rest, each paper as the turned sheet it is, a pile's sheet. */
  footprintParts(unit: Unit, n: Nudge | undefined = ARRANGE[unit.id]): Array<Array<[number, number]>> {
    const out: Array<Array<[number, number]>> = [], quad = (pts: Array<[number, number]>) => out.push(pts.map(([u, v]) => nudgeUV(n, unit.pivot, u, v)));
    for (const id of unit.objs) {
      const it = this.items.find((i) => i.obj.id === id), b = it?.rest ?? it?.r?.localBox;
      if (!b || !this.shown(it!)) continue;
      const u0 = -b[1][1], u1 = -b[0][1], v0 = b[0][0], v1 = b[1][0];
      quad([[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
    }
    for (const pid of unit.papers) {
      const d = [READING_SPOT, ...PAPERS, TEXTBOOK].find((x) => x.id === pid);
      if (!d) continue;
      const f = Props.paperFrame(d);
      quad([[0, 0], [f.w, 0], [f.w, f.h], [0, f.h]].map(([a, c]) => { const p = f.dk(a, c, 0); return [-p[1], p[0]] as [number, number]; }));
    }
    if (unit.pile != null) {
      const sp = PILE_SPOTS[unit.pile], t = sp.turn * Math.PI / 180, c = Math.cos(t), si = Math.sin(t);
      quad([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const du = i * 112, dv = j * 155; return [sp.u + du * c - dv * si, sp.v + du * si + dv * c] as [number, number]; }));
    }
    if (!out.length) quad(this.footprint(unit, undefined));
    return out;
  }
  /** The units that are on the desk now (hidden objects' units left out). */
  units(): Unit[] {
    return UNITS.filter((u) => (u.pile == null || this.piles.plan.some((p) => p.i === u.pile)) && (!u.objs.length || u.objs.some((id) => !this.look.hidden.includes(id))));
  }
  /** Redraw after a unit was moved (its objects, the papers and the piles; the camera is where it was). */
  moved(unit: Unit) {
    for (const it of this.items) if (unit.objs.includes(it.obj.id) && this.shown(it)) { it.culled = false; for (const el of [it.gB, it.gG, it.gS]) el.style.display = ''; this.renderItem(it); }
    if (unit.papers.length) this.renderPapers();
    if (unit.pile != null && this.piles.given) { this.piles.plan = planPiles(this.piles.given, this.pileSpots()); this.renderPiles(); }
    this.sortBodies();
    this.onRendered?.();
  }

  /* ---------- camera moves ---------- */
  private tweenId = 0;
  /** Ease the camera to a view (the shorter way round), redrawing on the way. */
  tween(to: View, ms = 900): Promise<void> {
    const id = ++this.tweenId, from = { ...this.view };
    const dyaw = ((to.yaw - from.yaw + 540) % 360) - 180;
    if (ms <= 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.setView(to); return Promise.resolve(); }
    return new Promise((done) => {
      const t0 = performance.now();
      const tick = (now: number) => {
        if (id !== this.tweenId) return done();
        const k = Math.min(1, (now - t0) / ms), e = E.ease(k), lz = Math.log(from.zoom) + (Math.log(to.zoom) - Math.log(from.zoom)) * e;
        this.view = { yaw: from.yaw + dyaw * e, pitch: from.pitch + (to.pitch - from.pitch) * e, cx: from.cx + (to.cx - from.cx) * e,
          cy: from.cy + (to.cy - from.cy) * e, cz: from.cz + (to.cz - from.cz) * e, zoom: Math.exp(lz) };
        if (k < 1) { this.render('draft'); requestAnimationFrame(tick); }
        else { this.view = { ...to }; this.render('final'); done(); }
      };
      requestAnimationFrame(tick);
    });
  }
  stopTween() { this.tweenId++; }

  /* ---------- labels ---------- */
  /** Name pills for the focused object's parts: two columns either side of it, leaders that never cross. */
  private drawLabels() {
    const it = this.focus && this.labelsOn ? this.items.find((i) => i.obj === this.focus) : null;
    if (!it?.r || !it.r.labels.length) { this.L.labels.innerHTML = ''; return; }
    const z = this.view.zoom, b = it.r.box, pts: [number, number][] = [];
    for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const zz of [b[0][2], b[1][2]]) pts.push(E.P(x, y, zz));
    const xmin = Math.min(...pts.map((p) => p[0])), xmax = Math.max(...pts.map((p) => p[0])), cx = (xmin + xmax) / 2;
    const fs = 12 / z, hgt = fs * 1.8, gap = hgt + 4 / z;
    const em = (t: string) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? 1.06 : 0.64), 0);
    const cols: Record<string, Array<{ X: number; Y: number; text: string; on?: boolean; py?: number }>> = { L: [], R: [] };
    for (const l of it.r.labels) { const [X, Y] = E.P(...l.at); cols[X < cx ? 'L' : 'R'].push({ X, Y, text: l.text, on: l.on }); }
    let out = '';
    for (const [side, col] of Object.entries(cols)) {
      col.sort((a, c) => a.Y - c.Y);
      let y = -1e9;
      for (const c of col) { c.py = Math.max(c.Y, y + gap); y = c.py; }
      const shift = col.length ? Math.max(0, col.reduce((a, c) => a + c.py! - c.Y, 0) / col.length) : 0;
      for (const c of col) c.py! -= shift;
      for (const c of col) {
        const w = em(c.text) * fs + fs * 1.5, sgn = side === 'L' ? -1 : 1;
        const px = side === 'L' ? xmin - 18 / z - w / 2 : xmax + 18 / z + w / 2, ex = px - sgn * w / 2;
        out += `<g class="tag${c.on ? ' on' : ''}"><path d="M${c.X.toFixed(1)} ${c.Y.toFixed(1)}L${(ex - sgn * 6 / z).toFixed(1)} ${c.py!.toFixed(1)}L${ex.toFixed(1)} ${c.py!.toFixed(1)}" fill="none" stroke="${E.INK}" stroke-width="${(1 / z).toFixed(2)}"/>`
          + `<circle cx="${c.X.toFixed(1)}" cy="${c.Y.toFixed(1)}" r="${(2 / z).toFixed(2)}" fill="${E.INK}"/>`
          + `<rect x="${(px - w / 2).toFixed(1)}" y="${(c.py! - hgt / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${hgt.toFixed(1)}" rx="${(hgt / 2).toFixed(1)}" fill="${c.on ? 'var(--accent,#f4b829)' : '#fff4d6'}" stroke="${E.INK}" stroke-width="${(1.2 / z).toFixed(2)}"/>`
          + `<text x="${px.toFixed(1)}" y="${(c.py! + fs * 0.36).toFixed(1)}" font-size="${fs.toFixed(2)}" text-anchor="middle" font-family="ui-monospace,Menlo,'PingFang SC',monospace" font-weight="800" fill="${E.INK}">${c.text}</text></g>`;
      }
    }
    this.L.labels.style.setProperty('--accent', E.PALS[it.obj.st.pal]?.l ?? '#f4b829');
    this.L.labels.innerHTML = out;
  }

  /** Turn an object's see-through on or off (eased, like the figures' switch). */
  setSeeThrough(obj: DeskObject, on: boolean) {
    const st = obj.st;
    st.xrT = on ? 1 : 0;
    this.animate(obj, (dt) => { const gg = Math.sign(st.xrT - st.xr); st.xr = Math.min(1, Math.max(0, st.xr + gg * dt / 0.7)); return st.xr !== st.xrT; });
  }
  /** Press one of an object's buttons (label prefix; 'Label>Choice' picks from a picker). */
  press(obj: DeskObject, what: string) {
    const [label, choice] = what.split('>');
    const b = obj.buttons.find((x) => x.label.startsWith(label));
    if (!b) return false;
    if (choice != null && b.choices) {
      const c = b.choices(obj.st).find((x) => x.label.startsWith(choice));
      if (!c) return false;
      if (c.current) obj.ui.flash(`${c.label}——已经是了`);
      else if (c.disabled) obj.ui.flash(c.why || `现在没法${c.label}`);
      else c.onClick(obj.st, obj.ui);
    } else if (b.onClick) b.onClick(obj.st, obj.ui);
    this.invalidate(obj);
    return true;
  }

  /* ---------- objects' clock ---------- */
  animate(obj: DeskObject, step: (dt: number) => boolean | void) {
    const it = this.items.find((i) => i.obj === obj);
    if (!it) return;
    this.steps.set(step, it);
    this.kick();
  }
  invalidate(obj: DeskObject) {
    const it = this.items.find((i) => i.obj === obj);
    if (it) { it.dirty = true; this.kick(); }
  }
  flash(obj: DeskObject, text: string, ms?: number) { this.onFlash?.(obj, text, ms); }
  /** Is anyone looking at the desk (home, not the reading backdrop, tab visible)? Wake-ups wait for that. */
  live = true;
  private timers = new Map<string, { t: ReturnType<typeof setTimeout>; obj: DeskObject; fn?: () => void }>();
  private missed = new Map<string, { obj: DeskObject; fn?: () => void; ambient: boolean }>();
  later(obj: DeskObject, ms: number, fn: (() => void) | undefined, key: string, ambient = false) {
    const k = obj.id + '|' + key;
    const old = this.timers.get(k);
    if (old) clearTimeout(old.t);
    this.missed.delete(k);
    const t = setTimeout(() => {
      this.timers.delete(k);
      if (!this.live || document.visibilityState !== 'visible' || (ambient && !this.attended)) { this.missed.set(k, { obj, fn, ambient }); return; }
      this.wake(obj, fn);
    }, Math.max(0, ms));
    this.timers.set(k, { t, obj, fn });
  }
  private wake(obj: DeskObject, fn?: () => void) {
    try { if (fn) fn(); } catch (e) { console.error(`object ${obj.id} later:`, e); }
    this.invalidate(obj);
  }
  /** Looking again (back home, tab shown, back at the desk): wake-ups that came while nobody looked run now. */
  resume() {
    if (!this.live || document.visibilityState !== 'visible') return;
    const m = [...this.missed.entries()].filter(([, x]) => this.attended || !x.ambient);
    for (const [k] of m) this.missed.delete(k);
    for (const [, x] of m) this.wake(x.obj, x.fn);
  }

  /* ---------- someone at the desk ----------
     The touches of life that nobody asked for (the backdrop's slow motion, the fish's swims) play only while
     someone is here: the window has the focus and something was touched in the last minute. Anything that shows
     real state (the clock's minute, the calendar's day) goes on regardless. */
  private attended = true;
  private lastInput = performance.now();
  private dozeT: ReturnType<typeof setTimeout> | undefined;
  private watchAttention() {
    const DOZE_MS = 60_000;
    const arm = (ms: number) => { clearTimeout(this.dozeT); this.dozeT = setTimeout(check, ms); };
    const check = () => {
      const idle = performance.now() - this.lastInput;
      if (idle < DOZE_MS && document.hasFocus()) return arm(DOZE_MS - idle + 50);
      this.dozeT = undefined;
      this.setAttended(false);
    };
    const poke = () => {
      this.lastInput = performance.now();
      if (!this.attended && document.hasFocus()) this.setAttended(true);
      if (this.attended && this.dozeT === undefined) arm(DOZE_MS);
    };
    for (const t of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const) addEventListener(t, poke, { capture: true, passive: true });
    addEventListener('focus', poke);
    addEventListener('blur', () => { clearTimeout(this.dozeT); this.dozeT = undefined; this.setAttended(false); });
    arm(DOZE_MS);
  }
  private setAttended(on: boolean) {
    if (on === this.attended) return;
    this.attended = on;
    this.bg.doze(!on);
    if (on) this.resume();
  }

  private kick() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    advanceClock(dt * 1000);
    for (const [step, it] of [...this.steps]) {
      let go: boolean | void = false;
      try { go = step(dt); } catch (e) { console.error(`object ${it.obj.id} step:`, e); }
      it.dirty = true;
      if (go === false) this.steps.delete(step);
    }
    this.flush();
    if (this.steps.size) this.kick();
  };
  /** Redraw just the objects that changed (the camera is where it was). */
  flush() {
    const dirty = this.items.filter((i) => i.dirty && this.shown(i) && !i.culled);
    if (!dirty.length) return;
    const t0 = performance.now();
    for (const it of dirty) this.renderItem(it);
    this.sortBodies();
    if (this.focus && dirty.some((i) => i.obj === this.focus)) this.drawLabels();
    this.timing.part = performance.now() - t0;
    this.onRendered?.();
  }
  get busy() { return this.steps.size > 0; }

  /* ---------- picking ---------- */
  /** What a pointer landed on: an object (and one of its clickable parts), a pile of past papers, or a paper. */
  pick(target: Element | null): { obj: DeskObject | null; act: string | null; el: Element | null; pile: number | null; paper: string | null } {
    const o = target?.closest?.('[data-obj]') as SVGGElement | null;
    const obj = o ? this.byId(o.dataset.obj!) : null;
    const a = obj ? (target!.closest('[data-act]') as Element | null) : null;
    const p = target?.closest?.('[data-pile]') as SVGGElement | null;
    const paper = (target?.closest?.('[data-paper]') as SVGGElement | null)?.dataset.paper ?? null;
    return { obj, act: a ? a.getAttribute('data-act') : null, el: a, pile: p ? +p.dataset.pile! : null, paper };
  }
  /** A world point to client px. */
  toScreen(p: V3) { const m = this.svg.getScreenCTM(); const [x, y] = E.P(...p); return m ? new DOMPoint(x, y).matrixTransform(m) : new DOMPoint(); }
  /** An object's world box (from its last render). */
  boxOf(obj: DeskObject) { return this.items.find((i) => i.obj === obj)?.r?.box ?? null; }
  /** An object's box on screen (client px). */
  screenBox(obj: DeskObject): DOMRect | null {
    const it = this.items.find((i) => i.obj === obj);
    return it ? it.gB.getBoundingClientRect() : null;
  }
}
