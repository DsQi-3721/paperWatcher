/* Colorfigures engine for Paper Watcher's desk scene: projection, shapes, shading, ink, shadows.
   An ES-module port of .claude/skills/colorfigures/assets/core.js without the page shell: the scene (src/scene/scene.ts)
   owns the camera, framing, ink scale and rendering. Mutable state (camera, origin, ink scale, light) is changed only
   through setCam / setOrigin / setInk / setLight / setClipPrefix; importers read the live bindings. */
/* ---------- palettes ---------- */
export const PALS = {
  mustard: { l:'#f4b829', m:'#d49c1f', d:'#4e4a18' },
  tomato:  { l:'#ef6a4c', m:'#cf5038', d:'#4a2219' },
  mint:    { l:'#93d3b0', m:'#71b693', d:'#1f4034' },
  cobalt:  { l:'#76a0e2', m:'#5a82c6', d:'#1c2948' },
  blush:   { l:'#f3a6bb', m:'#d8869c', d:'#4b2430' },
};
export const METAL   = { l:'#eef0f0', m:'#c6ccce', d:'#8f989b' };
export const CLEAR   = { l:'#e4f2f4', m:'#c4dfe4', d:'#97b9c0' };
export const CERAMIC = { l:'#fbfaf3', m:'#e3e0d2', d:'#bdb8a6' };
export const DARK    = { l:'#55504a', m:'#3d3935', d:'#272421' };
export const INK = '#231e16';
export const SHADOW = '#41538f';

/* ---------- projection (x = depth toward viewer-right, y = toward viewer-left, z = up) ---------- */
export const C = Math.cos(Math.PI/6), S = Math.sin(Math.PI/6);
export let OX = 0, OY = 0;
/* Free orthographic camera (internal names start with CAM_ / cam so they never clash with a figure's own names). YAW turns the viewer around the vertical axis (45° = the classic front-left view),
   PITCH is how far it looks down (35.26° = true isometric). At the defaults P() is exactly the old isometric
   projection, so every figure drawn for it still lines up. Drag the figure to orbit; double-click to reset.
   rotV(n) maps a world direction into the default view's frame, so vis / tone / any "sum of rotV > 0" test keep
   working at every angle: the viewer is always (1,1,1) and the light stays put relative to the viewer. */
export let VIEW = 0, RC = [0, 0], RCZ = 0;
export const VIEW_NAMES = ['front', 'left side', 'back', 'right side'];
export const TURNS = [0, 2];
export const YAW0 = 45, PITCH0 = Math.atan(1/Math.SQRT2) * 180/Math.PI, CAM_K = Math.sqrt(1.5);
export let YAW = YAW0, PITCH = PITCH0, CAM_R, CAM_U, CAM_V, CAM_D;                       // right, up, toward viewer, screen-down
export const camBasis = (yaw, pitch) => { const t = yaw*Math.PI/180, p = pitch*Math.PI/180, ct = Math.cos(t), st = Math.sin(t), cp = Math.cos(p), sp2 = Math.sin(p);
  return { R:[st,-ct,0], U:[-sp2*ct,-sp2*st,cp], V:[cp*ct,cp*st,sp2] }; };
export const CAM_B0 = camBasis(YAW0, PITCH0);
// CAM_LIM: how far (deg) the camera may turn either side of the front view; null = all the way round (set per figure)
export let CAM_LIM = null;
export function setCam(yaw, pitch){ YAW = yaw; PITCH = Math.max(2, Math.min(89.9, pitch));
  const b = camBasis(YAW, PITCH); CAM_R = b.R; CAM_U = b.U; CAM_V = b.V; CAM_D = CAM_U.map(v => -v); }
