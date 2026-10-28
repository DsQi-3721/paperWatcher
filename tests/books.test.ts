// The reading shelf's storage (server/books.ts): telling formats apart by their bytes, keeping a book once however
// often it is added, and changing only what may be changed. Runs in a temporary data folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'pw-books-'));
process.env.PW_DATA_DIR = dir;
const books = await import('../server/books.ts');

const zipWith = (first: string) => {
  // a local file header (PK\x03\x04 + 26 bytes) followed by the first entry's name and data
  const head = Buffer.alloc(30);
  head.write('PK\x03\x04', 0, 'latin1');
  return Buffer.concat([head, Buffer.from(first, 'latin1'), Buffer.alloc(64)]);
};

test('sniffFormat tells book files apart by their bytes', () => {
  assert.equal(books.sniffFormat(zipWith('mimetypeapplication/epub+zip'), 'x.zip'), 'epub');
  assert.equal(books.sniffFormat(zipWith('page001.jpg'), 'comic.cbz'), 'cbz');
  assert.equal(books.sniffFormat(Buffer.from('%PDF-1.7\n...'), 'mag'), 'pdf');
  const mobi = Buffer.alloc(100); mobi.write('BOOKMOBI', 60, 'latin1');
  assert.equal(books.sniffFormat(mobi, 'a.mobi'), 'mobi');
  assert.equal(books.sniffFormat(mobi, 'a.azw3'), 'azw3');
  assert.equal(books.sniffFormat(Buffer.from('<?xml version="1.0"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">'), 'b'), 'fb2');
  assert.equal(books.sniffFormat(Buffer.from('<!DOCTYPE html><html><body>hi'), 'page.html'), 'html');
  assert.equal(books.sniffFormat(Buffer.from('第一章 开始\n春天来了。', 'utf8'), 'novel.txt'), 'txt');
  assert.equal(books.sniffFormat(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), 'gbk.txt'), 'txt');              // "中文" in GBK
  assert.equal(books.sniffFormat(Buffer.from([0xff, 0xfe, 0x2d, 0x4e, 0x00, 0x00]), 'utf16.txt'), 'txt'); // UTF-16LE BOM
  assert.equal(books.sniffFormat(Buffer.from([0, 1, 2, 3, 0, 0, 7]), 'blob.bin'), null);
});

test('a book is kept once, patched only where allowed, and removed', async () => {
  const buf = Buffer.from('第一章 开始\n\n　　春天来了。\n', 'utf8');
  const a = await books.addBook(buf, { fileName: '春天_的书.txt' });
  assert.equal(a.format, 'txt');
  assert.equal(a.kind, 'flow');
  assert.equal(a.title, '春天 的书');
  const again = await books.addBook(buf, { fileName: 'other-name.txt' });
  assert.equal(again.id, a.id);
  assert.equal(again.title, a.title, 'the first name stays');
  assert.equal((await books.listBooks()).length, 1);
  const p = await books.patchBook(a.id, { title: '春天', progress: { chapter: 0, offset: 3, percent: 0.4, at: 1 }, format: 'pdf' as any, id: 'evil' as any });
  assert.equal(p!.title, '春天');
  assert.equal(p!.progress!.percent, 0.4);
  assert.equal(p!.format, 'txt', 'the format is not something a patch changes');
  assert.equal(p!.id, a.id);
  await assert.rejects(() => books.writeCover(a.id, Buffer.from('not a jpeg')));
  const c = await books.writeCover(a.id, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]));
  assert.ok(c!.cover);
  await books.deleteBook(a.id);
  assert.equal((await books.listBooks()).length, 0);
  await assert.rejects(() => books.addBook(Buffer.from([0, 1, 2, 0]), { fileName: 'x.bin' }));
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
