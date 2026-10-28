// The paper arrives: a printed stack, as thick as the paper is long, falls onto the desk from above (we look
// straight down, so it starts big and its shadow far away), lands with a thud and a puff, the sheets settle
// with a few corners out of line, then the pages are dealt out for reading. Going back to the desk: the pages
// gather onto page 1, which is then picked up as one sheet and carried onto its pile (Flyer) as the camera turns back.
import type { Reader } from '../reader';
import { h, s, sleep } from '../util/dom';
import { reducedMotion } from '../util/anim';
import type { Rect } from '../util/geom';
import { Rng } from '../util/rng';
import type { View } from './camera';
import type { Desk } from './desk';

/** Where the stack sits on the desk below: a sheet's rectangle on screen (unturned) and its turn. */
export interface Landing { sheet: DOMRect; deg: number }

export interface DropOpts {
  fast?: boolean;
  onLanded?: () => void;
  /** Where to end up (the reading view by default). */
  target?: View;
  /** The spot on the desk backdrop the stack lands on (the blank sheet). */
  landing?: Landing | null;
  /** Printing started earlier (startPrint): the stack falls at once, the deal waits a moment for it. */
  printed?: Promise<unknown>;
}

/** Start printing the pages the reader will see first, at the reading zoom (while the camera is still turning). */
export function startPrint(desk: Desk, reader: Reader, target: View) {
  return reader.renderer.prerender(pagesSeenFrom(reader, target, desk.camera.vw, desk.camera.vh), target.z);
}

/** The pages the camera will see from a view (with a margin), page 1 first. */
function pagesSeenFrom(reader: Reader, v: View, vw: number, vh: number) {
  const hw = vw / 2 / v.z + 60, hh = vh / 2 / v.z + 60;
  const out = [0];
  reader.slots.forEach((sl, i) => {
    if (i && sl.x < v.x + hw && sl.x + sl.w > v.x - hw && sl.y < v.y + hh && sl.y + sl.h > v.y - hh) out.push(i);
  });
  return out.slice(0, 12);
}

/** The zoom and spot to look at the stack from: lying exactly on the landing sheet of the desk below if there is
 *  one, else with desk around it. */
function stackView(desk: Desk, reader: Reader, landing?: Landing | null): View {
  const cam = desk.camera, s0 = reader.slots[0];
  if (landing) {
    const r = landing.sheet, z = Math.min(r.width / s0.w, r.height / s0.h);
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    return { x: s0.x + s0.w / 2 - (cx - cam.vw / 2) / z, y: s0.y + s0.h / 2 - (cy - cam.vh / 2) / z, z };
  }
  const z = Math.min((cam.vh * 0.54) / s0.h, (cam.vw * 0.38) / s0.w, 1.3);
  return { x: s0.x + s0.w / 2 + 30 / z, y: s0.y + s0.h / 2 + 10 / z, z };
}

interface Stack { el: HTMLDivElement; shadow: HTMLDivElement; layers: HTMLDivElement[]; rest0: string; thickness: number }