setCam(YAW0, PITCH0);
export const camDot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const rotV = n => { const r = camDot(n,CAM_R), u = camDot(n,CAM_U), v = camDot(n,CAM_V), R0 = CAM_B0.R, U0 = CAM_B0.U, V0 = CAM_B0.V;
  return [R0[0]*r + U0[0]*u + V0[0]*v, R0[1]*r + U0[1]*u + V0[1]*v, R0[2]*r + U0[2]*u + V0[2]*v]; };
// the light's ground direction turns with the viewer's yaw only (shadows always fall toward the lower left of the screen)
export const yawTurn = ([x,y]) => { const t = (YAW - YAW0)*Math.PI/180, c = Math.cos(t), s = Math.sin(t); return [x*c - y*s, x*s + y*c]; };
export const rotXY = (x,y) => [x, y];                                                // kept for old callers
export const P0 = (x,y,z) => [(x-y)*C + OX, (x+y)*S - z + OY];                       // raw iso
export const P  = (x,y,z) => { const q = [x-RC[0], y-RC[1], z-RCZ];
  return [CAM_K*camDot(q,CAM_R) + (RC[0]-RC[1])*C + OX, CAM_K*camDot(q,CAM_D) + (RC[0]+RC[1])*S - RCZ + OY]; };
export const Dv = (x,y,z) => [CAM_K*camDot([x,y,z],CAM_R), CAM_K*camDot([x,y,z],CAM_D)];
// distance toward the viewer: draw parts with smaller depth first
export const depthOf = p => camDot(p, CAM_V);
// sort [{at:[x,y,z], svg}] back-to-front for the current camera. A part may also give box:[[x0,y0,z0],[x1,y1,z1]]:
// when two boxes are separated along x, y or z, the one on the viewer's side goes last (a centre point alone gets long
// or wrapping parts wrong: a pole beside a row of keys, a spout reaching past a cup).
export const boxMid = b => [0,1,2].map(k => (b[0][k] + b[1][k]) / 2);
export const sepOrder = (p, q) => { if (!p.box || !q.box) return 0;
  for (let k = 0; k < 3; k++){ if (p.box[1][k] <= q.box[0][k] + 1e-6) return CAM_V[k] >= 0 ? -1 : 1; if (q.box[1][k] <= p.box[0][k] + 1e-6) return CAM_V[k] >= 0 ? 1 : -1; }
  return 0; };
export const byDepth = parts => { const ps = parts.filter(Boolean), d = new Map(ps.map(p => [p, depthOf(p.at || boxMid(p.box))]));
  return ps.sort((p,q) => sepOrder(p,q) || (d.get(p) - d.get(q))).map(p => p.svg).join(''); };
// the half of a vertical ring that faces the viewer / is turned away, as [from, to] angles in degrees (0 = +x, 90 = +y)
export const nearHalf = () => [YAW - 90, YAW + 90], farHalf = () => [YAW + 90, YAW + 270];
// an open container (cup, bin, cone, drum) between two rings: far inner wall, then its contents, then the near outer wall
export const openShell = (A, B, colour, contents = '') => loft(A, B, colour, true) + contents + loft(A, B, colour);
/* Level of detail for round things: the scene lowers it when the whole desk is in view (a pen 100 px long needs no
   24-sided barrel) and raises it as the camera comes closer. It depends on the zoom only, never on whether the camera
   is moving, so a moving desk looks like a still one. Only used where a helper makes and uses its own rings. */
