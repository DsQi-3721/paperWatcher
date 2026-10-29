export type EnglishKind = 'word' | 'phrase' | 'sentence';
export interface EnglishSource {
  paperId: string; title: string; page: number; exampleEn: string; exampleZh: string; occurrences: number;
}
export interface EnglishDraft {
  kind: EnglishKind; english: string; chinese: string; meaningEn: string; meaningZh: string;
  source: EnglishSource;
}
export interface EnglishEntry extends EnglishDraft {
  id: string; sources: EnglishSource[]; collectionCount: number; createdAt: number; collectedAt: number;
  learned: boolean; deletedAt?: number; collectionIds: string[];
}
export interface EnglishSelection { paperId: string; title: string; text: string; page?: number }
export interface EnglishResult { entries: EnglishDraft[]; translation?: string; warning?: string }
export interface EnglishProgress {
  phase: 'reading' | 'waiting' | 'generating' | 'checking' | 'saving' | 'complete' | 'stopped';
  text: string; target?: number; completed?: number; chars?: number; batch?: number;
  pagesDone?: number; pagesTotal?: number; latest?: string;
}
