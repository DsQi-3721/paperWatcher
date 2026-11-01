import { randomUUID } from 'node:crypto';
import { listEnglish } from './english.ts';
import { LocalState } from './local-state.ts';
import type { PlannerData, TodoItem, DictationResult, DictationWord } from '../src/deskapps/types.ts';

export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDay(day: unknown): string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('日期格式应为 YYYY-MM-DD');
  const parsed = new Date(day + 'T12:00:00Z');
  if (Number.isNaN(+parsed) || parsed.toISOString().slice(0, 10) !== day) throw new Error('日期无效');
  return day;
}
export function recentDays(today: string, count = 30) {
  validDay(today);
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(today + 'T12:00:00Z') - i * 86400000).toISOString().slice(0, 10));
}
const planner = new LocalState<{ version: 1; days: Record<string, TodoItem[]> }>('planner.json', { version: 1, days: {} },
  (v) => v?.version === 1 && v.days && !Array.isArray(v.days) && typeof v.days === 'object' && Object.values(v.days).every(Array.isArray));
export async function readPlanner(date = todayKey(), today = todayKey()): Promise<PlannerData> {
  validDay(date); validDay(today);
  const data = await planner.read();
  const active = (day: string) => (data.days[day] || []).filter((x) => !x.deletedAt);
  return { date, today, items: active(date), history: recentDays(today).map((d) => ({ date: d, total: active(d).length, done: active(d).filter((x) => x.done).length })) };
}
function todoText(text: unknown) {
  if (typeof text !== 'string' || !text.trim() || text.trim().length > 300) throw new Error('待办内容请输入 1–300 个字符');
  return text.trim();
}
export async function addTodo(date: string, text: unknown, id = randomUUID()) {
  validDay(date); const content = todoText(text);
  if (!/^[\w-]{8,80}$/.test(id)) throw new Error('待办编号无效');
  return planner.change((data) => {
    const items = data.days[date] ??= [];
    const existing = items.find((x) => x.id === id);
    if (existing) return existing;
    const now = Date.now(), item = { id, text: content, done: false, createdAt: now, updatedAt: now };
    items.push(item); return item;
  });
}
export async function patchTodo(date: string, id: string, patch: { text?: unknown; done?: boolean; deleted?: boolean }) {
  validDay(date);
  return planner.change((data) => {
    const item = data.days[date]?.find((x) => x.id === id);
    if (!item) throw new Error('待办不存在');
    if (patch.text !== undefined) item.text = todoText(patch.text);
    if (typeof patch.done === 'boolean') item.done = patch.done;
    if (patch.deleted === true) item.deletedAt = Date.now();
    if (patch.deleted === false) delete item.deletedAt;
    item.updatedAt = Date.now(); return item;
  });
}

const dictation = new LocalState<{ version: 1; results: Record<string, DictationResult> }>('dictation.json', { version: 1, results: {} },
  (v) => v?.version === 1 && v.results && typeof v.results === 'object' && !Array.isArray(v.results));
export function normalizeAnswer(text: string) {
  return text.normalize('NFKC').replace(/[’‘]/g, "'").replace(/[‐‑–]/g, '-').replace(/\s+/g, ' ').trim().replace(/[.!?。！？，,;；]+$/, '').toLowerCase();
}
export async function dictationWords(limit = 10): Promise<DictationWord[]> {
  const size = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
  const [entries, state] = await Promise.all([listEnglish(), dictation.read()]);
  return entries.filter((e) => e.kind === 'word' || e.kind === 'phrase').sort((a, b) => b.collectedAt - a.collectedAt || b.createdAt - a.createdAt)
    .slice(0, size).map((e) => ({ id: e.id, english: e.english, chinese: e.chinese, meaningEn: e.meaningEn, meaningZh: e.meaningZh, collectedAt: e.collectedAt, previous: state.results[e.id] }));
}
export async function checkDictation(entryId: string, answer: unknown): Promise<DictationResult> {
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 500) throw new Error('请先输入英文答案（不超过 500 字符）');
  const entry = (await listEnglish()).find((e) => e.id === entryId && e.kind !== 'sentence');
  if (!entry) throw new Error('这个词已不在词本中，请刷新题目');
  return dictation.change((data) => {
    const old = data.results[entryId], correct = normalizeAnswer(answer) === normalizeAnswer(entry.english);
    const result = { entryId, english: entry.english, chinese: entry.chinese, answer: answer.trim(), correct, checkedAt: Date.now(), attempts: (old?.attempts || 0) + 1, correctCount: (old?.correctCount || 0) + Number(correct) };
    data.results[entryId] = result; return result;
  });
}
