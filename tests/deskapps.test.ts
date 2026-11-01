import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-deskapps-'));
process.env.PW_DATA_DIR = dir;
const desk = await import('../server/deskapps.ts');
const music = await import('../server/music.ts');
const { Router } = await import('../server/http.ts');
const { deskRoutes } = await import('../server/desk-routes.ts');
const { sceneText } = await import('../src/deskapps/text.ts');
const router = new Router(); deskRoutes(router);
const server = http.createServer((req, res) => { void router.handle(req, res).then((handled) => { if (!handled) { res.writeHead(404); res.end(); } }); });
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as any).port}`;

test('planner uses local calendar dates and lists thirty days across month and leap-year boundaries', () => {
  assert.equal(desk.todayKey(new Date(2026, 10, 1, 0, 2)), '2026-11-01');
  const days = desk.recentDays('2026-11-01');
  assert.equal(days.length, 30); assert.equal(days[0], '2026-11-01'); assert.equal(days.at(-1), '2026-10-03');
  assert.deepEqual(desk.recentDays('2024-03-01', 3), ['2024-03-01', '2024-02-29', '2024-02-28']);
  assert.throws(() => desk.validDay('2026-02-30'), /日期无效/);
  assert.throws(() => desk.validDay('../settings'), /日期格式/);
});

test('todo additions deduplicate retries and concurrent edits preserve text, completion and history', async () => {
  await Promise.all(Array.from({ length: 5 }, () => desk.addTodo('2026-11-01', 'Read a paper', 'same-todo-id')));
  assert.equal((await desk.readPlanner('2026-11-01')).items.length, 1);
  await Promise.all([desk.patchTodo('2026-11-01', 'same-todo-id', { text: 'Read two papers' }), desk.patchTodo('2026-11-01', 'same-todo-id', { done: true })]);
  await desk.addTodo('2026-10-10', 'Review last month', 'history-todo-id');
  const today = await desk.readPlanner('2026-11-01', '2026-11-01');
  assert.equal(today.items[0].text, 'Read two papers'); assert.equal(today.items[0].done, true);
  assert.equal(today.history.find((d) => d.date === '2026-10-10')?.total, 1);
  await desk.patchTodo('2026-11-01', 'same-todo-id', { deleted: true });
  assert.equal((await desk.readPlanner('2026-11-01')).items.length, 0);
  await desk.patchTodo('2026-11-01', 'same-todo-id', { deleted: false });
  assert.equal((await desk.readPlanner('2026-11-01')).items[0].done, true);
  assert.equal(fs.statSync(path.join(dir, 'planner.json')).mode & 0o777, 0o600);
});

test('damaged planner storage is not silently replaced', async () => {
  const file = path.join(dir, 'planner.json'), original = fs.readFileSync(file);
  fs.writeFileSync(file, '{broken');
  await assert.rejects(desk.addTodo('2026-11-01', 'Do not overwrite', 'another-todo-id'), /原文件已保留/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken'); fs.writeFileSync(file, original);
});

const words = [
  { id: 'old-word', english: 'attention', chinese: '注意力', kind: 'word', collectedAt: 1, createdAt: 1 },
  { id: 'new-phrase', english: 'self-attention', chinese: '自注意力', kind: 'phrase', collectedAt: 10, createdAt: 2 },
  { id: 'sentence', english: 'We train the model.', chinese: '我们训练模型。', kind: 'sentence', collectedAt: 20, createdAt: 3 },
  { id: 'deleted', english: 'removed', chinese: '已移除', kind: 'word', collectedAt: 30, deletedAt: 31 },
].map((w) => ({ ...w, meaningEn: 'Definition', meaningZh: '解释', learned: false }));
fs.writeFileSync(path.join(dir, 'english-notebook.json'), JSON.stringify({ version: 1, entries: words }));

test('dictation follows latest vocabulary and grades words and phrases without changing learned state', async () => {
  assert.deepEqual((await desk.dictationWords()).map((w) => w.id), ['new-phrase', 'old-word']);
  assert.equal(desk.normalizeAnswer('  SELF‑ATTENTION. '), 'self-attention');
  assert.equal(desk.normalizeAnswer('in   conjunction  with'), 'in conjunction with');
  assert.notEqual(desk.normalizeAnswer('self attention'), desk.normalizeAnswer('self-attention'));
  const correct = await desk.checkDictation('new-phrase', '  SELF‑ATTENTION. ');
  assert.equal(correct.correct, true);
  const wrong = await desk.checkDictation('new-phrase', 'self atention');
  assert.equal(wrong.correct, false); assert.equal(wrong.english, 'self-attention');
  assert.equal(wrong.attempts, 2); assert.equal(wrong.correctCount, 1);
  assert.equal((await desk.dictationWords())[0].previous?.answer, 'self atention');
  await assert.rejects(desk.checkDictation('deleted', 'removed'), /不在词本/);
  await assert.rejects(desk.checkDictation('sentence', 'We train the model.'), /不在词本/);
  await assert.rejects(desk.checkDictation('old-word', ''), /先输入/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'english-notebook.json'), 'utf8')).entries[0].learned, false);
});

function wav() {
  const buffer = Buffer.alloc(44 + 16000); buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(16000, 40); return buffer;
}
let audioId = '';
test('local audio persists once, is validated, and can be removed and restored', async () => {
  const bytes = wav(), first = await music.importAudio(bytes, '../../我的音乐.wav'); audioId = first.id;
  const second = await music.importAudio(bytes, 'another-name.wav');
  assert.equal(first.id, second.id); assert.equal((await music.listMusic()).length, 1);
  assert.equal(first.fileName, '我的音乐.wav');
  assert.deepEqual(fs.readFileSync((await music.musicFile(first.id))!), bytes);
  await music.removeMusic(first.id, true); assert.equal(await music.musicFile(first.id), null);
  await music.removeMusic(first.id, false); assert.ok(await music.musicFile(first.id));
  await assert.rejects(music.importAudio(Buffer.from('<html>not audio</html>'), 'fake.mp3'), /音频格式/);
});

test('audio URLs are explicit HTTP media sources and cannot inject local files or script schemes', async () => {
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'data:audio/mp3;base64,AA==', 'https://user:password@example.com/a.mp3']) assert.throws(() => music.audioUrl(bad));
  const entry = await music.addAudioLink('https://example.com/test.mp3', 'A & B <music>');
  assert.equal(entry.kind, 'url'); assert.equal(entry.url, 'https://example.com/test.mp3');
  assert.equal(await music.musicFile(entry.id), null);
  assert.equal(sceneText('<script> & "music"'), '&lt;script&gt; &amp; &quot;music&quot;');
});

test('music endpoint serves browser media ranges and HEAD with audio MIME type', async () => {
  const response = await fetch(`${base}/api/music/${audioId}/audio`, { headers: { Range: 'bytes=0-43' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-type'), 'audio/wav');
  assert.equal(response.headers.get('content-range'), `bytes 0-43/${wav().length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), wav().subarray(0, 44));
  const head = await fetch(`${base}/api/music/${audioId}/audio`, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal((await head.arrayBuffer()).byteLength, 0);
  const outOfRange = await fetch(`${base}/api/music/${audioId}/audio`, { headers: { Range: 'bytes=999999-' } }); assert.equal(outOfRange.status, 416);
});

test.after(async () => { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); fs.rmSync(dir, { recursive: true, force: true }); });
