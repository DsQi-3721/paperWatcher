// Every paper that has been read stays on the desk as one printed sheet: its first page, white paper, one sheet
// thick, laid on a pile a little askew (the corners of the ones under it peek out). The oldest is at the bottom, the
// one read last on top. The first spot fills first; when a pile gets too tall the next spot starts one, and once
// every spot has a pile the lowest keeps growing. Clicking a pile fans its papers out (src/ui/fan.ts).
import { fill, ink, pd, hullInk, vis, castShadow, txOn, INK, MAT, DESK_Z, P, Dv, kRng } from './engine/index.js';
import { PILE_SPOTS } from './layout';

export const SHEET = { w: 210, h: 297 };          // A4, lying the student's way round
const T = 0.3;                                    // one sheet (a little thicker than real paper, so a pile shows)
const CAP = 120;                                  // how tall a pile gets before the next spot is started (mm)
const TINTS = ['#fffdf6', '#fbf8ef', '#fffef9', '#f8f4e8'];   // not every sheet is quite the same white

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** Lay out the piles: [{ spot, items: [{ meta, z0, deg, du, dv, tint }] }], oldest at the bottom (spots: where the
 *  piles are now, if the student moved them). */
export function planPiles(papers, spots = PILE_SPOTS){
  const list = [...papers].sort((a, b) => (a.openedAt || a.addedAt) - (b.openedAt || b.addedAt));
  const piles = spots.map((spot, i) => ({ spot, i, items: [], h: 0 }));
  let k = 0;
  for (const meta of list){
    // the current spot until it is full, then the next; with every spot taken, the lowest pile grows
    while (k < piles.length - 1 && piles[k].h + T > CAP) k++;
    let p = piles[k];
    if (p.h + T > CAP) p = piles.reduce((a, b) => (b.h < a.h ? b : a));
    const r = kRng(hash(meta.id) % 2147483646 + 1);
    // most sheets lie nearly square on the pile, now and then one is put down more crooked
    const crooked = r() < .22;
    p.items.push({ meta, z0: p.h, deg: p.spot.turn + (r() - .5)*(crooked ? 9 : 3.2), du: (r() - .5)*(crooked ? 14 : 6), dv: (r() - .5)*(crooked ? 14 : 6),
      tint: TINTS[hash(meta.id + 't') % TINTS.length] });
    p.h += T;
  }
  return piles.filter((p) => p.items.length);
}

// corners of one sheet (desk terms -> world), top-left first, going round
function corners(spot, it, z){
  const a = it.deg*Math.PI/180, c = Math.cos(a), s = Math.sin(a), cu = spot.u + it.du, cv = spot.v + it.dv;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const du = i*SHEET.w/2, dv = j*SHEET.h/2, u = cu + du*c - dv*s, v = cv + du*s + dv*c; return [v, -u, z]; });
}

/** The sheet on top of a pile: the paper's first page over the whole sheet (an affine map onto the top face, the
 *  camera being orthographic), or, with no picture yet, its title typed over a few grey lines. */
function topFace(B, it, thumb){
  const q = (fx, fy) => { const p0 = B[0], p1 = B[1], p3 = B[3];
    return [p0[0] + (p1[0] - p0[0])*fx + (p3[0] - p0[0])*fy, p0[1] + (p1[1] - p0[1])*fx + (p3[1] - p0[1])*fy, B[0][2] + .02]; };
  if (thumb){
    const o = P(...q(0, 0)), ux = P(...q(1, 0)), uy = P(...q(0, 1));
    return `<image href="${thumb}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${(ux[0] - o[0]).toFixed(3)} ${(ux[1] - o[1]).toFixed(3)} ${(uy[0] - o[0]).toFixed(3)} ${(uy[1] - o[1]).toFixed(3)} ${o[0].toFixed(2)} ${o[1].toFixed(2)})"/>`;
  }
  const u = [B[1][0] - B[0][0], B[1][1] - B[0][1], 0], L = Math.hypot(u[0], u[1]), dir = [u[0]/L, u[1]/L, 0];
  const title = (it.meta.title || '').slice(0, 26).replace(/[<&>]/g, '');
  let s = txOn(q(.5, .14), dir, [0, 0, 1], title, 8, INK, 800, 'middle'), lines = '';
  for (let i = 0; i < 14; i++){ const y = .24 + i*.05; lines += pd([q(.12, y), q(.88 - (i % 4)*.07, y)], false); }
  return s + `<path d="${lines}" fill="none" stroke="#c9c2b2" stroke-width=".8"/>`;
}