export let LOD = 1;
export function setLod(k){ LOD = k; }
export const lodN = n => n >= 12 ? Math.max(10, Math.round(n*LOD)) : n;
// coordinates are written to PREC (10: one decimal; 1: whole units, when the whole desk is in view and a unit is
// smaller than a pixel); no trailing zeros, so the drawing is short to write and to parse
export let PREC = 10;
export function setPrec(k){ PREC = k; }
export const f  = v => '' + Math.round(v*PREC)/PREC;
// REC: while set (by the scene), every 3D point drawn through pd() widens this box: the object's true bounds
// (points lower than REC_Z — marks lying flat on paper — are left out)
// (points lower than REC_Z, or that REC_SKIP says lie flat on something, are left out)
export let REC = null, REC_Z = -Infinity, REC_SKIP = null;
export function setRec(r, zmin = -Infinity, skip = null){ REC = r; REC_Z = zmin; REC_SKIP = skip; }
export const pd = (pts, close=true) => { if (REC) for (const p of pts){ if (p[2] < REC_Z || (REC_SKIP && REC_SKIP(p))) continue; if (p[0] < REC[0][0]) REC[0][0] = p[0]; if (p[1] < REC[0][1]) REC[0][1] = p[1]; if (p[2] < REC[0][2]) REC[0][2] = p[2];
    if (p[0] > REC[1][0]) REC[1][0] = p[0]; if (p[1] > REC[1][1]) REC[1][1] = p[1]; if (p[2] > REC[1][2]) REC[1][2] = p[2]; }
  // P() inlined: this runs for every point of every path, every frame. The first point is written where it is, the
  // rest as steps from the one before (rounded first, so the steps add up exactly): a quarter less to write and parse
  const R = CAM_R, D = CAM_D, K = CAM_K, rx = RC[0], ry = RC[1], rz = RCZ, k = PREC;
  const ox = (rx - ry)*C + OX, oy = (rx + ry)*S - rz + OY;
  let s = 'M', px = 0, py = 0;
  for (let i = 0; i < pts.length; i++){
    const p = pts[i], qx = p[0] - rx, qy = p[1] - ry, qz = p[2] - rz;
    const X = Math.round((K*(qx*R[0] + qy*R[1] + qz*R[2]) + ox)*k), Y = Math.round((K*(qx*D[0] + qy*D[1] + qz*D[2]) + oy)*k);
    if (!i) s += X/k + ' ' + Y/k;
    else { const dx = (X - px)/k, dy = (Y - py)/k; s += (i === 1 ? 'l' : dx < 0 ? '' : ' ') + dx + (dy < 0 ? '' : ' ') + dy; }
    px = X; py = Y;
  }
  return close ? s + 'Z' : s; };
export const sp = pts => 'M' + pts.map(q => f(q[0])+' '+f(q[1])).join('L') + 'Z';

