/* ============================================================
   Stationery kit: helpers shared by the stationery figures. Loaded right after core.js
   (stationery/build.py inlines it). Everything here is global, so a figure must not redeclare these names:
   MAT GRAPHITE zhEm zhCallouts zhTag kAdd kScl kLerp kAt kLen kRng axisFrame axisRing nearArc coaxSeg coaxOrder
   coilParts obox oboxPts txOn txZ paperSheet HAND handGlyphs handStrokes traceStrokes strokesLength graphite kPlay kBusy
   K_RUN DK DU DV dk dkv undk deskSetup deskTop deskBoard deskSheet deskText deskHand deskBox deskBoxPts
   ============================================================ */

/* ---------- materials that come up again and again ---------- */
const MAT = {
  brass:    { l:'#f2d48a', m:'#d8b25a', d:'#9a7a2a' },
  steel:    { l:'#eef0f0', m:'#c6ccce', d:'#8f989b' },
  rubber:   { l:'#5b5650', m:'#3d3935', d:'#272421' },
  graphite: { l:'#7a7c84', m:'#55575e', d:'#34363b' },
  eraser:   { l:'#fbf8f0', m:'#e9e3d4', d:'#c4bba6' },
  paper:    { l:'#fffdf6', m:'#efe9da', d:'#cfc6b2' },
  plastic:  { l:'#f7f5ee', m:'#dedad0', d:'#b3ada0' },
  clear:    { l:'#e4f2f4', m:'#c4dfe4', d:'#97b9c0' },
  wood:     { l:'#f0c890', m:'#d9a86c', d:'#a8784a' },
};
const GRAPHITE = '#4c4e55';