/** A small black binder clip seen from straight above, handles folded down over the page (as on the piles). */
function clipArt() {
  const w = 52, h = 42;
  const handle = 'M15 30 L17 41 L35 41 L37 30';
  const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" overflow="visible">`
    + `<path d="M6 13 L46 13 L46 30 L6 30 Z" fill="#2b2826" stroke="#231e16" stroke-width="1.6" stroke-linejoin="round"/>`
    + `<path d="M9 16.5 L43 16.5" stroke="#5b5650" stroke-width="2.2" stroke-linecap="round"/>`
    + `<path d="${handle}" fill="none" stroke="#231e16" stroke-width="3.6" stroke-linejoin="round"/>`
    + `<path d="${handle}" fill="none" stroke="#c6ccce" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  return { svg, w, h, ox: w / 2, oy: 13 };
}

/** The printed stack under page 1, page 1 riding on top, held by a binder clip. */
function buildStack(desk: Desk, reader: Reader, rng: Rng): Stack {
  const views = reader.views, n = views.length, s0 = reader.slots[0];
  const thickness = Math.min(36, 4 + n * 0.95);
  const layerCount = Math.min(n - 1, 40);
  const el = h('div', { class: 'stack', style: `left:${s0.x}px;top:${s0.y}px;width:${s0.w}px;height:${s0.h}px` });
  const shadow = h('div', { class: 'stack-shadow' });
  el.append(shadow);
  const layers: HTMLDivElement[] = [];
  for (let i = layerCount; i >= 1; i--) {
    const depth = (i / Math.max(1, layerCount)) * thickness;
    // Most sheets lie square; a few are out of line, their corners poking out of the stack.
    const big = rng.chance(0.2);
    const dx = depth * 0.45 + rng.j(big ? 7 : 1.4), dy = depth * 0.7 + rng.j(big ? 7 : 1.4);
    const rot = big ? (rng.chance(0.5) ? 1 : -1) * rng.range(1.8, 3.6) : rng.j(0.5);
    const l = h('div', { class: `stack-sheet${i % 4 === 0 ? ' tint' : ''}`, style: `transform:translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)` });
    l.dataset.t = l.style.transform;
    layers.push(l);
    el.append(l);
  }
  // the binder clip holding it together, its body over the top edge
  const art = clipArt(), ck = 1.5;
  const clip = h('div', { class: 'stack-clip', html: art.svg, style: `left:${(s0.w / 2 - art.ox * ck).toFixed(1)}px;top:${(-(art.oy + 3) * ck).toFixed(1)}px;width:${(art.w * ck).toFixed(1)}px;height:${(art.h * ck).toFixed(1)}px` });
  const p0 = views[0];
  desk.pages.insertBefore(el, desk.pages.firstChild);
  p0.el.style.left = '0px';
  p0.el.style.top = '0px';
  p0.el.style.visibility = '';
  el.append(p0.el, clip);
  const rest0 = `translate(${(thickness * 0.5 + 7).toFixed(1)}px, ${(thickness * 0.72 + 9).toFixed(1)}px)`;
  shadow.style.transform = rest0;
  return { el, shadow, layers, rest0, thickness };
}

export async function dropAndDeal(desk: Desk, reader: Reader, opts: DropOpts = {}) {
  const cam = desk.camera;
  const views = reader.views;
  const n = views.length;
  const s0 = reader.slots[0];
  const fast = !!opts.fast;
  const target = opts.target ?? reader.viewForPage(0);
  const renderer = reader.renderer;
  if (reducedMotion() || !n) {
    for (const v of views) v.el.style.visibility = '';
    cam.set(target);
    renderer.paused = false;
    renderer.kick();
    opts.onLanded?.();
    return;
  }
  const rng = new Rng(n * 31 + 7);
  // The pages the reader will see first are printed at the reading zoom (so the camera can zoom in without a
  // blurry-then-sharp change): started earlier while the desk turned, or now, before anything moves.
  renderer.paused = true;
  const printed = opts.printed ?? renderer.prerender(pagesSeenFrom(reader, target, cam.vw, cam.vh), target.z);
  if (!opts.printed) await printed;

  // Look at the spot where the stack will land, with desk around it.
  cam.set(stackView(desk, reader, opts.landing));
  const { el: stack, shadow, layers, rest0, thickness } = buildStack(desk, reader, rng);
  const p0 = views[0];
  const pagesLayer = desk.pages;
  for (let i = 1; i < n; i++) views[i].el.style.visibility = 'hidden';

  // Fast-forward on any input.
  const running: Animation[] = [];
  let skipped = false;
  const skip = () => { skipped = true; cam.stop(); for (const a of running) { try { a.finish(); } catch { /* done */ } } };
  desk.viewport.addEventListener('pointerdown', skip, { once: true });
  desk.viewport.addEventListener('wheel', skip, { once: true, passive: true });
  const track = (a: Animation) => { running.push(a); return a; };

  /* --- fall --- */
  const turn = opts.landing ? opts.landing.deg : -1.2;
  const rest = `translate(0px, 0px) scale(1) rotate(${turn.toFixed(2)}deg)`;
  const fall = fast ? 440 : 620, landAt = 0.76;
  track(stack.animate([
    { transform: 'translate(-70px, -150px) scale(1.42) rotate(-7deg)', opacity: 0, easing: 'cubic-bezier(.55,0,1,.5)' },
    { opacity: 1, offset: 0.1, easing: 'cubic-bezier(.55,0,1,.5)' },
    { transform: `translate(0px, 0px) scale(1) rotate(${(turn - 0.4).toFixed(2)}deg)`, offset: landAt, easing: 'ease-out' },
    { transform: `translate(0px, 1.5px) scale(0.985, 0.99) rotate(${(turn - 0.1).toFixed(2)}deg)`, offset: 0.86, easing: 'ease-out' },
    { transform: rest },
  ], { duration: fall, fill: 'forwards' }));
  track(shadow.animate([
    { transform: 'translate(120px, 190px) scale(1.25)', opacity: 0.18, easing: 'cubic-bezier(.55,0,1,.5)' },
    { transform: `${rest0} scale(1)`, opacity: 1, offset: landAt },
    { transform: `${rest0} scale(1)`, opacity: 1 },
  ], { duration: fall, fill: 'forwards' }));
  await sleep(fall * landAt);

  /* --- thud --- */
  if (!skipped) {
    cam.shake(fast ? 2 : 4, 260);
    puff(desk, s0, thickness, rng);
    layers.forEach((l, i) => {
      const t = l.dataset.t!;
      track(l.animate([
        { transform: `${t} translate(${rng.j(3).toFixed(1)}px, ${(-2 - rng.next() * 3).toFixed(1)}px)` },
        { transform: t },
      ], { duration: 300 + rng.range(0, 160), delay: (i % 6) * 14, easing: 'cubic-bezier(.2,.8,.3,1.2)' }));
    });
  }
  opts.onLanded?.();
  await sleep(skipped ? 0 : fast ? 40 : 110);
  // the first pages are printed by now, or nearly: wait a moment at most
  await Promise.race([printed, sleep(skipped ? 0 : 70)]);

  /* --- deal --- */
  const reading = target;
  const visible = (i: number) => {
    const sl = reader.slots[i];
    const hw = cam.vw / 2 / reading.z + 200, hh = cam.vh / 2 / reading.z + 400;
    return sl.x < reading.x + hw && sl.x + sl.w > reading.x - hw && sl.y < reading.y + hh && sl.y + sl.h > reading.y - hh;
  };
  // straighten the stack (while the deal starts), put page 1 back in its slot
  track(stack.animate([{ transform: rest }, { transform: 'translate(0,0) scale(1) rotate(0deg)' }], { duration: 160, fill: 'forwards', easing: 'ease-out' }));
  p0.el.style.left = s0.x + 'px';
  p0.el.style.top = s0.y + 'px';
  p0.el.style.zIndex = '5';
  pagesLayer.insertBefore(p0.el, views[1]?.el || null);
  // the camera's move to the reading view runs on the compositor, so it stays sharp while zooming in
  const flown = new Promise<void>((done) => setTimeout(() => cam.glide(reading, skipped ? 1 : fast ? 600 : 860).then(done), skipped ? 0 : fast ? 40 : 120));

  const flying: Promise<void>[] = [];
  let animated = 0;
  for (let i = 1; i < n; i++) {
    const v = views[i];
    const sl = reader.slots[i];
    if (!visible(i) || animated >= 8 || skipped) {
      v.el.style.visibility = '';
      if (!skipped) v.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 300 });
      continue;
    }
    const k = animated++;
    const delay = k * (fast ? 36 : 70);
    const dx = s0.x - sl.x + rng.j(4), dy = s0.y - sl.y + rng.j(4) + 8;
    const r0 = rng.j(2);
    v.el.style.zIndex = '1';
    const anim = v.el.animate([
      { transform: `translate(${dx}px, ${dy}px) rotate(${r0}deg)`, visibility: 'visible', easing: 'cubic-bezier(.3,.1,.25,1)' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 30}px) rotate(${r0 * 0.4 + rng.j(1.5)}deg) scale(1.03)`, offset: 0.45, easing: 'cubic-bezier(.3,.1,.25,1)' },
      { transform: 'translate(0, 0) rotate(0deg) scale(1)', visibility: 'visible' },
    ], { duration: fast ? 420 : 620, delay, fill: 'backwards' });
    v.shadow.animate([
      { transform: 'translate(6px, 8px)' },
      { transform: 'translate(22px, 30px)', offset: 0.45 },
      { transform: 'translate(5px, 6px)' },
    ], { duration: fast ? 420 : 620, delay, fill: 'backwards' });
    track(anim);
    // a sheet leaves the stack: it gets thinner
    setTimeout(() => {
      v.el.style.visibility = '';
      const remove = Math.ceil(layers.length / Math.max(1, n - 1));
      for (let j = 0; j < remove && layers.length; j++) layers.shift()!.remove();
    }, delay);
    flying.push(anim.finished.then(() => { v.el.style.zIndex = ''; }, () => { v.el.style.zIndex = ''; }));
  }
  await Promise.all(flying);
  stack.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240 }).finished.then(() => stack.remove(), () => stack.remove());
  for (const v of views) { v.el.style.visibility = ''; v.el.style.zIndex = ''; }
  desk.viewport.removeEventListener('pointerdown', skip);
  desk.viewport.removeEventListener('wheel', skip);
  await flown;
  renderer.paused = false;
  renderer.kick();
}

