// The desk scene: a viewport looking straight down at a wooden desk. The desk and its stationery are a fixed
// stage that never moves; the camera only moves the world layer above it — the paper, the scratch sheets and
// the ink — so flipping, scrolling and zooming move the paper, not the desk.
import { h, s } from '../util/dom';
import type { Rect } from '../util/geom';
import { Camera } from './camera';
import { Input, type PointerDelegate } from './input';

export class Desk {
  viewport: HTMLDivElement;
  world: HTMLDivElement;
  stage: HTMLDivElement;
  pages: HTMLDivElement;
  sheets: HTMLDivElement;
  arrows: SVGSVGElement;
  top: HTMLDivElement;
  camera: Camera;
  input: Input;
  deskRect: Rect = { x: -1300, y: -900, w: 2600, h: 1800 };

  constructor(root: HTMLElement, delegate: PointerDelegate) {
    this.stage = h('div', { class: 'stage' });
    this.pages = h('div', { class: 'layer pages' });
    this.sheets = h('div', { class: 'layer sheets' });
    this.arrows = s('svg', { class: 'layer arrows', width: 1, height: 1 });
    this.top = h('div', { class: 'layer top' });
    this.world = h('div', { id: 'world' }, this.pages, this.arrows, this.sheets, this.top);
    this.viewport = h('div', { id: 'viewport' }, this.stage, this.world);
    root.append(this.viewport);
    this.camera = new Camera(this.world, this.viewport);
    this.input = new Input(this.camera, this.viewport, delegate);
    this.setDeskRect(this.deskRect);
    // Focusing things inside the world must never scroll the viewport behind the camera's back.
    this.viewport.addEventListener('scroll', () => { this.viewport.scrollTop = 0; this.viewport.scrollLeft = 0; });
  }

  /** The area the paper may be moved around in (keeps it from being flung off into nowhere). */
  setDeskRect(r: Rect) {
    this.deskRect = r;
    this.camera.bounds = { x: r.x - 200, y: r.y - 200, w: r.w + 400, h: r.h + 400 };
  }
}
