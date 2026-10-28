// Paper Watcher local server: serves the desk app, stores papers and notes, fetches papers from links,
// and bridges questions to local AI agents (Claude Code / Codex CLI) or an OpenAI-compatible API.
import { existsSync, realpathSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { aiStatus, handleAsk } from './ai/index.ts';
import { IMMUTABLE, sendFile } from './files.ts';
import { ndjson, readBody, readJson, Router, sendError, sendJson, sendJsonBody } from './http.ts';
import { fetchPaper } from './resolve.ts';
import { addBook, bookFile, coverPath, deleteBook, ensureBooksDir, fetchBook, fetchCatalog, getBook, listBooksJson, patchBook, writeCover } from './books.ts';
import {
  addPaper, deletePaper, ensureDirs, getMeta, listPapersJson, loadSettings, paperDir, patchMeta, publicSettings,
  DATA_DIR, readNotes, ROOT, saveSettings, thumbPath, writeNotes, writePaperText, writeThumb,
} from './store.ts';

const PROD = process.argv.includes('--prod');
const PORT = Number(process.env.PORT || 5199);
const HOST = process.env.HOST || '127.0.0.1';

/** A thumbnail or cover never changes under the URL the desk builds for it (?v= is when it was saved); asked for
 *  without one, the browser checks it each time (a 304 while it is the same). */
const versioned = (q: URLSearchParams) => (q.has('v') ? IMMUTABLE : 'no-cache');

const api = new Router();

api.get('/api/health', (_q, res) => sendJson(res, { ok: true }));

api.get('/api/settings', async (_q, res) => sendJson(res, publicSettings(await loadSettings())));
api.put('/api/settings', async (req, res) => {
  const patch = await readJson(req);
  // The browser only ever sees a masked key; never write the mask back.
  if (patch?.openai && typeof patch.openai.apiKey === 'string' && patch.openai.apiKey.includes('…')) delete patch.openai.apiKey;
  sendJson(res, publicSettings(await saveSettings(patch)));
});

api.get('/api/ai/status', async (req, res) => sendJson(res, await aiStatus(req.query.get('force') === '1')));
api.post('/api/ai/ask', (req, res) => handleAsk(req, res));

api.get('/api/papers', async (_q, res) => sendJsonBody(res, await listPapersJson()));

api.post('/api/papers/upload', async (req, res) => {
  const buf = await readBody(req);
  const fileName = decodeURIComponent(String(req.headers['x-filename'] || 'paper.pdf'));
  const meta = await addPaper(buf, { fileName });
  sendJson(res, meta);
});

api.post('/api/papers/fetch', async (req, res) => {
  const { url } = await readJson<{ url: string }>(req);
  const stream = ndjson(res);
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  try {
    const { buf, meta } = await fetchPaper(
      url,
      (text) => stream.send({ type: 'status', text }),
      (loaded, total) => stream.send({ type: 'progress', loaded, total }),
      ctl.signal,
    );
    const saved = await addPaper(buf, meta);
    stream.send({ type: 'done', meta: saved });
  } catch (e) {
    stream.send({ type: 'error', message: (e as Error).message || String(e) });
  }
  stream.end();
});

api.get('/api/papers/:id', async (req, res) => {
  const m = await getMeta(req.params.id);
  if (!m) return sendError(res, 404, 'No such paper');
  sendJson(res, m);
});

api.patch('/api/papers/:id', async (req, res) => {
  const patch = await readJson(req);
  delete patch.id;
  const m = await patchMeta(req.params.id, patch);
  if (!m) return sendError(res, 404, 'No such paper');
  sendJson(res, m);
});

api.del('/api/papers/:id', async (req, res) => {
  await deletePaper(req.params.id);
  sendJson(res, { ok: true });
});

api.get('/api/papers/:id/pdf', async (req, res) => {
  const ok = await sendFile(req, res, path.join(paperDir(req.params.id), 'paper.pdf'), IMMUTABLE);
  if (!ok) sendError(res, 404, 'No such paper');
});

api.put('/api/papers/:id/text', async (req, res) => {
  await writePaperText(req.params.id, await readBody(req, 50 * 1024 * 1024));
  sendJson(res, { ok: true });
});

api.put('/api/papers/:id/thumb', async (req, res) => {
  const m = await writeThumb(req.params.id, await readBody(req, 4 * 1024 * 1024));
  if (!m) return sendError(res, 404, 'No such paper');
  sendJson(res, m);
});

api.get('/api/papers/:id/thumb', async (req, res) => {
  const ok = await sendFile(req, res, thumbPath(req.params.id), versioned(req.query));
  if (!ok) sendError(res, 404, 'No thumbnail');
});

api.get('/api/papers/:id/notes', async (req, res) => sendJson(res, await readNotes(req.params.id)));
api.put('/api/papers/:id/notes', async (req, res) => {
  await writeNotes(req.params.id, await readJson(req));
  sendJson(res, { ok: true });
});

/* ---------- the reading shelf (novels, comics, magazines) ---------- */
api.get('/api/books', async (_q, res) => sendJsonBody(res, await listBooksJson()));
api.post('/api/books/upload', async (req, res) => {
  const buf = await readBody(req, 400 * 1024 * 1024);
  const fileName = decodeURIComponent(String(req.headers['x-filename'] || 'book'));
  const format = String(req.headers['x-format'] || '') || undefined;
  sendJson(res, await addBook(buf, { fileName, format }));
});
api.post('/api/books/fetch', async (req, res) => {
  const { url } = await readJson<{ url: string }>(req);
  const stream = ndjson(res);
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });
  try {
    const got = await fetchBook(url, (text) => stream.send({ type: 'status', text }), (loaded, total) => stream.send({ type: 'progress', loaded, total }), ctl.signal);
    stream.send({ type: 'done', meta: await addBook(got.buf, got) });
  } catch (e) {
    stream.send({ type: 'error', message: (e as Error).message || String(e) });
  }
  stream.end();
});
// a book catalog for the import card (OPDS feeds, Gutendex): only for this app's own page (the header makes any
// other site's request need a preflight, which this server never grants)
api.get('/api/catalog', async (req, res) => {
  if (req.headers['x-pw'] !== '1') return sendError(res, 403, 'Forbidden');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20_000);
  try { sendJson(res, await fetchCatalog(String(req.query.get('url') || ''), ctl.signal)); }
  catch (e) { sendError(res, 502, (e as Error).name === 'AbortError' ? '书库太久没有回应' : (e as Error).message); }
  finally { clearTimeout(t); }
});
api.get('/api/books/:id', async (req, res) => {
  const m = await getBook(req.params.id);
  if (!m) return sendError(res, 404, 'No such book');
  sendJson(res, m);
});
api.patch('/api/books/:id', async (req, res) => {
  const m = await patchBook(req.params.id, await readJson(req));
  if (!m) return sendError(res, 404, 'No such book');
  sendJson(res, m);
});
api.del('/api/books/:id', async (req, res) => { await deleteBook(req.params.id); sendJson(res, { ok: true }); });
api.get('/api/books/:id/file', async (req, res) => {
  const f = await bookFile(req.params.id);
  if (!f || !(await sendFile(req, res, f.file, IMMUTABLE))) sendError(res, 404, 'No such book');
});
api.put('/api/books/:id/cover', async (req, res) => {
  const m = await writeCover(req.params.id, await readBody(req, 6 * 1024 * 1024));
  if (!m) return sendError(res, 404, 'No such book');
  sendJson(res, m);
});
api.get('/api/books/:id/cover', async (req, res) => {
  if (!(await sendFile(req, res, coverPath(req.params.id), versioned(req.query)))) sendError(res, 404, 'No cover');
});