/**
 * Back to the desk, first half: the pages come together onto page 1 while the camera glides so that page 1 lies
 * exactly on the blank sheet of the desk below (where it landed). The rest is the Flyer's.
 */
export async function gather(desk: Desk, reader: Reader, landing: Landing | null, ms = 380) {
  const cam = desk.camera;
  const views = reader.views, n = views.length, s0 = reader.slots[0];
  reader.renderer.paused = true;
  if (reducedMotion() || !n) return;
  const rng = new Rng(n * 31 + 11);
  const seen = cam.visibleRect(80);
  const near = (i: number) => {
    const sl = reader.slots[i];
    return sl.x < seen.x + seen.w && sl.x + sl.w > seen.x && sl.y < seen.y + seen.h && sl.y + sl.h > seen.y;
  };
  const gathering: Promise<unknown>[] = [];
  let k = 0;
  views[0].el.style.zIndex = '6';
  for (let i = n - 1; i >= 1; i--) {
    const v = views[i], sl = reader.slots[i];
    if (!near(i) || k >= 10) {
      v.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished.then(() => { v.el.style.visibility = 'hidden'; }, () => {});
      continue;
    }
    const dx = s0.x - sl.x + rng.j(3), dy = s0.y - sl.y + rng.j(3);
    const delay = k++ * 22;
    v.el.style.zIndex = String(2 + Math.min(k, 3));
    const a = v.el.animate([
      { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 20}px) rotate(${rng.j(2)}deg) scale(1.02)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${rng.j(1)}deg) scale(1)` },
    ], { duration: Math.max(200, ms - delay), delay, easing: 'cubic-bezier(.4,.1,.3,1)', fill: 'forwards' });
    v.shadow.animate([{ transform: 'translate(5px, 6px)' }, { transform: 'translate(16px, 22px)', offset: 0.5 }, { transform: 'translate(5px, 6px)' }], { duration: Math.max(200, ms - delay), delay, fill: 'forwards' });
    gathering.push(a.finished.then(() => { v.el.style.visibility = 'hidden'; }, () => {}));
  }
  const pulledBack = cam.glide(stackView(desk, reader, landing), ms);
  await Promise.all([...gathering, pulledBack]);
}

/**
 * Page 1, picked up off the desk as one sheet and carried somewhere (onto its pile): an element in screen space
 * whose transform lays its picture exactly over a quad (the sheet's corners projected by the scene's camera, so it
 * stays glued to the desk however the camera moves), with its shadow on the desk top below it.
 */
export class Flyer {
  el: HTMLDivElement;
  private shadow: HTMLDivElement;
  private copy: HTMLCanvasElement | null = null;
  constructor(host: HTMLElement, private fw: number, private fh: number, raster: HTMLCanvasElement | null, picture?: string) {
    this.shadow = h('div', { class: 'flyer-shadow', style: `width:${fw}px;height:${fh}px` });
    this.el = h('div', { class: 'flyer', style: `width:${fw}px;height:${fh}px` });
    if (raster && raster.width) {
      const c = document.createElement('canvas');
      c.width = raster.width;
      c.height = raster.height;
      c.getContext('2d')?.drawImage(raster, 0, 0);
      this.el.append(c);
      this.copy = c;
    } else if (picture) this.el.style.backgroundImage = `url("${picture}")`;
    host.append(this.shadow, this.el);
  }
  private static matrix(q: Array<{ x: number; y: number }>, w: number, h: number) {
    const [p0, p1, , p3] = q;
    return `matrix(${((p1.x - p0.x) / w).toFixed(5)}, ${((p1.y - p0.y) / w).toFixed(5)}, ${((p3.x - p0.x) / h).toFixed(5)}, ${((p3.y - p0.y) / h).toFixed(5)}, ${p0.x.toFixed(2)}, ${p0.y.toFixed(2)})`;
  }
  /** Lay it over a screen quad (top-left, top-right, bottom-right, bottom-left), its shadow over another. */
  place(q: Array<{ x: number; y: number }>, shadow?: Array<{ x: number; y: number }> | null, shadowOpacity = 0.45) {
    this.el.style.transform = Flyer.matrix(q, this.fw, this.fh);
    if (shadow) { this.shadow.style.transform = Flyer.matrix(shadow, this.fw, this.fh); this.shadow.style.opacity = shadowOpacity.toFixed(2); }
  }
  remove(ms = 90) {
    const els = [this.el, this.shadow];
    const gone = () => {
      for (const e of els) e.remove();
      // the copy of page 1's print (tens of MB) is given back as soon as it is off the screen
      if (this.copy) { this.copy.width = this.copy.height = 0; this.copy = null; }
    };
    let left = els.length;
    for (const e of els) e.animate([{ opacity: e.style.opacity || 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' }).finished.then(() => { e.remove(); if (--left === 0) gone(); }, () => { e.remove(); if (--left === 0) gone(); });
  }
}

/** Ink dust kicked up where the stack hits the desk. */
function puff(desk: Desk, s0: { x: number; y: number; w: number; h: number }, thick: number, rng: Rng, amount = 1) {
  const svg = s('svg', { class: 'puff', width: 1, height: 1 });
  const cx = s0.x + s0.w / 2, cy = s0.y + s0.h / 2;
  for (let i = 0; i < Math.round(16 * amount); i++) {
    const side = i % 4;
    const t = rng.range(0.1, 0.9);
    const px = side === 0 ? s0.x + s0.w * t : side === 1 ? s0.x + s0.w + thick * 0.5 : side === 2 ? s0.x + s0.w * t : s0.x - 4;
    const py = side === 0 ? s0.y - 4 : side === 1 ? s0.y + s0.h * t : side === 2 ? s0.y + s0.h + thick * 0.7 : s0.y + s0.h * t;
    const dx = px - cx, dy = py - cy, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    const len = rng.range(16, 34);
    const line = s('path', { d: `M${px + ux * 6} ${py + uy * 6}l${ux * len} ${uy * len}`, stroke: '#231e16', 'stroke-width': rng.range(1.6, 2.6), 'stroke-linecap': 'round', fill: 'none' });
    svg.append(line);
    line.animate([
      { transform: 'translate(0,0) scale(.6)', opacity: 0.95 },
      { transform: `translate(${ux * 56}px, ${uy * 56}px) scale(1)`, opacity: 0 },
    ], { duration: 460 + rng.range(0, 220), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  }
  desk.top.append(svg);
  setTimeout(() => svg.remove(), 800);
}

/** The current paper is picked up and cleared from the desk. */
export async function clearAway(reader: Reader) {
  if (reducedMotion()) return;
  const anims = reader.views.slice(0, 12).map((v, i) => v.el.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${-30 - i * 4}px, ${-40 - i * 6}px) scale(1.04) rotate(-3deg)`, opacity: 0 },
  ], { duration: 320, delay: i * 18, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }));
  await Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
}
