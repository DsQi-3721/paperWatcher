export interface TodoItem { id: string; text: string; done: boolean; createdAt: number; updatedAt: number; deletedAt?: number }
export interface PlannerDay { date: string; items: TodoItem[] }
export interface PlannerData extends PlannerDay { today: string; history: Array<{ date: string; total: number; done: number }> }
export interface DictationResult { entryId: string; english: string; chinese: string; answer: string; correct: boolean; checkedAt: number; attempts: number; correctCount: number }
export interface DictationWord { id: string; english: string; chinese: string; meaningEn: string; meaningZh: string; collectedAt: number; previous?: DictationResult }
export interface MusicTrack { id: string; title: string; kind: 'file' | 'url'; url?: string; fileName?: string; file?: string; bytes?: number; addedAt: number; deletedAt?: number }
export interface PlayerSnapshot { title: string; currentTime: number; duration: number; playing: boolean; volume: number; loop: boolean; index: number; total: number }
