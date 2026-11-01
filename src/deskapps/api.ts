import type { PlannerData, TodoItem, DictationWord, DictationResult, MusicTrack } from './types';
async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data;
}
export const deskApi = {
  planner: (date?: string) => request<PlannerData>('/api/planner' + (date ? `?date=${encodeURIComponent(date)}` : '')),
  addTodo: (date: string, text: string, id = crypto.randomUUID()) => request<TodoItem>(`/api/planner/${date}`, 'POST', { text, id }),
  patchTodo: (date: string, id: string, patch: { text?: string; done?: boolean; deleted?: boolean }) => request<TodoItem>(`/api/planner/${date}/${id}`, 'PATCH', patch),
  words: (limit = 10) => request<DictationWord[]>(`/api/dictation?limit=${limit}`),
  check: (entryId: string, answer: string) => request<DictationResult>('/api/dictation/check', 'POST', { entryId, answer }),
  music: () => request<MusicTrack[]>('/api/music'),
  addLink: (url: string, title: string) => request<MusicTrack>('/api/music/link', 'POST', { url, title }),
  removeTrack: (id: string, deleted: boolean) => request<MusicTrack>(`/api/music/${id}`, 'PATCH', { deleted }),
  upload: async (file: File) => {
    const r = await fetch('/api/music/upload', { method: 'POST', body: file, headers: { 'X-Filename': encodeURIComponent(file.name) } });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || '音频导入失败'); return data as MusicTrack;
  },
};
