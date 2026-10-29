// Paper Watcher: the desk, the paper on it, the pencil in your hand and the AI beside you.
import { api } from './api';
import { Desk } from './desk/desk';
import { isTyping, type PointerDelegate } from './desk/input';
import { clearAway, dropAndDeal, Flyer, gather, startPrint } from './desk/stack';
import { ViewBar } from './ui/viewbar';
import { Arrange } from './ui/arrange';
import { Ambience } from './ui/ambience';
import { BookFan } from './ui/fan';
import { BookImport } from './ui/bookimport';
import { Shelf } from './books/shelf';
import { BookReader } from './books/reader/index';
import { BOOK_ACCEPT, parseBook } from './books/formats/index';
import type { BookDoc, BookMeta } from './books/types';
import { DeskHome } from './scene/home';
import type { PileMeta } from './scene/piles.js';
import { installTextures } from './desk/textures';
import { roughRect } from './ink/sketch';
import { Arrows } from './notes/arrows';
import { Marks } from './notes/marks';
import { Notes, type SelectionInfo } from './notes/notes';
import { Preview } from './notes/preview';
import { firstPageJpeg, PaperDoc, thumbFor } from './pdf/doc';
import { detectFigures, FIGURE_SCALE, type Figure } from './pdf/figures';
import type { PageText } from './pdf/textmodel';
import { Reader } from './reader';
import { canvasToDataUrl, citation, copyImage, cropRegion, download, notesToMarkdown, safeName } from './select/capture';
import { SelectionController, type Selection, type Tool } from './select/selection';
import type { HighlightColor } from './theme';
import type { Anchor, Annotation, LayoutMode, MarkStyle, PaperMeta, Settings, TextRange } from './types';
import { debounce, h, idle, nextFrame, rafThrottle, s, sleep } from './util/dom';
import type { V3 } from './scene/types';
import { inflate, unionAll, type Pt, type Rect } from './util/geom';
import { Rng } from './util/rng';
import { ICONS } from './ui/icons';
import { Importer } from './ui/importer';
import { LibraryCard, type LibraryHost } from './ui/library';
import { TagEditor } from './ui/tagedit';
import { bookLibrary, paperLibrary } from './library/configs';
import { bookSections, bookWords, paperSections, paperWords, tagCounts } from './library/facets';
import type { LibKind } from './api';
import { NotesList } from './ui/noteslist';
import { Selbar } from './ui/selbar';
import { SettingsCard } from './ui/settings';
import { DeskSettings } from './ui/desksettings';
import { WOODS } from './scene/props.js';
import { Toasts } from './ui/toast';
import { Toc } from './ui/toc';
import { deskButton, Tray } from './ui/tray';
import { EnglishNotebook } from './english/notebook';
import { PaperSearch } from './ui/papersearch';

/**
 * The way a sheet travels from one place on the desk to another (both given as world corners, top-left first): it is
 * lifted, carried in an arc and put down, turning and changing shape from `from` to `to`.
 */
function sheetPath(from: V3[], to: V3[]) {
  const frame = (q: V3[]) => {
    const ux = q[1][0] - q[0][0], uy = q[1][1] - q[0][1], vx = q[3][0] - q[0][0], vy = q[3][1] - q[0][1];
    const w = Math.hypot(ux, uy), h = Math.hypot(vx, vy);
    return { c: [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2, (q[0][2] + q[2][2]) / 2], a: Math.atan2(uy, ux), w, h };
  };
  const A = frame(from), B = frame(to);
  let da = B.a - A.a;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const lift = 150;
  return (k: number) => {
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const c = [A.c[0] + (B.c[0] - A.c[0]) * e, A.c[1] + (B.c[1] - A.c[1]) * e, A.c[2] + (B.c[2] - A.c[2]) * e + lift * Math.sin(Math.PI * e)];
    const a = A.a + da * e, w = A.w + (B.w - A.w) * e, h = A.h + (B.h - A.h) * e;
    const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
    // which way is "down the page" (v) follows the corners' own handedness
    const sgn = Math.sign((to[1][0] - to[0][0]) * (to[3][1] - to[0][1]) - (to[1][1] - to[0][1]) * (to[3][0] - to[0][0])) || 1;
    const pt = (i: number, j: number): V3 => [c[0] + ux * w / 2 * i + vx * h / 2 * j * sgn, c[1] + uy * w / 2 * i + vy * h / 2 * j * sgn, c[2]];
    return { pts: [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)] };
  };
}

export class App {
  desk: Desk;
  hud: HTMLDivElement;
  reader: Reader | null = null;
  doc: PaperDoc | null = null;
  meta: PaperMeta | null = null;
  tool: Tool = 'pen';
  hlColor: HighlightColor = 'yellow';
  settings: Settings | null = null;
  figures = new Map<number, Figure[]>();
  marks: Marks;
  arrows: Arrows;
  preview: Preview;
  notes: Notes;
  selection: SelectionController;
  /** The 3D classroom desk: home, and the backdrop while reading. */
  home: DeskHome;
  toasts: Toasts;
  tray: Tray;
  selbar: Selbar;
  importer: Importer;
  settingsCard: SettingsCard;
  deskSettings: DeskSettings | null = null;
  notesList: NotesList;
  toc: Toc;
  english!: EnglishNotebook;
  paperSearch!: PaperSearch;
  private pageTag!: HTMLDivElement;
  private noteTab!: HTMLButtonElement;
  private titleTag!: HTMLDivElement;
  private zoomLabel!: HTMLSpanElement;
  private layoutBtn!: HTMLButtonElement;
  private lamp!: HTMLButtonElement;
  private helpCard!: HTMLDivElement;
  private paperTextP: Promise<void> | null = null;
  private viewBar!: ViewBar;
  private arrange!: Arrange;
  /** the light round what is read, and the immersive mode (shared with books) */
  ambience!: Ambience;
  /** the reading shelf on the desk's textbook (novels, comics, magazines) */
  shelf = new Shelf();
  private bookImport!: BookImport;
  private bookFan!: BookFan;
  /** the libraries on a card (the little pile of papers while reading, the book reader's 书架, the fans' 整理) */
  private paperLib!: LibraryCard<PaperMeta>;
  private bookLib!: LibraryCard<BookMeta>;
  private tagEditor!: TagEditor;
  /** a paper being brought back from the bin's records (to tell if the download was another version) */
  private reimporting: PaperMeta | null = null;
  private booksLayer!: HTMLDivElement;
  /** the book open now, if any */
  book: { reader: BookReader; meta: BookMeta; doc: BookDoc } | null = null;
  /** the papers on the desk's piles, as last fetched (a pile's fan and coming back from a book use these) */
  private papers: PaperMeta[] = [];
  private ambienceCard!: HTMLDivElement;
  private aiCount = 0;
  private openSeq = 0;
  private transitioning = false;
  private hintPage = -1;
  private figJobs = new Set<number>();
  /** the figures found on the last few papers read, by paper (finding them means drawing each page again) */
  private figCache = new Map<string, Map<number, Figure[]>>();

