// What the stationery lies on: one big bare desk top (a thick wooden slab, the 三八线 chalked across it), the shared
// papers the stationery works on, and the deskmate's textbook. World = the desk's frame (u along the front edge =
// world -y, v toward the student = world +x, z up); the top is at z = DESK_Z. Drawn with the same engine as the
// stationery.
import { loft, fill, ink, pd, rrUV, rectUV, hullInk, toneI, matOf, mix, vis, P, INK, DESK_Z, MAT, makeDesk } from './engine/index.js';
import { DESK_SIZE } from './layout';

export const DESK = { L: DESK_SIZE.L, D: DESK_SIZE.D, T: 30, R: 16 };     // length (u), depth (v), slab thickness, corner radius
/** Below the top: where things that fall off the desk end up (they are gone; nothing is drawn down there). */
export const FLOOR_Z = DESK_Z - 400;
const U0 = -DESK.L/2, U1 = DESK.L/2, V0 = -DESK.D/2, V1 = DESK.D/2;
/** Desk tops to choose from (settings): the top's colour and its edge banding. */
export const WOODS = {
  honey:  { name: '蜂蜜木', top: { l:'#e8c18b', m:'#d3a468', d:'#a7773f' }, edge: { l:'#c9955a', m:'#ad7a43', d:'#7c5229' } },
  oak:    { name: '白橡木', top: { l:'#f0dfc2', m:'#dcc49d', d:'#b3976b' }, edge: { l:'#d6bb90', m:'#bb9d70', d:'#8d714a' } },
  walnut: { name: '胡桃木', top: { l:'#b9875c', m:'#9c6c45', d:'#6e4529' }, edge: { l:'#9a6a43', m:'#7e5333', d:'#55351e' } },
  mint:   { name: '绿桌垫', top: { l:'#bfe0c9', m:'#a2cbb1', d:'#729f86' }, edge: { l:'#c9955a', m:'#ad7a43', d:'#7c5229' } },
  slate:  { name: '灰桌面', top: { l:'#dfe1df', m:'#c6cac7', d:'#959b97' }, edge: { l:'#b9bdba', m:'#9da29e', d:'#6f7470' } },
};
let TOP = WOODS.honey.top, EDGE = WOODS.honey.edge;
export function setWood(name){ const w = WOODS[name] || WOODS.honey; TOP = w.top; EDGE = w.edge; }

// world point of desk coords
const W = (u, v, z) => [v, -u, z];
const ubBox = (u0, v0, z0, u1, v1, z1) => [[v0, -u1, z0], [v1, -u0, z1]];

/** The desk top's outline (for clipping shadows that fall on it). */
export const deskTopPts = () => rrUV(U0, V0, U1, V1, DESK.R).map(([u, v]) => W(u, v, DESK_Z));
/** World box of the desk slab. */
export const deskBox = () => ubBox(U0, V0, DESK_Z - DESK.T, U1, V1, DESK_Z);

// long faint grain streaks across the top, fixed (seeded) so they never move between frames
const GRAIN = (() => { let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; const out = [];
  for (let i = 0; i < 34; i++){ const v = V0 + 18 + r()*(DESK.D - 36), a = U0 + 30 + r()*600, len = 380 + r()*900;
    out.push([v, a, Math.min(U1 - 30, a + len), (r() - .5)*10, r() < .3 ? 2.2 : 1.2]); }
  return out; })();

/** The desk: a thick wooden top, its edges darker, faint grain on top. */
export function desk(){
  const A = rrUV(U0, V0, U1, V1, DESK.R).map(([u, v]) => W(u, v, DESK_Z - DESK.T)), B = rrUV(U0, V0, U1, V1, DESK.R).map(([u, v]) => W(u, v, DESK_Z));
  let s = loft(A, B, n => toneI(n, EDGE));
  if (vis([0, 0, 1])){
    s += fill(pd(B), TOP.l);
    let g1 = '', g2 = '';
    for (const [v, a, b, dv, w] of GRAIN){ const d = pd([W(a, v, DESK_Z + .02), W((a + b)/2, v + dv*.4, DESK_Z + .02), W(b, v + dv, DESK_Z + .02)], false); if (w > 2) g2 += d; else g1 += d; }
    s += `<path d="${g1}" fill="none" stroke="${TOP.m}" stroke-width="1.2" opacity=".45" stroke-linecap="round"/>`
      + `<path d="${g2}" fill="none" stroke="${TOP.m}" stroke-width="2.2" opacity=".35" stroke-linecap="round"/>`;
    s += ink(pd(B), 1.6);
  }
  return s + hullInk([...A, ...B], 2.8);
}