/* ---------- 2D shapes in a plane's (u,v) coords (v up), mapped to 3D by a plane ---------- */
export const arcUV  = (cu,cv,r,a0,a1,n=7) => { const o=[]; for (let i=0;i<=n;i++){ const a=(a0+(a1-a0)*i/n)*Math.PI/180; o.push([cu+r*Math.cos(a), cv+r*Math.sin(a)]); } return o; };
export const rrUV   = (u0,v0,u1,v1,r,n=7) => r <= 0 ? rectUV(u0,v0,u1,v1) : [...arcUV(u1-r,v0+r,r,-90,0,n), ...arcUV(u1-r,v1-r,r,0,90,n), ...arcUV(u0+r,v1-r,r,90,180,n), ...arcUV(u0+r,v0+r,r,180,270,n)];
export const rectUV = (u0,v0,u1,v1) => [[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
export const ellUV  = (cu,cv,ru,rv,n=24) => Array.from({length:n}, (_,i) => { const a=i/n*2*Math.PI; return [cu+ru*Math.cos(a), cv+rv*Math.sin(a)]; });
export const PX = x => ([u,v]) => [x,u,v];      // front-facing plane x = const   (u = y, v = z)
export const PY = y => ([u,v]) => [u,y,v];      // side plane y = const           (u = x, v = z)
export const PZ = z => ([u,v]) => [u,v,z];      // horizontal plane z = const     (u = x, v = y)
export const on = (plane, uv) => uv.map(plane);

/* ---------- vectors + shading ---------- */
export const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const norm=a=>{ if (a.length === 3){ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; } const l=Math.hypot(...a)||1; return a.map(v=>v/l); };
export const avg=ps=>{ const n=ps.length; let x=0,y=0,z=0; for (const p of ps){ x+=p[0]/n; y+=p[1]/n; z+=p[2]/n; } return [x,y,z]; };
export const vis = n => { const r = rotV(n); return r[0]+r[1]+r[2] > 1e-6; };   // viewer looks from (+1,+1,+1) after the turn
export const facing = vis;                                                       // readable alias: is this face toward the viewer?
export const SHADOW_K = 0.85, AZ_MIN = 20, AZ_MAX = 160;
// cast shadows are drawn shorter than the shading light implies (0.45 × height instead of 0.85 ×): long shadows of tall
// parts on thin supports (a lamp shade, a fan head) land far from the object and read as separate blobs
export const SHADOW_LEN = 0.45;
export let L = [0,0,1], SH = [0,0];
export function setLight(deg){ const a=deg*Math.PI/180; SH=[SHADOW_K*Math.cos(a), SHADOW_K*Math.sin(a)]; L=norm([-SH[0],-SH[1],1]); }
export const LIN = norm([.6,.2,1]);                       // fixed light for interiors / small props
// Three flat tones, but blended across a narrow band at each step, so a face that turns past a threshold while the
// figure rotates fades between tones instead of snapping (at rest almost every face still sits on a pure tone).
export const SOFT = .18;
const smooth3 = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a)/(b - a))); return k*k*(3 - 2*k); };
export const step3 = (d, hi, lo, m) => { const ss = smooth3;
  const a = ss(hi - SOFT, hi + SOFT, d), b = ss(lo - SOFT, lo + SOFT, d);
  return a >= 1 ? m.l : b <= 0 ? m.d : a > 0 ? mix(m.m, m.l, a) : b < 1 ? mix(m.d, m.m, b) : m.m; };
export const tone  = (n,m) => step3(dot(rotV(n),L),   -.15, -.45, m);   // exterior, follows the sun
export const toneI = (n,m) => step3(dot(rotV(n),LIN),  .6,   .05, m);   // interior / props
const RGB = new Map(), rgbOf = h => { let c = RGB.get(h); if (!c){ c = [1,3,5].map(i => parseInt(h.substr(i,2),16)); RGB.set(h, c); } return c; };
const hex2 = v => (v < 16 ? '0' : '') + v.toString(16);
export const mix = (a,b,t) => { const A = rgbOf(a), B = rgbOf(b);
  return '#' + hex2(Math.round(A[0]*(1-t) + B[0]*t)) + hex2(Math.round(A[1]*(1-t) + B[1]*t)) + hex2(Math.round(A[2]*(1-t) + B[2]*t)); };
export const matOf = hex => ({ l:hex, m:mix(hex,'#000000',.16), d:mix(hex,'#000000',.42) });
export const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;

