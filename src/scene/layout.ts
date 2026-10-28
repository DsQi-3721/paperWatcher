// Where things lie on the desk top, in desk mm (u along the front edge to the right, v toward the student, origin at
// the desk's centre). The desk is a big bare top, 1800 × 1000; the 三八线 is u = 0 (the student's half is u < 0).
//
// Each object module places itself (PLACE) as it was first laid out, around a few shared papers. Here those places
// are scattered over the bigger desk: every group (a shared paper with the objects working on it, or a single object
// with its own props) is moved and turned as one rigid piece, so everything inside it stays where it was relative to
// the rest. Two groups only slide: G1 keeps the ruler on the real front edge (it twangs there) and G2 keeps the
// eraser square to the 三八线 (it counts what crosses it).

export interface PaperDef {
  id: string;
  /** u0, v0 (far edge), u1, v1 (near edge) before turning */
  rect: [number, number, number, number];
  /** degrees, about the sheet's centre */
  turn: number;
  /** sheets in the stack (1 = a single sheet) */
  sheets: number;
  rule?: number;
  rule0?: number;
  grid?: number;
  margin?: number;
  title?: string;
  /** a closed book instead of loose paper: its cover colour */
  book?: string;
  /** a picture for the book's cover (the book read last from the shelf) */
  cover?: string;
}

export const DESK_SIZE = { L: 1800, D: 1000 };

/** A rigid move of a group: turn by rot (deg) about pivot, then shift by (du, dv). */
export interface GroupMove { du: number; dv: number; rot: number; pivot: [number, number] }

export const GROUPS: Record<string, GroupMove> = {
  G1: { du: -210, dv: 250, rot: 0, pivot: [-504, 117] },     // 数学小测 · pencil · correction tape · ruler (front edge)
  G2: { du: 0, dv: 225, rot: 0, pivot: [-98, 111] },          // 英语默写 · gel pen · eraser (on the 三八线)
  G3: { du: 150, dv: 220, rot: 5, pivot: [154, 144] },        // 数学练习 · compass · calculator
  G4: { du: 120, dv: -80, rot: -6, pivot: [297, -40] },       // 期中考试 · stapler · clips
  G03: { du: -370, dv: -188, rot: 8, pivot: [-100, -192] },   // fountain pen · copybook · ink
  G05: { du: 288, dv: 228, rot: -11, pivot: [492, 180] },     // sharpener · memo pad · bin
  G11: { du: 12, dv: -244, rot: 3, pivot: [148, -186] },      // pencil case
  G12: { du: 261, dv: -175, rot: -6, pivot: [-491, -165] },   // sticky notes · exercise book
  G13: { du: -206, dv: 100, rot: -12, pivot: [-274, -160] },  // washi tape · planner
};
/** Which group each object (by figure number) and each shared paper belongs to. */
export const GROUP_OF: Record<string, string> = {
  '01': 'G1', '04': 'G1', '07': 'G1', S1: 'G1',
  '02': 'G2', '06': 'G2', S4: 'G2',
  '08': 'G3', '10': 'G3', S2: 'G3',
  '09': 'G4', '14': 'G4', S3: 'G4',
  '03': 'G03', '05': 'G05', '11': 'G11', '12': 'G12', '13': 'G13',
};

/** A desk point (u, v) after its group's move. */
export function moveUV(g: string | undefined, u: number, v: number): [number, number] {
  const t = g ? GROUPS[g] : null;
  if (!t) return [u, v];
  const a = t.rot * Math.PI / 180, x = u - t.pivot[0], y = v - t.pivot[1];
  return [t.pivot[0] + t.du + x * Math.cos(a) - y * Math.sin(a), t.pivot[1] + t.dv + x * Math.sin(a) + y * Math.cos(a)];
}
/** An object's placement after its group's move. */
export function movePlace(n: string, p: { u: number; v: number; rot: number }) {
  const g = GROUP_OF[n], [u, v] = moveUV(g, p.u, p.v);
  return { u, v, rot: p.rot + (g ? GROUPS[g].rot : 0) };
}
/** A shared paper after its group's move (its centre moves, its turn adds the group's). */
export function movePaper(d: PaperDef): PaperDef {
  const g = GROUP_OF[d.id];
  if (!g) return d;
  const [u0, v0, u1, v1] = d.rect, w = u1 - u0, h = v1 - v0;
  const [cu, cv] = moveUV(g, (u0 + u1) / 2, (v0 + v1) / 2);
  return { ...d, rect: [cu - w / 2, cv - h / 2, cu + w / 2, cv + h / 2], turn: d.turn + GROUPS[g].rot };
}

/** The blank A4 in the middle of the student's half: where a paper lands to be read, and the sheet to click to import
 *  one. Seen close from straight above for reading, the desk round it is nearly bare (the nearest things are kept
 *  just outside that view), so nothing pulls the eye off the paper. */
export const READING_SPOT: PaperDef = { id: 'blank', rect: [-225, -188.5, -15, 108.5], turn: -3, sheets: 1 };

