// What lies behind the desk on the home page (switchable in the desk settings). The desk is the picture; a backdrop
// only sets a mood round it: quiet colours, nothing that pulls the eye, in the same hand-inked flat-colour look as the
// stationery. A backdrop is a full-screen layer behind the scene's SVG, drawn once for a screen size (plain SVG and
// CSS); while the desk turns it may shift its layers a little (transforms only: cheap), and with motion on it may
// drift gently (CSS animations on transforms / opacity, so they stay off the main thread). While a paper is read the
// layer is hidden (the close desk fills the screen) and its animations stop.
//
// Everything that moves is its own small HTML box (an <svg> inside a <div>) so the browser can move it on the
// compositor; the still art of a design is one SVG. Interest sits toward the edges and corners: the middle of the
// screen is where the desk is.

export interface Backdrop {
  id: string;
  /** shown in the settings card */
  name: string;
  /** the colour behind everything (the page shows it while the layer is built) */
  base: string;
  /** a dark backdrop: the corner pills keep their cream cards, but text drawn straight on it must be light */
  dark?: boolean;
  /** Draw into el (empty, sized w x h css px). motion: gentle CSS animation is allowed. */
  build(el: HTMLElement, w: number, h: number, motion: boolean): void;
  /** The camera turned or tilted (yaw, pitch in degrees): shift layers for a little parallax (transforms only). */
  view?(el: HTMLElement, yaw: number, pitch: number): void;
  /** A small picture of it for the settings card: an SVG string with viewBox 0 0 120 72. */
  thumb(): string;
}

/* ---------- drawing helpers ---------- */
const INK = '#231e16';
type Pt = [number, number];
type Rand = () => number;
const n1 = (v: number) => String(Math.round(v * 10) / 10);
/** seeded random numbers in [0, 1) */
function rng(seed: number): Rand { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;
const poly = (pts: Pt[], close = false) => 'M' + pts.map((p) => `${n1(p[0])} ${n1(p[1])}`).join('L') + (close ? 'Z' : '');
/** A smooth line through the points (Catmull-Rom as cubic Béziers); closed: back round to the first. */
function smooth(pts: Pt[], close = false): string {
  const n = pts.length;
  if (n < 3) return poly(pts, close);
  const at = (i: number) => (close ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += `C${n1(p1[0] + (p2[0] - p0[0]) / 6)} ${n1(p1[1] + (p2[1] - p0[1]) / 6)} ${n1(p2[0] - (p3[0] - p1[0]) / 6)} ${n1(p2[1] - (p3[1] - p1[1]) / 6)} ${n1(p2[0])} ${n1(p2[1])}`;
  }
  return d + (close ? 'Z' : '');
}
/** the points nudged a little each way: a hand-drawn line never runs quite straight */
const wob = (pts: Pt[], a: number, r: Rand): Pt[] => pts.map(([x, y]) => [x + (r() - 0.5) * 2 * a, y + (r() - 0.5) * 2 * a]);
/** n points round a wobbly ellipse, turned by rot (rad) */
function ring(cx: number, cy: number, rx: number, ry: number, n: number, wobble: number, r: Rand, rot = 0): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * TAU, k = 1 + (r() - 0.5) * 2 * wobble, x = Math.cos(t) * rx * k, y = Math.sin(t) * ry * k;
    return [cx + x * c - y * s, cy + x * s + y * c] as Pt;
  });
}
/** a hand-drawn stroke from a to b (a couple of gentle bends) */
function hand(a: Pt, b: Pt, r: Rand, wobble = 1, n = 3): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, e = i && i < n ? wobble : 0; pts.push([lerp(a[0], b[0], t) + (r() - 0.5) * 2 * e, lerp(a[1], b[1], t) + (r() - 0.5) * 2 * e]); }
  return smooth(pts);
}
const qb = (a: Pt, c: Pt, b: Pt, t: number): Pt => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
/** an almond leaf from its stem at p, pointing along ang (rad), length L */
function leaf(p: Pt, ang: number, L: number, r: Rand): string {
  const c = Math.cos(ang), s = Math.sin(ang), wv = L * (0.32 + r() * 0.12), bend = (r() - 0.5) * 0.3 * L;
  const at = (u: number, v: number): Pt => [p[0] + u * c - v * s, p[1] + u * s + v * c];
  const a = at(0, 0), b = at(L, bend), c1 = at(L * 0.3, wv), c2 = at(L * 0.78, wv * 0.8 + bend), c3 = at(L * 0.78, -wv * 0.8 + bend), c4 = at(L * 0.3, -wv);
  return `M${n1(a[0])} ${n1(a[1])}C${n1(c1[0])} ${n1(c1[1])} ${n1(c2[0])} ${n1(c2[1])} ${n1(b[0])} ${n1(b[1])}C${n1(c3[0])} ${n1(c3[1])} ${n1(c4[0])} ${n1(c4[1])} ${n1(a[0])} ${n1(a[1])}Z`;
}

/* ---------- boxes in the layer ---------- */
const NS = 'http://www.w3.org/2000/svg';
const svgOf = (w: number, h: number, inner: string, extra = '') =>
  `<svg xmlns="${NS}" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}" ${extra}>${inner}</svg>`;
/** a box in the layer (absolutely placed by css), holding html (usually one svg) */
function put(parent: HTMLElement, css: string, html = '', cls = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = 'bd' + (cls ? ' ' + cls : '');
  d.style.cssText = css;
  if (html) d.innerHTML = html;
  parent.append(d);
  return d;
}
/** an animated box: css keyframes by class name, timing through css variables */
function anim(parent: HTMLElement, motion: boolean, kind: string, css: string, vars: Record<string, string | number>, html: string) {
  const v = Object.entries(vars).map(([k, x]) => `--${k}:${x};`).join('');
  return put(parent, css + v, html, motion ? `bd-anim bd-${kind}` : '');
}

/* ---------- following the camera ---------- */
// Layers shift a little as the desk turns (the far side of the desk moves the way they do) and tilts (looking down
// more lifts the horizon); a panorama slides all the way round, wrapping seamlessly.
interface Px { el: HTMLElement; ax: number; ay: number; pan?: { P: number; n: number } }
const PX = new WeakMap<HTMLElement, Px[]>();
function fresh(el: HTMLElement) { PX.set(el, []); el.replaceChildren(); }
function px<T extends HTMLElement>(root: HTMLElement, layer: T, ax: number, ay: number, pan?: Px['pan']): T {
  layer.classList.add('bd-px');
  PX.get(root)!.push({ el: layer, ax, ay, pan });
  return layer;
}
/** a full-screen box that moves with the camera, for things placed inside it */
const pxBox = (root: HTMLElement, ax: number, ay: number) => px(root, put(root, 'inset:0;'), ax, ay);
const wrap180 = (d: number) => (((d % 360) + 540) % 360) - 180;
function parallax(el: HTMLElement, yaw: number, pitch: number) {
  const L = PX.get(el);
  if (!L) return;
  const sy = Math.sin((wrap180(yaw - 16) * Math.PI) / 180), tp = (pitch - 44) / 46;
  for (const l of L) {
    let x = -l.ax * sy;
    if (l.pan) { const P = l.pan.P; x = -((((yaw / 360) * P * l.pan.n) % P) + P) % P; }
    l.el.style.transform = `translate3d(${x.toFixed(1)}px,${(-l.ay * tp).toFixed(1)}px,0)`;
  }
}

