// Dev page (scene-lab.html): the desk scene on its own, with a bare orbit / zoom, for looking at it and timing it.
import { DeskScene, LOOK_DEFAULT } from './scene';

const host = document.getElementById('host')!;
const hud = document.getElementById('hud')!;
const scene = new DeskScene(host);
const q = new URLSearchParams(location.search);
if (q.has('wobble')) scene.look.wobble = +q.get('wobble')!;
if (q.get('grain') === '0') scene.look.grain = false;
const dv = scene.defaultView();
scene.setView({
  yaw: +(q.get('yaw') ?? dv.yaw), pitch: +(q.get('pitch') ?? dv.pitch), zoom: q.has('zoom') ? +q.get('zoom')! * dv.zoom : dv.zoom,
  cx: +(q.get('cx') ?? 0), cy: +(q.get('cy') ?? 0), cz: +(q.get('cz') ?? 4),
});
void LOOK_DEFAULT;
// ?focus=01 centres on an object (its box's middle) with ?zoom; ?xr=1 / ?labels=1 for it;
// ?run=01:写答案@300,01:转笔@2500 presses its buttons at those times (Label>Choice for pickers)
const focusN = q.get('focus');
const fobj = focusN ? scene.objects.find((o) => o.n === focusN) ?? null : null;
if (fobj) {
  const b = scene.boxOf(fobj)!;
  scene.focus = fobj;
  scene.labelsOn = q.get('labels') === '1';
  scene.setView({ cx: (b[0][0] + b[1][0]) / 2, cy: (b[0][1] + b[1][1]) / 2, cz: b[0][2], zoom: +(q.get('zoom') ?? 4) * dv.zoom });
  if (q.get('xr') === '1') { fobj.st.xr = fobj.st.xrT = 1; scene.render(); }
}
const errs: string[] = [];
scene.onFlash = (o, t) => { errs.push(`[${o.n}] ${t}`); (window as any).__flash = `[${o.n}] ${t}`; };
for (const item of (q.get('run') || '').split(',').filter(Boolean)) {
  const [what, ms] = item.split('@'), [n, label] = what.split(':');
  setTimeout(() => { const o = scene.objects.find((x) => x.n === n); if (!o || !scene.press(o, label)) errs.push(`no button ${what}`); }, +ms || 0);
}
(window as any).__log = errs;
const show = () => { hud.textContent = `yaw ${scene.view.yaw.toFixed(0)} pitch ${scene.view.pitch.toFixed(0)} zoom ${scene.view.zoom.toFixed(2)} · full ${scene.timing.full.toFixed(1)} ms · part ${scene.timing.part.toFixed(1)} ms`; };
scene.onRendered = show;
show();

// drag = orbit (draft while moving, final on release), wheel = zoom
let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
host.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, yaw: scene.view.yaw, pitch: scene.view.pitch }; host.setPointerCapture(e.pointerId); });
host.addEventListener('pointermove', (e) => { if (!drag) return; scene.setView({ yaw: drag.yaw - (e.clientX - drag.x) * 0.35, pitch: Math.max(12, Math.min(89.9, drag.pitch + (e.clientY - drag.y) * 0.25)) }, 'draft'); });
host.addEventListener('pointerup', () => { if (drag) { drag = null; scene.render('final'); } });
host.addEventListener('wheel', (e) => { e.preventDefault(); scene.setView({ zoom: scene.view.zoom * Math.exp(-e.deltaY * 0.002) }); }, { passive: false });

/** Orbit n frames by step degrees at a quality, timing each frame from one rAF to the next (JS + style + layout + paint). */
async function bench(n = 40, step = 3, quality: 'draft' | 'final' = 'draft') {
  const times: number[] = [], js: number[] = [];
  let last = await new Promise<number>((r) => requestAnimationFrame(r));
  for (let i = 0; i < n; i++) {
    scene.setView({ yaw: scene.view.yaw + step }, quality);
    js.push(scene.timing.full);
    const now = await new Promise<number>((r) => requestAnimationFrame(r));
    times.push(now - last);
    last = now;
  }
  const pct = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { frame50: pct(times, 0.5), frame95: pct(times, 0.95), js50: pct(js, 0.5), js95: pct(js, 0.95) };
}
(window as any).lab = { scene, bench };
(window as any).__ready = true;
