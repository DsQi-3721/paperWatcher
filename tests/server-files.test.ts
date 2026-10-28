// Serving files (server/files.ts): validators so asking again costs a 304, single byte ranges, and a file that is
// closed as soon as the client goes away (it used to stay open, and a deleted paper's disk space with it).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { IMMUTABLE, sendFile } from '../server/files.ts';

const dir = fs.mkdtempSync(path.join(tmpdir(), 'pw-files-'));
const big = path.join(dir, 'paper.pdf');
const data = Buffer.alloc(3 * 1024 * 1024);
for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;
fs.writeFileSync(big, data);
fs.writeFileSync(path.join(dir, 'empty.txt'), '');

const server = http.createServer(async (req, res) => {
  const file = path.join(dir, decodeURIComponent(new URL(req.url!, 'http://x').pathname));
  if (!(await sendFile(req, res, file, IMMUTABLE))) { res.writeHead(404); res.end(); }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const port = (server.address() as { port: number }).port;

function get(p: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

test('a file comes with validators, and asking again with them gets a 304', async () => {
  const a = await get('/paper.pdf');
  assert.equal(a.status, 200);
  assert.ok(a.body.equals(data));
  assert.equal(Number(a.headers['content-length']), data.length);
  assert.equal(a.headers['content-type'], 'application/pdf');
  assert.equal(a.headers['cache-control'], IMMUTABLE);
  assert.match(String(a.headers.etag), /^"[0-9a-z-]+"$/);
  assert.ok(a.headers['last-modified']);
  for (const h of [{ 'If-None-Match': a.headers.etag! }, { 'If-None-Match': `"nope", W/${a.headers.etag}` }, { 'If-Modified-Since': a.headers['last-modified']! }]) {
    const b = await get('/paper.pdf', h);
    assert.equal(b.status, 304, JSON.stringify(h));
    assert.equal(b.body.length, 0);
    assert.equal(b.headers.etag, a.headers.etag);
  }
  assert.equal((await get('/paper.pdf', { 'If-None-Match': '"something-else"' })).status, 200);
  // the file changes: the old validator no longer matches
  const file = path.join(dir, 'thumb.jpg');
  fs.writeFileSync(file, 'old picture');
  const t1 = await get('/thumb.jpg');
  fs.writeFileSync(file, 'a new picture');
  const t2 = await get('/thumb.jpg', { 'If-None-Match': t1.headers.etag! });
  assert.equal(t2.status, 200);
  assert.equal(t2.body.toString(), 'a new picture');
  assert.notEqual(t2.headers.etag, t1.headers.etag);
});

test('byte ranges', async () => {
  const n = data.length;
  const r1 = await get('/paper.pdf', { Range: 'bytes=0-9' });
  assert.equal(r1.status, 206);
  assert.equal(r1.headers['content-range'], `bytes 0-9/${n}`);
  assert.ok(r1.body.equals(data.subarray(0, 10)));
  const r2 = await get('/paper.pdf', { Range: 'bytes=-5' });
  assert.equal(r2.status, 206);
  assert.ok(r2.body.equals(data.subarray(n - 5)));
  const r3 = await get('/paper.pdf', { Range: `bytes=${n - 100}-` });
  assert.equal(r3.headers['content-range'], `bytes ${n - 100}-${n - 1}/${n}`);
  assert.ok(r3.body.equals(data.subarray(n - 100)));
  const r4 = await get('/paper.pdf', { Range: `bytes=100-${n * 2}` });
  assert.equal(r4.headers['content-range'], `bytes 100-${n - 1}/${n}`);
  assert.equal(r4.body.length, n - 100);
  assert.equal((await get('/paper.pdf', { Range: `bytes=${n}-` })).status, 416);
  assert.equal((await get('/paper.pdf', { Range: `bytes=${n}-` })).headers['content-range'], `bytes */${n}`);
  // several ranges, a backwards one, other units: the whole file
  for (const r of ['bytes=0-1,5-6', 'bytes=9-2', 'pages=1-2']) {
    const x = await get('/paper.pdf', { Range: r });
    assert.equal(x.status, 200, r);
    assert.equal(x.body.length, n, r);
  }
  // If-Range: the range only while the file is still the one the client has
  const etag = (await get('/paper.pdf')).headers.etag!;
  assert.equal((await get('/paper.pdf', { Range: 'bytes=0-9', 'If-Range': etag })).status, 206);
  assert.equal((await get('/paper.pdf', { Range: 'bytes=0-9', 'If-Range': '"older"' })).status, 200);
});

test('missing files, folders and empty files', async () => {
  assert.equal((await get('/nothing.pdf')).status, 404);
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  assert.equal((await get('/sub')).status, 404);
  const e = await get('/empty.txt');
  assert.equal(e.status, 200);
  assert.equal(e.headers['content-length'], '0');
});

const openFds = () => fs.readdirSync(fs.existsSync('/proc/self/fd') ? '/proc/self/fd' : '/dev/fd').length;
const connections = () => new Promise<number>((r) => server.getConnections((_e, n) => r(n)));
async function settled() {
  for (let i = 0; i < 100 && (await connections()) > 0; i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 50));
}

test('a download the client gives up on closes the file', { skip: process.platform === 'win32' }, async () => {
  await settled();
  const before = openFds();
  for (let i = 0; i < 8; i++) {
    await new Promise<void>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/paper.pdf', agent: false }, (res) => {
        res.once('data', () => { req.destroy(); resolve(); });
      });
      req.on('error', () => resolve());
    });
  }
  await settled();
  assert.equal(openFds(), before, 'no file left open');
});

test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
