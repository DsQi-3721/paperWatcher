// A picture's size from the first bytes of its file (PNG, JPEG, GIF, WebP), without decoding it: an illustrated
// chapter is laid out without waiting for every picture to be decoded. Anything else is decoded.
import { LazyBlobs } from '../formats/util';

export async function imageSize(blob: Blob): Promise<{ w: number; h: number } | null> {
  return sizeOfBlob(blob);
}

/** A book picture's size by its key: a picture not unpacked yet (formats/util LazyBlobs) is read from its first
 *  bytes, as imageSize reads a Blob's, so it need not be unpacked for its size; anything else as imageSize. */
export async function pictureSize(res: Map<string, Blob>, key: string): Promise<{ w: number; h: number } | null> {
  if (res instanceof LazyBlobs) { const s = res.peek(key, headerSize); if (s) return s; }
  const blob = res.get(key);
  return blob ? sizeOfBlob(blob) : null;
}

async function sizeOfBlob(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const b = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
    const s = headerSize(b);
    if (s) return s;
  } catch { /* fall through */ }
  try { const bm = await createImageBitmap(blob); const s = { w: bm.width, h: bm.height }; bm.close(); return s; } catch { return null; }
}

export function headerSize(b: Uint8Array): { w: number; h: number } | null {
  const u16 = (o: number) => (b[o] << 8) | b[o + 1], u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const le16 = (o: number) => b[o] | (b[o + 1] << 8), le24 = (o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
  // PNG: the IHDR chunk
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b.length > 24) return { w: u32(16), h: u32(20) };
  // GIF: the logical screen
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b.length > 10) return { w: le16(6), h: le16(8) };
  // JPEG: the first start-of-frame marker
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { o += 2; continue; }
      const len = u16(o + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { w: u16(o + 7), h: u16(o + 5) };
      o += 2 + len;
    }
    return null;
  }
  // WebP: lossy, lossless, extended
  if (b.length > 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8 ') return { w: le16(26) & 0x3fff, h: le16(28) & 0x3fff };
    if (kind === 'VP8L') { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    if (kind === 'VP8X') return { w: le24(24) + 1, h: le24(27) + 1 };
  }
  return null;
}
