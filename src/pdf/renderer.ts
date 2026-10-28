// Renders only what the camera can see, at a resolution matched to the zoom, and only after the camera
// settles (while moving, the existing raster is simply scaled). Far-away pages give their memory back: the raster,
// and what pdf.js keeps to draw the page again (operator list, decoded images).
import type { RenderTask } from 'pdfjs-dist';
import type { Camera } from '../desk/camera';
import { rafThrottle } from '../util/dom';
import { intersects } from '../util/geom';
import type { PaperDoc } from './doc';
import type { PageView } from './pageview';

const TIERS = [0.3, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
const MAX_PX = 4096 * 4096;
const MAX_DIM = 8192;
/** Pages drawn at the same time (pdf.js draws on the main thread, a slice per frame for each of them). */
const MAX_ACTIVE = 2;
// pdf.js draws into opaque canvases, so the paper colour is painted by the renderer itself.
export const PAGE_COLOR = '#fcfbf6';

/** A page being drawn. It counts as running from the moment it is asked for (before pdf.js has the page), so
 *  the limit on simultaneous drawings holds within one update, and it can be called off at any point. */
interface Job { scale: number; task: RenderTask | null; cancelled: boolean }

export class Renderer {
  private active = new Map<number, Job>();
  private dead = false;
  private everRendered = new Set<number>();
  /** Pages pdf.js has drawn (and so keeps an operator list and images for) since they were last released. */
  private holding = new Set<number>();
  private schedule: (settled: boolean) => void;
  private settledFlag = true;
  private unsub: Array<() => void> = [];
  paused = false;

  constructor(
    private doc: PaperDoc,
    private views: PageView[],
    private cam: Camera,
    private onFirstRender?: (i: number) => void,
  ) {
    const run = rafThrottle(() => this.update());
    this.schedule = (settled: boolean) => {
      this.settledFlag = settled;
      run();
    };
    this.unsub.push(cam.onChange(() => this.schedule(false)));
    this.unsub.push(cam.onSettle(() => this.schedule(true)));
  }

  kick(settled = true) {
    this.schedule(settled);
  }

  private tierFor(need: number, v: PageView) {
    const maxScale = Math.min(Math.sqrt(MAX_PX / (v.w * v.hgt)), MAX_DIM / Math.max(v.w, v.hgt));
    let t = TIERS[TIERS.length - 1];
    for (const k of TIERS) if (k >= need * 0.97) { t = k; break; }
    return Math.min(t, maxScale);
  }

  private cancel(i: number) {
    const job = this.active.get(i);
    if (!job) return;
    job.cancelled = true;
    job.task?.cancel();
    this.active.delete(i);
  }

  update() {
    if (this.dead || this.paused) return;
    const cam = this.cam;
    const z = cam.view.z;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const need = z * dpr;
    const vis = cam.visibleRect(Math.max(cam.vw, cam.vh) * 0.3 / z);
    const far = cam.visibleRect(Math.max(cam.vw, cam.vh) * 2.5 / z);
    const center = { x: cam.view.x, y: cam.view.y };
    const wanted: Array<{ v: PageView; scale: number; d: number }> = [];

    for (const v of this.views) {
      const r = { x: v.slot.x, y: v.slot.y, w: v.w, h: v.hgt };
      if (intersects(vis, r)) {
        let target = this.tierFor(need, v);
        const moving = cam.moving && !this.settledFlag;
        if (v.scale === 0) v.el.classList.add('queued');
        if (v.scale === 0) {
          if (moving) target = Math.min(target, this.tierFor(1.5, v));
        } else if (moving || (v.scale >= target * 0.84 && v.scale <= target * 2.4)) {
          continue;
        }
        const cur = this.active.get(v.index);
        if (cur && Math.abs(cur.scale - target) < 0.01) continue;
        const d = Math.hypot(r.x + r.w / 2 - center.x, r.y + r.h / 2 - center.y);
        wanted.push({ v, scale: target, d });
      } else {
        this.cancel(v.index);
        // a page waiting for its print stops looking busy (an endless animation) once it is out of sight
        if (v.scale === 0 && v.el.classList.contains('queued')) v.el.classList.remove('queued');
        if (!intersects(far, r)) {
          if (v.canvas) v.dropRaster();
          if (this.holding.delete(v.index)) this.doc.releasePage(v.index);
        }
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) {
      // a page already being drawn at another scale gives up its slot for the new drawing
      if (this.active.size >= MAX_ACTIVE && !this.active.has(w.v.index)) break;
      this.cancel(w.v.index);
      void this.render(w.v, w.scale, !cam.moving);
    }
  }

  /**
   * Print some pages now, sharp enough for a given zoom, before they are shown (the opening shot): the
   * paper lands already printed and the camera can zoom in on it without a blurry-then-sharp change.
   */
  async prerender(indices: number[], zoom: number, timeoutMs = 2500) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const jobs: Promise<void>[] = [];
    for (const i of indices) {
      const v = this.views[i];
      if (!v) continue;
      const target = this.tierFor(zoom * dpr, v);
      if (v.scale >= target * 0.84) continue;
      this.cancel(i);
      jobs.push(this.render(v, target, false));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.all(jobs), new Promise((r) => { timer = setTimeout(r, timeoutMs); })]);
    clearTimeout(timer);
  }

  private async render(v: PageView, scale: number, fade: boolean) {
    const job: Job = { scale, task: null, cancelled: false };
    this.active.set(v.index, job);
    let canvas: HTMLCanvasElement | null = null;
    try {
      const page = await this.doc.page(v.index);
      if (this.dead || job.cancelled) return;
      const vp = page.getViewport({ scale });
      canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      this.holding.add(v.index);
      job.task = page.render({ canvas, viewport: vp, background: PAGE_COLOR } as any);
      await job.task.promise;
      if (this.dead || job.cancelled) return;
      v.setRaster(canvas, scale, fade);
      canvas = null;
      if (!this.everRendered.has(v.index)) {
        this.everRendered.add(v.index);
        this.onFirstRender?.(v.index);
      }
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException' && !this.dead) console.warn('render failed', v.index, e);
    } finally {
      // a drawing that was not shown gives its pixels back now, not whenever the garbage collector comes by
      if (canvas) canvas.width = canvas.height = 0;
      if (this.active.get(v.index) === job) this.active.delete(v.index);
      if (!this.dead) this.schedule(this.settledFlag || !this.cam.moving);
    }
  }

  /** Render one page right now at a given scale into a fresh canvas (stack top page, crops, exports). */
  async snapshot(index: number, scale: number, background = PAGE_COLOR): Promise<HTMLCanvasElement> {
    const page = await this.doc.page(index);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(vp.width));
    canvas.height = Math.max(1, Math.floor(vp.height));
    if (!this.dead) this.holding.add(index);
    await page.render({ canvas, viewport: vp, background } as any).promise;
    return canvas;
  }

  destroy() {
    this.dead = true;
    for (const i of [...this.active.keys()]) this.cancel(i);
    this.holding.clear();
    for (const u of this.unsub) u();
  }
}