/* ============================================================ 素色 ============================================================ */
const plain: Backdrop = {
  id: 'plain',
  name: '素色',
  base: '#f2efe7',
  build(el, w, h) {
    fresh(el);
    el.style.background = 'radial-gradient(ellipse 120% 100% at 50% 42%, #f7f4ed 0%, #f2efe7 55%, #e7e1d3 100%)';
    // paper fibres, very faint
    const r = rng(3);
    let d = '';
    for (let i = 0, n = Math.round((w * h) / 8000); i < n; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI, l = 3 + r() * 10;
      d += `M${n1(x)} ${n1(y)}q${n1(Math.cos(a) * l * 0.5 + (r() - 0.5) * 2)} ${n1(Math.sin(a) * l * 0.5 + (r() - 0.5) * 2)} ${n1(Math.cos(a) * l)} ${n1(Math.sin(a) * l)}`;
    }
    px(el, put(el, 'inset:0;', svgOf(w, h, `<path d="${d}" fill="none" stroke="#b3a68b" stroke-width=".7" stroke-linecap="round" opacity=".2"/>`)), 6, 4);
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><defs><radialGradient id="tpl" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#f8f5ee"/><stop offset=".6" stop-color="#f2efe7"/><stop offset="1" stop-color="#e3dccb"/></radialGradient></defs><rect width="120" height="72" fill="url(#tpl)"/><path d="M14 18q3 1 6 0M88 12q2 2 5 1M30 54q3-1 5 1M96 50q2 1 4 0M60 30q3 1 5 0" stroke="#b3a68b" stroke-width=".8" fill="none" opacity=".6"/></svg>`,
};

/* ========================================================== 午后阳光 ========================================================== */
// An afternoon wall: two windows' light falling across it at a slant, the frames' shadows between the panes, the
// shadow of a tree's branches swaying over it, dust drifting in the light.
function branchShadow(W: number, H: number, from: Pt, to: Pt, r: Rand, col: string) {
  const mid: Pt = [lerp(from[0], to[0], 0.5) + (r() - 0.5) * W * 0.18, lerp(from[1], to[1], 0.5) + (r() - 0.5) * H * 0.18];
  const S = Math.min(W, H);
  let wood = '', leaves = '';
  // the branch, thick at the trunk end
  for (let k = 0; k < 3; k++) {
    const t0 = k / 3, t1 = (k + 1) / 3, pts: Pt[] = [];
    for (let i = 0; i <= 6; i++) pts.push(qb(from, mid, to, lerp(t0, t1, i / 6)));
    wood += `<path d="${smooth(wob(pts, 1.2, r))}" stroke-width="${n1(S * (0.03 - k * 0.009))}"/>`;
  }
  // twigs off it, alternating sides, each with leaves; more leaves toward the tip
  for (let k = 0; k < 8; k++) {
    const t = 0.16 + (0.78 * k) / 8 + (r() - 0.5) * 0.05, p = qb(from, mid, to, t), q = qb(from, mid, to, t + 0.01);
    const dir = Math.atan2(q[1] - p[1], q[0] - p[0]), side = k % 2 ? 1 : -1, ang = dir + side * (0.55 + r() * 0.5);
    const len = S * (0.13 + r() * 0.09) * (1 - t * 0.35), end: Pt = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len];
    const bend: Pt = [lerp(p[0], end[0], 0.5) + Math.cos(ang + side * 1.57) * len * 0.12, lerp(p[1], end[1], 0.5) + Math.sin(ang + side * 1.57) * len * 0.12];
    wood += `<path d="M${n1(p[0])} ${n1(p[1])}Q${n1(bend[0])} ${n1(bend[1])} ${n1(end[0])} ${n1(end[1])}" stroke-width="${n1(S * 0.007)}"/>`;
    for (let j = 0; j < 5; j++) {
      const tt = 0.3 + j * 0.17, lp = qb(p, bend, end, Math.min(1, tt)), la = ang + (j % 2 ? 1 : -1) * (0.5 + r() * 0.7);
      leaves += leaf(lp, la, S * (0.045 + r() * 0.03), r);
    }
    leaves += leaf(end, ang + (r() - 0.5) * 0.4, S * (0.05 + r() * 0.025), r);
  }
  for (let j = 0; j < 6; j++) { const p = qb(from, mid, to, 0.86 + j * 0.03); leaves += leaf(p, Math.atan2(to[1] - from[1], to[0] - from[0]) + (r() - 0.5) * 2.4, S * (0.045 + r() * 0.03), r); }
  return `<g opacity=".3"><g fill="none" stroke="${col}" stroke-linecap="round">${wood}</g><path d="${leaves}" fill="${col}"/></g>`;
}
const sunny: Backdrop = {
  id: 'sunny',
  name: '午后阳光',
  base: '#eadaba',
  build(el, w, h, motion) {
    fresh(el);
    el.style.background = 'linear-gradient(162deg, #f1e3c9 0%, #ead9ba 48%, #e0caa5 100%)';
    const r = rng(17), S = Math.min(w, h);
    // the light of two windows: a soft rim, then the panes with the frames' shadows between them
    let light = '';
    const windowLight = (ox: number, oy: number, W: number, H: number, sk: number) => {
      const U: Pt = [W, W * 0.2], V: Pt = [H * sk, H];
      const at = (a: number, b: number): Pt => [ox + U[0] * a + V[0] * b, oy + U[1] * a + V[1] * b];
      const quad = (a0: number, b0: number, a1: number, b1: number) => poly(wob([at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1)], 1.5, r), true);
      light += `<path d="${quad(-0.05, -0.04, 1.05, 1.04)}" fill="#fbf0d9" opacity=".28"/><path d="${quad(-0.02, -0.016, 1.02, 1.016)}" fill="#fcf2dd" opacity=".38"/>`;
      let panes = '';
      for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) panes += quad(i / 2 + (i ? 0.018 : 0), j / 3 + (j ? 0.014 : 0), (i + 1) / 2 - (i < 1 ? 0.018 : 0), (j + 1) / 3 - (j < 2 ? 0.014 : 0));
      light += `<path d="${panes}" fill="#fff8e8" opacity=".74"/>`;
    };
    windowLight(-0.06 * w, -0.08 * h, 0.4 * w, 0.66 * h, 0.4);
    windowLight(0.62 * w, 0.4 * h, 0.34 * w, 0.62 * h, 0.4);
    px(el, put(el, 'inset:0;', svgOf(w, h, light)), 12, 8);
    // the branches' shadows, swaying slowly from the corners
    const tr = pxBox(el, 20, 12), W1 = 0.46 * w, H1 = 0.52 * h;
    anim(tr, motion, 'sway', `right:-2%;top:-3%;width:${n1(W1)}px;height:${n1(H1)}px;transform-origin:100% 0;`, { a: '1.3deg', dur: '8.5s', delay: '-3s' },
      svgOf(W1, H1, branchShadow(W1, H1, [W1 + 6, -6], [W1 * 0.16, H1 * 0.84], rng(5), '#9c8058')));
    const bl = pxBox(el, 24, 14), W2 = 0.34 * w, H2 = 0.42 * h;
    anim(bl, motion, 'sway', `left:-2%;bottom:-2%;width:${n1(W2)}px;height:${n1(H2)}px;transform-origin:0 100%;`, { a: '1deg', dur: '10.5s', delay: '-6s' },
      svgOf(W2, H2, branchShadow(W2, H2, [-6, H2 + 6], [W2 * 0.88, H2 * 0.22], rng(9), '#9c8058')));
    // dust in the light
    if (motion) {
      const motes = (n: number, R: number) => { let s = ''; for (let i = 0; i < n; i++) s += `<circle cx="${n1(R + (r() - 0.5) * R * 1.6)}" cy="${n1(R + (r() - 0.5) * R * 1.6)}" r="${n1(0.8 + r() * 1.6)}"/>`; return svgOf(R * 2, R * 2, `<g fill="#fffdf5" stroke="#c9ad7e" stroke-width=".4" stroke-opacity=".5">${s}</g>`); };
      const R = S * 0.11;
      for (const [x, y, mx, my, dur] of [[0.1, 0.18, 26, -44, 19], [0.24, 0.4, -20, -36, 23], [0.76, 0.66, 30, -40, 21]] as const)
        anim(el, motion, 'mote', `left:${x * 100}%;top:${y * 100}%;`, { mx: `${mx}px`, my: `${my}px`, dur: `${dur}s`, delay: `-${Math.round(dur * r())}s`, lo: 0.15, hi: 0.85 }, motes(6, R));
    }
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><rect width="120" height="72" fill="#e9d8b9"/><g fill="#fff8e8" opacity=".85"><path d="M-2 -4L22 1 34 34 10 29Z"/><path d="M24 2L46 6 58 39 36 35Z"/><path d="M76 34L98 38 110 70 88 66Z"/></g><g stroke="#e9d8b9" stroke-width="2"><path d="M2 12L28 17M6 22L31 27M80 46L104 50M84 56L107 60"/></g><g fill="#9c8058" opacity=".32"><path d="M120 0Q96 10 84 26" stroke="#9c8058" stroke-width="2" fill="none"/><ellipse cx="104" cy="6" rx="6" ry="2.4" transform="rotate(-30 104 6)"/><ellipse cx="96" cy="14" rx="6" ry="2.4" transform="rotate(40 96 14)"/><ellipse cx="88" cy="22" rx="5" ry="2.2" transform="rotate(-20 88 22)"/><ellipse cx="110" cy="14" rx="5" ry="2" transform="rotate(60 110 14)"/><ellipse cx="92" cy="30" rx="5" ry="2" transform="rotate(10 92 30)"/></g></svg>`,
};

/* ============================================================ 云上 ============================================================ */
// The desk floats in a pale sky: flat clouds at three depths drift past (the near ones bigger, faster), and now and
// then a paper plane folded from a test sheet glides by along a dashed trail.
function cloud(cx: number, base: number, cw: number, ch: number, r: Rand) {
  // bumps along the top; the two end ones sit on the base line, so the ends come down round onto the flat bottom
  const k = 3 + Math.floor(r() * 3), left = cx - cw / 2, right = cx + cw / 2, bumps: Array<{ x: number; y: number; rr: number }> = [];
  const r0 = ch * (0.3 + r() * 0.08), r1 = ch * (0.28 + r() * 0.08);
  bumps.push({ x: left + r0, y: base, rr: r0 }, { x: right - r1, y: base, rr: r1 });
  for (let i = 0; i < k; i++) {
    const t = (i + 0.5) / k, rr = ch * (0.32 + 0.3 * Math.sin(Math.PI * t)) * (0.9 + r() * 0.22);
    bumps.push({ x: lerp(left + r0 * 1.2, right - r1 * 1.2, t) + (r() - 0.5) * cw * 0.05, y: base - ch * (0.2 + 0.46 * Math.sin(Math.PI * t)) * (0.85 + r() * 0.3) + rr * 0.3, rr });
  }
  const env = (x: number) => { let y = base; for (const b of bumps) { const dx = x - b.x; if (Math.abs(dx) < b.rr) y = Math.min(y, b.y - Math.sqrt(b.rr * b.rr - dx * dx)); } return y; };
  const top: Pt[] = [], shade: Pt[] = [], shadeLine = base - ch * 0.24;
  // samples closer together toward the ends, where the outline turns down onto the base
  for (let i = 0; i <= 48; i++) { const x = left + (cw * (1 - Math.cos((Math.PI * i) / 48))) / 2, y = env(x); top.push([x, y]); shade.push([x, Math.max(y, shadeLine + Math.sin(x * 0.045) * ch * 0.035)]); }
  // a flat bottom closes each (a straight Z back along the base line)
  return { outline: smooth(top) + 'Z', shade: smooth(shade) + 'Z' };
}
function cloudStrip(P: number, M: number, H: number, n: number, size: [number, number], bands: Array<[number, number]>, seed: number, op: number, ink: number) {
  const r = rng(seed);
  let s = '';
  for (let i = 0; i < n; i++) {
    const [b0, b1] = bands[i % bands.length], cw = lerp(size[0], size[1], r()), ch = cw * (0.3 + r() * 0.1);
    const x = ((i + r() * 0.6) / n) * P, base = lerp(b0, b1, r()) * H;
    const c = cloud(0, base, cw, ch, r);
    for (const dx of [x + M, x + M + P]) s += `<g transform="translate(${n1(dx)} 0)"><path d="${c.outline}" fill="#fcfdfb"/><path d="${c.shade}" fill="#dde9ee"/><path d="${c.outline}" fill="none" stroke="#3f4f60" stroke-width="1.3" stroke-linejoin="round" opacity="${ink}"/></g>`;
  }
  return `<g opacity="${op}">${s}</g>`;
}
function paperPlane() {
  // a dart folded from a test sheet (a rule line and a red tick still on the wing), flying right, its dashed trail behind
  return svgOf(270, 80, `<path d="M0 50C46 70 96 76 140 56S196 36 210 36" fill="none" stroke="${INK}" stroke-width="1.3" stroke-dasharray="6 7" stroke-linecap="round" opacity=".28"/>`
    + `<g stroke="${INK}" stroke-width="1.1" stroke-linejoin="round" stroke-opacity=".6"><path d="M262 34L208 14 222 36Z" fill="#ffffff"/><path d="M262 34L222 36 214 44Z" fill="#e2e8ee"/><path d="M262 34L214 44 208 56Z" fill="#cdd7df"/></g>`
    + `<path d="M216 20L248 32" stroke="#9fb6d6" stroke-width=".8"/><path d="M228 24l3 4 6-8" fill="none" stroke="#d9534a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`);
}
const sky: Backdrop = {
  id: 'sky',
  name: '云上',
  base: '#d3e7f0',
  build(el, w, h, motion) {
    fresh(el);
    el.style.background = 'radial-gradient(ellipse 60% 50% at 12% 0%, rgba(255,250,232,.55) 0%, rgba(255,250,232,0) 70%), linear-gradient(180deg, #b7d7ea 0%, #d2e7f0 44%, #ebf3ef 100%)';
    // three depths of clouds, each a seamless strip drifting left (and shifting a little as the desk turns)
    const layers: Array<{ ax: number; ay: number; n: number; size: [number, number]; bands: Array<[number, number]>; op: number; ink: number; dur: number; seed: number }> = [
      { ax: 10, ay: 6, n: 7, size: [90, 170], bands: [[0.06, 0.26], [0.64, 0.8]], op: 0.7, ink: 0.13, dur: 300, seed: 21 },
      { ax: 22, ay: 12, n: 5, size: [170, 290], bands: [[0.1, 0.3], [0.76, 0.92]], op: 0.88, ink: 0.2, dur: 190, seed: 22 },
      { ax: 40, ay: 22, n: 3, size: [320, 470], bands: [[0.98, 1.06], [0.02, 0.09]], op: 1, ink: 0.26, dur: 120, seed: 23 },
    ];
    for (const L of layers) {
      const M = L.ax + 40, P = Math.ceil(w + 2 * M + 240);
      const box = pxBox(el, L.ax, L.ay);
      anim(box, motion, 'drift', `left:${-M}px;top:0;`, { p: `${P}px`, dur: `${L.dur}s`, delay: `-${Math.round(L.dur * rng(L.seed + 7)())}s` },
        svgOf(2 * P + 2 * M, h, cloudStrip(P, M, h, L.n, L.size, L.bands, L.seed, L.op, L.ink)));
    }
    if (motion) anim(el, motion, 'plane', 'left:0;top:0;', { dur: '46s', delay: '-9s' }, paperPlane());
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><defs><linearGradient id="tsk" x2="0" y2="1"><stop offset="0" stop-color="#b7d7ea"/><stop offset="1" stop-color="#ebf3ef"/></linearGradient></defs><rect width="120" height="72" fill="url(#tsk)"/><g fill="#fcfdfb" stroke="#3f4f60" stroke-opacity=".3" stroke-width=".8"><path d="M12 22q0-7 7-7 3-6 10-4 6-3 9 4 6 0 6 7z"/><path d="M70 14q0-5 5-5 2-4 7-3 4-2 6 3 4 0 4 5z"/><path d="M62 70q0-10 10-10 4-8 14-6 9-4 13 6 9 0 9 10z"/></g><path d="M8 52q20 8 34-2" fill="none" stroke="#231e16" stroke-opacity=".3" stroke-dasharray="2.5 2.5"/><path d="M52 44l-10-4 3 5zM52 44l-7 1-2 4z" fill="#fff" stroke="#231e16" stroke-opacity=".6" stroke-width=".6"/></svg>`,
};

/* =========================================================== 草稿纸 =========================================================== */
// The desk lies on a giant sheet of graph paper: a faint blue grid, the red margin, punched holes, and pencil doodles
// in the corners from many bored lessons.
function doodles(w: number, h: number, r: Rand) {
  const S = Math.min(w, h), u = S / 900;
  let d = '';
  // a smiling sun, top right
  const sx = w * 0.9, sy = h * 0.15, sr = 26 * u;
  d += `<path d="${smooth(ring(sx, sy, sr, sr, 14, 0.06, r), true)}"/>`;
  for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU + 0.2; d += `<path d="${hand([sx + Math.cos(a) * sr * 1.35, sy + Math.sin(a) * sr * 1.35], [sx + Math.cos(a) * sr * (1.85 + (i % 2) * 0.3), sy + Math.sin(a) * sr * (1.85 + (i % 2) * 0.3)], r, 0.8, 2)}"/>`; }
  d += `<path d="M${n1(sx - sr * 0.35)} ${n1(sy - sr * 0.15)}l.5 1.5M${n1(sx + sr * 0.3)} ${n1(sy - sr * 0.15)}l.5 1.5"/><path d="M${n1(sx - sr * 0.45)} ${n1(sy + sr * 0.22)}Q${n1(sx)} ${n1(sy + sr * 0.65)} ${n1(sx + sr * 0.45)} ${n1(sy + sr * 0.2)}"/>`;
  // a stick figure waving, below the desk, with something to say
  const fx = w * 0.4, fy = h * 0.93, fs = 26 * u;
  d += `<path d="${smooth(ring(fx, fy - fs * 1.6, fs * 0.32, fs * 0.32, 10, 0.08, r), true)}"/>`
    + `<path d="${hand([fx, fy - fs * 1.28], [fx, fy - fs * 0.35], r, 0.6)}"/><path d="${hand([fx, fy - fs * 0.35], [fx - fs * 0.4, fy + fs * 0.25], r, 0.5)}"/><path d="${hand([fx, fy - fs * 0.35], [fx + fs * 0.4, fy + fs * 0.25], r, 0.5)}"/>`
    + `<path d="${hand([fx, fy - fs * 1.05], [fx - fs * 0.55, fy - fs * 0.65], r, 0.5)}"/><path d="${hand([fx, fy - fs * 1.05], [fx + fs * 0.45, fy - fs * 1.55], r, 0.5)}"/>`
    + `<path d="${smooth(ring(fx + fs * 1.25, fy - fs * 2.1, fs * 0.55, fs * 0.36, 12, 0.05, r), true)}"/><path d="M${n1(fx + fs * 0.9)} ${n1(fy - fs * 1.8)}l${n1(-fs * 0.3)} ${n1(fs * 0.3)}"/>`;
  // a heart with an arrow through it, bottom right
  const hx = w * 0.88, hy = h * 0.82, hs = 22 * u;
  d += `<path d="M${n1(hx)} ${n1(hy + hs)}C${n1(hx - hs * 1.6)} ${n1(hy - hs * 0.1)} ${n1(hx - hs * 0.8)} ${n1(hy - hs * 1.3)} ${n1(hx)} ${n1(hy - hs * 0.45)}C${n1(hx + hs * 0.8)} ${n1(hy - hs * 1.3)} ${n1(hx + hs * 1.6)} ${n1(hy - hs * 0.1)} ${n1(hx)} ${n1(hy + hs)}Z"/>`
    + `<path d="${hand([hx - hs * 1.9, hy + hs * 0.6], [hx + hs * 1.9, hy - hs * 0.9], r, 0.6)}"/><path d="M${n1(hx + hs * 1.9)} ${n1(hy - hs * 0.9)}l${n1(-hs * 0.45)} ${n1(-hs * 0.02)}M${n1(hx + hs * 1.9)} ${n1(hy - hs * 0.9)}l${n1(-hs * 0.18)} ${n1(hs * 0.4)}"/>`;
  // a little rocket climbing up the right edge, flames and all
  const rx = w * 0.955, ry = h * 0.47, rs = 26 * u, rk = (x: number, y: number): Pt => { const a = -0.5; return [rx + x * Math.cos(a) - y * Math.sin(a), ry + x * Math.sin(a) + y * Math.cos(a)]; };
  d += `<path d="${smooth([rk(0, -rs * 1.4), rk(rs * 0.42, -rs * 0.6), rk(rs * 0.4, rs * 0.7), rk(-rs * 0.4, rs * 0.7), rk(-rs * 0.42, -rs * 0.6)], true)}"/>`
    + `<path d="${smooth(ring(...rk(0, -rs * 0.35), rs * 0.17, rs * 0.17, 8, 0.06, r), true)}"/>`
    + `<path d="${poly([rk(rs * 0.4, rs * 0.2), rk(rs * 0.75, rs * 0.8), rk(rs * 0.38, rs * 0.68)])}"/><path d="${poly([rk(-rs * 0.4, rs * 0.2), rk(-rs * 0.75, rs * 0.8), rk(-rs * 0.38, rs * 0.68)])}"/>`
    + `<path d="${poly([rk(-rs * 0.22, rs * 0.75), rk(-rs * 0.1, rs * 1.25), rk(0, rs * 0.9), rk(rs * 0.12, rs * 1.35), rk(rs * 0.22, rs * 0.75)])}"/>`;
  // the bored spiral, up by the sums
  const px0 = w * 0.33, py0 = h * 0.15, pts: Pt[] = [];
  for (let i = 0; i <= 80; i++) { const t = (i / 80) * 4.2 * TAU, rr = 2 * u + (t / TAU) * 7 * u; pts.push([px0 + Math.cos(t) * rr * 1.1, py0 + Math.sin(t) * rr]); }
  d += `<path d="${smooth(wob(pts, 0.4, r))}"/>`;
  // noughts and crosses, near the bottom
  const tx = w * 0.7, ty = h * 0.905, tc = 13 * u;
  d += `<path d="${hand([tx - tc * 0.5, ty - tc * 1.5], [tx - tc * 0.5, ty + tc * 1.5], r, 0.6)}"/><path d="${hand([tx + tc * 0.5, ty - tc * 1.5], [tx + tc * 0.5, ty + tc * 1.5], r, 0.6)}"/>`
    + `<path d="${hand([tx - tc * 1.5, ty - tc * 0.5], [tx + tc * 1.5, ty - tc * 0.5], r, 0.6)}"/><path d="${hand([tx - tc * 1.5, ty + tc * 0.5], [tx + tc * 1.5, ty + tc * 0.5], r, 0.6)}"/>`;
  for (const [i, j, o] of [[-1, -1, 0], [0, 0, 1], [1, -1, 0], [1, 1, 1], [-1, 1, 0]] as const) {
    const cx = tx + i * tc, cy = ty + j * tc, q = tc * 0.3;
    d += o ? `<path d="${smooth(ring(cx, cy, q, q, 8, 0.1, r), true)}"/>` : `<path d="M${n1(cx - q)} ${n1(cy - q)}l${n1(2 * q)} ${n1(2 * q)}M${n1(cx + q)} ${n1(cy - q)}l${n1(-2 * q)} ${n1(2 * q)}"/>`;
  }
  d += `<path d="${hand([tx - tc, ty + tc], [tx + tc, ty - tc], r, 0.5)}"/>`;
  // a five-pointed star, top left inside the margin
  const st = (cx: number, cy: number, R: number) => { const p: Pt[] = []; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * TAU) / 5; p.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); } return poly(wob(p, 0.6, r), true); };
  d += `<path d="${st(w * 0.19, h * 0.31, 15 * u)}"/><path d="${st(w * 0.6, h * 0.035, 9 * u)}"/>`;
  return d;
}
const graph: Backdrop = {
  id: 'graph',
  name: '草稿纸',
  base: '#fbfaf2',
  build(el, w, h) {
    fresh(el);
    el.style.background = 'radial-gradient(ellipse 110% 100% at 50% 45%, #fdfcf6 0%, #faf8ef 60%, #f0ecdf 100%)';
    const r = rng(31), S = Math.min(w, h), u = S / 900, c = Math.round(Math.max(18, Math.min(26, S / 34)));
    const mx = Math.round(w * 0.085), hy = Math.round(h * 0.075);
    let s = `<defs><pattern id="bdgrid" width="${c * 5}" height="${c * 5}" patternUnits="userSpaceOnUse" x="${mx % (c * 5)}" y="${hy % (c * 5)}">`
      + `<path d="${Array.from({ length: 5 }, (_, i) => `M${i * c} 0V${c * 5}M0 ${i * c}H${c * 5}`).join('')}" stroke="#cfdeec" stroke-width=".8" fill="none"/>`
      + `<path d="M0 0V${c * 5}M0 0H${c * 5}" stroke="#b7cde3" stroke-width="1.1" fill="none"/></pattern></defs>`;
    s += `<rect width="${w}" height="${h}" fill="url(#bdgrid)" opacity=".85"/>`;
    // the head line and the margin
    s += `<path d="${hand([0, hy], [w, hy], r, 0.5, 6)}" stroke="#9db7d4" stroke-width="1.3" fill="none"/>`;
    s += `<g stroke="#e3958e" stroke-width="1.2" fill="none"><path d="${hand([mx, 0], [mx, h], r, 0.5, 6)}"/><path d="${hand([mx + 4, 0], [mx + 4, h], r, 0.5, 6)}"/></g>`;
    const dl = 90 * u + 12, nl = 60 * u + 10, dX = w - 24 - dl - 48 * u - 14, nX = dX - 30 - nl - 36 * u - 12;
    s += `<g font-family="Caveat, 'Kalam', cursive" font-size="${n1(22 * u + 6)}" fill="#8aa0ba"><text x="${n1(nX)}" y="${n1(hy - 9)}">No.</text><text x="${n1(dX)}" y="${n1(hy - 9)}">Date</text></g>`
      + `<path d="M${n1(nX + 34 * u + 12)} ${hy - 7}h${n1(nl)}M${n1(dX + 46 * u + 12)} ${hy - 7}h${n1(dl)}" stroke="#8aa0ba" stroke-width="1"/>`;
    // punched holes down the left
    const hr = Math.max(7, 10 * u);
    for (let i = 0; i < 4; i++) {
      const cy = h * (0.17 + i * 0.22), cx = mx * 0.42;
      s += `<path d="${smooth(ring(cx, cy, hr, hr, 12, 0.03, r), true)}" fill="#e6e0cf" stroke="${INK}" stroke-opacity=".28" stroke-width="1"/><path d="M${n1(cx - hr * 0.8)} ${n1(cy - hr * 0.2)}A${n1(hr)} ${n1(hr)} 0 0 1 ${n1(cx + hr * 0.6)} ${n1(cy - hr * 0.7)}" stroke="${INK}" stroke-opacity=".16" stroke-width="2.2" fill="none"/>`;
    }
    // a tea ring someone's cup left, and eraser smudges
    s += `<path d="${smooth(ring(w * 0.47, h * 0.02, 34 * u + 8, 32 * u + 8, 18, 0.035, r), true)}" fill="none" stroke="#c9a273" stroke-width="${n1(5 * u + 2)}" opacity=".16"/>`
      + `<path d="${smooth(ring(w * 0.47, h * 0.02, 31 * u + 7, 29 * u + 7, 18, 0.04, r), true)}" fill="none" stroke="#b98f5f" stroke-width="1" opacity=".18"/>`;
    s += `<g fill="#8c8c8c" opacity=".05"><path d="${smooth(ring(w * 0.44, h * 0.94, 70 * u, 22 * u, 14, 0.15, r, -0.1), true)}"/><path d="${smooth(ring(w * 0.92, h * 0.62, 50 * u, 18 * u, 14, 0.15, r, 0.4), true)}"/></g>`;
    // pencil doodles and sums
    s += `<g fill="none" stroke="#56585f" stroke-width="${n1(1.3 + u * 0.4)}" stroke-linecap="round" stroke-linejoin="round" opacity=".5">${doodles(w, h, r)}</g>`;
    s += `<g font-family="Caveat, 'Kalam', cursive" fill="#56585f" opacity=".55"><text x="${n1(w * 0.12)}" y="${n1(h * 0.17)}" font-size="${n1(34 * u + 8)}" transform="rotate(-4 ${n1(w * 0.12)} ${n1(h * 0.17)})">1+1=2</text>`
      + `<text x="${n1(w * 0.125)}" y="${n1(h * 0.235)}" font-size="${n1(24 * u + 6)}" transform="rotate(-3 ${n1(w * 0.125)} ${n1(h * 0.235)})">3x+2=11, x=3</text>`
      + `<text x="${n1(w * 0.54)}" y="${n1(h * 0.965)}" font-size="${n1(22 * u + 6)}" transform="rotate(-3 ${n1(w * 0.54)} ${n1(h * 0.965)})">3.14159...</text>`
      + `<text x="${n1(w * 0.4 + 26 * u * 1.02)}" y="${n1(h * 0.93 - 26 * u * 1.98)}" font-size="${n1(18 * u + 6)}" transform="rotate(-8 ${n1(w * 0.4 + 26 * u)} ${n1(h * 0.93 - 26 * u * 2)})">hi!</text></g>`;
    px(el, put(el, 'inset:-24px;', svgOf(w + 48, h + 48, `<g transform="translate(24 24)">${s}</g>`)), 10, 8);
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><defs><pattern id="tgr" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M6 0V6H0" fill="none" stroke="#cfdeec" stroke-width=".6"/></pattern></defs><rect width="120" height="72" fill="#fbfaf2"/><rect width="120" height="72" fill="url(#tgr)"/><path d="M14 0V72M16 0V72" stroke="#e3958e" stroke-width=".8"/><path d="M0 9H120" stroke="#9db7d4" stroke-width=".9"/><g fill="#e6e0cf" stroke="#231e16" stroke-opacity=".3" stroke-width=".6"><circle cx="6" cy="20" r="2.6"/><circle cx="6" cy="38" r="2.6"/><circle cx="6" cy="56" r="2.6"/></g><g fill="none" stroke="#56585f" stroke-width=".9" opacity=".7" stroke-linecap="round"><circle cx="104" cy="20" r="5"/><path d="M104 11v-3M104 29v3M95 20h-3M113 20h3M97.5 13.5l-2-2M110.5 26.5l2 2M110.5 13.5l2-2M97.5 26.5l-2 2"/><path d="M101.5 22q2.5 2 5 0"/><path d="M28 62l3-6 3 6M31 56v-4"/><circle cx="31" cy="49.5" r="2.4"/><path d="M100 60c-6-4-4-9 0-6 4-3 6 2 0 6z"/></g><text x="22" y="22" font-family="Caveat, cursive" font-size="9" fill="#56585f" opacity=".7">1+1=2</text></svg>`,
};

/* ============================================================ 远山 ============================================================ */
// 山水: layered mountains in mist under a pale warm sky, a small red sun like a seal, a few birds; a panorama that
// slides round as the desk turns, so turning the desk is turning in the landscape.
function ridgeFn(P: number, base: number, amp: number, freqs: number[], seed: number, sharp: number) {
  const r = rng(seed), ph = freqs.map(() => r() * TAU), a = freqs.map((f) => (0.6 + r() * 0.7) / Math.pow(f, 0.75));
  const sa = a.reduce((x, y) => x + y, 0), h1 = r() * TAU, h2 = r() * TAU;
  return (x: number) => {
    let g = 0;
    for (let i = 0; i < freqs.length; i++) g += a[i] * Math.sin((TAU * freqs[i] * x) / P + ph[i]);
    g /= sa;
    return base - amp * (Math.pow((g + 1) / 2, sharp) + 0.05 * Math.sin((TAU * 37 * x) / P + h1) + 0.03 * Math.sin((TAU * 71 * x) / P + h2));
  };
}
function pagoda(x: number, y: number, s: number, col: string) {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const wv = s * (1 - i * 0.18), yb = y - i * s * 0.62, ht = s * 0.34;
    d += `M${n1(x - wv * 0.42)} ${n1(yb)}V${n1(yb - ht)}H${n1(x + wv * 0.42)}V${n1(yb)}Z`;
    d += `M${n1(x - wv * 0.8)} ${n1(yb - ht + 1)}Q${n1(x - wv * 0.55)} ${n1(yb - ht - 1)} ${n1(x - wv * 0.3)} ${n1(yb - ht - s * 0.22)}H${n1(x + wv * 0.3)}Q${n1(x + wv * 0.55)} ${n1(yb - ht - 1)} ${n1(x + wv * 0.8)} ${n1(yb - ht + 1)}Z`;
  }
  const top = y - 4 * s * 0.62 - s * 0.1;
  d += `M${n1(x - 0.8)} ${n1(top + s * 0.4)}V${n1(top - s * 0.45)}H${n1(x + 0.8)}V${n1(top + s * 0.4)}Z`;
  return `<path d="${d}" fill="${col}" stroke="${INK}" stroke-width=".8" stroke-opacity=".3" stroke-linejoin="round"/>`;
}
const birds = (cx: number, cy: number, s: number, r: Rand) => {
  let d = '';
  for (const [dx, dy, k] of [[0, 0, 1], [-1.4, 0.9, 0.85], [1.3, 1.1, 0.8], [-2.6, 1.9, 0.7], [0.4, 2.4, 0.65]] as const) {
    const x = cx + dx * s * 2.2 + (r() - 0.5) * s, y = cy + dy * s * 1.6, q = s * k;
    d += `M${n1(x - q)} ${n1(y)}Q${n1(x - q * 0.45)} ${n1(y - q * 0.7)} ${n1(x)} ${n1(y + q * 0.08)}Q${n1(x + q * 0.45)} ${n1(y - q * 0.7)} ${n1(x + q)} ${n1(y)}`;
  }
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" opacity=".42"/>`;
};
const hills: Backdrop = {
  id: 'hills',
  name: '远山',
  base: '#f1e8d8',
  build(el, w, h, motion) {
    fresh(el);
    el.style.background = 'linear-gradient(180deg, #efe4d0 0%, #f3ebdd 46%, #ece6d7 100%)';
    const P = Math.round(Math.max(1700, w * 1.6)), S = Math.min(w, h), N = Math.round(P / 6);
    const L = [
      { base: 0.5, amp: 0.15, col: '#d8dfd7', ink: 0.1, n: 1, freqs: [2, 3, 5, 8], sharp: 1.7, seed: 41 },
      { base: 0.6, amp: 0.13, col: '#c0cec6', ink: 0.14, n: 1, freqs: [3, 4, 7, 11], sharp: 1.5, seed: 42 },
      { base: 0.71, amp: 0.11, col: '#a7bcb0', ink: 0.18, n: 2, freqs: [3, 5, 8, 13], sharp: 1.4, seed: 43 },
      { base: 0.84, amp: 0.09, col: '#8ea898', ink: 0.24, n: 2, freqs: [4, 6, 9, 14], sharp: 1.3, seed: 44 },
    ];
    L.forEach((l, li) => {
      const f = ridgeFn(P, l.base * h, l.amp * h, l.freqs, l.seed, l.sharp), r = rng(l.seed + 100), J = Array.from({ length: N }, () => (r() - 0.5) * 1.2);
      const pts: Pt[] = [];
      for (let i = 0; i <= 2 * N; i++) { const x = (i * P) / N; pts.push([x, f(x) + J[i % N]]); }
      const top = Math.min(...pts.map((p) => p[1])) - 60;
      let s = `<path d="M0 ${h}L${pts.map((p) => `${n1(p[0])} ${n1(p[1])}`).join('L')}L${2 * P} ${h}Z" fill="${l.col}"/>`;
      s += `<path d="${poly(pts)}" fill="none" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round" opacity="${l.ink}"/>`;
      // texture strokes down the slopes (ink-wash 皴 marks), sparse
      let tex = '';
      for (let k = 0; k < 14; k++) {
        const x = ((k + r() * 0.8) / 14) * P, y = f(x) + 8 + r() * l.amp * h * 0.5, len = 10 + r() * 24;
        for (const dx of [0, P]) tex += `M${n1(x + dx)} ${n1(y)}q${n1(-len * 0.3)} ${n1(len * 0.5)} ${n1(-len * 0.5)} ${n1(len)}`;
      }
      s += `<path d="${tex}" fill="none" stroke="${INK}" stroke-width="1" stroke-linecap="round" opacity="${l.ink * 0.7}"/>`;
      // mist at the foot of the range
      s += `<rect y="${n1(l.base * h + l.amp * h * 0.15)}" width="${2 * P}" height="${n1(h * 0.09)}" fill="url(#bdmist)"/>`;
      if (li === 0) {
        // the sun, a red seal of a disc, and the birds near it
        const sr = Math.max(13, S * 0.026), sx = P * 0.3, sy = h * 0.2;
        for (const dx of [0, P]) s += `<path d="${smooth(ring(sx + dx, sy, sr, sr, 18, 0.025, rng(7)), true)}" fill="#cf5a43" opacity=".85"/>`;
      }
      if (li === 2) {
        // a pagoda on the highest peak of the third range
        let bi = 0;
        for (let i = Math.round(N * 0.1); i < Math.round(N * 0.9); i++) if (pts[i][1] < pts[bi][1]) bi = i;
        for (const dx of [0, P]) s += pagoda(pts[bi][0] + dx, pts[bi][1] + 3, Math.max(9, S * 0.016), '#7d978a');
      }
      const defs = `<defs><linearGradient id="bdmist" x2="0" y2="1"><stop offset="0" stop-color="#f6f1e6" stop-opacity="0"/><stop offset=".5" stop-color="#f6f1e6" stop-opacity=".75"/><stop offset="1" stop-color="#f6f1e6" stop-opacity="0"/></linearGradient></defs>`;
      const box = px(el, put(el, `left:0;top:${n1(top)}px;`), 0, 26 + li * 10, { P, n: l.n });
      box.innerHTML = svgOf(2 * P, h - top, defs + `<g transform="translate(0 ${n1(-top)})">${s}</g>`);
      if (li === 1) for (const dx of [0, P]) anim(box, motion, 'bob', `left:${n1(P * 0.34 + dx)}px;top:${n1(h * 0.13 - top)}px;`, { b: '4px', dur: '6s' }, svgOf(160, 60, birds(80, 22, Math.max(5, S * 0.009), rng(3))));
    });
    // long bands of mist drifting slowly across, in front of the hills
    const mist = (seed: number, H: number) => { const rr = rng(seed), Pm = Math.ceil(w + 400); let s = ''; for (let i = 0; i < 5; i++) { const cx = ((i + rr()) / 5) * Pm, cw = 220 + rr() * 260; for (const dx of [0, Pm]) s += `<ellipse cx="${n1(cx + dx)}" cy="${n1(H / 2 + (rr() - 0.5) * H * 0.3)}" rx="${n1(cw)}" ry="${n1(H * 0.26)}" fill="url(#bdm2)"/>`; } return { s, Pm }; };
    for (const [y, H, dur, seed] of [[0.62, 0.12, 140, 51], [0.78, 0.1, 100, 52]] as const) {
      const m = mist(seed, h * H), box = pxBox(el, 34, 30);
      anim(box, motion, 'drift', `left:-200px;top:${n1(h * y)}px;`, { p: `${m.Pm}px`, dur: `${dur}s`, delay: `-${Math.round(dur / 3)}s` },
        svgOf(2 * m.Pm + 400, h * H, `<defs><radialGradient id="bdm2"><stop offset="0" stop-color="#f7f2e8" stop-opacity=".6"/><stop offset="1" stop-color="#f7f2e8" stop-opacity="0"/></radialGradient></defs><g transform="translate(200 0)">${m.s}</g>`));
    }
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><rect width="120" height="72" fill="#f1e8d8"/><circle cx="34" cy="16" r="5" fill="#cf5a43" opacity=".85"/><path d="M0 40L10 30 18 36 30 22 42 34 54 26 66 36 80 20 94 32 106 26 120 34V72H0Z" fill="#d8dfd7"/><path d="M0 48L14 40 26 46 40 36 52 44 64 38 78 46 92 36 106 44 120 40V72H0Z" fill="#c0cec6"/><path d="M0 56L16 50 30 55 44 47 58 54 72 49 88 55 100 49 120 54V72H0Z" fill="#a7bcb0"/><path d="M0 64L18 60 34 64 50 58 66 63 82 59 98 64 120 60V72H0Z" fill="#8ea898"/><path d="M48 14q2-2 3 0q1-2 3 0M56 18q1.5-1.5 2.5 0q1-1.5 2.5 0" stroke="#231e16" stroke-width=".7" fill="none" opacity=".5"/></svg>`,
};

/* ============================================================ 星空 ============================================================ */
// A deep indigo night all round the desk: stars (some twinkle), a crescent moon, and constellations in the shapes of
// stationery, dotted between stars and named in small letters; once in a long while a shooting star.
const CONSTELLATIONS: Array<{ name: string; pts: Pt[]; edges: Array<[number, number]>; size: number; rot: number }> = [
  // 铅笔座: a long pencil, sharpened point to the right, its eraser end to the left
  { name: '铅笔座', size: 230, rot: -0.22, pts: [[0, 0.42], [0.12, 0.38], [0.74, 0.38], [1, 0.5], [0.74, 0.62], [0.12, 0.62], [0, 0.58]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0], [1, 5], [2, 4]] },
  // 尺子座: a ruler with its ticks
  { name: '尺子座', size: 240, rot: 0.12, pts: [[0, 0.4], [1, 0.4], [1, 0.62], [0, 0.62], [0.25, 0.4], [0.5, 0.4], [0.75, 0.4], [0.25, 0.48], [0.5, 0.52], [0.75, 0.48]],
    edges: [[0, 4], [4, 5], [5, 6], [6, 1], [1, 2], [2, 3], [3, 0], [4, 7], [5, 8], [6, 9]] },
  // 回形针座: a paperclip's two loops
  { name: '回形针座', size: 150, rot: -0.5, pts: [[0.15, 0.3], [0.85, 0.3], [0.95, 0.5], [0.85, 0.7], [0.08, 0.7], [0, 0.5], [0.1, 0.4], [0.75, 0.4], [0.82, 0.5], [0.75, 0.6], [0.28, 0.6]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10]] },
  // 圆规座: two legs from the hinge, the handle above, and the arc it draws
  { name: '圆规座', size: 170, rot: 0.08, pts: [[0.5, 0.05], [0.5, 0.18], [0.22, 0.9], [0.78, 0.9], [0.36, 0.96], [0.5, 0.99], [0.64, 0.96]],
    edges: [[0, 1], [1, 2], [1, 3], [2, 4], [4, 5], [5, 6], [6, 3]] },
];
function crescent(cx: number, cy: number, R: number) {
  // the lit part: a full circle's left limb, the dark disc's edge cutting it
  const d = R * 0.42, R2 = R * 0.92;
  const x = (R * R - R2 * R2 + d * d) / (2 * d), y = Math.sqrt(Math.max(0, R * R - x * x));
  return `M${n1(cx + x)} ${n1(cy - y)}A${n1(R)} ${n1(R)} 0 1 0 ${n1(cx + x)} ${n1(cy + y)}A${n1(R2)} ${n1(R2)} 0 1 1 ${n1(cx + x)} ${n1(cy - y)}Z`;
}
const sparkle = (x: number, y: number, s: number) => `M${n1(x)} ${n1(y - s)}Q${n1(x + s * 0.16)} ${n1(y - s * 0.16)} ${n1(x + s)} ${n1(y)}Q${n1(x + s * 0.16)} ${n1(y + s * 0.16)} ${n1(x)} ${n1(y + s)}Q${n1(x - s * 0.16)} ${n1(y + s * 0.16)} ${n1(x - s)} ${n1(y)}Q${n1(x - s * 0.16)} ${n1(y - s * 0.16)} ${n1(x)} ${n1(y - s)}Z`;
const night: Backdrop = {
  id: 'night',
  name: '星空',
  base: '#1f2646',
  dark: true,
  build(el, w, h, motion) {
    fresh(el);
    el.style.background = 'linear-gradient(180deg, #151a33 0%, #1e2546 46%, #2b3257 100%)';
    const P = Math.round(Math.max(1800, w * 1.6)), S = Math.min(w, h), r = rng(61);
    let s = `<defs><linearGradient id="bdmw" x2="0" y2="1"><stop offset="0" stop-color="#c9d4ff" stop-opacity="0"/><stop offset=".5" stop-color="#c9d4ff" stop-opacity=".07"/><stop offset="1" stop-color="#c9d4ff" stop-opacity="0"/></linearGradient>`
      + `<radialGradient id="bdglow"><stop offset="0" stop-color="#f7eecd" stop-opacity=".28"/><stop offset="1" stop-color="#f7eecd" stop-opacity="0"/></radialGradient></defs>`;
    // the milky way, a faint band
    for (const dx of [0, P]) s += `<g transform="translate(${n1(P * 0.36 + dx)} ${n1(h * 0.48)}) rotate(-17)"><rect x="${n1(-P * 0.62)}" y="${n1(-h * 0.13)}" width="${n1(P * 1.24)}" height="${n1(h * 0.26)}" fill="url(#bdmw)"/></g>`;
    // stars: small and many, a few warm or blue
    let st = '';
    const n = Math.round((P * h) / 7500);
    const cols = ['#ffffff', '#fff3d2', '#d6e2ff'];
    const dots: string[] = ['', '', ''];
    for (let i = 0; i < n; i++) {
      const x = r() * P, y = Math.pow(r(), 1.15) * h, rr = 0.5 + Math.pow(r(), 3) * 1.4, c = Math.floor(r() * 3);
      for (const dx of [0, P]) dots[c] += `M${n1(x + dx - rr)} ${n1(y)}a${n1(rr)} ${n1(rr)} 0 1 0 ${n1(2 * rr)} 0a${n1(rr)} ${n1(rr)} 0 1 0 ${n1(-2 * rr)} 0`;
    }
    dots.forEach((d, i) => { st += `<path d="${d}" fill="${cols[i]}" opacity="${[0.85, 0.75, 0.75][i]}"/>`; });
    s += st;
    // the constellations: dotted lines between their stars, a name under each
    const spots: Pt[] = [[0.1, 0.17], [0.36, 0.1], [0.6, 0.83], [0.87, 0.2]];
    CONSTELLATIONS.forEach((c, i) => {
      const k = c.size * Math.max(0.75, S / 900), [ox, oy] = spots[i], cxp = ox * P, cyp = oy * h, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
      const at = ([u, v]: Pt): Pt => { const x = (u - 0.5) * k, y = (v - 0.5) * k; return [cxp + x * cs - y * sn, cyp + x * sn + y * cs]; };
      const q = c.pts.map(at);
      for (const dx of [0, P]) {
        s += `<path d="${c.edges.map(([a, b]) => `M${n1(q[a][0] + dx)} ${n1(q[a][1])}L${n1(q[b][0] + dx)} ${n1(q[b][1])}`).join('')}" stroke="#cdd9ff" stroke-width="1.1" stroke-dasharray="2 5" stroke-linecap="round" opacity=".5" fill="none"/>`;
        s += q.map((p, j) => `<circle cx="${n1(p[0] + dx)}" cy="${n1(p[1])}" r="${j % 3 ? 1.6 : 2.2}" fill="#fffbe8"/><circle cx="${n1(p[0] + dx)}" cy="${n1(p[1])}" r="5" fill="#fffbe8" opacity=".12"/>`).join('');
        const by = Math.max(...q.map((p) => p[1])) + 18, bx = q.reduce((a, p) => a + p[0], 0) / q.length;
        s += `<text x="${n1(bx + dx)}" y="${n1(by)}" text-anchor="middle" font-family="'LXGW WenKai', 'Kaiti SC', serif" font-size="13" fill="#c9d3f2" opacity=".6" letter-spacing="2">${c.name}</text>`;
      }
    });
    // the crescent moon and its glow
    const mr = Math.max(18, S * 0.03), mxp = P * 0.6, myp = h * 0.12;
    for (const dx of [0, P]) s += `<circle cx="${n1(mxp + dx)}" cy="${n1(myp)}" r="${n1(mr * 3.2)}" fill="url(#bdglow)"/><path d="${crescent(mxp + dx, myp, mr)}" fill="#f4e8c2" stroke="${INK}" stroke-opacity=".35" stroke-width="1"/>`;
    const sky = px(el, put(el, 'left:0;top:0;'), 0, 30, { P, n: 1 });
    sky.innerHTML = svgOf(2 * P, h, s);
    // twinkling stars: little four-point sparkles, each on its own
    for (let i = 0; i < 9; i++) {
      const x = r() * P, y = Math.pow(r(), 1.3) * h * 0.9, sz = 3 + r() * 3.5, dur = 2.6 + r() * 4;
      for (const dx of [0, P]) anim(sky, motion, 'twinkle', `left:${n1(x + dx - 10)}px;top:${n1(y - 10)}px;`, { dur: `${n1(dur)}s`, delay: `-${n1(r() * dur)}s`, lo: 0.25 },
        svgOf(20, 20, `<path d="${sparkle(10, 10, sz)}" fill="#fffbe8"/><circle cx="10" cy="10" r="${n1(sz * 0.9)}" fill="#fffbe8" opacity=".15"/>`));
    }
    // a shooting star now and then
    if (motion) anim(el, motion, 'shoot', `left:${n1(w * 0.8)}px;top:${n1(h * 0.05)}px;`, { dur: '27s', delay: '-20s' },
      svgOf(200, 60, `<defs><linearGradient id="bdsh" x1="1" x2="0"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#fffbe8" stop-opacity="0"/></linearGradient></defs><path d="M196 4L20 56" stroke="url(#bdsh)" stroke-width="2.2" stroke-linecap="round"/><circle cx="196" cy="4" r="2.6" fill="#fffbe8"/>`));
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><defs><linearGradient id="tng" x2="0" y2="1"><stop offset="0" stop-color="#151a33"/><stop offset="1" stop-color="#2b3257"/></linearGradient></defs><rect width="120" height="72" fill="url(#tng)"/><g fill="#fff"><circle cx="10" cy="8" r=".8"/><circle cx="28" cy="20" r=".6"/><circle cx="48" cy="6" r=".9"/><circle cx="64" cy="30" r=".6"/><circle cx="80" cy="12" r=".7"/><circle cx="18" cy="44" r=".7"/><circle cx="104" cy="44" r=".8"/><circle cx="58" cy="60" r=".6"/><circle cx="90" cy="64" r=".7"/><circle cx="36" cy="66" r=".6"/></g><path d="M12 30L22 27 46 27 54 31 46 35 22 35 12 32Z" fill="none" stroke="#cdd9ff" stroke-dasharray="1.2 2" stroke-width=".7" opacity=".7"/><g fill="#fffbe8"><circle cx="12" cy="31" r="1.1"/><circle cx="54" cy="31" r="1.1"/><circle cx="22" cy="27" r="1"/><circle cx="46" cy="35" r="1"/></g><path d="M102 7A9 9 0 1 0 102 25A6 9 0 1 1 102 7Z" fill="#f4e8c2"/></svg>`,
};

/* ============================================================ 海底 ============================================================ */
// The desk sinks into a calm sea: light falling in rays from the surface, a shimmer of caustics, bubbles rising at
// the sides, seaweed swaying on the sand, two small fish drifting by.
function seaweed(W: number, H: number, r: Rand) {
  const cols = ['#6aa889', '#4f8e74', '#86bf98'];
  let s = '';
  for (let b = 0; b < 4; b++) {
    const x0 = W * (0.25 + b * 0.17) + (r() - 0.5) * 8, hh = H * (0.55 + r() * 0.42), wd = 7 + r() * 6, sw = (r() - 0.5) * 30;
    const L: Pt[] = [], R: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, y = H - hh * t, xc = x0 + Math.sin(t * 5 + b) * 9 * t + sw * t * t, ww = wd * (1 - t * 0.85) * (0.8 + 0.3 * Math.sin(t * 9 + b));
      L.push([xc - ww, y]); R.push([xc + ww, y]);
    }
    const tip: Pt = [x0 + sw + Math.sin(5 + b) * 9, H - hh - 6];
    s += `<path d="${smooth([...L, tip, ...R.reverse()], true)}" fill="${cols[b % 3]}" stroke="${INK}" stroke-width="1.1" stroke-opacity=".3" stroke-linejoin="round"/>`;
  }
  return s;
}
function fish(col: string, dark: string, stripe: string | null) {
  // a small fish swimming right: body, tail, fin, a darker belly band, an eye
  return svgOf(64, 36, `<g stroke="${INK}" stroke-width="1.1" stroke-opacity=".55" stroke-linejoin="round">`
    + `<path d="M14 18L2 7 5 18 2 29Z" fill="${dark}"/><path d="M12 18C18 6 40 3 54 13C58 16 58 20 54 23C40 33 18 30 12 18Z" fill="${col}"/>`
    + `<path d="M30 9Q34 3 40 7" fill="${dark}"/></g><path d="M14 20C24 28 42 30 54 22" fill="none" stroke="${dark}" stroke-width="3" opacity=".55" stroke-linecap="round"/>`
    + (stripe ? `<path d="M26 8Q23 18 27 29M40 6Q37 18 41 30" fill="none" stroke="${stripe}" stroke-width="3.4" stroke-linecap="round"/><path d="M26 8Q23 18 27 29M40 6Q37 18 41 30" fill="none" stroke="${INK}" stroke-width=".7" opacity=".3"/>` : '')
    + `<circle cx="48" cy="15" r="2.4" fill="#fff"/><circle cx="48.6" cy="15" r="1.3" fill="${INK}"/>`);
}
const sea: Backdrop = {
  id: 'sea',
  name: '海底',
  base: '#a9d6d8',
  build(el, w, h, motion) {
    fresh(el);
    el.style.background = 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(232,250,246,.7) 0%, rgba(232,250,246,0) 75%), linear-gradient(180deg, #c8e8e6 0%, #a7d5d7 48%, #8cc3c9 100%)';
    const r = rng(71), S = Math.min(w, h);
    // light rays from the surface, swaying very slowly
    const rays = (seed: number) => { const rr = rng(seed); let s = ''; for (let i = 0; i < 3; i++) { const x = w * (0.08 + rr() * 0.84), t = w * (0.012 + rr() * 0.02), b = t * (5 + rr() * 4), len = h * (0.6 + rr() * 0.3), sk = (rr() - 0.5) * w * 0.12; s += `<path d="M${n1(x - t)} -10L${n1(x + t)} -10L${n1(x + b + sk)} ${n1(len)}L${n1(x - b + sk)} ${n1(len)}Z" fill="url(#bdray)"/>`; } return s; };
    const rayDefs = `<defs><linearGradient id="bdray" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".34"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>`;
    for (const [seed, a, dur] of [[1, '1.6deg', 17], [2, '-1.3deg', 23]] as const) {
      const box = pxBox(el, 8, 6);
      anim(box, motion, 'sway', `left:0;top:0;width:${w}px;height:${h}px;transform-origin:50% -20%;`, { a, dur: `${dur}s`, delay: `-${dur / 2}s` }, svgOf(w, h, rayDefs + rays(seed)));
    }
    // the caustic shimmer near the surface: a net of light lines, two of them drifting against each other
    const net = (seed: number, Pn: number, H: number) => {
      const rr = rng(seed), cols = Math.round(Pn / 70), rows = 3, J = Array.from({ length: cols * (rows + 1) }, () => [(rr() - 0.5) * 30, (rr() - 0.5) * 18] as Pt);
      const pt = (i: number, j: number): Pt => { const jj = J[((i % cols) + cols) % cols + j * cols]; return [i * (Pn / cols) + jj[0], j * (H / rows) + jj[1]]; };
      let d = '';
      for (let j = 0; j <= rows; j++) { const row: Pt[] = []; for (let i = 0; i <= 2 * cols; i++) row.push(pt(i, j)); d += smooth(row); }
      for (let i = 0; i <= 2 * cols; i++) d += smooth([pt(i, 0), pt(i + (i % 2 ? 1 : 0), 1), pt(i, 2), pt(i + 1, 3)]);
      return d;
    };
    for (const [seed, dur] of [[5, 70], [6, 95]] as const) {
      const Pn = Math.ceil(w + 300), H = h * 0.22, box = pxBox(el, 12, 8);
      anim(box, motion, 'drift', `left:-150px;top:${n1(h * 0.02)}px;`, { p: `${Pn}px`, dur: `${dur}s`, delay: `-${dur / 3}s` },
        svgOf(2 * Pn + 300, H, `<path d="${net(seed, Pn, H)}" transform="translate(150 0)" fill="none" stroke="#f4fffc" stroke-width="1.4" stroke-linecap="round" opacity=".22"/>`));
    }
    // the sand along the bottom, pebbles, a shell and a starfish on it
    const sy = h * 0.92, sand: Pt[] = [];
    for (let i = 0; i <= 24; i++) sand.push([((i / 24) * (w + 80)) - 40, sy + Math.sin(i * 0.9) * 5 + (r() - 0.5) * 4]);
    let g = `<path d="M-40 ${h + 10}L${sand.map((p) => `${n1(p[0])} ${n1(p[1])}`).join('L')}L${w + 40} ${h + 10}Z" fill="#e6dbbd"/><path d="${smooth(sand)}" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".25"/>`;
    for (let i = 0; i < 14; i++) { const x = r() * w, y = sy + 8 + r() * (h - sy - 4); if (x > w * 0.3 && x < w * 0.7) continue; g += `<path d="${smooth(ring(x, y, 3 + r() * 5, 2 + r() * 3, 8, 0.1, r), true)}" fill="${['#cfc3a3', '#bdb393', '#d9ccb0'][i % 3]}" stroke="${INK}" stroke-opacity=".25" stroke-width=".8"/>`; }
    const stx = w * 0.6, sty = sy + (h - sy) * 0.45, sr = Math.max(9, S * 0.016), arms: Pt[] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? sr * 0.45 : sr; arms.push([stx + Math.cos(a) * rr, sty + Math.sin(a) * rr * 0.75]); }
    g += `<path d="${smooth(arms, true)}" fill="#ef9a6b" stroke="${INK}" stroke-opacity=".4" stroke-width="1"/>`;
    const shx = w * 0.2, shy = sy + (h - sy) * 0.5, shr = Math.max(8, S * 0.013);
    g += `<path d="M${n1(shx - shr)} ${n1(shy + shr * 0.4)}Q${n1(shx)} ${n1(shy - shr * 1.4)} ${n1(shx + shr)} ${n1(shy + shr * 0.4)}Z" fill="#f6e7da" stroke="${INK}" stroke-opacity=".4" stroke-width="1"/><path d="M${n1(shx)} ${n1(shy + shr * 0.35)}L${n1(shx)} ${n1(shy - shr * 0.5)}M${n1(shx)} ${n1(shy + shr * 0.35)}L${n1(shx - shr * 0.55)} ${n1(shy - shr * 0.2)}M${n1(shx)} ${n1(shy + shr * 0.35)}L${n1(shx + shr * 0.55)} ${n1(shy - shr * 0.2)}" stroke="${INK}" stroke-opacity=".25" stroke-width=".8"/>`;
    px(el, put(el, 'left:0;top:0;', svgOf(w, h + 10, g)), 34, 24);
    // seaweed clumps in the corners, each swaying from its root
    const weed = pxBox(el, 30, 22);
    for (const [x, ww, hh, seed, dur] of [[0.01, 0.12, 0.34, 3, 6.5], [0.09, 0.09, 0.24, 4, 8], [0.86, 0.11, 0.3, 5, 7.2], [0.93, 0.08, 0.2, 6, 9]] as const) {
      const W = w * ww, H = h * hh;
      anim(weed, motion, 'sway', `left:${n1(w * x)}px;top:${n1(sy - H + 10)}px;width:${n1(W)}px;height:${n1(H)}px;transform-origin:50% 100%;`, { a: '2.4deg', dur: `${dur}s`, delay: `-${n1(dur * r())}s` }, svgOf(W, H, seaweed(W, H, rng(seed))));
    }
    // bubbles rising at the sides
    const bubbles = (seed: number) => { const rr = rng(seed); let s = ''; for (let i = 0; i < 5; i++) { const y = 150 - i * 32 + (rr() - 0.5) * 10, x = 16 + (rr() - 0.5) * 14, br = 2.5 + rr() * 4.5; s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(br)}" fill="#f3fffd" fill-opacity=".35" stroke="${INK}" stroke-opacity=".3" stroke-width=".8"/><circle cx="${n1(x - br * 0.35)}" cy="${n1(y - br * 0.35)}" r="${n1(br * 0.28)}" fill="#ffffff" opacity=".8"/>`; } return svgOf(32, 170, s); };
    if (motion) for (const [x, dur, seed] of [[0.05, 14, 1], [0.12, 18, 2], [0.885, 16, 3], [0.95, 21, 4]] as const)
      anim(el, motion, 'rise', `left:${n1(w * x)}px;top:${n1(h * 0.95)}px;`, { dur: `${dur}s`, delay: `-${n1(dur * r())}s`, o: 0.9 }, bubbles(seed));
    // two little fish drifting by, one each way
    if (motion) {
      const f1 = put(el, `left:0;top:${n1(h * 0.13)}px;`, '', 'bd-anim bd-swim');
      f1.style.cssText += '--dur:58s;--delay:-14s;';
      anim(f1, motion, 'bob', 'left:0;top:0;', { b: '6px', dur: '4.5s' }, fish('#f08f55', '#c9663a', '#fff7ea'));
      const f2 = put(el, `left:0;top:${n1(h * 0.7)}px;`, '', 'bd-anim bd-swim-back');
      f2.style.cssText += '--dur:76s;--delay:-50s;';
      anim(f2, motion, 'bob', 'left:0;top:0;', { b: '5px', dur: '5.5s' }, `<div style="transform:scaleX(-1)">${fish('#6f9be0', '#4c73b8', null)}</div>`);
    }
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><defs><linearGradient id="tse" x2="0" y2="1"><stop offset="0" stop-color="#c8e8e6"/><stop offset="1" stop-color="#8cc3c9"/></linearGradient><linearGradient id="tsr" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect width="120" height="72" fill="url(#tse)"/><path d="M30 0h6l10 50H24zM74 0h5l12 46H70z" fill="url(#tsr)"/><path d="M0 66q30-5 60 0t60 0V72H0z" fill="#e6dbbd"/><g stroke="#231e16" stroke-opacity=".3" stroke-width=".6"><path d="M8 68q-2-12 3-24 3 10 1 24z" fill="#6aa889"/><path d="M13 68q1-10 6-18 0 10-3 18z" fill="#4f8e74"/><path d="M108 68q-3-10 2-20 3 10 1 20z" fill="#6aa889"/></g><path d="M62 24l-5-4v8zM62 24c3-5 12-6 16 0-4 6-13 5-16 0z" fill="#f08f55" stroke="#231e16" stroke-opacity=".5" stroke-width=".6"/><g fill="none" stroke="#231e16" stroke-opacity=".35" stroke-width=".6"><circle cx="18" cy="30" r="2"/><circle cx="16" cy="22" r="1.4"/><circle cx="104" cy="34" r="1.8"/></g></svg>`,
};

/* ============================================================ 黑板 ============================================================ */
// A calm classroom blackboard (dusty green): faint chalk left from the lessons — the countdown to the exams worked out
// from today's date, today's date and the day's monitors, a sum, a doodle — eraser smudges, the frame and the chalk
// tray along the edges.
function examCountdown(now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // the end-of-term exams: mid January (autumn term) and the end of June (spring term)
  const cands = [new Date(today.getFullYear(), 0, 15), new Date(today.getFullYear(), 5, 28), new Date(today.getFullYear() + 1, 0, 15)];
  const next = cands.find((d) => d >= today)!;
  return Math.round((next.getTime() - today.getTime()) / 864e5);
}
const board: Backdrop = {
  id: 'board',
  name: '黑板',
  base: '#3b5747',
  dark: true,
  build(el, w, h) {
    fresh(el);
    el.style.background = 'radial-gradient(ellipse 90% 80% at 50% 50%, #41604f 0%, #3a5646 60%, #314a3c 100%)';
    const r = rng(81), S = Math.min(w, h), u = S / 900, chalk = '#f2efe2';
    let s = '';
    // eraser smudges: wide pale sweeps, and chalk dust
    for (let i = 0; i < 9; i++) {
      const cx = w * (0.15 + r() * 0.7), cy = h * (0.15 + r() * 0.7), rx = w * (0.1 + r() * 0.12), ry = h * (0.03 + r() * 0.04);
      s += `<path d="${smooth(ring(cx, cy, rx, ry, 16, 0.12, r, (r() - 0.5) * 0.5), true)}" fill="#e9f2ea" opacity="${n1(0.025 + r() * 0.025)}"/>`;
    }
    let dust = '';
    for (let i = 0, n = Math.round((w * h) / 2600); i < n; i++) { const x = r() * w, y = r() * h; dust += `M${n1(x)} ${n1(y)}h${n1(0.6 + r() * 1.6)}`; }
    s += `<path d="${dust}" stroke="#eef4ec" stroke-width="1" opacity=".09"/>`;
    // chalk: everything slightly broken and faint, as if written yesterday
    const fz = (k: number) => n1(k * u + k * 0.25);
    const now = new Date(), days = examCountdown(now), wk = '日一二三四五六'[now.getDay()];
    const cx0 = w * 0.06, cy0 = h * 0.1;
    const ry = h * 0.055, lx = w * 0.016, ly = h * 0.72, rx = w - Math.max(18, w * 0.035);
    s += `<g fill="${chalk}" font-family="'Long Cang', 'LXGW WenKai', 'Kaiti SC', cursive" opacity=".6">`
      + `<text x="${n1(cx0)}" y="${n1(cy0 + 36 * u)}" font-size="${fz(30)}">距离期末考试还有</text>`
      + `<text x="${n1(cx0 + 34 * u)}" y="${n1(cy0 + 102 * u)}" font-size="${fz(58)}" font-family="Kalam, 'Long Cang', cursive" font-weight="700">${days}</text>`
      + `<text x="${n1(cx0 + 34 * u + String(days).length * 0.58 * (58 * u + 14.5) + 0.3 * (32 * u + 8))}" y="${n1(cy0 + 98 * u)}" font-size="${fz(32)}">天</text>`
      + `<text x="${n1(rx)}" y="${n1(ry + 18 * u)}" font-size="${fz(24)}" text-anchor="end">${now.getMonth() + 1}月${now.getDate()}日  星期${wk}</text>`
      + `<text x="${n1(rx)}" y="${n1(ry + 54 * u + 6)}" font-size="${fz(22)}" text-anchor="end">值日生：小明  小红</text>`
      + `<text x="${n1(lx)}" y="${n1(ly)}" font-size="${fz(22)}">解方程：</text>`
      + `<text x="${n1(lx + 8 * u)}" y="${n1(ly + 34 * u + 6)}" font-size="${fz(24)}" font-family="Kalam, 'Long Cang', cursive">2x+3=11</text>`
      + `<text x="${n1(lx + 22 * u)}" y="${n1(ly + 70 * u + 12)}" font-size="${fz(24)}" font-family="Kalam, 'Long Cang', cursive">x=4</text>`
      + `<text x="${n1(rx)}" y="${n1(h * 0.88)}" font-size="${fz(22)}" text-anchor="end">今天也要加油鸭</text></g>`;
    // a box round the countdown, a tick by the answer, a line under the date, a duck by the cheer, all in chalk
    const bx = cx0 - 14 * u, by = cy0 + 50 * u, bw = 230 * u + 30, bh = 66 * u + 10;
    s += `<g fill="none" stroke="${chalk}" stroke-width="${n1(2 + u)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="14 2 22 3" opacity=".5">`
      + `<path d="${poly(wob([[bx, by], [bx + bw, by + 2], [bx + bw - 2, by + bh], [bx + 2, by + bh - 2]], 2, r), true)}"/>`
      + `<path d="M${n1(lx + 22 * u + 58 * u + 10)} ${n1(ly + 62 * u + 10)}l${n1(7 * u + 3)} ${n1(9 * u + 3)} ${n1(18 * u + 6)} ${n1(-22 * u - 6)}"/>`
      + `<path d="${hand([rx - 230 * u - 40, ry + 28 * u + 2], [rx, ry + 30 * u + 2], r, 1.2, 4)}"/>`;
    const dx = rx - 60 * u - 20, dy = h * 0.8, ds = 22 * u + 6;
    s += `<path d="${smooth([[dx - ds, dy], [dx - ds * 0.6, dy + ds * 0.6], [dx + ds * 0.7, dy + ds * 0.55], [dx + ds, dy - ds * 0.1], [dx + ds * 0.4, dy - ds * 0.2], [dx + ds * 0.55, dy - ds * 0.9], [dx + ds * 0.1, dy - ds * 1.2], [dx - ds * 0.3, dy - ds * 0.8], [dx - ds * 0.15, dy - ds * 0.25]], true)}"/>`
      + `<path d="M${n1(dx - ds * 0.3)} ${n1(dy - ds * 0.85)}l${n1(-ds * 0.45)} ${n1(ds * 0.12)} ${n1(ds * 0.42)} ${n1(ds * 0.15)}"/><circle cx="${n1(dx + ds * 0.05)}" cy="${n1(dy - ds * 0.85)}" r="1.4" fill="${chalk}"/></g>`;
    // the frame: a wooden top rail, and the chalk tray along the bottom with chalk and an eraser in it
    const fr = Math.max(9, 12 * u), tr = Math.max(14, 20 * u);
    s += `<rect width="${w}" height="${n1(fr)}" fill="#a6764a"/><path d="M0 ${n1(fr)}H${w}" stroke="${INK}" stroke-width="1.4" opacity=".55"/><path d="M0 ${n1(fr * 0.35)}H${w}" stroke="#c99a6a" stroke-width="1.2" opacity=".6"/>`;
    s += `<rect y="${n1(h - tr)}" width="${w}" height="${n1(tr)}" fill="#8f6440"/><rect y="${n1(h - tr)}" width="${w}" height="${n1(tr * 0.3)}" fill="#b0825a"/><path d="M0 ${n1(h - tr)}H${w}" stroke="${INK}" stroke-width="1.4" opacity=".55"/>`;
    const ty = h - tr - 1;
    for (const [x, len, col] of [[0.72, 34, '#f4f1e6'], [0.755, 22, '#f3d77a'], [0.77, 26, '#f2a7b6'], [0.12, 30, '#f4f1e6']] as const) {
      const L = len * u + 10, cx = w * x;
      s += `<rect x="${n1(cx)}" y="${n1(ty - 6 * u - 3)}" width="${n1(L)}" height="${n1(6 * u + 3)}" rx="${n1(3 * u + 1.5)}" fill="${col}" stroke="${INK}" stroke-opacity=".5" stroke-width="1"/>`;
    }
    const ex = w * 0.84, ew = 70 * u + 24, eh = 14 * u + 6;
    s += `<rect x="${n1(ex)}" y="${n1(ty - eh)}" width="${n1(ew)}" height="${n1(eh * 0.55)}" rx="2" fill="#c49a6c" stroke="${INK}" stroke-opacity=".55"/><rect x="${n1(ex)}" y="${n1(ty - eh * 0.45)}" width="${n1(ew)}" height="${n1(eh * 0.45)}" fill="#3e3a3d" stroke="${INK}" stroke-opacity=".55"/>`;
    px(el, put(el, 'inset:-16px;', svgOf(w + 32, h + 32, `<g transform="translate(16 16)">${s}</g>`)), 8, 6);
  },
  view: parallax,
  thumb: () => `<svg viewBox="0 0 120 72"><rect width="120" height="72" fill="#3b5747"/><rect width="120" height="3" fill="#a6764a"/><rect y="66" width="120" height="6" fill="#8f6440"/><rect x="86" y="62" width="10" height="3" rx="1.5" fill="#f4f1e6"/><rect x="98" y="62" width="7" height="3" rx="1.5" fill="#f3d77a"/><g fill="#f2efe2" opacity=".75" font-family="'Long Cang','LXGW WenKai',cursive"><text x="6" y="14" font-size="7">距离期末考试</text><text x="10" y="30" font-size="15" font-family="Kalam,cursive">82</text><text x="80" y="12" font-size="5.5">值日生</text><text x="6" y="56" font-size="6">2x + 3 = 11</text></g><rect x="4" y="17" width="36" height="17" fill="none" stroke="#f2efe2" stroke-opacity=".5" stroke-dasharray="4 1"/></svg>`,
};

