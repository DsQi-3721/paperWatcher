// The home desk: the 3D desk top you can turn round (orbit), with the stationery that answers a click and the piles
// of papers read so far. When a paper is opened the camera turns straight down, close over the blank sheet, and the
// scene stays as the still backdrop of the reading desk; going home turns it back to where you were.
import { loadLook } from '../ui/desksettings';
import { PaperFan, type FanLibrary } from '../ui/fan';
import { ObjMenu } from '../ui/objmenu';
import type { PaperMeta } from '../types';
import { OrbitInput } from './orbit';
import type { PileMeta } from './piles.js';
import { DeskScene, type View } from './scene';

export class DeskHome {
  scene: DeskScene;
  orbit: OrbitInput;
  menu: ObjMenu;
  fan: PaperFan;
  mode: 'home' | 'reading' = 'home';
  /** arrange mode is on (src/ui/arrange.ts): clicks move things instead of using them */
  arranging = false;
  /** A pile of past papers was clicked (its index): fan them out. */
  onPile?: (i: number) => void;
  /** The blank sheet was clicked: bring a paper in (anchor = the sheet on screen). */
  onImport?: (anchor: DOMRect) => void;
  /** A click on bare desk or beside it (close whatever is open). */
  onBare?: () => void;
  /** The student moved the camera by hand (drag, wheel, keys). */
  onUserMove?: () => void;
  /** The textbook was clicked: the reading shelf. */
  onShelf?: () => void;
  onEnglish?: () => void;
  private homeView: View | null = null;

  constructor(stage: HTMLElement, hud: HTMLElement, thumb: (m: PaperMeta) => string | undefined, fanLib: FanLibrary<PaperMeta> = {}) {
    this.scene = new DeskScene(stage);
    this.scene.look = loadLook();
    this.menu = new ObjMenu(hud, this.scene);
    this.fan = new PaperFan(hud, thumb, fanLib);
    this.orbit = new OrbitInput(this.scene, this.scene.el);
    this.scene.onFlash = (o, t, ms) => this.menu.flash(o, t, ms);
    this.scene.onRendered = () => this.menu.place();
    this.orbit.onTap = (target) => this.tap(target);
    this.orbit.onMove = () => { this.menu.place(); this.onUserMove?.(); };
    this.scene.el.classList.add('home');
    this.scene.el.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element)?.closest('[data-english-notebook]')) {
        e.preventDefault(); this.onEnglish?.();
      }
    });
  }

  private tap(target: Element) {
    if (this.mode !== 'home' || this.arranging) return;
    if (target.closest('[data-english-notebook]')) { this.menu.close(); this.onEnglish?.(); return; }
    if (target.closest('[data-paper="blank"]')) {
      this.menu.close();
      const spot = this.scene.readingSpot();
      if (spot) this.onImport?.(spot.rect);
      return;
    }
    if (target.closest('[data-paper="book"]') && !target.closest('[data-obj]')) {
      this.menu.close();
      this.menu.hush();
      this.onShelf?.();
      return;
    }
    const { obj, act, el, pile } = this.scene.pick(target);
    if (pile != null) { this.menu.close(); this.menu.hush(); this.onPile?.(pile); return; }
    if (!obj) { this.menu.close(); this.onBare?.(); return; }
    // a part of the object whose card is open does its own thing (the cap clicks, the sheet gets written on)
    if (this.menu.obj === obj && act && obj.acts[act]) {
      obj.acts[act](obj.st, el!, obj.ui);
      this.scene.invalidate(obj);
      return;
    }
    this.menu.show(obj);
  }

  /** The first look at the room, or back from reading. */
  start(papers: PileMeta[], thumb: (m: PileMeta) => string | undefined) {
    this.scene.setPapers(papers, { thumb });
    this.scene.setLook(this.scene.look);
    this.scene.setView(this.scene.defaultView());
  }
  setPapers(papers: PileMeta[], thumb: (m: PileMeta) => string | undefined, hidden?: string) {
    this.scene.setPapers(papers, { thumb, hidden });
  }

  /** Turn straight down onto the desk: the reading backdrop. */
  async toReading(ms = 950) {
    this.menu.close();
    this.menu.hush();
    this.fan.close();
    this.orbit.enabled = false;
    if (this.mode === 'home') this.homeView = { ...this.scene.view };
    this.mode = 'reading';
    this.scene.live = false;
    this.scene.el.classList.remove('home');
    await this.scene.tween(this.scene.topDownView(), ms);
    if (this.mode === 'reading') { this.scene.el.classList.add('reading'); this.scene.bg.pause(true); }
  }
  /** Straight to the backdrop with no move (opening a paper from a link). */
  readingNow() {
    this.menu.close();
    this.menu.hush();
    this.orbit.enabled = false;
    this.mode = 'reading';
    this.scene.live = false;
    this.scene.el.classList.remove('home');
    this.scene.el.classList.add('reading');
    this.scene.bg.pause(true);
    this.scene.setView(this.scene.topDownView());
  }
  /** Where the camera will go back to (the view before the last turn down). */
  returnView(): View { return this.homeView ?? this.scene.defaultView(); }
  /** Turn back to where the student was looking from. */
  async toHome(ms = 950) {
    this.mode = 'home';
    this.scene.live = true;
    this.scene.el.classList.remove('reading');
    this.scene.bg.pause(false);
    this.scene.resume();
    await this.scene.tween(this.homeView ?? this.scene.defaultView(), ms);
    this.scene.el.classList.add('home');
    this.orbit.enabled = true;
  }

  resize() {
    this.scene.measure();
    if (this.mode === 'reading') this.scene.setView(this.scene.topDownView());
    else this.scene.render();
    if (this.menu.open) this.menu.place();
  }
}
