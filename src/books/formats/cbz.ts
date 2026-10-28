// Comics: a CBZ (a ZIP of page pictures, maybe with ComicInfo.xml). Pages in natural order (page2 before page10),
// skipping Mac resource forks and hidden files; manga that read right to left say so in ComicInfo.xml. Pictures are
// decoded only when shown, at the width asked for. Folders inside (volumes, chapters) become the contents.
import type { FixedDoc, TocItem } from '../types';
import { blobOf, dirOf, fail, IMAGE_EXT, imageMime, imageSize, naturalCompare, titleFromName } from './util';
import { Zip, type ZipEntry } from './zip';

export function parseCbzZip(zip: Zip, name: string): FixedDoc {
  const pages: ZipEntry[] = zip.entries
    .filter((e) => IMAGE_EXT.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) && e.usize !== 0)
    .sort((a, b) => naturalCompare(a.name, b.name));
  if (!pages.length) fail('这个压缩包里没有图片，不是漫画（CBZ）');

  let title = titleFromName(name), author: string | undefined, rtl = false, lang: string | undefined;
  const infoEntry = zip.entries.find((e) => /(^|\/)comicinfo\.xml$/i.test(e.name));
  if (infoEntry) {
    try {
      const x = new DOMParser().parseFromString(zip.text(infoEntry), 'application/xml');
      const get = (k: string) => (x.getElementsByTagName(k)[0]?.textContent || '').trim();
      const series = get('Series'), num = get('Number'), t = get('Title');
      if (series || t) title = series ? `${series}${num ? ' ' + num : ''}${t && t !== series ? ' · ' + t : ''}` : t;
      author = get('Writer') || get('Penciller') || undefined;
      rtl = /righttoleft/i.test(get('Manga'));
      lang = get('LanguageISO') || undefined;
    } catch { /* a broken ComicInfo */ }
  }

  // sizes: read from the picture's header when it is stored (no decompressing), else when first drawn
  const sizes: Array<{ w: number; h: number } | null> = pages.map((e) => (e.method === 0 ? imageSize(zip.bytes(e)) : null));
  const blobAt = (i: number) => {
    const bytes = zip.bytes(pages[i]);
    if (!sizes[i]) sizes[i] = imageSize(bytes);
    return blobOf(bytes, imageMime(bytes, pages[i].name) || 'image/jpeg');
  };
  const render = async (i: number, widthPx: number): Promise<ImageBitmap | HTMLCanvasElement> => {
    const blob = blobAt(i), w = Math.max(1, Math.round(widthPx));
    try { return await createImageBitmap(blob, { resizeWidth: w, resizeQuality: 'high' }); } catch {
      // SVG pages and odd files: through an <img>
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = w;
        c.height = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * w));
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        return c;
      } finally { URL.revokeObjectURL(url); }
    }
  };

  // contents: one entry per folder, at its first page (only when there is more than one folder)
  const toc: TocItem[] = [];
  let last = '\0';
  pages.forEach((e, i) => { const d = dirOf(e.name); if (d !== last) { last = d; toc.push({ title: d.split('/').pop() || title, chapter: 0, block: i }); } });

  return {
    kind: 'fixed', title, author, lang, rtl, cover: blobAt(0), pages: pages.length,
    size: (i) => sizes[i] ?? null, render,
    toc: toc.length > 1 ? toc : [],
  };
}

/** RAR / 7z comics: not readable here. */
export function isRarOr7z(b: Uint8Array) {
  return (b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) || (b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf);
}