/* ---------- labels that fit Chinese text (CJK glyphs are a full em wide, monospace Latin ~.64 em) ---------- */
const zhEm = t => [...String(t)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? 1.06 : .64), 0);
// xrCallouts with pills sized for Chinese names: two columns either side of the object, leaders never cross
function zhCallouts(items, B){
  const pts = []; for (const x of [B[0], B[1]]) for (const y of [B[2], B[3]]) for (const z of [B[4], B[5]]) pts.push(P(x, y, z));
  const xmin = Math.min(...pts.map(p => p[0])), xmax = Math.max(...pts.map(p => p[0])), cx = (xmin + xmax)/2;
  const k = INK_K, u = window.LBL_U ? LBL_U() : 0, fs = u ? 10*u : 8.6*k, hgt = u ? 17*u : fs*1.8, gap = hgt + (u ? 3*u : 3*k);
  const lc = [], rc = [];
  const svgEl = document.getElementById('fig'), vb = svgEl.viewBox.baseVal, btn = document.getElementById('btns');
  const pw = t => u ? hgt*1.3 : zhEm(t)*fs + fs*1.5;
  const wMax = Math.max(...items.map(it => pw(it.text))) + 12*k;
  const roomL = xmin - vb.x >= wMax, roomR = vb.x + vb.width - xmax >= wMax;
  for (const it of items){ const [X, Y] = P(...it.at); ((X < cx && roomL) || !roomR ? lc : rc).push({ ...it, X, Y }); }
  let s = '';
  const top = { [-1]: fs, [1]: fs + 30*k };
  if (btn && svgEl.getScreenCTM()){ const r = btn.getBoundingClientRect(), q = new DOMPoint(r.right, r.bottom + 50).matrixTransform(svgEl.getScreenCTM().inverse());
    if (q.y > 0) top[-1] = q.y + hgt; }
  for (const [col, side] of [[lc, -1], [rc, 1]]){
    col.sort((a, b) => a.Y - b.Y);
    let y = -1e9; for (const c of col){ c.py = Math.max(c.Y, y + gap, top[side]); y = c.py; }
    const shift = col.length ? Math.max(0, col.reduce((a, c) => a + c.py - c.Y, 0) / col.length) : 0;
    const room = col.length ? col[0].py - top[side] : 0; for (const c of col) c.py -= Math.min(shift, room);
    for (const c of col){
      c.n = ((window.__ln || (window.__ln = {}))[c.text] || (__ln[c.text] = Object.keys(__ln).length + 1));
      const w = u ? hgt*(c.n > 9 ? 1.3 : 1) : zhEm(c.text)*fs + fs*1.5;
      let px = side < 0 ? xmin - 10*k - w/2 : xmax + 10*k + w/2; px = Math.max(vb.x + w/2 + 2*k, Math.min(vb.x + vb.width - w/2 - 2*k, px));
      const ex = px - side*w/2;
      s += `<g class="tag${c.on ? ' on' : ''}" data-n="${c.n}" data-t="${c.text}"><path d="M${f(c.X)} ${f(c.Y)}L${f(ex + side*-4*k)} ${f(c.py)}L${f(ex)} ${f(c.py)}" fill="none" stroke="${INK}" stroke-width="1"/>`
        + `<circle cx="${f(c.X)}" cy="${f(c.Y)}" r="${f(1.4*k)}" fill="${INK}"/>`
        + `<rect x="${f(px - w/2)}" y="${f(c.py - hgt/2)}" width="${f(w)}" height="${f(hgt)}" rx="${f(hgt/2)}" fill="${c.on ? 'var(--accent,#f4b829)' : '#fff4d6'}" stroke="${INK}" stroke-width="1.2"/>`
        + `<text x="${f(px)}" y="${f(c.py + fs*.36)}" font-size="${f(fs)}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="800" letter-spacing=".04em" fill="${INK}">${u ? c.n : c.text}</text></g>`;
    }
  }
  return s;
}
// tag() with a pill sized for Chinese text
function zhTag(p3, dx, dy, text, on = false){
  const u = window.LBL_U ? LBL_U() : 0, n = ((window.__ln || (window.__ln = {}))[text] || (__ln[text] = Object.keys(__ln).length + 1));
  const k = INK_K, [X, Y] = P(...p3), fs = u ? 10*u : 8.6*k, h = u ? 17*u : fs*1.8, w = u ? h*(n > 9 ? 1.3 : 1) : zhEm(text)*fs + fs*1.5, cx = X + dx*k, cy = Y + dy*k;
  return `<g class="tag${on ? ' on' : ''}" data-n="${n}" data-t="${text}"><path d="M${f(X)} ${f(Y)}L${f(cx)} ${f(cy)}" fill="none" stroke="${INK}" stroke-width="1"/>`
    + `<circle cx="${f(X)}" cy="${f(Y)}" r="${f(1.3*k)}" fill="${INK}"/>`
    + `<rect x="${f(cx - w/2)}" y="${f(cy - h/2)}" width="${f(w)}" height="${f(h)}" rx="${f(h/2)}" fill="${on ? 'var(--accent,#f4b829)' : '#fff4d6'}" stroke="${INK}" stroke-width="1.2"/>`
    + `<text x="${f(cx)}" y="${f(cy + fs*.36)}" font-size="${f(fs)}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="800" letter-spacing=".04em" fill="${INK}">${u ? n : text}</text></g>`;
}