/** 三八线: a chalk line across the middle of the top. */
export function chalkLine(){
  const z = DESK_Z + .03, pts = [];
  for (let i = 0; i <= 30; i++){ const v = V0 + 10 + (DESK.D - 20)*i/30; pts.push(W(Math.sin(i*1.7)*1.8 + (i % 5 === 2 ? 1.3 : 0), v, z)); }
  return `<path d="${pd(pts, false)}" fill="none" stroke="#fbfaf4" stroke-width="3.6" stroke-linecap="round" opacity=".85"/>`
    + `<path d="${pd(pts, false)}" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity=".7" stroke-dasharray="18 7 30 5"/>`;
}

/* ---------- shared papers (and the deskmate's textbook) ---------- */
// A sheet (or a small stack, or a closed book) lying on the desk: its own frame starts at its top-left corner
// (pu across, pv down the page); z = its top surface.
export function paperFrame(def){
  const [u0, v0, u1, v1] = def.rect, w = u1 - u0, h = v1 - v0, t = def.turn*Math.PI/180;
  const cu = (u0 + u1)/2 - (w/2)*Math.cos(t) + (h/2)*Math.sin(t), cv = (v0 + v1)/2 - (w/2)*Math.sin(t) - (h/2)*Math.cos(t);
  const f = makeDesk(cu, cv, def.turn), thick = def.book ? 12 : Math.max(.4, (def.sheets || 1)*.12);
  return { ...f, w, h, z: DESK_Z + thick, thick };
}
/** One shared paper: the sheet (or stack, its edges showing), its rules or grid, its printed title; or a closed book. */
export function paper(def){
  if (def.book) return book(def);
  const fr = paperFrame(def), { w, h, thick } = fr, z0 = DESK_Z;
  const R = rectUV(0, 0, w, h), A = R.map(([a, b]) => fr.dk(a, b, z0)), B = R.map(([a, b]) => fr.dk(a, b, z0 + thick)), zt = z0 + thick + .01;
  let s = loft(A, B, n => toneI(n, MAT.paper)) + fill(pd(B), MAT.paper.l);
  if (def.sheets > 1 && vis([0, 0, 1])){
    // the sheets under the top one show as a few lines on the edges facing the viewer
    let e = ''; for (let i = 1; i < Math.min(def.sheets, 6); i++){ const z = z0 + thick*i/Math.min(def.sheets, 6); e += pd([fr.dk(0, h, z), fr.dk(w, h, z), fr.dk(w, 0, z)], false); }
    s += `<path d="${e}" fill="none" stroke="${MAT.paper.d}" stroke-width=".5"/>`;
  }
  let d = '';
  if (def.grid){ for (let b = def.grid; b < h - .5; b += def.grid) d += pd([fr.dk(0, b, zt), fr.dk(w, b, zt)], false);
    for (let a = def.grid; a < w - .5; a += def.grid) d += pd([fr.dk(a, 0, zt), fr.dk(a, h, zt)], false); }
  else if (def.rule) for (let b = def.rule0 ?? def.rule; b < h - 3; b += def.rule) d += pd([fr.dk(2, b, zt), fr.dk(w - 2, b, zt)], false);
  if (d) s += `<path d="${d}" fill="none" stroke="${def.grid ? '#b9cde6' : '#9fb6d6'}" stroke-width="${def.grid ? .35 : .55}"/>`;
  if (def.margin != null) s += `<path d="${pd([fr.dk(def.margin, 1, zt), fr.dk(def.margin, h - 1, zt)], false)}" fill="none" stroke="#e2706a" stroke-width=".6"/>`;
  if (def.title) s += fr.deskText(8, 12, zt, def.title, 6.4, INK, 800);
  return s + ink(pd(B), .8) + hullInk([...A, ...B], 1.1);
}
// a closed textbook: cloth boards, the page block showing between them, the title and a little picture on the cover;
// or, once a book has been read from the shelf, that book's cover printed on it and its colour on the boards
function book(def){
  const fr = paperFrame(def), { w, h, thick } = fr, z0 = DESK_Z, C = matOf(def.book), zt = z0 + thick + .02;
  if (def.cover) return coverBook(def, fr, C, zt);
  const R = rectUV(0, 0, w, h), A = R.map(([a, b]) => fr.dk(a, b, z0)), B = R.map(([a, b]) => fr.dk(a, b, z0 + thick));
  const P0 = rectUV(2, 2, w - 2, h - 2), PA = P0.map(([a, b]) => fr.dk(a, b, z0 + 1.6)), PB = P0.map(([a, b]) => fr.dk(a, b, z0 + thick - 1.6));
  let s = loft(A, A.map(p => [p[0], p[1], z0 + 1.6]), n => toneI(n, C)) + loft(PA, PB, n => toneI(n, MAT.paper));
  s += loft(B.map(p => [p[0], p[1], z0 + thick - 1.6]), B, n => toneI(n, C));
  if (vis([0, 0, 1])){
    s += fill(pd(B), C.l);
    s += fill(pd(rectUV(0, 0, 14, h).map(([a, b]) => fr.dk(a, b, zt))), C.m);
    const box = rectUV(40, 26, w - 22, 86).map(([a, b]) => fr.dk(a, b, zt));
    s += fill(pd(box), '#fbf6e8') + ink(pd(box), .7);
    s += fr.deskText((40 + w - 22)/2, 66, zt + .01, def.title || '', 26, INK, 800, 'middle');
    s += fr.deskText((40 + w - 22)/2, 80, zt + .01, '七年级 · 上册', 7, mix(INK, '#ffffff', .2), 700, 'middle');
    const boat = [[60, 186], [150, 186], [138, 200], [74, 200]].map(([a, b]) => fr.dk(a, b, zt + .01));
    s += fill(pd(boat), '#fbf6e8') + ink(pd(boat), .8) + ink(pd([fr.dk(104, 186, zt + .01), fr.dk(104, 140, zt + .01), fr.dk(132, 180, zt + .01)]), .8);
    s += `<path d="${pd([fr.dk(40, 214, zt), fr.dk(70, 210, zt), fr.dk(100, 216, zt), fr.dk(130, 210, zt), fr.dk(160, 215, zt)], false)}" fill="none" stroke="#fbf6e8" stroke-width="1.6" stroke-linecap="round"/>`;
    s += ink(pd(B), 1);
  }
  return s + hullInk([...A, ...B], 1.6);
}