// A tall pile costs the same to draw as a short one: the sheets near the top (all of a pile up to LOOSE + BUNDLES)
// go down one by one; under them, the rest are bundled, each bundle drawn as its top sheet with sides down to the
// bundle under it, the sheets' edges ruled along those sides (as finely as the screen shows, one per sheet up close).
const LOOSE = 48, BUNDLES = 32;

/** A pile, as a scene item: its body, its shadow and its box. The sheets go down bottom first, each a white quad
 *  with a thin edge at its own height: the next one covers all but the bit that peeks out, and seen from the side
 *  their edges stack up into the pile's sides. `px`: screen px per drawing unit (how finely bundles are ruled). */
export function pileRender(pile, opts){
  const { spot } = pile, items = pile.items.filter((it) => it.meta.id !== opts.hidden);
  if (!items.length) return null;
  const up = vis([0, 0, 1]), top = items[items.length - 1], n = items.length;
  let body = '', pts = [], lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const add = (p) => { pts.push(p); for (let k = 0; k < 3; k++){ lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } };
  // the bundles under the loose sheets
  const loose = n <= LOOSE + BUNDLES ? n : LOOSE, under = n - loose;
  if (under){
    // the edges that show between the sheets: about one every 2.4 px, unevenly (a sheet sticking out shows, one
    // tucked in doesn't)
    const nb = Math.min(BUNDLES, under), step = Math.hypot(...Dv(0, 0, T))*(opts.px || 1);
    const every = Math.max(1, Math.round(2.4/Math.max(1e-6, step)));
    for (let j = 0; j < nb; j++){
      const a = Math.floor(under*j/nb), b = Math.floor(under*(j + 1)/nb), it = items[b - 1];
      const z1 = DESK_Z + it.z0 + T, z0 = DESK_Z + items[a].z0, B = corners(spot, it, z1), D = corners(spot, it, z0);
      for (const p of B) add(p);
      add([B[0][0], B[0][1], DESK_Z]);
      if (!up) continue;
      if (b - a === 1){ body += `<path d="${pd(B)}" fill="${it.tint}" stroke="${MAT.paper.d}" stroke-width=".5" stroke-linejoin="round"/>`; continue; }
      const cx = (B[0][0] + B[2][0])/2, cy = (B[0][1] + B[2][1])/2;
      let sides = '', rules = '';
      for (let k = 0; k < 4; k++){
        const k2 = (k + 1) % 4, mx = (B[k][0] + B[k2][0])/2 - cx, my = (B[k][1] + B[k2][1])/2 - cy;
        if (!vis([mx, my, 0])) continue;
        sides += pd([B[k], B[k2], D[k2], D[k]]);
        for (let i = b - 2; i >= a; i--){
          if (every > 1 && hash(items[i].meta.id) % every) continue;
          const z = DESK_Z + items[i].z0 + T; rules += pd([[B[k][0], B[k][1], z], [B[k2][0], B[k2][1], z]], false);
        }
      }
      if (sides) body += `<path d="${sides}" fill="${it.tint}" stroke="${MAT.paper.d}" stroke-width=".5" stroke-linejoin="round"/>`;
      if (rules) body += `<path d="${rules}" fill="none" stroke="${MAT.paper.d}" stroke-width=".5"/>`;
      body += `<path d="${pd(B)}" fill="${it.tint}" stroke="${MAT.paper.d}" stroke-width=".5" stroke-linejoin="round"/>`;
    }
  }
  for (let i = under; i < n; i++){
    const it = items[i], z = DESK_Z + it.z0 + T, B = corners(spot, it, z);
    for (const p of B) add(p);
    add([B[0][0], B[0][1], DESK_Z]);
    if (!up) continue;
    if (it === top) body += fill(pd(B), MAT.paper.l) + topFace(B, it, opts.thumb(it.meta)) + ink(pd(B), .8);
    else body += `<path d="${pd(B)}" fill="${it.tint}" stroke="${MAT.paper.d}" stroke-width=".5" stroke-linejoin="round"/>`;
  }
  body += hullInk(pts, 1.2);
  return { body, shadow: castShadow(pts, DESK_Z), floor: false, box: [lo, hi] };
}

/** The top face of one paper on its pile (world corners, top-left first), or null. */
export function paperTop(piles, id){
  for (const pile of piles) for (const it of pile.items) if (it.meta.id === id) return corners(pile.spot, it, DESK_Z + it.z0 + T);
  return null;
}