// pdf.js needs its CMaps (CJK fonts), standard fonts and decoders served as plain files.
const PDFJS_DIR = path.join(ROOT, 'node_modules', 'pdfjs-dist');
async function servePdfjs(urlPath: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const rel = path.normalize(urlPath.replace(/^\/pdfjs\//, '')).replace(/^(\.\.[/\\])+/, '');
  if (!/^(cmaps|standard_fonts|wasm|iccs)[/\\]/.test(rel)) return false;
  return sendFile(req, res, path.join(PDFJS_DIR, rel), 'public, max-age=86400');
}

/* This server can read local files through an AI agent, so only the app itself may talk to it:
   the Host must be loopback (stops DNS rebinding) unless the user opened it up with HOST, and any
   state-changing request must come from our own origin (stops other websites posting to it). */
const LOOPBACK = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
function trusted(req: http.IncomingMessage): boolean {
  const host = String(req.headers.host || '');
  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (LOOPBACK && !['127.0.0.1', 'localhost', '::1'].includes(hostname)) return false;
  const method = req.method || 'GET';
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = req.headers.origin;
  if (!origin) return true;                       // curl, server-to-server: not a browser page
  return origin === `http://${host}`;
}

async function main() {
  await ensureDirs();
  await ensureBooksDir();
  let vite: any = null;
  if (!PROD) {
    const { createServer } = await import('vite');
    // The data folder is not source: Vite's watcher would wake on every save of a note, a view, a thumbnail (and
    // keep track of the whole library). It reports real paths, so the folder's real path is ignored too.
    const dataDirs = [DATA_DIR];
    try { dataDirs.push(realpathSync(DATA_DIR)); } catch { /* not there yet: the path as given */ }
    const inData = (p: string) => dataDirs.some((d) => p === d || p.startsWith(d + path.sep));
    vite = await createServer({ root: ROOT, server: { middlewareMode: true, hmr: { port: PORT + 1 }, watch: { ignored: [inData] } }, appType: "spa", logLevel: "warn" });
  }
  const DIST = path.join(ROOT, 'dist');
  if (PROD && !existsSync(path.join(DIST, 'index.html'))) {
    console.error('No build found. Run `npm run build` first (or `npm start`).');
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://local');
      if (!trusted(req)) {
        sendError(res, 403, 'Forbidden');
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        if (!(await api.handle(req, res))) sendError(res, 404, 'Unknown endpoint');
        return;
      }
      if (url.pathname.startsWith('/pdfjs/')) {
        if (!(await servePdfjs(url.pathname, req, res))) sendError(res, 404, 'Not found');
        return;
      }
      if (vite) {
        vite.middlewares(req, res, () => sendError(res, 404, 'Not found'));
        return;
      }
      const file = path.join(DIST, path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
      if (file.startsWith(DIST) && url.pathname !== '/' && (await sendFile(req, res, file, url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'))) return;
      await sendFile(req, res, path.join(DIST, 'index.html'));
    } catch (e) {
      console.error(e);
      if (!res.headersSent) sendError(res, 500, 'Server error');
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
    console.log(`\n  ✎  Paper Watcher is on the desk at ${url}\n     (${PROD ? 'production' : 'dev'} mode, papers & notes in ${path.relative(process.cwd(), DATA_DIR) || DATA_DIR})\n`);
    if (process.argv.includes('--open')) import('node:child_process').then(({ spawn }) => spawn(process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref());
  });
}

main();
