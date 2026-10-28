// Book catalogs on the web (OPDS 1.x, the Atom feeds that Project Gutenberg, Calibre's content server and many
// libraries publish): a feed is a page of entries, each either a way into a sub-catalog or a book with links to its
// files. The server fetches the pages for us (src/api.ts catalog), the page reads them here.
import { api } from '../api';

export interface OpdsLink { href: string; type: string; title?: string; length?: number }
export interface OpdsEntry {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  thumb?: string;
  /** a sub-catalog (or the book's own feed) */
  nav?: string;
  /** the book's files, best first */
  files: OpdsLink[];
}
export interface OpdsFeed { url: string; title: string; entries: OpdsEntry[]; next?: string; prev?: string; search?: string }

/** Catalogs offered without setup: public-domain books, free to take. */
export const BUILTIN_CATALOGS = [
  {
    id: 'gutenberg', name: 'Project Gutenberg',
    note: '七万多本公版书，英文为主，也有不少中文古籍；全部免费、合法。',
    start: 'https://www.gutenberg.org/ebooks.opds/',
    search: 'https://www.gutenberg.org/ebooks/search.opds/?query={searchTerms}',
    quick: [
      ['中文古籍', 'https://www.gutenberg.org/ebooks/search.opds/?query=l.zh'],
      ['下载最多', 'https://www.gutenberg.org/ebooks/search.opds/?sort_order=downloads'],
      ['最近上新', 'https://www.gutenberg.org/ebooks/search.opds/?sort_order=release_date'],
    ] as Array<[string, string]>,
  },
];

// which file to offer first: what reads best here
const RANK: Record<string, number> = {
  'application/epub+zip': 0, 'application/x-mobipocket-ebook': 2, 'application/vnd.amazon.ebook': 2, 'application/pdf': 3,
  'application/vnd.comicbook+zip': 1, 'application/x-cbz': 1, 'application/x-fictionbook+xml': 4, 'text/plain': 5, 'text/html': 6,
};
const isAcq = (rel: string) => rel.startsWith('http://opds-spec.org/acquisition');
const isNav = (rel: string, type: string) => rel === 'subsection' || rel === 'http://opds-spec.org/sort/new' || rel === 'http://opds-spec.org/sort/popular' || /profile=opds-catalog|application\/atom\+xml/.test(type);

/** One catalog page, read. */
export async function loadFeed(url: string): Promise<OpdsFeed> {
  const got = await api.catalog(url);
  const base = got.url || url;
  const abs = (h: string | null) => { if (!h) return undefined; try { return new URL(h, base).href; } catch { return undefined; } };
  const doc = new DOMParser().parseFromString(got.text, 'application/xml');
  if (doc.querySelector('parsererror') || !doc.documentElement || doc.documentElement.localName !== 'feed') throw new Error('这个地址不是 OPDS 书库（需要 Atom 格式的目录）');
  const links = (el: Element) => [...el.children].filter((c) => c.localName === 'link');
  const text = (el: Element, name: string) => [...el.children].find((c) => c.localName === name)?.textContent?.trim() || '';
  const feedLinks = links(doc.documentElement);
  const rel = (l: Element) => l.getAttribute('rel') || '', typ = (l: Element) => l.getAttribute('type') || '';
  const entries: OpdsEntry[] = [...doc.documentElement.children].filter((c) => c.localName === 'entry').map((e, i) => {
    const ls = links(e);
    const files = ls.filter((l) => isAcq(rel(l)) && abs(l.getAttribute('href')))
      .map((l) => ({ href: abs(l.getAttribute('href'))!, type: typ(l).split(';')[0], title: l.getAttribute('title') || undefined, length: +(l.getAttribute('length') || 0) || undefined }))
      .filter((f) => f.type in RANK || /epub|mobi|pdf|cbz|fb2|text/.test(f.type))
      // EPUB first, editions with pictures before the ones without, then the rest; one link per kind and size
      .sort((a, b) => ((RANK[a.type] ?? 9) - (RANK[b.type] ?? 9)) || ((/no ?images/i.test(a.title || '') ? 1 : 0) - (/no ?images/i.test(b.title || '') ? 1 : 0)))
      .filter((f, k, all) => all.findIndex((g) => fileLabel(g) === fileLabel(f)) === k);
    const nav = ls.find((l) => !isAcq(rel(l)) && isNav(rel(l), typ(l)))?.getAttribute('href');
    // (a few catalogs put a tiny generic icon here instead of a cover: those are left out)
    const thumb = ls.find((l) => {
      const href = l.getAttribute('href') || '';
      return (/opds-spec\.org\/image(\/thumbnail)?$/.test(rel(l)) || /thumbnail$/.test(rel(l))) && (!/^data:/.test(href) || href.length > 3000);
    })?.getAttribute('href');
    const author = [...e.children].filter((c) => c.localName === 'author').map((a) => text(a, 'name')).filter(Boolean).join('、');
    const summary = (text(e, 'summary') || text(e, 'content')).replace(/\s+/g, ' ').slice(0, 220);
    return { id: text(e, 'id') || String(i), title: text(e, 'title') || '（无题）', author: author || undefined, summary: summary || undefined,
      thumb: abs(thumb ?? null), nav: files.length ? undefined : abs(nav ?? null), files };
  });
  const search = feedLinks.find((l) => rel(l) === 'search');
  return {
    url: base, title: text(doc.documentElement, 'title'), entries,
    next: abs(feedLinks.find((l) => rel(l) === 'next')?.getAttribute('href') ?? null),
    prev: abs(feedLinks.find((l) => rel(l) === 'previous' || rel(l) === 'prev')?.getAttribute('href') ?? null),
    search: search ? (/opensearchdescription/.test(typ(search)) ? 'osd:' : '') + (abs(search.getAttribute('href')) || '') : undefined,
  };
}

/** The address to search a catalog for some words (from its OpenSearch description if it has one). */
export async function searchUrl(template: string, words: string): Promise<string> {
  let t = template;
  if (t.startsWith('osd:')) {
    const got = await api.catalog(t.slice(4));
    const d = new DOMParser().parseFromString(got.text, 'application/xml');
    const urls = [...d.getElementsByTagName('*')].filter((x) => x.localName === 'Url');
    const u = urls.find((x) => /atom/.test(x.getAttribute('type') || '')) || urls[0];
    if (!u) throw new Error('这个书库不支持搜索');
    t = new URL(u.getAttribute('template') || '', got.url).href;
  }
  return t.replace('{searchTerms}', encodeURIComponent(words)).replace(/\{[a-zA-Z:]+\?\}/g, '');
}

/** What a file link is, in a word. */
export function fileLabel(f: OpdsLink) {
  const kind = /epub/.test(f.type) ? 'EPUB' : /mobipocket|amazon/.test(f.type) ? (/kf8|azw3/i.test(f.href + (f.title || '')) ? 'AZW3' : 'MOBI') : /pdf/.test(f.type) ? 'PDF'
    : /cbz|comicbook/.test(f.type) ? 'CBZ' : /fictionbook/.test(f.type) ? 'FB2' : /plain/.test(f.type) ? 'TXT' : /html/.test(f.type) ? 'HTML' : f.type.split('/').pop()!.toUpperCase();
  const size = f.length ? ` · ${f.length > 1e6 ? (f.length / 1e6).toFixed(1) + ' MB' : Math.round(f.length / 1e3) + ' KB'}` : '';
  return kind + (/no ?images/i.test(f.title || '') ? '（无图）' : '') + size;
}