  constructor(root: HTMLElement) {
    installTextures();
    const delegate: PointerDelegate = {
      down: (e, w) => this.selection.down(e, w),
      move: (e, w) => this.selection.move(e, w),
      up: (e, w) => { void this.selection.up(e, w); },
      cancel: () => this.selection.cancel(),
      // The pointer over a scratch sheet belongs to the sheet: nothing on the page underneath reacts.
      hover: (e, w) => this.selection.hover(e && overSheet(e) ? null : e, e && overSheet(e) ? null : w),
      click: (_e, w) => this.deskTap(w),
    };
    this.desk = new Desk(root, delegate);
    this.hud = h('div', { id: 'hud' });
    root.append(this.hud);
    this.home = new DeskHome(this.desk.stage, this.hud, (m) => (m.thumb ? api.thumbUrl(m) : undefined), {
      tags: (m, at, from) => this.editTags('papers', [m], at, from),
      trash: (m) => this.trash('papers', [m]),
      filter: { sections: () => paperSections(this.papers), all: () => this.papers, words: paperWords },
      organize: () => this.toggleLibrary('papers'),
      bin: () => this.toggleBin('papers'),
      keysOff: () => this.paperLib.open || this.tagEditor.open,
    });
    this.ambience = new Ambience(this.home.scene.el);
    this.booksLayer = h('div', { class: 'books-layer' });
    root.insertBefore(this.booksLayer, this.hud);
    this.bookImport = new BookImport(this.hud, this.shelf);
    this.bookImport.onRead = (m) => { void this.openBook(m); };
    this.bookFan = new BookFan(this.hud, (m) => this.shelf.coverUrl(m), [
      { label: '＋ 导入读物', title: '把小说、漫画、杂志放上书架', cls: 'add', on: () => { this.bookFan.close(); this.bookImport.show(); } },
    ], {
      tags: (m, at, from) => this.editTags('books', [m], at, from),
      trash: (m) => this.trash('books', [m]),
      filter: { sections: () => bookSections(this.shelf.books), all: () => this.shelf.books, words: bookWords },
      organize: () => this.toggleLibrary('books'),
      bin: () => this.toggleBin('books'),
      keysOff: () => this.bookLib.open || this.tagEditor.open,
    });
    this.bookFan.onPick = (m) => { void this.openBook(m); };
    this.shelf.onChange = () => { this.updateTextbook(); this.bookLib?.update(this.shelf.books); };
    // the textbook: the shelf, fanned out like the paper piles (or the import card, while the shelf is empty)
    this.home.onShelf = async () => {
      this.importer.hide();
      const books = await this.shelf.refresh();
      if (!books.length) { this.bookImport.show('file'); return; }
      const q = this.home.scene.textbookQuad();
      this.bookFan.show(books, q.sheet, q.deg);
    };
    this.home.onImport = (r) => this.importer.toggle(r);
    this.home.onBare = () => { this.importer.hide(); this.deskSettings?.hide(); };
    // a pile of past papers: fan out the ones in it, the last read first (on top); the one picked is opened
    this.home.onPile = async (i) => {
      this.importer.hide();
      const ids = this.home.scene.pileIds(i), all = this.papers.length ? this.papers : await api.papers().catch(() => [] as PaperMeta[]);
      const mine = all.filter((m) => ids.includes(m.id)).sort((a, b) => ids.indexOf(b.id) - ids.indexOf(a.id));
      const papers = mine.length ? mine : all;
      const q = this.home.scene.pileScreen(i);
      if (papers.length) this.home.fan.show(papers, q ? q.sheet : null, q ? q.deg : 0);
    };
    this.home.fan.onPick = (m) => { void this.openPaper(m, 'library'); };
    window.addEventListener('resize', debounce(() => this.home.resize(), 150));
    this.toasts = new Toasts(this.hud);
    this.marks = new Marks({ reader: () => this.reader, text: (p) => this.text(p) });
    this.arrows = new Arrows(this.desk.arrows);
    this.preview = new Preview(this.hud);
    this.preview.onOpen = (id) => this.openNote(id);
    // Anything else the reader does makes the preview step aside.
    window.addEventListener('pointerdown', (e) => { if (!this.preview.el.contains(e.target as Node)) this.preview.dismiss(); }, true);
    window.addEventListener('wheel', (e) => { if (!this.preview.el.contains(e.target as Node)) this.preview.dismiss(); }, { capture: true, passive: true });
    window.addEventListener('keydown', () => this.preview.dismiss(), true);
    this.notes = new Notes({
      desk: this.desk,
      marks: this.marks,
      arrows: this.arrows,
      preview: this.preview,
      reader: () => this.reader,
      doc: () => this.doc,
      text: (p) => this.text(p),
      settings: () => this.settings,
      describe: (a) => this.describe(a),
      images: (a) => this.images(a),
      outline: () => this.outline(),
      ensurePaperText: () => this.ensurePaperText(),
      toast: (m, k) => this.toasts.show(m, k),
      aiActivity: (d) => this.aiActivity(d),
      onNotesChanged: () => { if (this.notesList.open) this.showNotesList(); },
      onSheet: () => this.updateNoteTab(),
      english: (anchor) => { void this.learnEnglish(anchor); },
    });
    this.selection = new SelectionController({
      reader: () => this.reader,
      text: (p) => this.text(p),
      figures: (p) => this.figures.get(p),
      sectionRange: (p, y) => this.sectionRange(p, y),
      tool: () => this.tool,
      markAt: (p, x, y) => (document.body.classList.contains('hide-ink') ? null : this.marks.hit(p, x, y)),
      onSelect: (sel, final) => this.onSelect(sel, final),
      onMarkClick: (id) => this.openNote(id),
      onMarkHover: (id, e) => this.onMarkHover(id, e),
      onErase: (id) => this.notes.erase(id),
      onHover: (p, x, y, kind, fig) => this.onHover(p, x, y, kind, fig),
    });
    this.selbar = new Selbar(this.hud, {
      ask: (prompt) => this.askAboutSelection(prompt),
      highlight: (c) => this.highlightSelection(c),
      copy: () => this.copySelection(),
      exportMenu: (el) => this.exportMenu(el),
      english: (translate) => { const sel = this.selection.sel; if (sel?.kind === 'text') void this.learnEnglish(this.anchorFromSelection(sel), translate); },
    });
    this.tray = new Tray(this.hud);
    this.tray.onTool = (t) => this.setTool(t);
    this.tray.onColor = (c) => { this.hlColor = c; this.setTool('highlighter'); };
    this.importer = new Importer(this.hud, {
      books: (files) => { if (!this.book && !this.reader) void this.bookImport.addFiles(files); else this.toasts.show('先回到书桌，再把书放上书架'); },
      open: (m, via) => this.openPaper(m, via),
      toast: (m, k) => this.toasts.show(m, k),
    });
    this.settingsCard = new SettingsCard(this.hud, (m, k) => this.toasts.show(m, k));
    this.settingsCard.onChange = (st) => { this.settings = st; this.updateLamp(); };
    this.notesList = new NotesList(this.hud);
    this.notesList.onOpen = (a) => this.openNote(a.id, true);
    this.notesList.onExport = () => this.exportNotes();
    this.notesList.onAskPaper = () => this.askAboutPaper();
    this.toc = new Toc(this.hud);
    this.english = new EnglishNotebook(this.hud, {
      currentPaper: () => this.meta,
      ensureText: async (meta, progress, signal) => {
        const cached = await api.paperTextStatus(meta.id, signal);
        if (cached.ready) { progress({ phase: 'reading', text: '论文文字已就绪，使用已有内容' }); return; }
        if (this.meta?.id === meta.id && this.doc) { await this.ensurePaperText(); return; }
        progress({ phase: 'reading', text: '首次读取这篇论文…' });
        const doc = await PaperDoc.open(meta);
        const cancel = () => doc.destroy();
        signal.addEventListener('abort', cancel, { once: true });
        try {
          signal.throwIfAborted();
          const text = await doc.fullText((i) => progress({ phase: 'reading', text: '正在提取论文文字…', pagesDone: i + 1, pagesTotal: doc.numPages }));
          signal.throwIfAborted(); await api.putText(meta.id, text);
        } finally { signal.removeEventListener('abort', cancel); doc.destroy(); }
      },
      openSource: async (id, page, text) => {
        if (this.meta?.id !== id) await this.openPaper(await api.meta(id), 'library');
        if (this.meta?.id !== id || !this.reader) throw new Error('请稍后再打开来源论文');
        this.reader.goToPage(page - 1);
        this.paperSearch.show(text.slice(0, 100));
      },
    });
    this.home.onEnglish = () => { void this.english.show(); };
    this.home.orbit.keysOff = () => this.english.open || this.paperLib?.open || this.tagEditor?.open;
    this.paperSearch = new PaperSearch(this.hud, () => this.doc, () => this.reader, () => { this.notes.close(false); this.selection.clear(); this.selbar.hide(); });
    this.toc.onJump = (sec) => {
      const reader = this.reader;
      if (!reader) return;
      this.notes.close(false);
      const cam = this.desk.camera;
      cam.panTo(reader.viewForPage(sec.page, true, Math.max(0, sec.y - 40), cam.view.z, cam.view.x));
    };
    this.buildHud();
    this.setTool('pen');

    const cam = this.desk.camera;
    const onCam = rafThrottle(() => this.onCamera());
    cam.onChange(onCam);
    const saveView = debounce(() => this.saveView(), 1500);
    cam.onSettle(() => { onCam(); saveView(); });
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('beforeunload', () => { this.notes.save(); this.saveView(); });
    this.boot();
  }

  /* ---------------- boot & papers ---------------- */

  private async boot() {
    try { this.settings = await api.settings(); } catch { /* server not ready */ }
    this.updateLamp();
    const id = new URLSearchParams(location.search).get('paper');
    if (id) {
      try {
        const meta = await api.meta(id);
        this.papers = await api.papers().catch(() => [] as PaperMeta[]);
        this.home.setPapers(this.papers.filter((p) => p.id !== meta.id), this.thumb);
        this.home.readingNow();
        await this.openPaper(meta, 'library');
        (window as any).__ready = true;
        return;
      } catch { /* fall through to the empty desk */ }
    }
    await this.showHome();
    (window as any).__ready = true;
  }

  /** A paper's first page, for the top of its pile. */
  private thumb = (m: PileMeta) => ((m as PaperMeta).thumb ? api.thumbUrl(m as PaperMeta) : undefined);

  /** The room with no paper open: the 3D desk to walk round, its stationery, and the piles of everything read so
   *  far (`returning`: the camera turns back up from the reading backdrop). */
  /** `papers`: the list, if the caller has just fetched it; `shelfFresh`: the shelf was just refreshed. */
  private async showHome(opts: { returning?: boolean; turned?: Promise<void>; papers?: PaperMeta[]; shelfFresh?: boolean } = {}) {
    this.ambience?.setReading(false);
    const r = { x: -1300, y: -900, w: 2600, h: 1800 };
    this.desk.setDeskRect(r);
    const cam = this.desk.camera;
    cam.set({ x: 0, y: 20, z: Math.min(cam.vw / 1900, cam.vh / 1250, 1) });
    this.desk.input.enabled = false;
    document.body.classList.add('no-paper');
    this.updateTitle();
    if (location.search) history.replaceState(null, '', location.pathname);
    // coming back: the piles are already set, the camera turns back at once (the list is only for thumbnails)
    const turned = opts.turned ?? (opts.returning ? this.home.toHome() : null);
    const papers = opts.papers ?? await api.papers().catch(() => [] as PaperMeta[]);
    this.papers = papers;
    if (!opts.shelfFresh) void this.shelf.refresh();
    if (this.reader) return;   // a paper was opened meanwhile
    if (turned) await turned;
    else this.home.start(papers, this.thumb);
    void this.fillThumbs(papers);
  }

  /** Put the paper back on its pile and return to the desk: the pages gather onto page 1 on the blank sheet, then
   *  page 1 is picked up and carried over onto its pile while the camera turns back up to where you were, as one
   *  move (about a second). */
  async goHome() {
    const reader = this.reader, meta = this.meta;
    if (!reader || !meta || this.transitioning || document.body.classList.contains('opening')) return;
    this.transitioning = true;
    try {
      this.selection.clear();
      this.selbar.hide();
      this.preview.hide();
      this.notes.close(false);
      if (this.settingsCard.open) this.settingsCard.hide();
      if (this.notesList.open) this.notesList.hide();
      if (this.toc.open) this.toc.hide();
      this.paperLib.hide();
      this.tagEditor.close();
      this.helpCard.classList.remove('on');
      this.ambienceCard.classList.remove('on');
      this.ambience.setReading(false);
      this.importer.hide();
      this.saveView();
      this.notes.save();
      document.body.classList.add('no-paper');
      const scene = this.home.scene;
      const papersP = api.papers().catch(() => [] as PaperMeta[]);
      const spot = scene.readingSpot(), s0 = reader.slots[0], raster = reader.views[0].canvas;
      // 1. the pages come together onto page 1, lying on the blank sheet again
      await gather(this.desk, reader, spot ? { sheet: spot.sheet, deg: spot.deg } : null, 360);
      // the paper being put away is the one read last: it goes on top of the newest pile (drawn there once it lands)
      const papers = await papersP;
      const mine = { ...(papers.find((p) => p.id === meta.id) || meta), openedAt: Date.now() };
      const list = [...papers.filter((p) => p.id !== meta.id), mine];
      this.home.setPapers(list, this.thumb, meta.id);
      const pic = this.thumb(mine);
      if (pic) new Image().src = pic;
      const to = scene.pileCorners(meta.id);
      if (!to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.closePaper();
        scene.showPaper(meta.id);
        await this.showHome({ returning: true, papers: list });
        return;
      }
      // 2. page 1 leaves the reading desk as one sheet (the reader goes), 3. it is carried over and put down on its
      //    pile while the camera turns back up
      // where page 1 lies now, as a sheet on the desk (unprojected from the screen, so the hand-over is seamless)
      const r1 = reader.views[0].el.getBoundingClientRect(), zTop = scene.spotCorners()[0][2] + 0.4;
      const from = [[r1.left, r1.top], [r1.right, r1.top], [r1.right, r1.bottom], [r1.left, r1.bottom]].map(([x, y]) => scene.unprojectAt(x, y, zTop));
      const path = sheetPath(from, to);
      const flyer = new Flyer(this.desk.stage, s0.w, s0.h, raster, pic);
      const place = (k: number) => {
        const c = path(k);
        flyer.place(scene.projectAt(c.pts), scene.projectAt(scene.shadowOnDesk(c.pts)), 0.42 - 0.22 * Math.sin(Math.PI * Math.min(1, k * 1.2)));
      };
      place(0);
      this.closePaper();
      const ms = 760, t0 = performance.now();
      scene.onFrame = () => place(Math.min(1, (performance.now() - t0) / ms));
      const turned = this.home.toHome(ms);
      await turned;
      scene.onFrame = undefined;
      scene.showPaper(meta.id);
      flyer.remove(110);
      await this.showHome({ returning: true, turned, papers: list });
    } finally {
      this.transitioning = false;
    }
  }