export const BACKDROPS: Backdrop[] = [plain, sunny, sky, graph, hills, night, sea, board];
export const backdropById = (id: string) => BACKDROPS.find((b) => b.id === id) ?? plain;

/** The layer itself: one element behind the desk, rebuilt when the backdrop, the motion setting or the size change. */
export class BackdropLayer {
  el: HTMLDivElement;
  private cur: Backdrop = plain;
  private motion = true;
  private size = '';
  private last = { yaw: NaN, pitch: NaN };

  constructor(host: HTMLElement, before: Element | null) {
    this.el = document.createElement('div');
    this.el.className = 'scene-bg';
    this.el.setAttribute('aria-hidden', 'true');
    host.insertBefore(this.el, before);
  }

  set(id: string, motion: boolean) {
    const b = backdropById(id);
    const m = motion && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (b === this.cur && m === this.motion && this.size) return;
    this.cur = b;
    this.motion = m;
    this.size = '';
    this.resize();
  }

  /** Build for the current size (only when it changed). */
  resize() {
    const w = Math.round(this.el.clientWidth || innerWidth), h = Math.round(this.el.clientHeight || innerHeight), key = `${w}x${h}`;
    if (key === this.size) return;
    this.size = key;
    this.el.replaceChildren();
    this.el.removeAttribute('style');
    this.el.dataset.bg = this.cur.id;
    this.el.classList.toggle('dark', !!this.cur.dark);
    this.el.classList.toggle('still', !this.motion);
    document.documentElement.style.setProperty('--scene-bg', this.cur.base);
    try { this.cur.build(this.el, w, h, this.motion); } catch (e) { console.error('backdrop', this.cur.id, e); }
    this.last = { yaw: NaN, pitch: NaN };
  }

  /** Follow the camera (called after each scene render; cheap when nothing moved). */
  view(yaw: number, pitch: number) {
    if (!this.cur.view || (yaw === this.last.yaw && pitch === this.last.pitch)) return;
    this.last = { yaw, pitch };
    this.cur.view(this.el, yaw, pitch);
  }

  /** Reading: the layer is covered by the close desk; stop its animations. */
  pause(on: boolean) { this.el.classList.toggle('paused', on); }
  /** Nobody at the desk: the motion holds where it is (and goes on from there when someone is back). */
  doze(on: boolean) { this.el.classList.toggle('dozing', on); }
}