// the shared papers as first laid out (moved with their groups by movePaper)
const PAPERS_BASE: PaperDef[] = [
  // 数学试卷: the pencil's answers, the correction tape's wrong answer, the ruler's segment AB
  { id: 'S1', rect: [-597, -14, -411, 248], turn: 1.5, sheets: 1, rule: 13, rule0: 30, title: '数学小测' },
  // 英语默写: the gel pen's dictation and the pencil words the eraser rubs out
  { id: 'S4', rect: [-190, -20, -6, 242], turn: -1, sheets: 1, rule: 12, rule0: 30, margin: 18, title: '英语默写' },
  // 数学练习, lying long-ways: the compass's construction and the calculator's sums
  { id: 'S2', rect: [6, 40, 302, 248], turn: 1, sheets: 1, grid: 5, title: '数学练习' },
  // 一摞试卷: the binder clip and paperclips hold it, the stapler staples it
  { id: 'S3', rect: [22, -112, 238, 22], turn: -2, sheets: 40, rule: 11, rule0: 24, title: '期中考试' },
];
export const PAPERS: PaperDef[] = PAPERS_BASE.map(movePaper);

/** The deskmate's 语文 textbook, closed, on their side (the sticky note's target). */
export const TEXTBOOK: PaperDef = { id: 'book', rect: [557.5, 43, 742.5, 293], turn: -8, sheets: 1, book: '#3f6fb0', title: '语文' };

/** Where the history piles go, filled in order (a pile of single sheets takes hundreds before the next starts);
 *  once each has a pile the lowest keeps growing. */
export const PILE_SPOTS = [
  { u: 700, v: -320, turn: 5, floor: false },
  { u: -770, v: 20, turn: -4, floor: false },
];

/** Thickness of a stack of plain sheets, mm (a little puffier than the 0.1 mm of real paper). */
export const sheetsThick = (n: number) => Math.max(0.4, n * 0.12);

/* ---------- the student's own arrangement (arrange mode) ----------
   Anything on the desk can be moved and turned, as a unit: a shared paper together with the stationery working on it
   (so the pencil still writes on its quiz), or one object with its own props, the blank sheet, the textbook, a pile.
   Two units only slide: the 数学小测 group along the front edge (the ruler twangs over it) and the 英语默写 group along
   the 三八线 (the eraser counts what crosses it). A nudge is a turn (deg, the same way as a frame's rot) about the
   unit's pivot, then a slide (du, dv), from where the layout put it. */
export interface Nudge { du: number; dv: number; rot: number }
export interface Unit { id: string; name: string; objs: string[]; papers: string[]; pivot: [number, number]; lock?: 'u' | 'v'; pile?: number }

/** The current nudges, by unit; set by the scene from the saved settings. Bumped `layoutVersion` on every change. */
export const ARRANGE: Record<string, Nudge> = {};
export let layoutVersion = 0;
export function setArrange(place: Record<string, Nudge>) {
  for (const k of Object.keys(ARRANGE)) delete ARRANGE[k];
  for (const [k, n] of Object.entries(place || {})) if (n && (n.du || n.dv || n.rot)) ARRANGE[k] = { du: +n.du || 0, dv: +n.dv || 0, rot: +n.rot || 0 };
  layoutVersion++;
}
export function setNudge(unit: string, n: Nudge | null) {
  if (!n || (!n.du && !n.dv && !n.rot)) delete ARRANGE[unit]; else ARRANGE[unit] = { ...n };
  layoutVersion++;
}

/** A desk point turned by rot (deg, as a frame's rot) about a pivot. */
export function turnUV(u: number, v: number, pu: number, pv: number, rot: number): [number, number] {
  if (!rot) return [u, v];
  const t = rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), wx = v - pv, wy = -(u - pu);
  return [pu - (wx * s + wy * c), pv + (wx * c - wy * s)];
}
/** Where a desk point of a unit is now (its nudge applied), and back. */
export function nudgeUV(n: Nudge | undefined, pivot: [number, number], u: number, v: number): [number, number] {
  if (!n) return [u, v];
  const [a, b] = turnUV(u, v, pivot[0], pivot[1], n.rot);
  return [a + n.du, b + n.dv];
}
export function unnudgeUV(n: Nudge | undefined, pivot: [number, number], u: number, v: number): [number, number] {
  if (!n) return [u, v];
  return turnUV(u - n.du, v - n.dv, pivot[0], pivot[1], -n.rot);
}
/** A paper (or the textbook, or the blank sheet) where its unit's nudge has put it. */
export function nudgedDef(d: PaperDef, unit: Unit | undefined): PaperDef {
  const n = unit ? ARRANGE[unit.id] : undefined;
  if (!n || !unit) return d;
  const [u0, v0, u1, v1] = d.rect, w = u1 - u0, h = v1 - v0;
  const [cu, cv] = nudgeUV(n, unit.pivot, (u0 + u1) / 2, (v0 + v1) / 2);
  return { ...d, rect: [cu - w / 2, cv - h / 2, cu + w / 2, cv + h / 2], turn: d.turn + n.rot };
}