// the same book with a picture for a cover (the book read last on the shelf): the picture over the whole front board,
// mapped exactly onto it (the camera is orthographic, so an affine map is exact), the boards in its colour
function coverBook(def, fr, C, zt){
  const { w, h, thick } = fr, z0 = DESK_Z;
  const R = rectUV(0, 0, w, h), A = R.map(([a, b]) => fr.dk(a, b, z0)), B = R.map(([a, b]) => fr.dk(a, b, z0 + thick));
  const P0 = rectUV(2, 2, w - 2, h - 2), PA = P0.map(([a, b]) => fr.dk(a, b, z0 + 1.6)), PB = P0.map(([a, b]) => fr.dk(a, b, z0 + thick - 1.6));
  let s = loft(A, A.map(p => [p[0], p[1], z0 + 1.6]), n => toneI(n, C)) + loft(PA, PB, n => toneI(n, MAT.paper));
  s += loft(B.map(p => [p[0], p[1], z0 + thick - 1.6]), B, n => toneI(n, C));
  if (vis([0, 0, 1])){
    s += fill(pd(B), C.l);
    const q = (a, b) => P(...fr.dk(a, b, zt)), o = q(0, 0), ux = q(w, 0), uy = q(0, h);
    s += `<image href="${def.cover}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${(ux[0] - o[0]).toFixed(3)} ${(ux[1] - o[1]).toFixed(3)} ${(uy[0] - o[0]).toFixed(3)} ${(uy[1] - o[1]).toFixed(3)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})"/>`;
    // the hinge a few mm in from the spine, pressed into the board
    s += `<path d="${pd([fr.dk(10, 1, zt + .01), fr.dk(10, h - 1, zt + .01)], false)}" fill="none" stroke="${C.d}" stroke-width=".8" opacity=".55"/>`;
    s += ink(pd(B), 1);
  }
  return s + hullInk([...A, ...B], 1.6);
}

// Kept for objects not yet moved off the old classroom (nothing is drawn there now): a plane beyond the far edge.
export const JACKET = { u0: -485, u1: -115, v: -560, face: -546, z0: DESK_Z - 200, z1: DESK_Z + 130 };
