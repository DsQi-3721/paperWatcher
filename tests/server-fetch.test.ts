// Downloads the server makes (server/books.ts fetchBook / fetchCatalog, server/resolve.ts downloadPdf), against a
// local stand-in: the bytes come through intact whether the size is announced, unknown or compressed, and an answer
// that will not be used is let go at once instead of being downloaded first.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { gzipSync } from 'node:zlib';
import { fetchBook, fetchCatalog } from '../server/books.ts';
import { downloadPdf } from '../server/resolve.ts';

const book = Buffer.alloc(2 * 1024 * 1024);
for (let i = 0; i < book.length; i++) book[i] = (i * 13) & 0xff;
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), book]);
let htmlFinished: boolean | null = null;

const server = http.createServer((req, res) => {
  const p = req.url!;
  if (p === '/book.epub') { res.writeHead(200, { 'Content-Length': book.length, 'Content-Disposition': 'attachment; filename="My Book.epub"' }); res.end(book); }
  else if (p === '/chunked.epub') { res.writeHead(200); res.write(book.subarray(0, 1000)); res.end(book.subarray(1000)); }
  else if (p === '/gzip.epub') { const z = gzipSync(book); res.writeHead(200, { 'Content-Encoding': 'gzip', 'Content-Length': z.length }); res.end(z); }
  else if (p === '/page') {
    // a web page where a book was expected, coming in slowly (as over a real network): 64 KB every 5 ms, 8 MB
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    let sent = 0;
    const t = setInterval(() => {
      if (sent >= 8 * 1024 * 1024) { clearInterval(t); res.end(); return; }
      res.write(Buffer.alloc(64 * 1024, 'a'));
      sent += 64 * 1024;
    }, 5);
    res.on('finish', () => (htmlFinished = true));
    res.on('close', () => { clearInterval(t); htmlFinished ??= false; });
  }
  else if (p === '/feed') { res.writeHead(200, { 'Content-Type': 'application/atom+xml' }); res.end(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<feed>书库</feed>')])); }
  else if (p === '/paper.pdf') { res.writeHead(200, { 'Content-Length': pdf.length }); res.end(pdf); }
  else if (p === '/landing') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html><meta name="citation_pdf_url" content="/paper.pdf"></html>'); }
  else { res.writeHead(404); res.end('no'); }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const signal = () => new AbortController().signal;

test('a book comes through intact: size announced, unknown, or compressed', async () => {
  const seen: number[] = [];
  const a = await fetchBook(base + '/book.epub', () => {}, (loaded) => seen.push(loaded), signal());
  assert.ok(a.buf.equals(book));
  assert.equal(a.fileName, 'My Book.epub');
  assert.equal(seen.at(-1), book.length);
  assert.ok((await fetchBook(base + '/chunked.epub', () => {}, () => {}, signal())).buf.equals(book));
  assert.ok((await fetchBook(base + '/gzip.epub', () => {}, () => {}, signal())).buf.equals(book));
  await assert.rejects(() => fetchBook(base + '/missing.epub', () => {}, () => {}, signal()), /HTTP 404/);
});

test('a web page where a book was expected is turned down before it is downloaded', async () => {
  htmlFinished = null;
  await assert.rejects(() => fetchBook(base + '/page', () => {}, () => {}, signal()), /网页/);
  for (let i = 0; i < 100 && htmlFinished === null; i++) await new Promise((r) => setTimeout(r, 20));
  assert.equal(htmlFinished, false, 'the connection was dropped, not read to the end');
});

test('a catalog page is read as UTF-8 text', async () => {
  const c = await fetchCatalog(base + '/feed', signal());
  assert.equal(c.text, '<feed>书库</feed>');
  assert.equal(c.type, 'application/atom+xml');
  await assert.rejects(() => fetchCatalog(base + '/nope', signal()), /HTTP 404/);
});

test('a PDF download, and a page that is not one', async () => {
  const d = await downloadPdf(base + '/paper.pdf', () => {});
  assert.ok(d.buf.equals(pdf));
  assert.equal(d.html, undefined);
  const l = await downloadPdf(base + '/landing', () => {});
  assert.match(l.html!, /citation_pdf_url/);
  await assert.rejects(() => downloadPdf(base + '/nope.pdf', () => {}), /HTTP 404/);
});

test.after(() => server.close());
