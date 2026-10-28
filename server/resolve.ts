// Turns whatever the reader pastes (arXiv abs/pdf/html links, bare ids, OpenReview, ACL, DOIs, any page with
// citation meta tags, or a direct PDF link) into a downloadable PDF URL plus whatever metadata we can find.
import { ByteSink } from './http.ts';
import type { PaperMeta } from './store.ts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const ARXIV_NEW = /(\d{4}\.\d{4,5})(v\d+)?/;
const ARXIV_OLD = /([a-z][a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/;
const ARXIV_NEW_FULL = /^(\d{4}\.\d{4,5})(v\d+)?$/;
const ARXIV_OLD_FULL = /^([a-z][a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?$/;

export interface Resolved {
  pdfUrl: string;
  fallbackUrls?: string[];
  meta: Partial<PaperMeta>;
}

type Status = (text: string) => void;

async function get(url: string, opts: { accept?: string; timeout?: number; signal?: AbortSignal } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new Error('Request timed out')), opts.timeout ?? 20000);
  const onAbort = () => ctl.abort(opts.signal!.reason);
  if (opts.signal?.aborted) onAbort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    return await fetch(url, {
      headers: { 'User-Agent': UA, Accept: opts.accept || '*/*', 'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8' },
      redirect: 'follow',
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** An answer that will not be read: its connection is let go now, not when it is garbage-collected. */
function unread(res: Response) {
  res.body?.cancel().catch(() => {});
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:\-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

function metaTags(html: string): Array<Record<string, string>> {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
}

const BOT_TITLE = /verifying your browser|just a moment|attention required|access denied|captcha|are you a robot|cloudflare|security check|page not found|^\s*404|redirecting/i;

function citationMeta(html: string): Partial<PaperMeta> & { pdf?: string } {
  const tags = metaTags(html);
  const val = (...names: string[]) => {
    for (const n of names) {
      const t = tags.find((t) => (t.name || t.property || '').toLowerCase() === n);
      if (t?.content) return t.content.trim();
    }
    return undefined;
  };
  const authors = tags
    .filter((t) => ['citation_author', 'dc.creator'].includes((t.name || '').toLowerCase()))
    .map((t) => t.content?.trim())
    .filter(Boolean) as string[];
  let title = val('citation_title', 'dc.title', 'og:title', 'twitter:title');
  if (!title) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (m) title = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
  }
  if (title && BOT_TITLE.test(title)) title = undefined;
  return {
    title,
    authors: authors.length ? authors.slice(0, 30) : undefined,
    abstract: val('citation_abstract', 'dc.description', 'description', 'og:description'),
    pdf: val('citation_pdf_url', 'eprints.document_url', 'bepress_citation_pdf_url'),
  };
}

export function arxivIdFromUrl(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  const arxivHosts = ['arxiv.org', 'export.arxiv.org', 'alphaxiv.org', 'arxiv-sanity-lite.com', 'ar5iv.labs.arxiv.org', 'ar5iv.org', 'chatpaper.com', 'paperswithcode.com', 'huggingface.co', 'scholar.archive.org'];
  if (!arxivHosts.some((h) => host === h || host.endsWith('.' + h))) return null;
  if (host === 'huggingface.co' && !u.pathname.startsWith('/papers/')) return null;
  if (host === 'paperswithcode.com' && !u.pathname.startsWith('/paper/')) return null;
  const p = decodeURIComponent(u.pathname).replace(/\.pdf$/i, '');
  const m = ARXIV_NEW.exec(p) || ARXIV_OLD.exec(p);
  if (!m) return null;
  return m[1] + (m[2] || '');
}

async function arxivMeta(id: string, signal?: AbortSignal): Promise<Partial<PaperMeta>> {
  const base = id.replace(/v\d+$/, '');
  try {
    const res = await get(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(base)}`, { timeout: 12000, signal });
    if (!res.ok) {
      unread(res);
    } else {
      const xml = await res.text();
      const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1];
      if (entry) {
        const title = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1];
        const summary = /<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1];
        const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => decodeEntities(m[1]).trim());
        if (title && !/^Error$/i.test(title.trim())) {
          return {
            title: decodeEntities(title).replace(/\s+/g, ' ').trim(),
            abstract: summary ? decodeEntities(summary).replace(/\s+/g, ' ').trim() : undefined,
            authors: authors.length ? authors : undefined,
          };
        }
      }
    }
  } catch { /* fall through to the abs page */ }
  try {
    const res = await get(`https://arxiv.org/abs/${id}`, { timeout: 12000, accept: 'text/html', signal });
    if (res.ok) {
      const m = citationMeta(await res.text());
      return { title: m.title, authors: m.authors, abstract: m.abstract };
    }
    unread(res);
  } catch { /* metadata is optional */ }
  return {};
}

async function openreviewMeta(id: string, signal?: AbortSignal): Promise<Partial<PaperMeta>> {
  for (const base of ['https://api2.openreview.net', 'https://api.openreview.net']) {
    try {
      const res = await get(`${base}/notes?id=${encodeURIComponent(id)}`, { timeout: 10000, accept: 'application/json', signal });
      if (!res.ok) { unread(res); continue; }
      const j: any = await res.json();
      const c = j?.notes?.[0]?.content;
      if (!c) continue;
      const val = (x: any) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
      return { title: val(c.title), authors: val(c.authors), abstract: val(c.abstract) };
    } catch { /* try the next API */ }
  }
  return {};
}

async function arxivResolved(id: string, status: Status, sourceUrl?: string, signal?: AbortSignal): Promise<Resolved> {
  status(`arXiv ${id}`);
  const meta = await arxivMeta(id, signal);
  return {
    pdfUrl: `https://arxiv.org/pdf/${id}`,
    fallbackUrls: [`https://export.arxiv.org/pdf/${id}`],
    meta: { ...meta, arxivId: id, sourceUrl: sourceUrl || `https://arxiv.org/abs/${id}` },
  };
}

function absolutize(href: string, base: string) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

/** Finds the most plausible PDF link on an HTML page. */
function pdfLinkFromHtml(html: string, base: string): string | null {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.type || '').includes('pdf') && a.href) return absolutize(a.href, base);
  }
  let best: { url: string; score: number } | null = null;
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]{0,200}?)<\/a>/gi)) {
    const a = attrs(m[1]);
    if (!a.href || a.href.startsWith('javascript:') || a.href.startsWith('#')) continue;
    const text = m[2].replace(/<[^>]+>/g, ' ').trim().toLowerCase();
    const href = a.href.toLowerCase();
    let score = 0;
    if (/\.pdf($|[?#])/.test(href)) score += 5;
    if (/\/pdf(\/|$|\?)/.test(href)) score += 3;
    if (/\bpdf\b/.test(text)) score += 3;
    if (/download|full ?text|paper/.test(text)) score += 1;
    if (/supp|appendix|slides|poster|review/.test(href + ' ' + text)) score -= 4;
    if (score >= 4 && (!best || score > best.score)) {
      const url = absolutize(a.href, base);
      if (url) best = { url, score };
    }
  }
  return best?.url || null;
}

export function knownHostPdf(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  const p = u.pathname;
  if (host === 'openreview.net') {
    const id = u.searchParams.get('id');
    if (id) return `https://openreview.net/pdf?id=${encodeURIComponent(id)}`;
  }
  if (host === 'aclanthology.org') {
    const m = /^\/([A-Za-z0-9.\-]+?)(?:\.pdf)?\/?$/.exec(p);
    if (m && /\d/.test(m[1])) return `https://aclanthology.org/${m[1]}.pdf`;
  }
  if (host.endsWith('biorxiv.org') || host.endsWith('medrxiv.org')) {
    if (/\/content\/10\.\d+/.test(p) && !p.endsWith('.pdf')) return u.origin + p.replace(/(\.full|\.abstract)?\/?$/, '') + '.full.pdf';
  }
  if (host === 'proceedings.neurips.cc' || host === 'papers.nips.cc') {
    if (/-Abstract(-[A-Za-z_]+)?\.html$/.test(p)) return u.origin + p.replace('/hash/', '/file/').replace(/-Abstract(-[A-Za-z_]+)?\.html$/, '-Paper$1.pdf');
  }
  if (host === 'proceedings.mlr.press') {
    const m = /^\/(v\d+)\/([^/]+)\.html$/.exec(p);
    if (m) return `https://proceedings.mlr.press/${m[1]}/${m[2]}/${m[2]}.pdf`;
  }
  if (host === 'openaccess.thecvf.com' && p.includes('/html/')) return u.origin + p.replace('/html/', '/papers/').replace(/\.html$/, '.pdf');
  if (host === 'github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/blob\/(.+\.pdf)$/i.exec(p);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  if (host === 'dl.acm.org') {
    const m = /^\/doi\/(?:abs\/|full\/)?(10\.\d+\/.+)$/.exec(p);
    if (m) return `https://dl.acm.org/doi/pdf/${m[1]}`;
  }
  return null;
}

export async function resolvePaper(input: string, status: Status, depth = 0, signal?: AbortSignal): Promise<Resolved> {
  let s = input.trim().replace(/^<|>$/g, '');
  if (!s) throw new Error('Paste a paper link first');
  const bare = s.replace(/^arxiv:\s*/i, '');
  if (ARXIV_NEW_FULL.test(bare) || ARXIV_OLD_FULL.test(bare)) return arxivResolved(bare, status, undefined, signal);
  if (/^10\.\d{4,9}\/\S+$/.test(s)) s = 'https://doi.org/' + s;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u: URL;
  try { u = new URL(s); } catch { throw new Error('That does not look like a link'); }

  const ax = arxivIdFromUrl(u);
  if (ax) return arxivResolved(ax, status, s, signal);

  const known = knownHostPdf(u);
  if (known) {
    status(`${u.hostname}`);
    let meta: Partial<PaperMeta> = { sourceUrl: s };
    const orId = u.hostname.endsWith('openreview.net') ? u.searchParams.get('id') : null;
    if (orId) return { pdfUrl: known, meta: { ...meta, ...(await openreviewMeta(orId, signal)) } };
    if (!/\.pdf($|\?)/i.test(u.pathname) && !u.pathname.startsWith('/pdf')) {
      try {
        const res = await get(s, { accept: 'text/html', timeout: 12000, signal });
        if (res.ok && (res.headers.get('content-type') || '').includes('html')) {
          const m = citationMeta(await res.text());
          meta = { ...meta, title: m.title, authors: m.authors, abstract: m.abstract };
          if (m.pdf) return { pdfUrl: absolutize(m.pdf, res.url) || known, fallbackUrls: [known], meta };
        } else unread(res);
      } catch { /* the known pattern is still worth a try */ }
    }
    return { pdfUrl: known, meta };
  }

  status(`Looking at ${u.hostname}…`);
  let res: Response;
  try {
    res = await get(s, { accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8', timeout: 20000, signal });
  } catch (e: any) {
    if (signal?.aborted) throw e;
    const why = e?.cause?.code || e?.cause?.message || e?.message || 'network error';
    throw new Error(`Could not reach ${u.hostname} (${why})`);
  }
  if (!res.ok) { unread(res); throw new Error(`The page answered HTTP ${res.status}`); }
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('pdf') || /\.pdf($|\?)/i.test(new URL(res.url).pathname) && !ct.includes('html')) {
    await res.body?.cancel().catch(() => {});
    return { pdfUrl: res.url, meta: { sourceUrl: s } };
  }
  const text = await res.text();
  if (text.startsWith('%PDF')) return { pdfUrl: res.url, meta: { sourceUrl: s } };
  const finalUrl = res.url;
  const fu = new URL(finalUrl);
  const m = citationMeta(text);
  const meta: Partial<PaperMeta> = { sourceUrl: s, title: m.title, authors: m.authors, abstract: m.abstract };

  // A redirect (e.g. doi.org) may land on a host we know.
  if (finalUrl !== s) {
    const ax2 = arxivIdFromUrl(fu);
    if (ax2) return arxivResolved(ax2, status, s, signal);
    const k2 = knownHostPdf(fu);
    if (k2) return { pdfUrl: m.pdf ? absolutize(m.pdf, finalUrl)! : k2, fallbackUrls: [k2], meta };
  }
  if (m.pdf) {
    const pdf = absolutize(m.pdf, finalUrl);
    if (pdf) return { pdfUrl: pdf, meta };
  }
  // Pages about a paper (Papers with Code, Semantic Scholar, blogs…) often link its arXiv entry.
  const axLink = /arxiv\.org\/(?:abs|pdf|html)\/((?:\d{4}\.\d{4,5}|[a-z][a-z\-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?)/.exec(text);
  const pdfLink = pdfLinkFromHtml(text, finalUrl);
  if (pdfLink) return { pdfUrl: pdfLink, fallbackUrls: axLink ? [`https://arxiv.org/pdf/${axLink[1]}`] : [], meta };
  if (axLink && depth === 0) {
    const r = await arxivResolved(axLink[1], status, s, signal);
    return { ...r, meta: { ...r.meta, sourceUrl: s } };
  }
  throw new Error('Could not find a PDF on that page (it may be behind a paywall)');
}

/** Downloads a PDF with progress callbacks. An idle timeout replaces a total timeout so large files on slow links work. */
export async function downloadPdf(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ buf: Buffer; finalUrl: string; html?: string }> {
  const ctl = new AbortController();
  let idle: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => ctl.abort(new Error('Download stalled')), 30000);
  };
  const onAbort = () => ctl.abort(signal!.reason);
  if (signal?.aborted) onAbort();
  signal?.addEventListener('abort', onAbort, { once: true });
  arm();
  let complete = false;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*;q=0.8' },
      redirect: 'follow',
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body!.getReader();
    const sink = new ByteSink(total <= 300 * 1024 * 1024 ? total : 0);
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      sink.push(value);
      if (sink.length > 300 * 1024 * 1024) throw new Error('PDF is larger than 300 MB');
      const now = Date.now();
      if (now - lastReport > 120) { onProgress(sink.length, total); lastReport = now; }
    }
    complete = true;
    onProgress(sink.length, total || sink.length);
    const buf = sink.done();
    if (buf.subarray(0, 1024).indexOf('%PDF') < 0) {
      return { buf, finalUrl: res.url, html: buf.subarray(0, 3_000_000).toString('utf8') };
    }
    return { buf, finalUrl: res.url };
  } finally {
    clearTimeout(idle);
    signal?.removeEventListener('abort', onAbort);
    // given up (an error, too large): the connection goes now, not when it is garbage-collected
    if (!complete) ctl.abort();
  }
}

/** Resolve + download, following one level of HTML indirection (e.g. a landing page served at a .pdf URL). */
export async function fetchPaper(
  input: string,
  status: Status,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ buf: Buffer; meta: Partial<PaperMeta> }> {
  const r = await resolvePaper(input, status, 0, signal);
  const tries = [r.pdfUrl, ...(r.fallbackUrls || [])].filter((v, i, a) => a.indexOf(v) === i);
  let lastErr: Error | null = null;
  for (const url of tries) {
    try {
      status('Downloading PDF…');
      const d = await downloadPdf(url, onProgress, signal);
      if (!d.html) return { buf: d.buf, meta: r.meta };
      const link = citationMeta(d.html).pdf || pdfLinkFromHtml(d.html, d.finalUrl);
      if (link) {
        const d2 = await downloadPdf(absolutize(link, d.finalUrl)!, onProgress, signal);
        if (!d2.html) return { buf: d2.buf, meta: r.meta };
      }
      lastErr = new Error('The link gave a web page instead of a PDF');
    } catch (e) {
      if (signal?.aborted) throw e;
      lastErr = e as Error;
    }
  }
  throw lastErr || new Error('Download failed');
}