/* ---------- vectors ---------- */
const kAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const kScl = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const kLerp = (a, b, t) => [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t, a[2] + (b[2] - a[2])*t];
const kAt = (o, d, s) => [o[0] + d[0]*s, o[1] + d[1]*s, o[2] + d[2]*s];     // the point s along the axis d from o
const kLen = a => Math.hypot(a[0], a[1], a[2]);
// seeded random numbers in [0, 1)
const kRng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/* ---------- things built round an axis (pens, pencils, tubes, rolls) ---------- */
// two unit vectors square to the axis d: e1 lies level (unless d stands upright), e2 = d x e1 (points up when d is level)
function axisFrame(d){
  const e1 = Math.abs(d[2]) > .985 ? [1, 0, 0] : norm(cross([0, 0, 1], d));
  return [e1, cross(d, e1)];
}
// n points round the axis d at c, radius r, starting at angle phase (0 = e1, 90 deg = e2)
function axisRing(c, d, r, n = 16, phase = 0){
  const [e1, e2] = axisFrame(d);
  return Array.from({length:n}, (_, i) => { const t = phase + i/n*2*Math.PI, a = r*Math.cos(t), b = r*Math.sin(t);
    return [c[0] + e1[0]*a + e2[0]*b, c[1] + e1[1]*a + e2[1]*b, c[2] + e1[2]*a + e2[2]*b]; });
}
// the half of a ring round the axis d (centre c, radius r) that faces the viewer, as open polylines: grooves, seams, threads
function nearArc(c, d, r, n = 32){
  const [e1, e2] = axisFrame(d), pts = [], fv = [];
  for (let i = 0; i < n; i++){ const t = i/n*2*Math.PI, rad = kAdd(kScl(e1, Math.cos(t)), kScl(e2, Math.sin(t))); pts.push(kAdd(c, kScl(rad, r))); fv.push(vis(rad)); }
  const start = fv.findIndex((v, i) => !v && fv[(i + 1) % n]);
  if (start < 0) return fv[0] ? [pts.concat([pts[0]])] : [];
  const runs = []; let run = null;
  for (let j = 1; j <= n; j++){ const i = (start + j) % n; if (fv[i]){ if (!run) runs.push(run = []); run.push(pts[i]); } else run = null; }
  return runs;
}
// One solid on the axis o + s*d from s0 to s1, radius r0 to r1: round (n ~20) or a prism (n = 6 for a hex barrel).
// The end facing the viewer gets its cap; hole0/hole1 make that cap a ring with a dark bore (a tube, a sleeve).
// g = { s0, s1, r0, r1, M, n, phase, shade, w, edges, hole0, hole1, bore, cap:false, capCol }
function coaxSeg(o, d, g){
  const n = g.n || 20, ph = g.phase || 0, sh = g.shade || tone, M = g.M, w = g.w ?? 1.1, r1 = g.r1 ?? g.r0;
  const A = axisRing(kAt(o, d, g.s0), d, Math.max(.01, g.r0), n, ph), B = axisRing(kAt(o, d, g.s1), d, Math.max(.01, r1), n, ph);
  let s = loft(A, B, nr => sh(nr, M));
  if (g.edges){   // a prism: a fine line along each edge between two faces that both face the viewer
    const [e1, e2] = axisFrame(d), fn = i => { const t = ph + (i + .5)/n*2*Math.PI; return kAdd(kScl(e1, Math.cos(t)), kScl(e2, Math.sin(t))); };
    let e = ''; for (let i = 0; i < n; i++) if (vis(fn(i)) && vis(fn((i + n - 1) % n))) e += pd([A[i], B[i]], false);
    if (e) s += `<path d="${e}" fill="none" stroke="${INK}" stroke-width="${g.edges}" stroke-linecap="round" opacity=".55"/>`;
  }
  const capB = vis(d), cap = capB ? B : A, cn = capB ? d : kScl(d, -1), rr = capB ? r1 : g.r0, hole = capB ? g.hole1 : g.hole0;
  if (rr > .02 && g.cap !== false && vis(cn)){
    s += fill(pd(cap), g.capCol || sh(cn, M)) + ink(pd(cap), w*.7);
    if (hole){ const hr = axisRing(capB ? kAt(o, d, g.s1) : kAt(o, d, g.s0), d, hole, 16); s += fill(pd(hr), g.bore || '#1d1a16') + ink(pd(hr), w*.5); }
  }
  return s + hullInk([...A, ...B], w);
}
// Order a row of solids on one axis for the current view: far end first. items: { name, s0, s1, svg, over:[names] }.
// 'over' = the parts this one wraps round (a band on a barrel, a ring on a chuck): it goes after them in every view.
function coaxOrder(d, items){
  const tow = vis(d), list = items.filter(Boolean).sort((a, b) => tow ? (a.s0 + a.s1) - (b.s0 + b.s1) : (b.s0 + b.s1) - (a.s0 + a.s1));
  for (const it of list.slice()) if (it.over){
    const i = list.indexOf(it), last = Math.max(-1, ...it.over.map(n => list.findIndex(x => x.name === n)));
    if (last > i){ list.splice(i, 1); list.splice(last, 0, it); } }
  return list.map(x => x.svg).join('');
}
// A coil spring round the axis from s0 to s1: its far half and its near half come back separately, so whatever it
// wraps (a tube, a refill) can be drawn between them.
function coilParts(o, d, s0, s1, r, turns, col = MAT.steel.l, w = .55){
  const [e1, e2] = axisFrame(d), N = Math.max(48, Math.round(turns*28)), far = [], near = [];
  let run = null, side = null;
  for (let i = 0; i <= N; i++){ const t = i/N, a = t*turns*2*Math.PI, rad = kAdd(kScl(e1, Math.cos(a)), kScl(e2, Math.sin(a)));
    const p = kAdd(kAt(o, d, s0 + (s1 - s0)*t), kScl(rad, r)), nr = vis(rad);
    if (run && nr === side) run.push(p); else { if (run) run.push(p); run = [p]; (nr ? near : far).push(run); side = nr; } }
  const draw = runs => runs.filter(q => q.length > 1).map(q => `<path d="${pd(q, false)}" fill="none" stroke="${INK}" stroke-width="${f(w*2.4)}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${pd(q, false)}" fill="none" stroke="${col}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return { far: draw(far), near: draw(near) };
}
// A box turned any way: centre c, unit axes ax, ay, az, half sizes hx, hy, hz. Visible faces only, each outlined.
function oboxPts(c, ax, ay, az, hx, hy, hz){ const o = [];
  for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) o.push([0,1,2].map(q => c[q] + ax[q]*hx*i + ay[q]*hy*j + az[q]*hz*k));
  return o; }
function obox(c, ax, ay, az, hx, hy, hz, M, shade = toneI, w = .9){
  const v = (i, j, k) => [0,1,2].map(q => c[q] + ax[q]*hx*i + ay[q]*hy*j + az[q]*hz*k);
  const F = [[ax, [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]], [kScl(ax,-1), [[-1,-1,-1],[-1,1,-1],[-1,1,1],[-1,-1,1]]],
             [ay, [[-1,1,-1],[1,1,-1],[1,1,1],[-1,1,1]]], [kScl(ay,-1), [[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]],
             [az, [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]], [kScl(az,-1), [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]]]];
  return F.filter(([n]) => vis(n)).map(([n, q]) => shape(q.map(([i, j, k]) => v(i, j, k)), shade(n, M), w)).join('');
}

/* ---------- text lying on a face ---------- */
// Text on any flat face: anchor p, reading direction u, face normal n (the text is upright for someone facing the face).
// Hidden when the face is turned away. size in model units.
function txOn(p, u, n, str, size, col = INK, weight = 700, anchor = 'middle'){
  const v = cross(n, u);   // "down" on the face, so that u x v = n: never mirrored on a face toward the viewer
  return `<text transform="${txM(P(...p), Dv(...u), Dv(...v))}" font-size="${size}" fill="${col}" text-anchor="${anchor}" font-family="ui-monospace,Menlo,'PingFang SC',monospace" font-weight="${weight}">${str}</text>`;
}
// Text printed on paper lying on the desk, read by someone sitting at the front (+x): lines run toward -y, the page's
// top is toward -x. rot (deg) turns the text on the desk.
const txZ = (x, y, z, str, size, col = INK, weight = 700, anchor = 'start', rot = 0) => {
  const a = rot*Math.PI/180; return txOn([x, y, z], [Math.sin(a), -Math.cos(a), 0], [0, 0, 1], str, size, col, weight, anchor); };

/* ---------- paper ---------- */
// A sheet lying on the desk (x0..x1 deep, y0..y1 wide) at height z0, thickness t. opts.rule: line spacing (light
// blue rules across the sheet), opts.rule0: first rule from the top, opts.margin: red margin this far from the left
// (+y) edge, opts.col: paper colour, opts.grid: square grid spacing instead of rules.
function paperSheet(x0, y0, x1, y1, z0, t = .4, opts = {}){
  const R = rectUV(x0, y0, x1, y1), A = on(PZ(z0), R), B = on(PZ(z0 + t), R), z = z0 + t + .01, M = opts.M || MAT.paper;
  let s = loft(A, B, n => toneI(n, M)) + fill(pd(B), opts.col || M.l);
  let d = '';
  if (opts.grid) { for (let x = x0 + opts.grid; x < x1 - .5; x += opts.grid) d += pd([[x, y0, z], [x, y1, z]], false);
    for (let y = y0 + opts.grid; y < y1 - .5; y += opts.grid) d += pd([[x0, y, z], [x1, y, z]], false); }
  else if (opts.rule) for (let x = x0 + (opts.rule0 ?? opts.rule); x < x1 - 3; x += opts.rule) d += pd([[x, y0 + 1.5, z], [x, y1 - 1.5, z]], false);
  if (d) s += `<path d="${d}" fill="none" stroke="${opts.ruleCol || '#9fb6d6'}" stroke-width=".55"/>`;
  if (opts.margin != null) s += `<path d="${pd([[x0 + 1, y1 - opts.margin, z], [x1 - 1, y1 - opts.margin, z]], false)}" fill="none" stroke="#e2706a" stroke-width=".6"/>`;
  return s + ink(pd(B), .8) + hullInk([...A, ...B], 1.1);
}

/* ---------- handwriting ---------- */
// A small single-stroke hand: each glyph is a list of strokes in a box (u right 0..~.65, v up 0..1).
const HAND = {
  '0': [[[.3,1],[.1,.86],[.01,.5],[.09,.13],[.3,0],[.51,.13],[.6,.5],[.51,.88],[.3,1]]],
  '1': [[[.1,.78],[.32,1],[.3,0]]],
  '2': [[[.02,.76],[.14,.94],[.32,1],[.5,.94],[.58,.76],[.5,.55],[.02,0],[.64,.02]]],
  '3': [[[.04,.88],[.24,1],[.48,.95],[.55,.78],[.42,.6],[.22,.55],[.46,.5],[.6,.3],[.54,.09],[.32,0],[.04,.08]]],
  '4': [[[.46,0],[.46,1],[0,.32],[.66,.32]]],
  '5': [[[.58,1],[.12,1],[.06,.56],[.3,.62],[.52,.52],[.6,.3],[.5,.08],[.28,0],[.04,.08]]],
  '6': [[[.52,.95],[.3,1],[.1,.8],[.02,.45],[.08,.12],[.3,0],[.52,.12],[.56,.36],[.4,.52],[.18,.5],[.04,.36]]],
  '7': [[[0,1],[.62,1],[.24,0]]],
  '8': [[[.3,.55],[.08,.7],[.1,.92],[.3,1],[.5,.92],[.52,.7],[.3,.55],[.05,.38],[.04,.12],[.3,0],[.56,.12],[.55,.38],[.3,.55]]],
  '9': [[[.56,.62],[.42,.48],[.2,.48],[.05,.65],[.1,.9],[.3,1],[.5,.9],[.56,.62],[.5,.25],[.3,0],[.1,.05]]],
  'x': [[[0,.6],[.55,0]], [[.55,.6],[0,0]]],
  'y': [[[0,.6],[.28,.14]], [[.56,.6],[.2,-.42]]],
  'a': [[[.5,.5],[.3,.62],[.08,.48],[.04,.18],[.22,0],[.46,.12],[.52,.6],[.52,.1],[.6,0]]],
  'b': [[[.06,1],[.06,0],[.3,.02],[.5,.2],[.48,.46],[.28,.6],[.06,.46]]],
  'c': [[[.5,.5],[.3,.6],[.08,.46],[.04,.16],[.24,0],[.52,.08]]],
  'o': [[[.28,.6],[.06,.46],[.04,.14],[.26,0],[.48,.14],[.5,.46],[.28,.6]]],
  'e': [[[.06,.3],[.5,.32],[.44,.54],[.24,.6],[.06,.42],[.06,.14],[.26,0],[.52,.08]]],
  'h': [[[.06,1],[.06,0]], [[.06,.42],[.26,.6],[.46,.52],[.5,.3],[.5,0]]],
  'l': [[[.2,1],[.2,.1],[.32,0]]],
  'i': [[[.2,.6],[.2,0]], [[.2,.84],[.22,.88]]],
  'n': [[[.06,.6],[.06,0]], [[.06,.42],[.26,.6],[.46,.52],[.5,.3],[.5,0]]],
  'v': [[[0,.6],[.28,0],[.56,.6]]],
  'A': [[[0,0],[.3,1],[.6,0]], [[.12,.4],[.48,.4]]],
  'B': [[[.06,0],[.06,1],[.38,1],[.52,.86],[.4,.56],[.06,.54]], [[.4,.56],[.58,.36],[.5,.08],[.32,0],[.06,0]]],
  'C': [[[.58,.86],[.36,1],[.12,.88],[.02,.5],[.12,.12],[.36,0],[.6,.12]]],
  'D': [[[.06,0],[.06,1],[.32,.96],[.54,.72],[.56,.3],[.34,.04],[.06,0]]],
  'O': [[[.3,1],[.08,.86],[0,.5],[.08,.14],[.3,0],[.52,.14],[.6,.5],[.52,.86],[.3,1]]],
  'K': [[[.06,1],[.06,0]], [[.56,1],[.06,.4]], [[.22,.56],[.58,0]]],
  '=': [[[0,.24],[.58,.24]], [[0,.5],[.58,.5]]],
  '+': [[[.3,.12],[.3,.74]], [[0,.43],[.6,.43]]],
  '-': [[[.02,.42],[.54,.42]]],
  '.': [[[.1,.02],[.17,.07],[.13,0]]],
  ':': [[[.2,.5],[.24,.54]], [[.2,.06],[.24,.1]]],
  '!': [[[.22,1],[.2,.3]], [[.2,.06],[.22,.02]]],
  '?': [[[.04,.8],[.2,.98],[.42,.98],[.54,.82],[.46,.62],[.28,.5],[.28,.28]], [[.28,.06],[.3,.02]]],
  '/': [[[.6,1],[0,0]]],
  '(': [[[.4,1],[.18,.7],[.14,.3],[.4,0]]],
  ')': [[[.14,1],[.36,.7],[.4,.3],[.14,0]]],
  'v/': [[[0,.4],[.18,0],[.62,1]]],    // a tick (check mark)
  ' ': [],
};
// The strokes of a string in a flat hand: u to the right, v up, in units of the letter height, with a little wobble so
// it looks written, not typed.
function handGlyphs(str, seed = 7, adv = .78){
  const rnd = kRng(seed), out = []; let u0 = 0;
  for (const ch of (Array.isArray(str) ? str : [...str])){
    const g = HAND[ch] || []; const lean = .12, du = (rnd() - .5)*.06, dv = (rnd() - .5)*.06;
    for (const sk of g) out.push(sk.map(([u, v]) => [u0 + u + v*lean + du + (rnd() - .5)*.03, v + dv + (rnd() - .5)*.03]));
    u0 += ch === ' ' ? .5 : adv;
  }
  return out;
}
// ... written on a level sheet in world terms: lines toward -y, letters standing toward -x; x, y = baseline start
const handStrokes = (str, x, y, z, size, seed = 7, adv = .78) => handGlyphs(str, seed, adv).map(sk => sk.map(([u, v]) => [x - v*size, y - u*size, z]));
// How far a writing tip has got along a list of strokes after travelling dist: the parts already on the paper, where
// the tip is, and whether it touches the paper (between strokes it lifts by `lift` and moves through the air).
function traceStrokes(strokes, dist, lift = 1.5){
  const done = []; let left = dist, tip = strokes.length ? strokes[0][0] : null;
  for (let k = 0; k < strokes.length; k++){
    const sk = strokes[k];
    if (k > 0){ const a = strokes[k-1][strokes[k-1].length - 1], b = sk[0], gap = kLen(sub(b, a));
      if (left < gap){ const t = left/gap, p = kLerp(a, b, t); p[2] += lift*Math.sin(Math.PI*t); return { done, tip: p, down: false, end: false }; }
      left -= gap; }
    const part = [sk[0]];
    for (let i = 1; i < sk.length; i++){ const seg = kLen(sub(sk[i], sk[i-1]));
      if (left < seg){ const p = kLerp(sk[i-1], sk[i], left/seg); part.push(p); done.push(part); return { done, tip: p, down: true, end: false }; }
      left -= seg; part.push(sk[i]); }
    done.push(part); tip = sk[sk.length - 1];
  }
  return { done, tip, down: false, end: true };
}
// the total distance a writing tip travels over these strokes, air moves included
const strokesLength = strokes => strokes.reduce((a, sk, k) => a + sk.slice(1).reduce((b, p, i) => b + kLen(sub(p, sk[i])), 0)
  + (k ? kLen(sub(sk[0], strokes[k-1][strokes[k-1].length - 1])) : 0), 0);
// pencil / pen lines on paper; w in model units (mm), so it is as thick as the real line
const graphite = (strokes, col = GRAPHITE, w = .6, op = .9) => strokes.length ? `<path d="${strokes.map(q => pd(q, false)).join('')}" fill="none" stroke="${col}" style="stroke-width:${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>` : '';

/* ---------- one action at a time ---------- */
// kPlay(ui, name, segments, done): runs [{ ms, start(), step(k 0..1), end() }] one after another on ui.animate.
// While one runs, kBusy() is its name; a second press should answer with ui.flash instead of starting another.
let K_RUN = null;
const kBusy = () => K_RUN;
function kPlay(ui, name, segs, done){
  segs = segs.filter(Boolean); if (!segs.length){ if (done) done(); return; }
  K_RUN = name; let i = 0, t = 0; if (segs[0].start) segs[0].start();
  ui.animate(dt => { const g = segs[i]; t += dt*1000; const k = g.ms > 0 ? Math.min(1, t/g.ms) : 1; if (g.step) g.step(k);
    if (k >= 1){ if (g.end) g.end(); i++; t = 0;
      if (i >= segs.length){ K_RUN = null; if (done) done(); return false; }
      if (segs[i].start) segs[i].start(); }
    return true; });
}

/* ---------- a desk turned toward the viewer ----------
   Long things (pens, rulers) read best lying across the screen. The desk is turned on the spot: u runs along its front
   edge (to the right), v toward the viewer, z up, origin at the desk's centre; dk(u, v, z) gives the world point.
   turn 45 = front edge straight across the screen, 0 = the plain iso desk; ~36 still shows the left sides of boxes.
   deskSetup returns { size, center } for mountFigure: a stand-in box whose picture is exactly the desk's (Lu x Lv, with
   things up to Htop high), so the frame fits the desk and the turntable spins round its middle. */
let DK = [0, 0], DU = [Math.SQRT1_2, -Math.SQRT1_2, 0], DV = [Math.SQRT1_2, Math.SQRT1_2, 0];
const dk = (u, v, z = 0) => [DK[0] + u*DU[0] + v*DV[0], DK[1] + u*DU[1] + v*DV[1], z];
const dkv = (u, v, z = 0) => [u*DU[0] + v*DV[0], u*DU[1] + v*DV[1], z];          // a direction in desk terms
const undk = p => [(p[0] - DK[0])*DU[0] + (p[1] - DK[1])*DU[1], (p[0] - DK[0])*DV[0] + (p[1] - DK[1])*DV[1], p[2]];   // world -> desk
function deskSetup(Lu, Lv, Htop, turn = 36){
  const t = turn*Math.PI/180; DU = [Math.sin(t), -Math.cos(t), 0]; DV = [Math.cos(t), Math.sin(t), 0]; DK = [0, 0];
  const xs = [], ys = [];
  for (const u of [-Lu/2, Lu/2]) for (const v of [-Lv/2, Lv/2]) for (const z of [0, Htop]){ const [x, y] = dk(u, v, z); xs.push((x - y)*C); ys.push((x + y)*S - z); }
  const xa = Math.min(...xs), xb = Math.max(...xs), ya = Math.min(...ys), yb = Math.max(...ys);
  const W = (xb - xa)/C/2; let H = (yb - ya) - 2*W*S, extra = 0; if (H < 0){ extra = -H; H = 0; }
  const dxy = (-W*C - xa)/C, sxy = (-H + extra/2 - ya)/S;          // (x - y) and (x + y) of the desk's centre
  DK = [(sxy + dxy)/2, (sxy - dxy)/2];
  return { size: [W, W, H], center: DK.slice() };
}
const deskTop = (Lu, Lv, h, r = 6) => rrUV(-Lu/2, -Lv/2, Lu/2, Lv/2, r).map(([u, v]) => dk(u, v, h));
function deskBoard(Lu, Lv, h = 4, r = 6, M = WOOD){
  const A = rrUV(-Lu/2, -Lv/2, Lu/2, Lv/2, r).map(([u, v]) => dk(u, v, 0)), B = deskTop(Lu, Lv, h, r);
  return loft(A, B, n => toneI(n, M)) + fill(pd(B), M.l) + ink(pd(B), 1) + hullInk([...A, ...B], 1.8);
}
// a sheet of paper lying on the desk, u0..u1 across, v0..v1 from its top edge (far) to its bottom edge (near).
// opts: rule (spacing of lines across the page), rule0 (first line below the top), margin (red line this far in from the
// left edge), grid (squares), col, M, ruleCol, turn (deg, the sheet put down a little crooked about its centre)
function deskSheet(u0, v0, u1, v1, z0, t = .4, opts = {}){
  const M = opts.M || MAT.paper, a = (opts.turn || 0)*Math.PI/180, cu = (u0 + u1)/2, cv = (v0 + v1)/2;
  const at = (u, v, z) => { const du = u - cu, dv = v - cv; return dk(cu + du*Math.cos(a) - dv*Math.sin(a), cv + du*Math.sin(a) + dv*Math.cos(a), z); };
  const R = rectUV(u0, v0, u1, v1), A = R.map(([u, v]) => at(u, v, z0)), B = R.map(([u, v]) => at(u, v, z0 + t)), z = z0 + t + .01;
  let s = loft(A, B, n => toneI(n, M)) + fill(pd(B), opts.col || M.l), d = '';
  if (opts.grid){ for (let v = v0 + opts.grid; v < v1 - .5; v += opts.grid) d += pd([at(u0, v, z), at(u1, v, z)], false);
    for (let u = u0 + opts.grid; u < u1 - .5; u += opts.grid) d += pd([at(u, v0, z), at(u, v1, z)], false); }
  else if (opts.rule) for (let v = v0 + (opts.rule0 ?? opts.rule); v < v1 - 3; v += opts.rule) d += pd([at(u0 + 1.5, v, z), at(u1 - 1.5, v, z)], false);
  if (d) s += `<path d="${d}" fill="none" stroke="${opts.ruleCol || '#9fb6d6'}" stroke-width=".55"/>`;
  if (opts.margin != null) s += `<path d="${pd([at(u0 + opts.margin, v0 + 1, z), at(u0 + opts.margin, v1 - 1, z)], false)}" fill="none" stroke="#e2706a" stroke-width=".6"/>`;
  return s + ink(pd(B), .8) + hullInk([...A, ...B], 1.1);
}
// text printed flat on the desk / a sheet, reading to the right (u), letters standing toward the far edge (-v)
const deskText = (u, v, z, str, size, col = INK, weight = 700, anchor = 'start') => txOn(dk(u, v, z), DU, [0, 0, 1], str, size, col, weight, anchor);
// handwriting on the desk: baseline starts at (u, v), letters size high
const deskHand = (str, u, v, z, size, seed = 7, adv = .78) => handGlyphs(str, seed, adv).map(sk => sk.map(([gu, gv]) => dk(u + gu*size, v - gv*size, z)));
// a box square to the desk: u0..u1, v0..v1, z0..z1
const deskBoxPts = (u0, v0, z0, u1, v1, z1) => oboxPts(dk((u0 + u1)/2, (v0 + v1)/2, (z0 + z1)/2), DU, DV, [0, 0, 1], (u1 - u0)/2, (v1 - v0)/2, (z1 - z0)/2);
const deskBox = (u0, v0, z0, u1, v1, z1, M, shade = toneI, w = .9) => obox(dk((u0 + u1)/2, (v0 + v1)/2, (z0 + z1)/2), DU, DV, [0, 0, 1], (u1 - u0)/2, (v1 - v0)/2, (z1 - z0)/2, M, shade, w);

/* ---------- ?thumb=1: just the drawing, for the gallery's thumbnails ---------- */
if (new URLSearchParams(location.search).get('thumb') === '1') document.head.insertAdjacentHTML('beforeend',
  '<style>body{padding:0!important;overflow:hidden}header,.actions,.stats,.vset,.controls,.made-with,.zchip,.toast,.lgd,.mcap,#readout{display:none!important}'
  + '.stage{max-width:none!important}#fig{margin:0!important;max-width:none!important;max-height:none!important}</style>');
