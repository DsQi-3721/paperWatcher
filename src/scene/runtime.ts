// Turns an object module (a stationery figure wrapped by scripts/port-figures.mjs) into a live desk object: gives it
// its place on the desk, a ui that reports to the scene, its own action lock, and splits each render into the
// flat marks under everything, its shadows (drawn by the scene in one layer) and its body.
// When the student has moved or turned it (arrange mode), it is drawn with the camera turned the other way about its
// unit's pivot: the same picture as the object turned, with its own code and coordinates untouched. Its box, labels,
// its idea of where the desk's edges are and the papers it works on are handed over in those same coordinates.
import * as E from './engine/index.js';
import { ARRANGE, layoutVersion, movePlace, nudgedDef, nudgeUV, PAPERS, READING_SPOT, TEXTBOOK, unnudgeUV, type Nudge, type PaperDef, type Unit } from './layout';
import { DESK, FLOOR_Z, JACKET, paperFrame } from './props.js';
import type { Box3, DeskObject, LabelItem, ObjCtx, ObjectFactory, ObjUI, PaperKit, Placement, V3 } from './types';
import { unitOfObj, unitOfPaper } from './units';

/** Is a world point over the desk top? */
export const onDesk = (p: V3) => { const u = -p[1], v = p[0]; return Math.abs(u) <= DESK.L / 2 && Math.abs(v) <= DESK.D / 2; };

const BASE_DEFS: PaperDef[] = [READING_SPOT, ...PAPERS, TEXTBOOK];
/** A unit's own coordinates (as the layout put it) -> where it is now, and back (world points, x = v, y = -u). */
export function toWorld(unit: Unit | undefined, p: V3): V3 {
  const n = unit && ARRANGE[unit.id];
  if (!n) return p;
  const [u, v] = nudgeUV(n, unit!.pivot, -p[1], p[0]);
  return [v, -u, p[2]];
}
export function toLocal(unit: Unit | undefined, p: V3): V3 {
  const n = unit && ARRANGE[unit.id];
  if (!n) return p;
  const [u, v] = unnudgeUV(n, unit!.pivot, -p[1], p[0]);
  return [v, -u, p[2]];
}
const undoDef = (d: PaperDef, n: Nudge | undefined, unit: Unit | undefined): PaperDef => {
  if (!n || !unit) return d;
  const [u0, v0, u1, v1] = d.rect, w = u1 - u0, h = v1 - v0;
  const [cu, cv] = unnudgeUV(n, unit.pivot, (u0 + u1) / 2, (v0 + v1) / 2);
  return { ...d, rect: [cu - w / 2, cv - h / 2, cu + w / 2, cv + h / 2], turn: d.turn - n.rot };
};

// the tops of the shared papers (and the textbook) where they are now: marks and click targets drawn flat on them are not bodies
let flat = { v: -1, frames: [] as PaperKit[] };
const flatNow = () => {
  if (flat.v !== layoutVersion) flat = { v: layoutVersion, frames: BASE_DEFS.map((d) => paperFrame(nudgedDef(d, unitOfPaper[d.id])) as PaperKit) };
  return flat.frames;
};
const onPaperTop = (p: V3) => {
  for (const f of flatNow()) {
    if (Math.abs(p[2] - f.z) > 0.35) continue;
    const q = f.undk(p);
    if (q[0] > -1 && q[0] < f.w + 1 && q[1] > -1 && q[1] < f.h + 1) return true;
  }
  return false;
};

/** A shared paper's frame as seen from an object's own coordinates, kept up to date as things are moved. */
function livePaper(id: string, unit: Unit | undefined): PaperKit {
  const base = BASE_DEFS.find((d) => d.id === id);
  if (!base) throw new Error('no paper ' + id);
  let v = -1, cur: PaperKit;
  const get = () => {
    if (v !== layoutVersion) {
      v = layoutVersion;
      cur = paperFrame(undoDef(nudgedDef(base, unitOfPaper[id]), unit && ARRANGE[unit.id], unit)) as PaperKit;
    }
    return cur;
  };
  const o = {} as PaperKit;
  for (const k of Object.keys(get())) Object.defineProperty(o, k, { get: () => (get() as any)[k], enumerable: true });
  return o;
}

/** Draw as if the unit were turned and slid: the camera turned back by its turn about its pivot, the pivot put where
 *  it is now. Returns a function that puts the camera back. */
function enterUnit(n: Nudge, pivot: [number, number]) {
  const keep = { yaw: E.YAW, pitch: E.PITCH, ox: E.OX, oy: E.OY, rc: E.RC, rcz: E.RCZ };
  const c: [number, number] = [pivot[1], -pivot[0]];
  const Q = E.P(pivot[1] + n.dv, -(pivot[0] + n.du), keep.rcz);
  E.setCam(keep.yaw - n.rot, keep.pitch);
  E.setOrigin(Q[0] - (c[0] - c[1]) * E.C, Q[1] - (c[0] + c[1]) * E.S + keep.rcz, c, keep.rcz);
  return () => { E.setCam(keep.yaw, keep.pitch); E.setOrigin(keep.ox, keep.oy, keep.rc as [number, number], keep.rcz); };
}
const worldBox = (unit: Unit | undefined, b: Box3): Box3 => {
  if (!unit || !ARRANGE[unit.id]) return b;
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const z of [b[0][2], b[1][2]]) {
    const p = toWorld(unit, [x, y, z]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  }
  return [lo, hi];
};