  /** First pages for the shelf, for papers that have none yet: quietly, one at a time. */
  private async fillThumbs(papers: PaperMeta[]) {
    const missing = papers.filter((p) => !p.thumb).slice(0, 12);
    let made = 0;
    for (const m of missing) {
      await new Promise((r) => idle(() => r(null), 800));
      if (this.reader) return;
      try {
        const jpeg = await thumbFor(m);
        const saved = await api.putThumb(m.id, jpeg);
        m.thumb = saved.thumb;
        made++;
      } catch (e) {
        console.warn('thumbnail failed', m.id, e);
      }
    }
    if (made && !this.reader) this.home.setPapers(papers, this.thumb);
  }

  private async saveThumb(meta: PaperMeta, doc: PaperDoc) {
    try {
      const jpeg = await firstPageJpeg(await doc.page(0));
      const saved = await api.putThumb(meta.id, jpeg);
      meta.thumb = saved.thumb;
    } catch (e) {
      console.warn('thumbnail failed', e);
    }
  }

  async openPaper(meta: PaperMeta, via: 'url' | 'file' | 'library') {
    if (this.transitioning) return;
    if (this.arrange?.on) this.arrange.exit();
    this.home.fan.close();
    this.bookFan.close();
    const seq = ++this.openSeq;
    this.importer.hide();
    this.selection.clear();
    this.selbar.hide();
    this.preview.hide();
    this.notes.close(false);
    this.paperLib.hide();
    this.tagEditor.close();
    document.body.classList.add('opening');
    // brought back from the bin's records but downloaded as another version: its old record (notes) stays in the bin
    const back = this.reimporting;
    this.reimporting = null;
    if (back && via !== 'library' && back.id !== meta.id) {
      if (back.tags?.length) void api.patchMeta(meta.id, { tags: [...(meta.tags || []), ...back.tags] }).catch(() => {});
      this.toasts.show('下载到的是另一个版本：标签带过来了，旧的笔记还在垃圾桶的记录里', 'info', 6000);
    }
    // the paper is fetched and opened while the one on the desk (if any) clears away; that one keeps where you were
    const opening = PaperDoc.open(meta);
    opening.catch(() => { /* reported below */ });
    if (this.reader) {
      this.saveView();
      await clearAway(this.reader);
      this.closePaper();
    }
    document.body.classList.remove('no-paper');
    this.toasts.show(`摊开《${meta.title.length > 40 ? meta.title.slice(0, 38) + '…' : meta.title}》…`);
    // the paper and its pages are made ready first (while the picked card rises), then the camera turns straight down
    // with the main thread to itself; the paper starts to fall before the camera has quite arrived (where it lands is
    // known from the end of the turn), and the pages are printed once it has
    const TURN = 620, fromHome = this.home.mode === 'home';
    const spot = this.home.scene.readingSpotAt(this.home.scene.topDownView());
    let doc: PaperDoc;
    try {
      doc = await opening;
    } catch (e: any) {
      document.body.classList.remove('opening');
      this.toasts.show('打不开这篇 PDF：' + (e?.message || e), 'error');
      if (!this.reader) void this.showHome();
      return;
    }
    if (seq !== this.openSeq) { doc.destroy(); return; }
    this.doc = doc;
    this.meta = meta;
    this.figures = this.figCache.get(meta.id) ?? new Map();
    this.figCache.delete(meta.id);
    this.figCache.set(meta.id, this.figures);
    for (const k of this.figCache.keys()) { if (this.figCache.size <= 8) break; this.figCache.delete(k); }
    this.figJobs.clear();
    this.paperTextP = null;
    const layout: LayoutMode = meta.view?.layout || 'column';
    const reader = new Reader(this.desk, doc, layout);
    // nothing shows (or prints) until the stack lands and deals the pages out
    reader.renderer.paused = true;
    for (const v of reader.views) v.el.style.visibility = 'hidden';
    this.reader = reader;
    reader.onFirstRender((i) => this.pageRendered(i));
    reader.onLayout(() => {
      this.notes.drawAll();
      this.updateLayoutBtn();
    });
    this.updateLayoutBtn();
    this.updateTitle();
    history.replaceState(null, '', `?paper=${meta.id}`);
    // reopening a paper lands where you left it
    const saved = via === 'library' && meta.view && typeof meta.view.z === 'number' && meta.view.x !== undefined ? meta.view : null;
    const target = saved ? { x: saved.x!, y: saved.y!, z: saved.z! } : reader.viewForPage(0);
    // page 1 shows its picture until it is printed; text for the first pages now, so the pencil works as soon as the
    // pages land
    if (meta.thumb) reader.views[0].sheet.style.background = `#fcfbf6 url("${api.thumbUrl(meta)}") center / 100% 100% no-repeat`;
    await Promise.all([doc.text(0).catch((e) => console.warn('page 1 text', e)), this.notes.load(meta.id)]);
    if (seq !== this.openSeq) return;
    void document.body.offsetHeight;   // the pages' layout now, not in the camera's first frames
    const t0 = performance.now();
    const turned = fromHome ? this.home.toReading(TURN) : Promise.resolve();
    // printing draws on the main thread: it waits for the camera
    const printed = turned.then(() => startPrint(this.desk, reader, target));
    if (fromHome) await sleep(Math.max(0, t0 + TURN * 0.55 - performance.now()));
    else await turned;
    if (seq !== this.openSeq) return;
    this.desk.input.enabled = true;
    await Promise.all([dropAndDeal(this.desk, reader, { fast: via === 'library', target, landing: spot ? { sheet: spot.sheet, deg: spot.deg } : null, printed }), turned]);
    if (seq !== this.openSeq) return;
    document.body.classList.remove('opening');
    this.ambience.setReading(true);
    if (!meta.thumb) void this.saveThumb(meta, doc);
    this.notes.drawAll();
    // Background work, gently: every page's text model, the paper.txt for the agents, a better title.
    this.prepareText(seq);
    api.patchMeta(meta.id, { openedAt: Date.now(), pages: doc.numPages }).catch(() => {});
  }

  /* ---------------- books ---------------- */

  /** The textbook wears the book read last (its cover and colour), or stays the 语文 textbook. */
  private updateTextbook() {
    const c = this.shelf.current;
    this.home.scene.setShelfLook(c && c.cover ? { cover: api.bookCoverUrl(c), color: c.color, title: c.title } : null);
  }