/* ---------- drawing primitives (all return SVG strings) ---------- */
// (round joins and caps are inherited from the scene's drawing group: written once instead of on every path)
export const ink   = (d,w=1.0) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}"/>`;
export const fill  = (d,c,extra='') => `<path d="${d}" fill="${c}" ${extra}/>`;
// a face's thin outline in its own colour (it closes the hairline gaps between faces); its width, .7 at the ink scale,
// is inherited from the scene's drawing group
export const face  = (d,c) => `<path d="${d}" fill="${c}" stroke="${c}"/>`;
export const shape = (pts,c,w=.9) => { const d = pd(pts); return fill(d,c) + (w ? ink(d,w) : ''); };
export const line  = (pts,w=.9) => ink(pd(pts,false),w);
// Loft between two rings of equal length (closed). colour(n) picks each strip's fill; flip = seen from inside.
// Neighbouring strips of one tone go out as one path (they are drawn one after another anyway, so nothing changes on
// screen, but the drawing is much smaller).
export function loft(A, B, colour, flip=false){
  const n=A.length, cen=avg(A.concat(B)); let s='', run='', col=null;
  for (let i=0;i<n;i++){
    const a0=A[i], a1=A[(i+1)%n], b1=B[(i+1)%n], b0=B[i];
    // the strip's normal, outward (the same sums as norm(cross(sub(a1,a0), sub(b0,a0))), without the little arrays)
    const ux=a1[0]-a0[0], uy=a1[1]-a0[1], uz=a1[2]-a0[2], vx=b0[0]-a0[0], vy=b0[1]-a0[1], vz=b0[2]-a0[2];
    const cx=uy*vz-uz*vy, cy=uz*vx-ux*vz, cz=ux*vy-uy*vx, l=Math.hypot(cx,cy,cz)||1;
    let nr = [cx/l, cy/l, cz/l];
    if (!isFinite(nr[0])) continue;
    const mx=(((a0[0]/4)+a1[0]/4)+b1[0]/4)+b0[0]/4-cen[0], my=(((a0[1]/4)+a1[1]/4)+b1[1]/4)+b0[1]/4-cen[1], mz=(((a0[2]/4)+a1[2]/4)+b1[2]/4)+b0[2]/4-cen[2];
    if (nr[0]*mx+nr[1]*my+nr[2]*mz < 0) nr = [-nr[0], -nr[1], -nr[2]];
    if (flip) nr = [-nr[0], -nr[1], -nr[2]];
    if (!vis(nr)) continue;
    const c = colour(nr);
    if (c !== col){ if (run) s += face(run, col); run = ''; col = c; }
    run += pd([a0,a1,b1,b0]);
  }
  return run ? s + face(run, col) : s;
}
export function hull(pts){
  pts = pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); const lo=[], up=[];
  for (const p of pts){ while(lo.length>=2 && cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
  for (const p of pts.reverse()){ while(up.length>=2 && cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
// Silhouette ink, weighted by how thick the part is on screen (like a hand inker): the w you pass is the most it gets.
// Thickness = 2 × area / perimeter of the outline (a rod's diameter, about half a box's width), as a share of the
// frame width. A long thin rod, a handle or a knob stays light (~1–1.5); a grinder, kettle or machine body gets the
// heavy ~2.4–2.8. Thin parts stay thin and parts keep air between them.
export const hullInk = (pts3, w=1.4) => { const h = hull(pts3.map(p=>P(...p))); let a = 0, per = 0;
  for (let i = 0; i < h.length; i++){ const p = h[i], q = h[(i+1) % h.length]; a += p[0]*q[1] - q[0]*p[1]; per += Math.hypot(q[0]-p[0], q[1]-p[1]); }
  const thick = per ? Math.abs(a) / per / (INK_K * INK_REF_VB) : 0;
  return ink(sp(h), Math.min(w, .9 + 20*thick)); };
// Axis-aligned box: three visible faces, shaded, each outlined. shade = tone (sunlit) or toneI (interior).
export function box(x0,y0,z0,x1,y1,z1,m,shade=toneI,w=.9){
  // all six faces, drawn only when they face the viewer (sides first, then top) — correct in every VIEW
  const F = [
    [[0,1,0],  [[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]]],
    [[1,0,0],  [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]]],
    [[0,-1,0], [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]]],
    [[-1,0,0], [[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]]],
    [[0,0,1],  [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]]] ];
  return F.filter(([n]) => vis(n)).map(([n,q]) => shape(q, shade(n,m), w)).join('');
}
// Rounded-profile extrusion: profile (u=y, v=z) swept along x from x0 to x1. Body of most machines.
export function extrude(profileUV, x0, x1, m, shade=tone){ return loft(on(PX(x0),profileUV), on(PX(x1),profileUV), n=>shade(n,m)); }
// Vertical cylinder (axis z) centred (x,y), radius r from z0 to z1, with top cap.
export function cyl(x,y,z0,z1,r,m,shade=toneI,w=1.2,n=24){
  n = lodN(n);
  const A=on(PZ(z0),ellUV(x,y,r,r,n)), B=on(PZ(z1),ellUV(x,y,r,r,n));
  return loft(A,B,nr=>shade(nr,m)) + fill(pd(B),shade([0,0,1],m)) + hullInk([...A,...B],w) + ink(pd(B),w*.8);
}
// Cylinder lying along x (e.g. a knob or dial sticking out of a front face): centred (y,z), from x0 to x1.
export function cylX(x0,x1,y,z,r,m,shade=toneI,w=1.1,n=20){
  n = lodN(n);
  const A=on(PX(x0),ellUV(y,z,r,r,n)), B=on(PX(x1),ellUV(y,z,r,r,n));
  // cap on whichever end faces the viewer (the +x end in VIEW 0)
  const capB = vis([1,0,0]), cap = capB ? B : A, cn = capB ? [1,0,0] : [-1,0,0];
  return loft(A,B,nr=>shade(nr,m)) + (vis(cn) ? fill(pd(cap),shade(cn,m)) : '') + hullInk([...A,...B],w) + (vis(cn) ? ink(pd(cap),w*.8) : '');
}
// Cylinder between any two 3D points a and b (a lamp arm, a rod, a pipe at an angle, a handle bar), radius r.
// The end facing the viewer gets a cap. For a tapered part (a cone, a lamp shade) pass r1 for the radius at b.
export function rod(a, b, r, m, shade=toneI, w=1, r1=r, n=16){
  n = lodN(n);
  const d = norm(sub(b, a)), u = norm(cross(d, Math.abs(d[2]) < .9 ? [0,0,1] : [1,0,0])), v = cross(d, u);
  const ring = (p, rr) => Array.from({length:n}, (_,i) => { const t = i/n*2*Math.PI, c = Math.cos(t)*rr, s2 = Math.sin(t)*rr;
    return [p[0] + u[0]*c + v[0]*s2, p[1] + u[1]*c + v[1]*s2, p[2] + u[2]*c + v[2]*s2]; });
  const A = ring(a, r), B = ring(b, r1), capB = vis(d), cap = capB ? B : A, cn = capB ? d : d.map(x => -x);
  return loft(A, B, nr => shade(nr, m)) + (Math.max(r, r1) > 0 ? fill(pd(cap), shade(cn, m)) + ink(pd(cap), w*.8) : '') + hullInk([...A, ...B], w);
}
// Text lying flat on a front plane x = const, centred at (y,z) baseline; reads left-to-right on screen.
// text sits on a face: if its reading direction comes out mirrored (or edge-on), that face is turned away, so the text is hidden
export const txM = (o, U, V) => (U[0]*V[1] - U[1]*V[0]) <= .02 * Math.hypot(...U) * Math.hypot(...V) ? `matrix(0 0 0 0 ${f(o[0])} ${f(o[1])})` : `matrix(${U[0].toFixed(4)} ${U[1].toFixed(4)} ${V[0].toFixed(4)} ${V[1].toFixed(4)} ${f(o[0])} ${f(o[1])})`;
// Text too small to read at this zoom is left out (the scene sets TEXT_MIN, in SVG units, each render): it would
// only cost the browser shaping glyphs nobody can see. readable(size, U, V): is a text this big, set on these
// projected axes, at least that tall on screen?
export let TEXT_MIN = 0;
export function setTextMin(k){ TEXT_MIN = k; }
export const readable = (size, U, V) => !TEXT_MIN || size*Math.min(Math.hypot(U[0], U[1]), Math.hypot(V[0], V[1])) >= TEXT_MIN;
export const tx = (x,y,z,str,size,col=INK,weight=700) => { const o=P(x,y,z), U = Dv(0,-1,0), V = Dv(0,0,-1);
  if (!readable(size, U, V)) return '';
  return `<text transform="${txM(o, U, V)}" font-size="${size}" fill="${col}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="${weight}" letter-spacing=".04em">${str}</text>`; };
// Text on a side plane y = const, centred at (x,z).
export const txY = (x,y,z,str,size,col=INK,weight=700) => { const o=P(x,y,z), U = Dv(1,0,0), V = Dv(0,0,-1);
  if (!readable(size, U, V)) return '';
  return `<text transform="${txM(o, U, V)}" font-size="${size}" fill="${col}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="${weight}" letter-spacing=".04em">${str}</text>`; };
// Cast shadow of a set of 3D points (any outline of the object), pushed along the light onto z = 0.
// the light stays put relative to the viewer, so the shadow is cast in turned coordinates
// z0: the surface it falls on (a board, a counter); clip it to that surface with clipTo(...) if it could spill off.
// clip: the 3D outline of the surface it falls on (e.g. boardTop(...)), so it can't spill over the edge.
export const castShadow = (pts3, z0=0, clip=null) => { const k = SHADOW_LEN / SHADOW_K, [sx, sy] = yawTurn(SH);
  const s = fill(sp(hull(pts3.map(([x,y,z]) => P(x+(z-z0)*sx*k, y+(z-z0)*sy*k, z0)))), SHADOW);
  return clip ? clipTo(clip, s) : s; };
// A board for the object to stand on (a tray, a desk top, a counter): a rounded slab from (x0,y0) to (x1,y1), h thick.
// Draw it first; then castShadow(points, h, boardTop(x0,y0,x1,y1,h,r)) so shadows lie on it and stop at its edge.
export const BOARD = { l:'#e6e1d4', m:'#cfc8b8', d:'#aaa293' }, WOOD = { l:'#d9a86c', m:'#bf8a4f', d:'#8e6236' };
export const boardTop = (x0,y0,x1,y1,h=3,r=5) => on(PZ(h), rrUV(x0,y0,x1,y1,r));
export function board(x0,y0,x1,y1,h=3,r=5,m=BOARD){
  const A = on(PZ(0), rrUV(x0,y0,x1,y1,r)), B = boardTop(x0,y0,x1,y1,h,r);
  return loft(A, B, n => toneI(n, m)) + fill(pd(B), m.l) + ink(pd(B), 1) + hullInk([...A, ...B], 1.8);
}
// Group helpers: clickable target, clip to an opening.
export const act  = (name, inner, data='') => `<g data-act="${name}" ${data}>${inner}</g>`;
export let _clipN = 0, CLIP_PFX = 'k';
export function setClipPrefix(p){ CLIP_PFX = p; _clipN = 0; }
export const clipTo = (pts3, inner) => { const id = CLIP_PFX + (++_clipN); return `<clipPath id="${id}"><path d="${pd(pts3)}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`; };

/* ---------- constant on-screen line weight ----------
   Stroke widths are written in model units, and each figure is zoomed to fill the frame, so a small
   object would get fat lines. INK_K rescales every stroke-width (and the wobble/grain filter) so all
   figures match the reference zoom of the booth / vending machine (viewBox ≈ 585 units wide). */
export const INK_REF_VB = 585;
export let INK_K = 1;
export function setInk(k){ INK_K = k; }
// where the drawing sits: screen offset (OX, OY) and the point the camera turns round (RC, RCZ)
export function setOrigin(ox, oy, rc = RC, rcz = RCZ){ OX = ox; OY = oy; RC = rc; RCZ = rcz; }
export const inkScale = svg => INK_K === 1 ? svg : svg.replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${(+w * INK_K).toFixed(2)}"`);
// Lines drawn one right after another with the same pen (outlines only: no fill, nothing see-through) become one
// path, and a filled shape followed at once by its own outline in ink becomes one path filled and stroked (a path is
// filled, then stroked: the same picture), so there are fewer elements for the browser to build, style and lay out
// every frame. One pass.
const FILL_ONLY = /^\s*fill="[^"]+"(?:\s+fill-(?:opacity|rule)="[^"]+")*\s*$/, INK_ONLY = /^(?:\s+(?:fill="none"|stroke(?:-width|-linecap|-linejoin|-dasharray|-opacity)?="[^"]+"))+\s*$/;
export function mergeLines(svg){
  let out = '', i = 0, runD = '', runA = null;
  const flush = () => { if (runA !== null){ out += '<path d="' + runD + '"' + runA + '/>'; runA = null; runD = ''; } };
  for (;;){
    const j = svg.indexOf('<path d="', i);
    if (j < 0){ flush(); out += svg.slice(i); return out; }
    if (j > i){ flush(); out += svg.slice(i, j); }
    const dEnd = svg.indexOf('"', j + 9), gt = svg.indexOf('>', dEnd);
    if (dEnd < 0 || gt < 0){ flush(); out += svg.slice(j); return out; }
    const attrs = svg.slice(dEnd + 1, gt - 1);
    if (svg[gt - 1] !== '/'){ flush(); out += svg.slice(j, gt + 1); i = gt + 1; continue; }
    const line = attrs.indexOf('fill="none"') >= 0 && attrs.indexOf('opacity') < 0 && attrs.indexOf('dasharray') < 0;
    if (!line){
      // a fill, and right after it the same outline in ink: one path
      const dl = dEnd - j - 9, k = gt + 1;
      if (svg.startsWith('<path d="', k) && svg[k + 9 + dl] === '"' && svg.startsWith(svg.slice(j + 9, dEnd), k + 9) && FILL_ONLY.test(attrs)){
        const gt2 = svg.indexOf('>', k + 10 + dl), a2 = gt2 > 0 ? svg.slice(k + 10 + dl, gt2 - 1) : '';
        if (gt2 > 0 && svg[gt2 - 1] === '/' && INK_ONLY.test(a2) && a2.indexOf('fill="none"') >= 0 && a2.indexOf('stroke="') >= 0){
          flush(); out += svg.slice(j, dEnd + 1) + ' ' + attrs.trim() + a2.replace(' fill="none"', '') + '/>'; i = gt2 + 1; continue;
        }
      }
      flush(); out += svg.slice(j, gt + 1); i = gt + 1; continue;
    }
    const d = svg.slice(j + 9, dEnd);
    if (runA !== null && attrs === runA) runD += d; else { flush(); runA = attrs; runD = d; }
    i = gt + 1;
  }
}


export const filterFor = k => `<filter id="hand" x="-3%" y="-3%" width="106%" height="106%" color-interpolation-filters="sRGB">
  <feTurbulence type="fractalNoise" baseFrequency="${(0.045/k).toFixed(4)}" numOctaves="2" seed="4" result="warp"/>
  <feDisplacementMap id="wob" in="SourceGraphic" in2="warp" scale="${(2.4*k).toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="wob"/>
  <feTurbulence type="fractalNoise" baseFrequency="${(0.9/k).toFixed(4)}" numOctaves="3" seed="11" result="n1"/>
  <feColorMatrix in="n1" type="matrix" values=".3 0 0 0 .84  .3 0 0 0 .84  .3 0 0 0 .84  0 0 0 0 1" result="grain"/>
  <feTurbulence type="fractalNoise" baseFrequency="${(0.012/k).toFixed(4)}" numOctaves="2" seed="7" result="n2"/>
  <feColorMatrix in="n2" type="matrix" values=".3 0 0 0 .85  .3 0 0 0 .85  .3 0 0 0 .85  0 0 0 0 1" result="blot"/>
  <feBlend in="wob" in2="grain" mode="multiply" result="g1"/><feBlend in="g1" in2="blot" mode="multiply" result="g2"/>
  <feComposite in="g2" in2="wob" operator="in"/></filter>`;

