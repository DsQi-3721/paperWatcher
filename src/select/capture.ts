// Turning a selection into things you can take away: crisp image crops, clipboard copies, downloads,
// and a Markdown notebook of every conversation.
import { replyToPlain } from '../ink/markdown';
import type { Renderer } from '../pdf/renderer';
import type { Annotation, PaperMeta } from '../types';
import type { Rect } from '../util/geom';

/** Renders the page at a resolution suited to the crop and returns the crop as a canvas. */
export async function cropRegion(renderer: Renderer, page: number, r: Rect, maxSide = 1800): Promise<HTMLCanvasElement> {
  const scale = Math.max(1.5, Math.min(4, maxSide / Math.max(r.w, r.h)));
  const full = await renderer.snapshot(page, scale, '#ffffff');
  const x = Math.max(0, Math.floor(r.x * scale)), y = Math.max(0, Math.floor(r.y * scale));
  const w = Math.min(full.width - x, Math.ceil(r.w * scale)), h = Math.min(full.height - y, Math.ceil(r.h * scale));
  const out = document.createElement('canvas');
  out.width = Math.max(1, w);
  out.height = Math.max(1, h);
  out.getContext('2d')!.drawImage(full, x, y, w, h, 0, 0, w, h);
  full.width = full.height = 0;
  return out;
}

export function canvasToDataUrl(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg' = 'image/png') {
  return c.toDataURL(type, 0.92);
}

export async function copyImage(c: HTMLCanvasElement) {
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function download(name: string, data: Blob | string, type = 'text/plain;charset=utf-8') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'paper';
}

/** Citation line for a quote. */
export function citation(meta: PaperMeta, page: number) {
  const who = meta.authors?.length ? `${meta.authors[0].split(',')[0]}${meta.authors.length > 1 ? ' et al.' : ''}` : '';
  return `— ${who ? who + ', ' : ''}*${meta.title}*, p.${page + 1}${meta.arxivId ? ` (arXiv:${meta.arxivId})` : ''}`;
}

export function notesToMarkdown(meta: PaperMeta, list: Annotation[], label: (a: Annotation) => string): string {
  const lines: string[] = [`# ${meta.title}`, ''];
  if (meta.authors?.length) lines.push(meta.authors.join(', '), '');
  if (meta.sourceUrl) lines.push(`<${meta.sourceUrl}>`, '');
  lines.push(`> 来自 Paper Watcher 的阅读笔记 · ${new Date().toLocaleString()}`, '');
  const pageOf = (a: Annotation) => (a.anchor.kind === 'text' ? a.anchor.ranges[0]?.page ?? 0 : a.anchor.kind === 'region' ? a.anchor.page : -1);
  for (const a of [...list].sort((x, y) => pageOf(x) - pageOf(y))) {
    lines.push(`## ${label(a)}`, '');
    if (a.anchor.kind === 'text') lines.push(a.anchor.quote.split('\n').map((l) => '> ' + l).join('\n'), '');
    if (a.anchor.kind === 'region' && a.anchor.quote) lines.push('> ' + a.anchor.quote.slice(0, 600), '');
    if (a.margin) lines.push(`**页边：** ${a.margin}`, '');
    for (const m of a.messages) {
      if (!m.text) continue;
      lines.push(m.role === 'user' ? `**我：** ${m.text}` : `**AI：** ${replyToPlain(m.text)}`, '');
    }
  }
  return lines.join('\n');
}
