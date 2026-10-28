// Books on the desk's textbook (novels, comics, magazines…): the shapes shared by the importer, the format parsers
// (src/books/formats), the reader (src/books/reader), the desk and the server (server/books.ts).

export type BookFormat = 'epub' | 'mobi' | 'azw3' | 'txt' | 'pdf' | 'cbz' | 'fb2' | 'html' | 'md';

/** What the server keeps for a book (data/books/<id>/meta.json). */
export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  /** reflowable text (novels) or fixed pages (comics, magazines, PDFs) */
  kind: 'flow' | 'fixed';
  lang?: string;
  fileName?: string;
  size?: number;
  sourceUrl?: string;
  addedAt: number;
  openedAt?: number;
  /** when the cover image was saved (absent: none yet) */
  cover?: number;
  /** the cover's main colour (#rrggbb): the desk's textbook takes it */
  color?: string;
  progress?: BookProgress;
  bookmarks?: Bookmark[];
  /** characters of text (flow) or pages (fixed), for progress and the fan */
  length?: number;
}

/** Where the reader is, independent of font size and page width. */
export interface BookProgress {
  /** flow: chapter index and character offset in it; fixed: chapter 0 and the page index as offset */
  chapter: number;
  offset: number;
  /** 0..1 through the whole book */
  percent: number;
  /** when (ms since epoch) */
  at: number;
}
export interface Bookmark { chapter: number; offset: number; /** a few words from there */ text: string; at: number }

/* ---------- a parsed book ---------- */
export type BookDoc = FlowDoc | FixedDoc;

export interface DocInfo {
  title: string;
  author?: string;
  lang?: string;
  /** pages run right to left (manga) */
  rtl?: boolean;
  /** the cover picture, if the book has one */
  cover?: Blob | null;
}

/** Reflowable text: chapters of blocks; pictures by key into `resources`. */
export interface FlowDoc extends DocInfo {
  kind: 'flow';
  chapters: Chapter[];
  toc: TocItem[];
  resources: Map<string, Blob>;
}
export interface Chapter {
  title?: string;
  blocks: Block[];
  /** characters of text in it (the runs' text, summed): progress is measured in these */
  chars: number;
}
export type Block =
  | { t: 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'quote' | 'li' | 'pre' | 'center'; runs: Run[]; id?: string }
  | { t: 'img'; src: string; alt?: string; w?: number; h?: number; id?: string }
  | { t: 'hr'; id?: string };
export interface Run {
  text: string;
  b?: boolean;
  i?: boolean;
  code?: boolean;
  sup?: boolean;
  sub?: boolean;
  /** a link: an id in the book ('#id' or 'chapter-file#id') or an outside URL */
  href?: string;
  /** reading shown over the text (CJK ruby) */
  ruby?: string;
}
export interface TocItem { title: string; chapter: number; /** block index in the chapter (absent: its start) */ block?: number; children?: TocItem[] }

/** Fixed pages (comics, magazines, PDFs): each page is a picture, or drawn by pdf.js. */
export interface FixedDoc extends DocInfo {
  kind: 'fixed';
  pages: number;
  /** a page's natural size (px, or pt for PDF) if known without loading it */
  size(i: number): { w: number; h: number } | null;
  /** a page's natural size, reading what it takes to know it (formats that learn sizes page by page) */
  sizeOf?(i: number): Promise<{ w: number; h: number } | null>;
  /** page i, drawn or decoded at about this width in device px */
  render(i: number, widthPx: number): Promise<HTMLCanvasElement | ImageBitmap | HTMLImageElement>;
  toc: TocItem[];
  /** let go of what it holds (a PDF's worker); calling it again does nothing. The reader's destroy() calls it. */
  destroy?(): void;
}

/** The reader's settings (kept in the browser, the same for every book). */
export interface BookSettings {
  /** a key of the reader's font list */
  font: string;
  /** text size, px */
  size: number;
  /** line height, × size */
  lineHeight: number;
  /** space between paragraphs, em */
  paraSpace: number;
  /** first-line indent, em */
  indent: number;
  /** extra letter spacing, em */
  letterSpace: number;
  /** page margin round the text, px */
  margin: number;
  /** widest text column, px */
  width: number;
  align: 'justify' | 'left';
  theme: 'paper' | 'sepia' | 'green' | 'ink' | 'night';
  /** one page or an open book's two (auto: two when the screen is wide enough) */
  spread: 'auto' | 'single' | 'double';
  mode: 'page' | 'scroll';
  turn: 'slide' | 'curl' | 'none';
  /** fixed pages: right to left (manga) */
  rtl: boolean;
  /** fixed pages: the whole page in view, or the page's width */
  fit: 'page' | 'width';
}

export const BOOK_SETTINGS_DEFAULT: BookSettings = {
  font: 'auto', size: 19, lineHeight: 1.8, paraSpace: 0.5, indent: 2, letterSpace: 0.02, margin: 56, width: 720,
  align: 'justify', theme: 'paper', spread: 'auto', mode: 'page', turn: 'slide', rtl: false, fit: 'page',
};

/** What the reader needs from the app around it. */
export interface ReaderHost {
  /** the reading position moved (the host saves it, debounced) */
  onProgress(p: BookProgress): void;
  /** the student changed a setting (the host keeps it) */
  onSettings(s: BookSettings): void;
  /** bookmarks were added or removed */
  onBookmarks(b: Bookmark[]): void;
  /** back to the desk (the reader's back button, B or Esc with nothing open) */
  onClose(): void;
  /** the reading light and the immersive mode (shared with papers): a panel to put in the settings, and the toggle */
  ambience: { panel(): HTMLElement; immersive(): boolean; setImmersive(on: boolean): void };
}