  /** Open a book from the shelf: the camera turns down onto the desk, which goes soft, and the book comes up out of
   *  the textbook into its pages. */
  async openBook(meta: BookMeta, opts: { switching?: boolean } = {}) {
    if (this.transitioning || this.book || this.reader) return;
    if (this.arrange?.on) this.arrange.exit();
    this.home.fan.close();
    this.bookFan.close();
    this.transitioning = true;
    // a book read instead of another (from the 书架) comes up where the other was; from the desk, out of the textbook
    const from = opts.switching ? null : this.home.scene.textbookQuad();
    let doc: BookDoc | null = null;
    try {
      this.importer.hide();
      this.bookImport.hide();
      this.deskSettings?.hide();
      document.body.classList.add('book-open');
      this.toasts.show(`翻开《${meta.title.length > 30 ? meta.title.slice(0, 28) + '…' : meta.title}》…`);
      // 1. read the book and lay out its first pages while the chosen card rises, before anything moves: the camera's
      //    turn then has the main thread to itself (reading the file in the middle of it made it stutter)
      doc = await parseBook(await api.bookFile(meta.id), meta.fileName || `${meta.title}.${meta.format}`, meta.format);
      this.booksLayer.classList.add('preparing');
      const reader = new BookReader(this.booksLayer, doc, meta, this.shelf.settings(), {
        onProgress: (p) => this.shelf.saveProgress(meta.id, p),
        onSettings: (st) => this.shelf.saveSettings(st),
        onBookmarks: (b) => this.shelf.saveBookmarks(meta.id, b),
        onClose: () => { void this.closeBook(); },
        onShelf: () => this.toggleLibrary('books'),
        keysOff: () => this.bookLib.open || this.tagEditor.open || this.bookImport.open,
        ambience: { panel: () => this.ambience.panel(), immersive: () => this.ambience.immersive, setImmersive: (on) => this.ambience.setImmersive(on) },
      });
      this.book = { reader, meta, doc };
      await reader.open(meta.progress);
      // its layout, text shaping and paint now (two frames), not in the camera's first frames
      await nextFrame(); await nextFrame();
      // 2. the camera turns down; the book comes out of the textbook as it arrives (a compositor animation: smooth
      //    whatever the main thread is doing)
      const turned = this.home.mode === 'home' ? this.home.toReading(620) : Promise.resolve();
      const to = reader.pageRect();
      await sleep(60);
      this.booksLayer.classList.remove('preparing');
      if (to.width && from) {
        const sx = from.rect.width / to.width, sy = from.rect.height / to.height;
        this.booksLayer.animate([
          { transformOrigin: `${to.x}px ${to.y}px`, transform: `translate(${from.rect.x - to.x}px, ${from.rect.y - to.y}px) scale(${sx}, ${sy})`, opacity: 0.4 },
          { transformOrigin: `${to.x}px ${to.y}px`, transform: 'none', opacity: 1 },
        ], { duration: 560, easing: 'cubic-bezier(.3, .9, .3, 1)' });
      } else if (opts.switching) {
        this.booksLayer.animate([{ opacity: 0, transform: 'translateY(18px) scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3, .9, .3, 1)' });
      }
      await turned;
      this.ambience.setReading(true);
      void this.shelf.opened(meta.id);
    } catch (e) {
      // the reader lets go of its document; one that never got a reader is let go of here
      if (this.book) this.book.reader.destroy(); else if (doc?.kind === 'fixed') doc.destroy?.();
      this.book = null;
      this.booksLayer.classList.remove('preparing');
      document.body.classList.remove('book-open');
      this.toasts.show('打不开这本书：' + ((e as Error).message || e), 'error');
      this.transitioning = false;
      await this.showHome({ returning: true });
    } finally {
      this.transitioning = false;
    }
  }

  /** Read another book from the 书架 without going back to the desk: where you were in this one is kept, its pages
   *  slip away and the other book comes up in their place. */
  private async switchBook(meta: BookMeta) {
    const b = this.book;
    if (!b || b.meta.id === meta.id || this.transitioning) return;
    this.transitioning = true;
    try {
      this.bookLib.hide();
      await this.shelf.flush(b.meta.id);
      await this.booksLayer.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(14px) scale(.985)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.catch(() => {});
      b.reader.destroy();
      this.book = null;
      for (const a of this.booksLayer.getAnimations()) a.cancel();
    } finally {
      this.transitioning = false;
    }
    await this.openBook(meta, { switching: true });
  }

  /** Back to the desk: the book goes back into the textbook as the camera turns back up; the textbook now wears it. */
  async closeBook() {
    const b = this.book;
    if (!b || this.transitioning) return;
    this.transitioning = true;
    try {
      await this.shelf.flush(b.meta.id);
      this.ambience.setReading(false);
      const r = b.reader.pageRect(), to = this.home.scene.textbookQuad(this.home.returnView());
      const turned = this.home.toHome(700);
      if (r.width && to) {
        const sx = to.rect.width / r.width, sy = to.rect.height / r.height;
        await this.booksLayer.animate([
          { transformOrigin: `${r.x}px ${r.y}px`, transform: 'none', opacity: 1 },
          { transformOrigin: `${r.x}px ${r.y}px`, transform: `translate(${to.rect.x - r.x}px, ${to.rect.y - r.y}px) scale(${sx}, ${sy})`, opacity: 0 },
        ], { duration: 620, easing: 'cubic-bezier(.5, 0, .3, 1)' }).finished.catch(() => {});
      }
      b.reader.destroy();   // and its document
      this.book = null;
      document.body.classList.remove('book-open');
      await this.shelf.refresh();
      await this.showHome({ returning: true, turned, papers: this.papers.length ? this.papers : undefined, shelfFresh: true });
    } finally {
      this.transitioning = false;
    }
  }

  private closePaper() {
    this.paperSearch?.hide();
    this.notes.reset();
    this.marks.clearAll();
    this.reader?.destroy();
    this.reader = null;
    this.doc = null;
    this.meta = null;
    this.figures = new Map();
    this.figJobs.clear();
  }

  private prepareText(seq: number) {
    const doc = this.doc!;
    const meta = this.meta!;
    this.paperTextP = (async () => {
      const text = await doc.fullText();
      if (seq !== this.openSeq) return;
      await api.putText(meta.id, text);
      const title = await doc.guessTitle();
      if (title && (meta.title === meta.fileName?.replace(/\.pdf$/i, '') || /^untitled/i.test(meta.title))) {
        meta.title = title;
        api.patchMeta(meta.id, { title }).catch(() => {});
        this.updateTitle();
      }
    })().catch((e) => console.warn('paper text failed', e));
  }

  ensurePaperText(): Promise<void> {
    return this.paperTextP || Promise.resolve();
  }

  text(p: number): PageText | undefined {
    return this.doc?.texts[p];
  }

  private pageRendered(i: number) {
    const doc = this.doc;
    if (!doc) return;
    doc.text(i).then(() => {
      if (this.doc !== doc) return;
      this.notes.drawAll(i);
      this.scheduleFigures(i);
    }).catch(() => { /* the paper was closed meanwhile */ });
  }

  private scheduleFigures(i: number) {
    if (this.figJobs.has(i) || this.figures.has(i)) return;
    this.figJobs.add(i);
    const doc = this.doc!, figures = this.figures;
    idle(async () => {
      let canvas: HTMLCanvasElement | null = null;
      try {
        if (this.doc !== doc || !this.reader) return;
        const pt = await doc.text(i);
        if (this.doc !== doc || !this.reader) return;
        canvas = await this.reader.renderer.snapshot(i, FIGURE_SCALE, '#ffffff');
        if (this.doc !== doc) return;
        figures.set(i, detectFigures(canvas, pt));
      } catch (e) {
        if (this.doc === doc) console.warn('figure detection failed', i, e);
      } finally {
        if (canvas) canvas.width = canvas.height = 0;
      }
    }, 1500);
  }

  /* ---------------- AI context ---------------- */

  private async describe(a: Anchor): Promise<SelectionInfo> {
    const doc = this.doc!;
    if (a.kind === 'paper') return { kind: 'paper' };
    if (a.kind === 'region') {
      const pt = await doc.text(a.page);
      const sec = await doc.sectionAt(a.page, Math.max(0, pt.caretAt(a.rect.x + 2, a.rect.y + 2)));
      const fig = this.figures.get(a.page)?.find((f) => Math.abs(f.rect.x - a.rect.x) < 4 && Math.abs(f.rect.y - a.rect.y) < 4);
      return {
        kind: a.figKind === 'graphic' ? 'figure' : a.figKind,
        page: a.page + 1,
        text: pt.textInRect(a.rect).slice(0, 4000),
        label: a.label,
        caption: fig?.caption,
        section: sec?.title,
      };
    }
    const r0 = a.ranges[0], rn = a.ranges[a.ranges.length - 1];
    const parts: string[] = [];
    for (const r of a.ranges) parts.push((await doc.text(r.page)).slice(r.start, r.end));
    const pt0 = await doc.text(r0.page);
    const sec = await doc.sectionAt(r0.page, r0.start);
    const context = a.ranges.length === 1 ? pt0.context(r0.start, r0.end) : pt0.context(r0.start, pt0.text.length, 1600);
    return { kind: a.unit, page: r0.page + 1, pageEnd: rn.page + 1, text: parts.join(' ').slice(0, 9000), context, section: sec?.title };
  }

  private async images(a: Anchor): Promise<string[]> {
    if (!this.reader) return [];
    try {
      if (a.kind === 'region') {
        const c = await cropRegion(this.reader.renderer, a.page, inflate(a.rect, 4), 1600);
        return [canvasToDataUrl(c)];
      }
      if (a.kind === 'text' && a.ranges.length === 1) {
        const r = a.ranges[0];
        const pt = this.text(r.page);
        if (!pt) return [];
        // Math does not survive text extraction: send a picture of the selected lines too.
        const lines = new Set<number>();
        for (let i = r.start; i < r.end; i++) lines.add(pt.lineOf[i]);
        const mathy = [...lines].some((li) => li >= 0 && pt.mathiness(li) > 0.12);
        if (!mathy) return [];
        const rects = pt.rangeRects(r.start, r.end);
        const u = unionAll(rects);
        if (!u || u.h > 500) return [];
        const c = await cropRegion(this.reader.renderer, r.page, inflate(u, 6), 1400);
        return [canvasToDataUrl(c)];
      }
    } catch (e) {
      console.warn('crop failed', e);
    }
    return [];
  }

  private async outline(): Promise<string> {
    if (!this.doc) return '';
    const secs = await this.doc.sections();
    return secs.slice(0, 60).map((s) => `p.${s.page + 1} ${'  '.repeat(s.level)}${s.title}`).join('\n');
  }

  private async sectionRange(page: number, y: number): Promise<TextRange[] | null> {
    const doc = this.doc;
    if (!doc) return null;
    const secs = await doc.sections();
    // the section that starts at this heading (closest start at or just above y)
    let k = -1;
    for (let i = 0; i < secs.length; i++) {
      const s0 = secs[i];
      if (s0.page === page && Math.abs(s0.y - y) < 30) { k = i; break; }
    }
    if (k < 0) {
      const pt = await doc.text(page);
      const pi = pt.paras.findIndex((p) => p.kind === 'heading' && Math.abs(p.y0 - y) < 2);
      if (pi < 0) return null;
      // heuristic: until the next heading on this or following pages
      const start = pt.paras[pi].start;
      for (let pg = page; pg < Math.min(doc.numPages, page + 6); pg++) {
        const t = await doc.text(pg);
        const next = t.paras.find((p) => p.kind === 'heading' && (pg > page || p.start > start));
        if (next) return this.rangesFrom({ page, off: start }, { page: pg, off: next.start });
      }
      return this.rangesFrom({ page, off: start }, { page, off: pt.text.length });
    }
    const cur = secs[k];
    let end = secs.slice(k + 1).find((s0) => s0.level <= cur.level) || null;
    const ptStart = await doc.text(cur.page);
    const startLine = ptStart.lines.find((l) => l.y1 >= cur.y - 2) || ptStart.lines[0];
    const endPage = end ? end.page : Math.min(doc.numPages - 1, cur.page + 3);
    const ptEnd = await doc.text(endPage);
    const endOff = end ? (ptEnd.lines.find((l) => l.y1 >= end!.y - 2)?.start ?? ptEnd.text.length) : ptEnd.text.length;
    for (let pg = cur.page; pg <= endPage; pg++) await doc.text(pg);
    return this.rangesFrom({ page: cur.page, off: startLine?.start ?? 0 }, { page: endPage, off: endOff });
  }

  private rangesFrom(a: { page: number; off: number }, b: { page: number; off: number }): TextRange[] {
    const out: TextRange[] = [];
    for (let p = a.page; p <= b.page; p++) {
      const pt = this.text(p);
      if (!pt) continue;
      const s0 = p === a.page ? a.off : 0;
      const e0 = p === b.page ? b.off : pt.text.length;
      if (e0 > s0) out.push({ page: p, start: s0, end: e0 });
    }
    return out;
  }

  /* ---------------- selection → notes ---------------- */

  private onSelect(sel: Selection | null, final: boolean) {
    if (!sel || !final) { this.selbar.hide(); return; }
    if (this.tool === 'highlighter' && sel.kind === 'text') {
      this.highlightSelection(this.hlColor);
      return;
    }
    this.preview.hide();
    this.selbar.show(sel, this.settings?.language || 'auto');
    this.placeSelbar();
  }

  private placeSelbar() {
    const er = this.selection.endRect();
    const reader = this.reader;
    if (!er || !reader || !this.selbar.visible) return;
    const v = reader.views[er.page];
    const cam = this.desk.camera;
    const a = cam.worldToScreen(...xy(v.toWorld(er.rect.x, er.rect.y)));
    const b = cam.worldToScreen(...xy(v.toWorld(er.rect.x + er.rect.w, er.rect.y + er.rect.h)));
    this.selbar.place({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
  }

  private anchorFromSelection(sel: Selection): Anchor {
    if (sel.kind === 'region') {
      return { kind: 'region', page: sel.page, rect: sel.rect, figKind: sel.figKind, label: sel.label, quote: (sel.caption || this.text(sel.page)?.textInRect(sel.rect) || '').slice(0, 400) };
    }
    const quote = sel.ranges.map((r) => this.text(r.page)?.slice(r.start, r.end) || '').join(' ');
    return { kind: 'text', ranges: sel.ranges.map((r) => ({ ...r })), quote, unit: sel.unit };
  }

  private styleFor(sel: Selection): MarkStyle {
    if (sel.kind === 'region') return 'box';
    if (sel.unit === 'paragraph' || sel.unit === 'section') return 'bracket';
    if (sel.unit === 'word' || sel.unit === 'phrase') {
      const r = sel.ranges[0];
      const rects = this.text(r.page)?.rangeRects(r.start, r.end) || [];
      if (sel.ranges.length === 1 && rects.length === 1 && rects[0].w < 190) return 'circle';
    }
    return 'underline';
  }

  private askAboutSelection(prompt?: string) {
    const sel = this.selection.sel;
    if (!sel || !this.reader) return;
    const a = this.notes.create(this.anchorFromSelection(sel), this.styleFor(sel), 'blue');
    this.selection.clear();
    this.selbar.hide();
    if (prompt) {
      // Ask at once: the question is on the sheet before anything else can happen to the new note.
      this.notes.open(a.id, { fly: true });
      void this.notes.ask(a.id, prompt);
    } else {
      this.notes.open(a.id, { fly: true, focus: true });
    }
  }

  private async learnEnglish(anchor: Anchor, translate = false) {
    const meta = this.meta;
    if (!meta || anchor.kind !== 'text') return;
    try {
      const info = await this.describe(anchor);
      if (!info.text?.trim()) { this.toasts.show('请先选中论文中的英文'); return; }
      this.selbar.hide();
      await this.english.learnSelection({ paperId: meta.id, title: meta.title, text: info.text, page: info.page }, translate);
    } catch (e: any) { this.toasts.show(e.message, 'error'); }
  }

  /** A conversation about the paper as a whole (flag on page 1). */
  askAboutPaper() {
    if (!this.reader) { this.toasts.show('先放一篇论文上桌'); return; }
    const a = this.notes.create({ kind: 'paper' }, 'box', 'blue');
    this.notes.open(a.id, { fly: true, focus: true });
  }

  private highlightSelection(color: HighlightColor) {
    const sel = this.selection.sel;
    if (!sel || sel.kind !== 'text') return;
    this.notes.create(this.anchorFromSelection(sel), 'highlight', color);
    this.selection.clear();
    this.selbar.hide();
  }

  private async copySelection() {
    const sel = this.selection.sel;
    if (!sel || !this.meta) return;
    try {
      if (sel.kind === 'region') {
        const c = await cropRegion(this.reader!.renderer, sel.page, sel.rect);
        await copyImage(c);
        this.toasts.show('图已复制，可以直接粘贴', 'ok');
      } else {
        const text = sel.ranges.map((r) => this.text(r.page)?.slice(r.start, r.end) || '').join(' ');
        await navigator.clipboard.writeText(text);
        this.toasts.show('已复制', 'ok');
      }
    } catch (e: any) {
      this.toasts.show('复制失败：' + (e?.message || e), 'error');
    }
  }

  private exportMenu(anchorEl: HTMLElement) {
    const sel = this.selection.sel;
    if (!sel || !this.meta) return;
    const meta = this.meta;
    const menu = h('div', { class: 'menu' });
    const item = (label: string, fn: () => void | Promise<void>) => {
      const b = h('button', { type: 'button', class: 'menu-item' }, label);
      b.addEventListener('click', async () => { menu.remove(); try { await fn(); } catch (e: any) { this.toasts.show('没成功：' + (e?.message || e), 'error'); } });
      menu.append(b);
    };
    const page = sel.kind === 'region' ? sel.page : sel.ranges[0].page;
    const rect = sel.kind === 'region' ? sel.rect : unionAll(this.text(page)?.rangeRects(sel.ranges[0].start, sel.ranges[0].end) || []);
    const text = sel.kind === 'region' ? (sel.caption || this.text(page)?.textInRect(sel.rect) || '') : sel.ranges.map((r) => this.text(r.page)?.slice(r.start, r.end) || '').join(' ');
    item('复制为 Markdown 引用', async () => {
      await navigator.clipboard.writeText(`> ${text.replace(/\n/g, '\n> ')}\n>\n> ${citation(meta, page)}`);
      this.toasts.show('引用已复制', 'ok');
    });
    if (rect) {
      item('下载为图片 (PNG)', async () => {
        const c = await cropRegion(this.reader!.renderer, page, inflate(rect, 6), 2400);
        c.toBlob((b) => b && download(`${safeName(meta.title)} p${page + 1}.png`, b));
      });
      item('复制为图片', async () => {
        const c = await cropRegion(this.reader!.renderer, page, inflate(rect, 6), 2000);
        await copyImage(c);
        this.toasts.show('图已复制', 'ok');
      });
    }
    item('下载为文本 (.md)', () => download(`${safeName(meta.title)} p${page + 1}.md`, `> ${text}\n\n${citation(meta, page)}\n`));
    const r = anchorEl.getBoundingClientRect();
    menu.style.left = Math.min(window.innerWidth - 220, r.left) + 'px';
    menu.style.top = r.bottom + 8 + 'px';
    menu.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.hud.append(menu);
    const off = (e: Event) => { if (!menu.contains(e.target as Node)) { menu.remove(); window.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => window.addEventListener('pointerdown', off, true), 0);
  }

  private openNote(id: string, fly = true) {
    const a = this.notes.byId(id);
    if (!a || !this.reader) return;
    this.selection.clear();
    this.selbar.hide();
    // From the notes list the mark may be far away: travel there first.
    this.notes.open(id, { fly, focus: !a.messages.length });
  }

  private onMarkHover(id: string | null, e: PointerEvent | null) {
    this.marks.setHover(id);
    // While a conversation is open, other notes only light up; a preview would sit over the sheet.
    if (this.notes.openId) { this.preview.dismiss(); return; }
    const a = id ? this.notes.byId(id) : null;
    if (!e) { this.preview.hover(null, 0, 0, null); return; }
    const has = !!a && a.messages.some((m) => m.text);
    this.preview.hover(has ? a : null, e.clientX, e.clientY, has ? this.markScreenRect(a!.id) : null);
  }

  /** Screen rectangle of a note's doodle on its first page. */
  private markScreenRect(id: string): Rect | null {
    const g = this.marks.geo.get(id)?.[0];
    const v = g && this.reader?.views[g.page];
    if (!g || !v) return null;
    const cam = this.desk.camera;
    const p0 = cam.worldToScreen(...xy(v.toWorld(g.bbox.x, g.bbox.y)));
    const p1 = cam.worldToScreen(...xy(v.toWorld(g.bbox.x + g.bbox.w, g.bbox.y + g.bbox.h)));
    return { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), w: Math.abs(p1.x - p0.x), h: Math.abs(p1.y - p0.y) };
  }

  private onHover(page: number, _x: number, _y: number, kind: 'text' | 'figure' | 'mark' | 'paper' | 'none', fig?: Figure) {
    const vp = this.desk.viewport;
    vp.dataset.cur = kind === 'none' ? '' : this.tool === 'pen' || kind === 'mark' ? kind : this.tool;
    const reader = this.reader;
    if (!reader) return;
    if (this.hintPage >= 0 && (this.hintPage !== page || kind !== 'figure')) {
      reader.views[this.hintPage]?.gHint.replaceChildren();
      this.hintPage = -1;
    }
    if (kind === 'figure' && fig && !this.selection.sel) {
      const v = reader.views[page];
      if (!v || v.gHint.dataset.key === `${fig.rect.x},${fig.rect.y}` && this.hintPage === page) return;
      v.gHint.replaceChildren();
      v.gHint.dataset.key = `${fig.rect.x},${fig.rect.y}`;
      const rng = new Rng(Math.round(fig.rect.x + fig.rect.y));
      const label = s('text', { x: fig.rect.x + 4, y: fig.rect.y - 5, class: 'hint-label' });
      label.textContent = `${fig.label || (fig.kind === 'equation' ? '公式' : '图')} · 点一下选中`;
      v.gHint.append(s('path', { class: 'hint-box', d: roughRect(fig.rect, rng, { amp: 0.5, over: 2 }) }), label);
      this.hintPage = page;
    }
  }

  private deskTap(w: Pt) {
    if (this.notes.openId) {
      // A tap that is part of the gesture that opened the sheet, or a near-miss beside it, keeps it open.
      if (performance.now() - this.notes.openedAtTime < 650) return;
      const r = this.notes.openSheetRect();
      const pad = 70 / this.desk.camera.view.z;
      if (r && w.x > r.x - pad && w.x < r.x + r.w + pad && w.y > r.y - pad && w.y < r.y + r.h + pad) return;
      this.notes.close();
      return;
    }
    if (this.selection.sel) this.selection.clear();
    if (this.settingsCard.open) this.settingsCard.hide();
    if (this.notesList.open) this.notesList.hide();
    if (this.toc.open) this.toc.hide();
  }

  /* ---------------- camera, hud ---------------- */

  private onCamera() {
    if (this.preview.visible) this.preview.dismiss();
    this.placeSelbar();
    this.updateNoteTab();
    const reader = this.reader;
    if (reader) {
      const p = reader.currentPage();
      this.pageTag.querySelector('.pt-num')!.textContent = `${p + 1} / ${reader.views.length}`;
    }
    const z = this.desk.camera.view.z;
    this.zoomLabel.textContent = `${Math.round(z * 100)}%`;
  }

  private saveView() {
    if (!this.meta || !this.reader) return;
    const v = this.desk.camera.view;
    if (this.notes.openId) return;
    this.meta.view = { layout: this.reader.layout, x: Math.round(v.x), y: Math.round(v.y), z: Math.round(v.z * 1000) / 1000 };
    api.patchMeta(this.meta.id, { view: this.meta.view }).catch(() => {});
  }

  private buildHud() {
    // top-left: masking tape label with the title, envelope and bookshelf
    // the app's name takes you back to the desk; the paper's title opens its table of contents
    const ttApp = h('span', { class: 'tt-app', title: '回到书桌 (B)' }, 'Paper Watcher');
    const ttPaper = h('span', { class: 'tt-paper', title: '目录 (T)' });
    ttApp.addEventListener('click', (e) => { e.stopPropagation(); void this.goHome(); });
    ttPaper.addEventListener('click', (e) => { e.stopPropagation(); void this.toggleToc(); });
    this.titleTag = h('div', { class: 'title-tape' }, ttApp, ttPaper);
    const envelope = deskButton('envelope', '放一篇论文上桌', () => { this.paperLib.hide(); this.toc.hide(); this.importer.toggle('top'); });
    const shelfBtn = deskButton('papers', '论文书架：换一篇读、整理、垃圾桶 (L)', () => this.toggleLibrary('papers'), 'paper-only');
    const tl = h('div', { class: 'hud-tl' }, this.titleTag,
      h('div', { class: 'dobj-row' },
        envelope,
        shelfBtn,
        deskButton('englishNotebook', '英语笔记', () => { void this.english.show(); }, 'english-reader-btn paper-only'),
        deskButton('magnifier', '搜索论文 (⌘F / Ctrl+F)', () => this.paperSearch.show(), 'paper-find-btn paper-only'),
        deskButton('books', '回到书桌 (B)', () => { void this.goHome(); }, 'books paper-only'),
      ));
    this.tagEditor = new TagEditor(this.hud);
    this.paperLib = new LibraryCard<PaperMeta>(this.hud, paperLibrary(), this.libraryHost('papers') as LibraryHost<PaperMeta>, this.tagEditor);
    this.bookLib = new LibraryCard<BookMeta>(this.hud, bookLibrary((m) => this.shelf.coverUrl(m)), this.libraryHost('books') as LibraryHost<BookMeta>, this.tagEditor);
    // what opens them toggles them (a press on one is not a press outside the card)
    this.paperLib.triggers = [shelfBtn, '.fan.on .fan-pill.organize', '.fan.on .fan-pill.bin'];
    this.bookLib.triggers = ['.bk-btn.shelf', '.fan.on .fan-pill.organize', '.fan.on .fan-pill.bin'];
    // top-right: reading glasses (the reading light), lamp (AI), sticky pad (notes), folder (export), help
    this.lamp = deskButton('lamp', 'AI 阅读伙伴', () => this.settingsCard.toggle(), 'lamp');
    const glassesClose = h('button', { class: 'card-close', type: 'button', html: ICONS.close, title: '收起' });
    this.ambienceCard = h('div', { class: 'card ambience' }, glassesClose, h('div', { class: 'card-title' }, '阅读环境'), h('div', { class: 'am-body' }));
    glassesClose.addEventListener('click', () => this.ambienceCard.classList.remove('on'));
    this.ambienceCard.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.ambienceCard.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const tr = h('div', { class: 'hud-tr' },
      deskButton('glasses', '阅读环境：背景虚化、亮度、沉浸模式', () => this.toggleAmbienceCard(), 'paper-only'),
      this.lamp,
      deskButton('sticky', '本篇笔记', () => this.notesList.open ? this.notesList.hide() : this.showNotesList(), 'paper-only'),
      deskButton('folder', '导出笔记', () => this.exportNotes(), 'paper-only'),
    );
    // bottom: page tag with flips
    const prev = h('button', { class: 'pt-btn', type: 'button', html: ICONS.chevL, title: '上一页 (←/PageUp)' });
    const next = h('button', { class: 'pt-btn', type: 'button', html: ICONS.chevR, title: '下一页 (→/PageDown)' });
    prev.addEventListener('click', () => this.flip(-1));
    next.addEventListener('click', () => this.flip(1));
    this.pageTag = h('div', { class: 'page-tag' }, prev, h('span', { class: 'pt-num' }, '–'), next);
    // bottom-left: magnifier zoom + ruler layout
    const zin = h('button', { class: 'zb', type: 'button', html: ICONS.plus, title: '放大 (⌘+)' });
    const zout = h('button', { class: 'zb', type: 'button', html: ICONS.minus, title: '缩小 (⌘-)' });
    const zfit = h('button', { class: 'zb', type: 'button', html: ICONS.fit, title: '适合阅读 (⌘0)' });
    zin.addEventListener('click', () => this.zoomBy(1.25));
    zout.addEventListener('click', () => this.zoomBy(0.8));
    zfit.addEventListener('click', () => this.fitReading());
    this.zoomLabel = h('span', { class: 'zl' }, '100%');
    this.layoutBtn = h('button', { class: 'layout-btn', type: 'button', title: '排版：单栏 / 双页 / 平铺 (1/2/3)' }) as HTMLButtonElement;
    this.layoutBtn.addEventListener('click', () => this.cycleLayout());
    const bl = h('div', { class: 'hud-bl' },
      h('div', { class: 'magnifier' }, h('span', { class: 'mg-ico', html: ICONS.magnifier }), zout, this.zoomLabel, zin, zfit),
      this.layoutBtn);
    this.helpCard = h('div', { class: 'card help' },
      h('div', { class: 'card-title' }, '小抄'),
      h('div', { class: 'help-grid', html: [
        ['拖动纸面空白 / 桌面', '平移（或按住空格）'], ['触控板双指 / 滚轮', '上下滑动'], ['⌘/Ctrl + 滚轮、双指捏合', '放大缩小'],
        ['← → / PageUp PageDown', '翻页'], ['⌘0 · ⌘+ · ⌘-', '适合阅读 · 放大 · 缩小'], ['1 / 2 / 3', '单栏 / 双页 / 平铺'],
        ['⌘F / Ctrl+F', '搜索整篇论文；Enter 下一个，Shift+Enter 上一个'],
        ['拖选文字', '按词吸附的精确选取'], ['双击 / 三击 / 四击', '词 / 句 / 段'], ['单击标题 · 公式 · 图', '选中整节 · 公式 · 整张图'],
        ['在空白处拖框 · S 剪刀', '框选任意区域'], ['Enter', '就选中的内容问 AI'], ['悬停笔记 · 点击笔记', '若隐若现地预览 · 展开对话'],
        ['V H S E', '铅笔 荧光笔 剪刀 橡皮'], ['T · 点论文标题', '目录'], ['M', '隐藏 / 显示笔记'], ['⌘Z', '撤销擦除'], ['Esc', '收起'],
        ['L · 左上角的论文堆', '书架：换一篇读，不用回书桌'], ['B · 点 Paper Watcher', '收起论文，回到书桌'], ['F · 眼镜', '沉浸模式 · 阅读环境'],
      ].map(([k, v]) => `<kbd>${k}</kbd><span>${v}</span>`).join('') }));
    const help = h('button', { class: 'help-btn', type: 'button', title: '快捷键 (?)' }, '?');
    help.addEventListener('click', () => this.helpCard.classList.toggle('on'));
    this.helpCard.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.noteTab = h('button', { class: 'note-tab', type: 'button', title: '回到这条笔记' },
      h('span', { class: 'nt-arrow', html: '<svg viewBox="0 0 40 24"><path d="M3 13 C12 9, 22 15, 33 11 M26 5 L35 11 L27 18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' }),
      h('span', { class: 'nt-text' }, '笔记在这儿'));
    this.noteTab.addEventListener('click', () => this.notes.reframe());
    this.noteTab.addEventListener('pointerdown', (e) => e.stopPropagation());
    // home: one small pill in the corner (bring a paper in · the AI's settings); everything else is on the desk
    const plus = h('button', { class: 'hp-btn', type: 'button', title: '放一篇论文上桌' }, '＋ 论文');
    plus.addEventListener('click', (e) => { e.stopPropagation(); this.importer.toggle('corner'); });
    // what opens the import card toggles it (a press on one is not a press outside the card)
    this.importer.triggers = [envelope, plus, '[data-paper="blank"]'];
    const ai = h('button', { class: 'hp-btn', type: 'button', title: 'AI 阅读伙伴' }, 'AI');
    ai.addEventListener('click', (e) => { e.stopPropagation(); this.deskSettings?.hide(); this.settingsCard.toggle(); });
    this.deskSettings = new DeskSettings(this.hud, () => this.home.scene.objects, WOODS, () => this.home.scene.look, (l) => this.home.scene.setLook(l));
    const look = h('button', { class: 'hp-btn', type: 'button', title: '桌面设置' }, '设置');
    look.addEventListener('click', (e) => { e.stopPropagation(); if (this.settingsCard.open) this.settingsCard.hide(); this.deskSettings!.toggle(); });
    const english = h('button', { class: 'hp-btn', type: 'button', title: '打开英语笔记', onclick: () => { void this.english.show(); } }, '英语笔记');
    const homePill = h('div', { class: 'home-pill' }, plus, english, look, ai);
    homePill.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.hud.append(tl, tr, this.pageTag, bl, help, this.helpCard, this.noteTab, homePill, this.ambienceCard);
    this.viewBar = new ViewBar(this.hud, this.home);
    this.arrange = new Arrange(this.hud, this.home);
    this.arrange.onSave = (place) => this.deskSettings?.patch((l) => { l.place = place; });
    this.deskSettings.onArrange = () => { this.deskSettings?.hide(); this.importer.hide(); this.settingsCard.hide(); this.arrange.enter(); };
  }

  /** The reading light's card (the glasses, top right). */
  toggleAmbienceCard() {
    const on = !this.ambienceCard.classList.contains('on');
    if (on) {
      this.ambienceCard.querySelector('.am-body')!.replaceChildren(this.ambience.panel());
      if (this.settingsCard.open) this.settingsCard.hide();
    }
    this.ambienceCard.classList.toggle('on', on);
  }
  /** Tools into the edges, or back. */
  toggleImmersive() {
    const on = this.ambience.toggleImmersive();
    this.toasts.show(on ? '沉浸模式：工具收进了屏幕边缘，鼠标移到边上就会出来（F 退出）' : '工具都回来了');
  }

  /** When the open sheet is out of sight (camera moved, flight cut short), a tab at the edge points to it. */
  private updateNoteTab() {
    const tab = this.noteTab;
    const r = this.notes.openSheetRect();
    if (!r) { tab.classList.remove('on'); return; }
    const cam = this.desk.camera;
    const a = cam.worldToScreen(r.x, r.y);
    const b = cam.worldToScreen(r.x + r.w, r.y + Math.min(r.h, 520));
    const L = 150, R = cam.vw - 30, T = 70, B = cam.vh - 80;
    const vw = Math.max(0, Math.min(b.x, R) - Math.max(a.x, L));
    const vh = Math.max(0, Math.min(b.y, B) - Math.max(a.y, T));
    if (vw > 140 && vh > 110) { tab.classList.remove('on'); return; }
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const tx = Math.max(L + 70, Math.min(R - 90, cx)), ty = Math.max(T + 30, Math.min(B - 30, cy));
    const ang = Math.atan2(cy - ty, cx - tx);
    tab.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px) translate(-50%, -50%)`;
    (tab.querySelector('.nt-arrow') as HTMLElement).style.transform = `rotate(${ang.toFixed(3)}rad)`;
    (tab.querySelector('.nt-text') as HTMLElement).textContent = this.notes.isRunning(this.notes.openId!) ? 'AI 正在写 · 点我回去' : '笔记在这儿 · 点我回去';
    if (!tab.classList.contains('on')) tab.classList.add('on');
  }

  private updateTitle() {
    const t = this.meta?.title || '';
    (this.titleTag.querySelector('.tt-paper') as HTMLElement).textContent = t;
    this.titleTag.classList.toggle('has-paper', !!t);
    document.title = t ? `${t} · Paper Watcher` : 'Paper Watcher · 论文观察台';
  }

  private updateLayoutBtn() {
    const mode = this.reader?.layout || 'column';
    const icon = mode === 'column' ? ICONS.layoutColumn : mode === 'spread' ? ICONS.layoutSpread : ICONS.layoutGrid;
    const label = mode === 'column' ? '单栏' : mode === 'spread' ? '双页' : '平铺';
    this.layoutBtn.innerHTML = `<span class="ruler">${ICONS.ruler}</span><span class="lb-ico">${icon}</span><span class="lb-l">${label}</span>`;
  }

  private updateLamp() {
    this.lamp.classList.toggle('busy', this.aiCount > 0);
    const p = this.settings?.provider;
    const name = p === 'codex' ? 'Codex' : p === 'openai' ? 'OpenAI API' : 'Claude Code';
    (this.lamp.querySelector('.dobj-tag') as HTMLElement).textContent = this.aiCount > 0 ? `${name} 正在写…` : `AI 阅读伙伴 · ${name}`;
  }

  private aiActivity(d: number) {
    this.aiCount = Math.max(0, this.aiCount + d);
    this.updateLamp();
  }

  private async toggleToc() {
    if (this.toc.open) { this.toc.hide(); return; }
    if (!this.doc || !this.reader) return;
    this.paperLib.hide();
    this.importer.hide();
    this.toc.show(await this.doc.sections(), this.reader.currentPage());
  }

  /* ---------------- the libraries: finding, sorting out, the bin ---------------- */

  /** A library's card: open it (on the desk, while reading a paper, while reading a book), or close it if open. */
  private toggleLibrary(kind: LibKind) {
    const lib = kind === 'papers' ? this.paperLib : this.bookLib;
    if (lib.open) { lib.hide(); return; }
    this.showLibrary(kind);
  }
  /** The bin's button (in a fan): the card straight into the bin, or put away if it shows the bin already. */
  private toggleBin(kind: LibKind) {
    const lib = kind === 'papers' ? this.paperLib : this.bookLib;
    if (lib.open && lib.inBin) { lib.hide(); return; }
    this.showLibrary(kind, { bin: true });
  }
  private showLibrary(kind: LibKind, opts: { bin?: boolean } = {}) {
    this.importer.hide();
    this.toc.hide();
    this.bookImport.hide();
    (kind === 'papers' ? this.bookLib : this.paperLib).hide();
    (kind === 'papers' ? this.paperLib : this.bookLib).show(opts);
  }

  /** What a library card (and a fan) can do, for papers or books. */
  private libraryHost(kind: LibKind): LibraryHost<PaperMeta> | LibraryHost<BookMeta> {
    const lib = () => (kind === 'papers' ? this.paperLib : this.bookLib) as LibraryCard<any>;
    const common = {
      setTags: (ids: string[], op: 'tag' | 'untag', tags: string[]) => this.setTags(kind, ids, op, tags),
      bin: () => api.trash<any>(kind),
      binPic: (m: any) => (kind === 'papers' ? m.thumb : m.cover) ? `${api.trashPicUrl(kind, m.id)}?v=${kind === 'papers' ? m.thumb : m.cover}` : undefined,
      restore: (m: any) => this.restoreFromBin(kind, m),
      purge: async (m: any) => { await api.purge(kind, m.id); lib().update(); },
      forget: async (m: any) => { await api.forget(kind, m.id); lib().update(); },
      emptyBin: async () => { const r = await api.emptyTrash(kind); lib().update(); this.toasts.show(r.cleared ? `清除了 ${r.cleared} ${kind === 'papers' ? '篇' : '本'}的文件，记录都还在` : '垃圾桶里没有要清除的文件'); return r.cleared; },
    };
    if (kind === 'papers') return {
      ...common,
      list: () => this.papers,
      refresh: async () => { this.papers = await api.papers(); return this.papers; },
      current: () => this.meta?.id ?? null,
      pick: (m: PaperMeta) => { if (this.reader) this.switchPaper(m); else void this.openPaper(m, 'library'); },
      trash: (items: PaperMeta[]) => this.trash('papers', items),
      reimport: (m: PaperMeta) => this.reimportPaper(m),
      importNew: () => { this.home.fan.close(); void this.importer.show(this.reader ? 'top' : 'corner'); },
    } as LibraryHost<PaperMeta>;
    return {
      ...common,
      list: () => this.shelf.books,
      refresh: () => this.shelf.refresh(),
      current: () => this.book?.meta.id ?? null,
      pick: (m: BookMeta) => { if (this.book) void this.switchBook(m); else void this.openBook(m); },
      trash: (items: BookMeta[]) => this.trash('books', items),
      reimport: (m: BookMeta) => this.reimportBook(m),
      importNew: () => { this.bookFan.close(); this.bookImport.show(); },
    } as LibraryHost<BookMeta>;
  }

  /** Tags on or off, for one or many; the lists follow. */
  private async setTags(kind: LibKind, ids: string[], op: 'tag' | 'untag', tags: string[]) {
    const got = await api.batch<any>(kind, ids, op, tags);
    const by = new Map(got.map((m: any) => [m.id, m.tags || []]));
    if (kind === 'papers') {
      this.papers = this.papers.map((m) => (by.has(m.id) ? { ...m, tags: by.get(m.id) } : m));
      if (this.meta && by.has(this.meta.id)) this.meta.tags = by.get(this.meta.id);
    } else {
      for (const m of this.shelf.books) if (by.has(m.id)) m.tags = by.get(m.id);
      if (this.book && by.has(this.book.meta.id)) this.book.meta.tags = by.get(this.book.meta.id);
    }
    this.libraryChanged(kind);
  }

  /** A library changed (labelled, thrown away, put back): its card and an open fan follow. */
  private libraryChanged(kind: LibKind) {
    if (kind === 'papers') { this.paperLib.update(this.papers); this.home.fan.refresh(); }
    else { this.bookLib.update([...this.shelf.books]); this.bookFan.refresh(); }
  }

  /** The tag card for things in a fan. */
  private editTags(kind: LibKind, items: Array<PaperMeta | BookMeta>, at: DOMRect, from: HTMLElement) {
    const all: Array<PaperMeta | BookMeta> = kind === 'papers' ? this.papers : this.shelf.books;
    const m = items[0], cfg = kind === 'papers' ? paperLibrary() : null;
    this.tagEditor.show(at, {
      title: `标签 · ${m.title}`,
      current: [...(all.find((x) => x.id === m.id)?.tags || m.tags || [])],
      known: tagCounts(all, (x) => x.tags),
      suggest: cfg?.suggest?.(m as PaperMeta),
      add: (t) => this.setTags(kind, items.map((x) => x.id), 'tag', [t]),
      remove: (t) => this.setTags(kind, items.map((x) => x.id), 'untag', [t]),
    }, from);
  }

  /** Into the bin (never the one being read): off the desk and the lists, with a note to undo it. */
  private async trash(kind: LibKind, items: Array<PaperMeta | BookMeta>) {
    const open = kind === 'papers' ? this.meta?.id : this.book?.meta.id;
    const list = items.filter((m) => m.id !== open), ids = list.map((m) => m.id);
    if (!ids.length) return;
    try {
      await api.batch(kind, ids, 'trash');
    } catch (e) {
      this.toasts.show('没扔掉：' + ((e as Error).message || e), 'error');
      throw e;
    }
    const gone = new Set(ids);
    if (kind === 'papers') {
      this.papers = this.papers.filter((m) => !gone.has(m.id));
      if (!this.reader) this.home.setPapers(this.papers, this.thumb);
    } else {
      await this.shelf.refresh();
    }
    this.libraryChanged(kind);
    const what = list.length > 1 ? `${list.length} ${kind === 'papers' ? '篇论文' : '本读物'}` : `《${list[0].title.length > 24 ? list[0].title.slice(0, 22) + '…' : list[0].title}》`;
    this.toasts.show(`${what}扔进了垃圾桶`, 'info', 7000, { label: '撤销', run: () => void this.undoTrash(kind, ids) });
  }
  private async undoTrash(kind: LibKind, ids: string[]) {
    for (const id of ids) await api.restore(kind, id).catch(() => {});
    await this.afterBinChange(kind);
    this.toasts.show(ids.length > 1 ? `放回了 ${ids.length} ${kind === 'papers' ? '篇' : '本'}` : '放回去了', 'ok');
  }
  private async restoreFromBin(kind: LibKind, m: PaperMeta | BookMeta) {
    try { await api.restore(kind, m.id); }
    catch (e) { this.toasts.show('放不回去：' + ((e as Error).message || e), 'error'); return; }
    await this.afterBinChange(kind);
    this.toasts.show(`《${m.title.length > 24 ? m.title.slice(0, 22) + '…' : m.title}》放回${kind === 'papers' ? '桌上' : '书架'}了`, 'ok');
  }
  /** Something came out of the bin: the lists (and the piles on the desk) are fetched again. */
  private async afterBinChange(kind: LibKind) {
    if (kind === 'papers') {
      this.papers = await api.papers().catch(() => this.papers);
      if (!this.reader) this.home.setPapers(this.papers, this.thumb);
    } else {
      await this.shelf.refresh();
    }
    this.libraryChanged(kind);
  }

  /** A file chooser, from a click (browsers only open one from a click). */
  private chooseFile(accept: string, then: (f: File) => void) {
    const input = h('input', { type: 'file', accept, style: 'display:none' }) as HTMLInputElement;
    input.addEventListener('change', () => { const f = input.files?.[0]; input.remove(); if (f) then(f); });
    document.body.append(input);
    input.click();
  }
  /** Bring a cleared paper back: download it again from where it came from, or ask for the file. Importing the same
   *  PDF takes its record back (notes, tags, where you were). */
  private reimportPaper(m: PaperMeta) {
    const url = m.sourceUrl || (m.arxivId ? `https://arxiv.org/abs/${m.arxivId}` : '');
    this.reimporting = m;
    this.paperLib.hide();
    this.home.fan.close();
    if (url) {
      void this.importer.show(this.reader ? 'top' : 'corner');
      void this.importer.fetchUrl(url);
    } else {
      this.toasts.show(`找到《${m.title.length > 24 ? m.title.slice(0, 22) + '…' : m.title}》的 PDF（${m.fileName || '原来的文件'}）选上就行`, 'info', 5000);
      this.chooseFile('application/pdf,.pdf', (f) => void this.importer.uploadFile(f));
    }
  }
  /** Bring a cleared book back: download it again, or ask for the file; its record comes back with it. */
  private reimportBook(m: BookMeta) {
    const short = m.title.length > 24 ? m.title.slice(0, 22) + '…' : m.title;
    const done = async (meta: BookMeta) => {
      await this.shelf.refresh();
      this.bookLib.update(this.shelf.books);
      this.toasts.show(meta.id === m.id ? `《${short}》回来了，读到的地方和书签都在` : `《${short}》重新导入了（文件和原来的不完全一样，旧记录还在垃圾桶里）`, 'ok', 5000);
    };
    const fail = (e: unknown) => this.toasts.show('没导入成：' + ((e as Error).message || e), 'error');
    if (m.sourceUrl) {
      this.toasts.show(`正在重新下载《${short}》…`, 'info', 4000);
      this.shelf.addFromUrl(m.sourceUrl, () => {}).then(done, fail);
    } else {
      this.toasts.show(`找到《${short}》的文件（${m.fileName || '原来的文件'}）选上就行`, 'info', 5000);
      this.chooseFile(BOOK_ACCEPT, (f) => { this.shelf.addFile(f, f.name).then(done, fail); });
    }
  }

  /** Read another paper from the shelf without going back to the desk: this one's pages clear away (where you were
   *  in it and its notes are kept), the other is dropped on the reading spot as usual. */
  private switchPaper(m: PaperMeta) {
    if (this.meta?.id === m.id || this.transitioning || document.body.classList.contains('opening')) return;
    if (this.notesList.open) this.notesList.hide();
    void this.openPaper(m, 'library');
  }

  /** Hide every doodle and margin note for a clean read (M). */
  private toggleInk() {
    const off = document.body.classList.toggle('hide-ink');
    this.toasts.show(off ? '笔记先藏起来了 · M 显示' : '笔记回来了');
  }

  private showNotesList() {
    this.notesList.show(this.notes.list, (a) => this.notes.label(a));
  }

  private exportNotes() {
    if (!this.meta) { this.toasts.show('桌上还没有论文'); return; }
    if (!this.notes.list.length) { this.toasts.show('还没有笔记可以导出'); return; }
    download(`${safeName(this.meta.title)} · 笔记.md`, notesToMarkdown(this.meta, this.notes.list, (a) => this.notes.label(a)), 'text/markdown;charset=utf-8');
  }

  setTool(t: Tool) {
    this.tool = t;
    this.tray.setTool(t);
    this.desk.viewport.dataset.tool = t;
    if (t !== 'pen' && t !== 'scissors') this.selbar.hide();
  }

  private cycleLayout() {
    if (!this.reader) return;
    const order: LayoutMode[] = ['column', 'spread', 'grid'];
    this.setLayout(order[(order.indexOf(this.reader.layout) + 1) % 3]);
  }

  setLayout(mode: LayoutMode) {
    const reader = this.reader;
    if (!reader || reader.layout === mode) return;
    const page = reader.currentPage();
    this.notes.close(false);
    this.selection.clear();
    reader.applyLayout(mode, true);
    this.toasts.show(mode === 'column' ? '单栏阅读' : mode === 'spread' ? '双页对开' : '平铺在桌上');
    setTimeout(() => reader.goToPage(page), 120);
  }

  /** Where the running page flip is heading, so rapid presses chain from it (never from mid-glide). */
  private flipTo: { page: number; z: number; x: number } | null = null;
  private flipSeq = 0;

  private flip(dir: number) {
    const reader = this.reader;
    if (!reader) return;
    const cam = this.desk.camera;
    const n = reader.views.length;
    const chain = !!this.flipTo && cam.animating;
    // The zoom (and horizontal position) the reader chose stay exactly as they were: only the paper slides.
    const z = chain ? this.flipTo!.z : cam.view.z;
    const x = chain ? this.flipTo!.x : cam.view.x;
    const base = chain ? this.flipTo!.page : reader.currentPage();
    let step = 1;
    if (reader.layout === 'spread') step = 2;
    else if (reader.layout === 'grid') step = reader.slots.filter((sl) => Math.abs(sl.y - reader.slots[0].y) < 20).length || 1;
    let target = base + dir * step;
    if (!chain && dir < 0 && reader.layout !== 'grid') {
      // Below the top of the current page: going back first returns to its top.
      const s0 = reader.slots[base];
      if (cam.visibleRect().y > s0.y + 30) target = base;
    }
    target = Math.max(0, Math.min(n - 1, target));
    if (reader.layout === 'spread') target -= target % 2;
    this.flipTo = { page: target, z, x };
    const seq = ++this.flipSeq;
    cam.panTo(reader.viewForPage(target, true, 0, z, x)).then(() => { if (this.flipSeq === seq) this.flipTo = null; });
  }

  private zoomBy(f: number) {
    const cam = this.desk.camera;
    const z0 = cam.view.z, z1 = Math.max(cam.minZ, Math.min(cam.maxZ, z0 * f));
    cam.flyTo({ ...cam.view, z: z1 }, { duration: 240 });
  }

  private fitReading() {
    const reader = this.reader;
    if (!reader) return;
    const cam = this.desk.camera;
    const p = reader.currentPage();
    const z = reader.readingZoom(p);
    const s0 = reader.slots[p];
    const cx = reader.layout === 'column' ? s0.x + s0.w / 2 : cam.view.x;
    cam.flyTo({ x: cx, y: cam.view.y, z }, { duration: 320 });
  }

  private smoothScroll(dy: number) {
    const cam = this.desk.camera;
    // Repeated presses add up from where the glide is going, not from where it happens to be.
    const base = cam.animating && cam.target ? cam.target : cam.view;
    this.flipTo = null;
    cam.panTo({ x: base.x, y: base.y + dy / cam.view.z, z: base.z }, { duration: 200 });
  }

  private onKey(e: KeyboardEvent) {
    if (this.english.open) { if (e.key === 'Escape') { e.preventDefault(); this.english.hide(); } return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && this.reader && !this.english.open) { e.preventDefault(); this.paperSearch.show(); return; }
    if (isTyping(e)) return;
    // a book open: its reader has the keys
    if (this.book) return;
    if (e.key === 'Escape' && this.ambienceCard.classList.contains('on')) { this.ambienceCard.classList.remove('on'); return; }
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    if (k === 'Escape') {
      if (this.helpCard.classList.contains('on')) { this.helpCard.classList.remove('on'); return; }
      if (this.selection.sel) { this.selection.clear(); return; }
      if (this.notes.openId) { this.notes.close(); return; }
      if (this.settingsCard.open) { this.settingsCard.hide(); return; }
      if (this.notesList.open) { this.notesList.hide(); return; }
      if (this.toc.open) { this.toc.hide(); return; }
      if (this.tagEditor.open) { this.tagEditor.close(); return; }
      if (this.paperLib.open) { this.paperLib.hide(); return; }
      if (this.importer.mode === 'popover') this.importer.hide();
      return;
    }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); this.zoomBy(1.25); return; }
    if (mod && k === '-') { e.preventDefault(); this.zoomBy(0.8); return; }
    if (mod && k === '0') { e.preventDefault(); this.fitReading(); return; }
    if (mod && k.toLowerCase() === 'z') { if (this.notes.undo()) { e.preventDefault(); this.toasts.show('撤销了'); } return; }
    if (mod && k.toLowerCase() === 'c' && this.selection.sel) { e.preventDefault(); this.copySelection(); return; }
    if (mod) return;
    if (!this.reader) return;
    switch (k) {
      case 'ArrowDown': e.preventDefault(); this.smoothScroll(this.desk.camera.vh * 0.18); break;
      case 'ArrowUp': e.preventDefault(); this.smoothScroll(-this.desk.camera.vh * 0.18); break;
      case 'ArrowRight': case 'PageDown': e.preventDefault(); this.flip(1); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); this.flip(-1); break;
      case 'Home': this.reader.goToPage(0, { keepZoom: true }); break;
      case 'End': this.reader.goToPage(this.reader.views.length - 1, { keepZoom: true }); break;
      case '1': this.setLayout('column'); break;
      case '2': this.setLayout('spread'); break;
      case '3': this.setLayout('grid'); break;
      case 'v': case 'V': this.setTool('pen'); break;
      case 'h': case 'H': this.setTool('highlighter'); break;
      case 's': case 'S': this.setTool('scissors'); break;
      case 'e': case 'E': this.setTool('eraser'); break;
      case 'Enter': if (this.selection.sel) { e.preventDefault(); this.askAboutSelection(); } break;
      case '?': this.helpCard.classList.toggle('on'); break;
      case 't': case 'T': void this.toggleToc(); break;
      case 'm': case 'M': this.toggleInk(); break;
      case 'b': case 'B': void this.goHome(); break;
      case 'l': case 'L': this.toggleLibrary('papers'); break;
      case 'f': case 'F': this.toggleImmersive(); break;
    }
  }
}

const xy = (p: Pt): [number, number] => [p.x, p.y];
const overSheet = (e: PointerEvent) => !!(e.target as HTMLElement | null)?.closest?.('.sheet');
export type { Rect, Annotation };
