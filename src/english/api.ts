import { ndjsonPost } from '../api';
import type { EnglishDraft, EnglishEntry, EnglishProgress, EnglishResult } from './types';
async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await res.json();
  if (!res.ok) throw new Error(value.error || `HTTP ${res.status}`);
  return value;
}
export const englishApi = {
  list: () => request<EnglishEntry[]>('/api/english'),
  collect: async (entries: EnglishDraft[], collectionId: string, progress?: (done: number) => void) => {
    const saved: EnglishEntry[] = [];
    // The per-request payload limit should not limit the user's total collection.
    for (let i = 0; i < entries.length; i += 50) {
      saved.push(...await request<EnglishEntry[]>('/api/english/collect', 'POST', { entries: entries.slice(i, i + 50), collectionId }));
      progress?.(saved.length);
    }
    return saved;
  },
  patch: (id: string, patch: { learned?: boolean; deleted?: boolean }) => request<EnglishEntry>(`/api/english/${id}`, 'PATCH', patch),
  generate: async (body: unknown, signal: AbortSignal, progress: (value: EnglishProgress) => void, onEntry?: (entry: EnglishDraft) => void): Promise<EnglishResult> => {
    let result: EnglishResult | undefined, error = '';
    await ndjsonPost('/api/english/generate', body, (e) => {
      if (e.type === 'status') progress({ phase: 'waiting', text: e.text });
      if (e.type === 'progress') progress(e);
      if (e.type === 'entry') onEntry?.(e.entry);
      if (e.type === 'done') result = e.result;
      if (e.type === 'error') error = e.message;
    }, signal);
    if (error) throw new Error(error);
    if (!result) throw new Error('连接中断，内容尚未完成，请重试');
    return result;
  },
};
