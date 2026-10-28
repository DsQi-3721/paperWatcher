// What the library card (src/ui/library.ts) shows for papers and for books: a row's picture, words and facts, the
// groups, the orders, the tags worth suggesting, and the papers' extras (searching their text, sorting by arXiv).
import { api } from '../api';
import type { BookMeta } from '../books/types';
import type { PaperMeta } from '../types';
import { FORMAT_LABEL } from '../ui/fan';
import { ago, type LibraryConfig } from '../ui/library';
import { authorName, bookPercent, bookSections, bookWords, FIELDS, paperSections, paperWords, paperYear, topicsOf } from './facets';

const TITLES = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
const recent = (m: { openedAt?: number; addedAt: number }) => m.openedAt || m.addedAt || 0;
const authors = (list: string[]) => { const a = list.map(authorName); return a.slice(0, 3).join(', ') + (a.length > 3 ? ' 等' : ''); };

export const paperLibrary = (): LibraryConfig<PaperMeta> => ({
  kind: 'papers', title: '论文书架', noun: '论文', unit: '篇',
  id: (m) => m.id,
  name: (m) => m.title || m.fileName || '无题',
  who: (m) => authors(m.authors || []),
  facts: (m, now) => {
    const y = paperYear(m);
    return [y ? String(y) : '', m.field ? FIELDS[m.field] || m.field : '', m.pages ? `${m.pages} 页` : '', m.notes ? `${m.notes} 条笔记` : '',
      now ? (m.openedAt ? `读于 ${ago(m.openedAt, now)}` : `放上 ${ago(m.addedAt, now)}`) : ''].filter(Boolean).join(' · ');
  },
  pic: (m) => (m.thumb ? api.thumbUrl(m) : undefined),
  aspect: 1 / 1.3,
  words: paperWords,
  tags: (m) => m.tags || [],
  sections: paperSections,
  sorts: [
    ['recent', '最近读的', (a, b) => recent(b) - recent(a)],
    ['added', '新放上的', (a, b) => (b.addedAt || 0) - (a.addedAt || 0)],
    ['title', '按标题', (a, b) => TITLES.compare(a.title, b.title)],
    ['year', '按年份', (a, b) => (paperYear(b) || 0) - (paperYear(a) || 0) || recent(b) - recent(a)],
  ],
  suggest: (m) => [...topicsOf(m.title), ...(m.field && FIELDS[m.field] ? [FIELDS[m.field]] : [])],
  importLabel: '放一篇新论文',
  fullText: (q) => api.searchPapers(q),
  enrich: {
    label: '自动整理', title: '从 arXiv 补上每篇论文的领域和年份（只补还没有的，一次问完）',
    run: async () => { const r = await api.enrichPapers(); return r.asked ? `补上了 ${r.found} 篇的领域` : '已经都整理好了'; },
  },
});

export const bookLibrary = (cover: (m: BookMeta) => string | undefined): LibraryConfig<BookMeta> => ({
  kind: 'books', title: '书架', noun: '读物', unit: '本',
  id: (m) => m.id,
  name: (m) => m.title || '无题',
  who: (m) => m.author || '',
  facts: (m, now) => {
    const p = bookPercent(m), marks = (m.bookmarks || []).length;
    return [p >= 0.97 ? '读完了' : p >= 0.01 ? `读到 ${Math.round(p * 100)}%` : '还没读', marks ? `${marks} 个书签` : '',
      now ? (m.openedAt ? `读于 ${ago(m.openedAt, now)}` : `放上 ${ago(m.addedAt, now)}`) : ''].filter(Boolean).join(' · ');
  },
  pic: cover,
  aspect: 2 / 3,
  badge: (m) => FORMAT_LABEL[m.format] || m.format.toUpperCase(),
  progress: (m) => (m.progress ? m.progress.percent : undefined),
  words: bookWords,
  tags: (m) => m.tags || [],
  sections: bookSections,
  sorts: [
    ['recent', '最近读的', (a, b) => recent(b) - recent(a)],
    ['added', '新放上的', (a, b) => (b.addedAt || 0) - (a.addedAt || 0)],
    ['title', '按书名', (a, b) => TITLES.compare(a.title, b.title)],
    ['author', '按作者', (a, b) => TITLES.compare(a.author || '￿', b.author || '￿') || TITLES.compare(a.title, b.title)],
  ],
  importLabel: '导入读物',
});
