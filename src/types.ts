import type { Rect } from './util/geom';

export interface PaperMeta {
  id: string;
  title: string;
  authors?: string[];
  abstract?: string;
  arxivId?: string;
  sourceUrl?: string;
  fileName?: string;
  pages?: number;
  addedAt: number;
  openedAt?: number;
  notes?: number;
  view?: { layout?: LayoutMode; x?: number; y?: number; z?: number };
  /** When the first-page thumbnail was saved (absent: none yet). */
  thumb?: number;
  /** the student's own labels */
  tags?: string[];
  /** arXiv's primary category (cs.CL…) and the year it came out, when known */
  field?: string;
  year?: number;
  /** in the bin: when it was thrown away, and when its files were cleared */
  trashedAt?: number;
  purgedAt?: number;
}

export type Provider = 'claude' | 'codex' | 'openai';
export type LayoutMode = 'column' | 'spread' | 'grid';

export interface Settings {
  provider: Provider;
  language: 'auto' | 'zh' | 'en';
  claude: { bin: string; model: string; effort: string; allowWeb: boolean; loadUserSettings: boolean };
  codex: { bin: string; model: string; effort: string; httpTransport: boolean; allowWeb: boolean };
  openai: { baseUrl: string; apiKey: string; model: string; fullText: boolean; hasKey?: boolean };
}

export interface AiStatus {
  claude: { installed: boolean; version?: string };
  codex: { installed: boolean; version?: string; login?: string };
  openai: { configured: boolean; model?: string; baseUrl?: string };
}

/** Selection granularity, also what we tell the AI it is looking at. */
export type Unit = 'char' | 'word' | 'phrase' | 'sentence' | 'passage' | 'paragraph' | 'section';
export type FigureKind = 'figure' | 'table' | 'equation' | 'algorithm' | 'graphic' | 'region';

export interface TextRange { page: number; start: number; end: number }

export type Anchor =
  | { kind: 'text'; ranges: TextRange[]; quote: string; unit: Unit }
  | { kind: 'region'; page: number; rect: Rect; figKind: FigureKind; label?: string; quote?: string }
  | { kind: 'paper' };

export type MarkStyle = 'underline' | 'wavy' | 'circle' | 'box' | 'bracket' | 'highlight';
export type SheetPaper = 'grid' | 'lined' | 'legal' | 'dot' | 'index';

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  at: number;
  error?: string;
}

export interface Annotation {
  id: string;
  anchor: Anchor;
  style: MarkStyle;
  color: string;
  messages: Message[];
  margin?: string;
  sessionId?: string;
  provider?: Provider;
  sheet?: { dx: number; dy: number; rot: number; paper: SheetPaper };
  createdAt: number;
  updatedAt: number;
}

export interface NotesFile {
  version: 1;
  annotations: Annotation[];
}
