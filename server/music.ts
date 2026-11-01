import { createHash } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { DATA_DIR, writeFileAtomic } from './store.ts';
import { LocalState } from './local-state.ts';
import type { MusicTrack } from '../src/deskapps/types.ts';

const state = new LocalState<{ version: 1; tracks: MusicTrack[] }>('music.json', { version: 1, tracks: [] }, (v) => v?.version === 1 && Array.isArray(v.tracks));
const folder = path.join(DATA_DIR, 'music');
export function audioExtension(buf: Buffer): string {
  if (buf.length < 12) throw new Error('文件内容太短，不是有效音频');
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return '.wav';
  if (buf.toString('ascii', 0, 4) === 'fLaC') return '.flac';
  if (buf.toString('ascii', 0, 4) === 'OggS') return '.ogg';
  if (buf.toString('ascii', 0, 3) === 'ID3') return '.mp3';
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return '.aac';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return '.mp3';
  if (buf.toString('ascii', 4, 8) === 'ftyp') return '.m4a';
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return '.webm';
  throw new Error('未识别的音频格式，请使用 MP3、WAV、M4A、OGG、FLAC、AAC 或 WebM 音频');
}
export function audioUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('请输入音频直链');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('链接格式不正确'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持不含账号密码的 HTTP / HTTPS 音频直链');
  return url.href;
}
export async function listMusic() { return (await state.read()).tracks.filter((t) => !t.deletedAt); }
async function add(track: MusicTrack) {
  return state.change((data) => {
    const old = data.tracks.find((t) => t.id === track.id);
    if (old) { delete old.deletedAt; return old; }
    data.tracks.push(track); return track;
  });
}
export async function importAudio(buf: Buffer, filename: string) {
  if (buf.length > 200 * 1024 * 1024) throw new Error('单个音频文件不能超过 200 MB');
  const ext = audioExtension(buf), id = createHash('sha256').update(buf).digest('hex').slice(0, 20);
  const fileName = path.basename(filename.replace(/\\/g, '/')).slice(0, 200) || 'audio' + ext;
  await fs.mkdir(folder, { recursive: true });
  const file = id + ext;
  // Same bytes are stored once; every playlist insertion is serialized below.
  try { await fs.access(path.join(folder, file)); } catch { await writeFileAtomic(path.join(folder, file), buf, 0o600); }
  return add({ id, kind: 'file', title: fileName.replace(/\.[^.]+$/, ''), fileName, file, bytes: buf.length, addedAt: Date.now() });
}
export async function addAudioLink(value: unknown, title?: unknown) {
  const url = audioUrl(value), id = createHash('sha256').update('url:' + url).digest('hex').slice(0, 20);
  return add({ id, kind: 'url', url, title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : new URL(url).pathname.split('/').pop()?.slice(0, 200) || '在线音频', addedAt: Date.now() });
}
export async function musicFile(id: string) {
  const track = (await listMusic()).find((t) => t.id === id);
  if (!track || track.kind !== 'file' || !track.file || !/^[a-f0-9]{20}\.(mp3|wav|ogg|flac|aac|m4a|webm)$/.test(track.file)) return null;
  return path.join(folder, track.file);
}
export async function removeMusic(id: string, deleted: boolean) {
  return state.change((data) => { const track = data.tracks.find((t) => t.id === id); if (!track) throw new Error('音乐不存在'); if (deleted) track.deletedAt = Date.now(); else delete track.deletedAt; return track; });
}