let clock = 0;
/** The scene's clock in ms (advanced by the scene's frames; tests can drive it). */
export const sceneNow = () => clock;
export const advanceClock = (ms: number) => { clock += ms; };

/** What the scene does for its objects. */
export interface ObjHost {
  animate(obj: DeskObject, step: (dt: number) => boolean | void): void;
  invalidate(obj: DeskObject): void;
  flash(obj: DeskObject, text: string, ms?: number): void;
  /** wake the object once after ms (only while the desk is being looked at): run fn, or just redraw it */
  later?(obj: DeskObject, ms: number, fn: (() => void) | undefined, key: string, ambient?: boolean): void;
}

const MARK = '<!--sh-->';
const balanced = (s: string) => (s.match(/<g[\s>]/g) || []).length === (s.match(/<\/g>/g) || []).length
  && (s.match(/<clipPath[\s>]/g) || []).length === (s.match(/<\/clipPath>/g) || []).length;

export function makeObject(factory: ObjectFactory, n: string, id: string, place: Placement, host: ObjHost): DeskObject {
  // its place, moved with its group on the big desk; the desk is drawn by the scene, so its own little board is nothing
  const at = movePlace(n, place);
  const unit = unitOfObj[id];
  const desk = { ...E.makeDesk(at.u, at.v, at.rot), deskBoard: () => '' };
  let obj!: DeskObject;
  let shadows: string[] = [], labels: LabelItem[] = [], rec: Box3 | null = null;
  const ui: ObjUI = {
    st: null,
    animate: (step) => host.animate(obj, step),
    invalidate: () => host.invalidate(obj),
    render: () => host.invalidate(obj),
    flash: (text, ms) => host.flash(obj, text, ms),
  };
  const ctx: ObjCtx = {
    desk,
    deskZ: E.DESK_Z,
    floorZ: FLOOR_Z,
    paper: (pid: string) => livePaper(pid, unit),
    jacket: JACKET,
    onDesk: (p) => onDesk(toWorld(unit, p)),
    now: sceneNow,
    later: (ms, fn, key = 'default', ambient = false) => { if (obj) host.later?.(obj, ms, fn, key, ambient); },
    ui,
    play: E.makePlayer(ui),
    // the shadow goes to the scene's shadow layer; a mark is left where it was, splitting flat marks from the body
    castShadow: (pts, z0 = 0) => {
      shadows.push(E.castShadow(pts, z0));
      return MARK;
    },
    // a clip round nothing but shadows: the scene clips all shadows to the desk anyway
    clipTo: (pts, inner) => (inner.split(MARK).join('') === '' ? inner : E.clipTo(pts, inner)),
    labels: (items) => { labels = items || []; return ''; },
    adapt: (cfg, opts) => {
      const st = cfg.state || {};
      if (!st.pal) st.pal = cfg.palette || 'mustard';
      if (st.az == null) st.az = 105;
      if (st.xr == null) { st.xr = 0; st.xrT = 0; }
      ui.st = st;
      // a figure set some of its first state from its page's URL: run that with no parameters
      if (cfg.params) cfg.params(st, new URLSearchParams(''));
      obj = {
        n, id, title: cfg.title, st, seeThrough: opts.seeThrough, ui,
        buttons: cfg.buttons || [],
        acts: cfg.acts || {},
        stats: () => (cfg.stats ? cfg.stats(st).filter(Boolean) : []),
        render: () => {
          shadows = []; labels = [];
          // its box: every point it draws that stands above the paper (whatever order it builds things in)
          rec = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
          const nudge = unit && ARRANGE[unit.id];
          const back = nudge ? enterUnit(nudge, unit!.pivot) : null;
          E.setRec(rec, E.DESK_Z + 1.1, nudge ? (p: V3) => onPaperTop(toWorld(unit, p)) : onPaperTop);
          E.setClipPrefix(`o${n}_`);
          let s: string;
          try { s = cfg.scene(st, E.PALS[st.pal]); } finally { E.setRec(null); back?.(); }
          // before the first shadow: the flat marks that lie under every body (sheets, writing, crumbs)
          const i = s.indexOf(MARK);
          let ground = '', body = s;
          if (i >= 0 && balanced(s.slice(0, i))) { ground = s.slice(0, i); body = s.slice(i); }
          body = body.split(MARK).join('');
          if (rec && isFinite(rec[0][0])) rec[0][2] = Math.min(rec[0][2], E.DESK_Z);
          const local: Box3 = rec && isFinite(rec[0][0]) ? rec : [[at.v - 20, -at.u - 20, 0], [at.v + 20, -at.u + 20, 20]];
          return { ground, shadow: shadows.join(''), body, labels: nudge ? labels.map((l) => ({ ...l, at: toWorld(unit, l.at) })) : labels,
            box: worldBox(unit, local), localBox: local };
        },
      };
      return obj;
    },
  };
  return factory(ctx);
}
