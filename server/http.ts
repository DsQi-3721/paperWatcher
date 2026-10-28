// Tiny HTTP helpers: a regex router, request bodies, JSON responses and NDJSON streams.
import type { IncomingMessage, ServerResponse } from 'node:http';

export type Req = IncomingMessage & { params: Record<string, string>; query: URLSearchParams };
export type Handler = (req: Req, res: ServerResponse) => Promise<void> | void;

interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler });
  }
  get(p: string, h: Handler) { this.add('GET', p, h); }
  post(p: string, h: Handler) { this.add('POST', p, h); }
  put(p: string, h: Handler) { this.add('PUT', p, h); }
  patch(p: string, h: Handler) { this.add('PATCH', p, h); }
  del(p: string, h: Handler) { this.add('DELETE', p, h); }

  /** Returns true when a route handled the request. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', 'http://local');
    for (const r of this.routes) {
      if (r.method !== req.method) continue;
      const m = r.re.exec(url.pathname);
      if (!m) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const rq = req as Req;
      rq.params = params;
      rq.query = url.searchParams;
      try {
        await r.handler(rq, res);
      } catch (err) {
        console.error('[api]', req.method, url.pathname, err);
        if (!res.headersSent) sendError(res, 500, (err as Error).message || 'Internal error');
        else res.end();
      }
      return true;
    }
    return false;
  }
}

/** Collects a body's bytes: straight into one buffer of the announced size when the size is known (so a 300 MB upload
 *  is not held twice, as chunks and then as their concatenation), else in chunks. */
export class ByteSink {
  length = 0;
  private buf: Buffer | null;
  private chunks: Buffer[] = [];
  constructor(expected = 0) {
    this.buf = Number.isSafeInteger(expected) && expected > 0 ? Buffer.allocUnsafe(expected) : null;
  }
  push(c: Uint8Array) {
    if (this.buf && this.length + c.length <= this.buf.length) {
      this.buf.set(c, this.length);
    } else {
      // more than announced (e.g. a compressed download): carry on in chunks
      if (this.buf) { this.chunks.push(this.buf.subarray(0, this.length)); this.buf = null; }
      this.chunks.push(Buffer.from(c.buffer, c.byteOffset, c.byteLength));
    }
    this.length += c.length;
  }
  done(): Buffer {
    if (this.buf) return this.length === this.buf.length ? this.buf : this.buf.subarray(0, this.length);
    return Buffer.concat(this.chunks, this.length);
  }
}

export function readBody(req: IncomingMessage, limit = 200 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > limit) { reject(new Error('Body too large')); req.destroy(); return; }
    const sink = new ByteSink(declared);
    let settled = false;
    const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } };
    req.on('data', (c: Buffer) => {
      if (settled) return;
      if (sink.length + c.length > limit) { fail(new Error('Body too large')); req.destroy(); return; }
      sink.push(c);
    });
    req.on('end', () => { if (!settled) { settled = true; resolve(sink.done()); } });
    req.on('error', fail);
    // the client went away mid-upload: let go of what came so far now (after 'end' this does nothing)
    req.on('close', () => fail(new Error('Request aborted')));
  });
}

export async function readJson<T = any>(req: IncomingMessage, limit = 40 * 1024 * 1024): Promise<T> {
  const buf = await readBody(req, limit);
  if (!buf.length) return {} as T;
  return JSON.parse(buf.toString('utf8')) as T;
}

export function sendJson(res: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

/** JSON that is already serialized (a list kept ready), with sendJson's headers. */
export function sendJsonBody(res: ServerResponse, body: Buffer, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length });
  res.end(body);
}

export function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, { error: message }, status);
}

/** Starts a newline-delimited JSON stream. `send` is a no-op once the client is gone. */
export function ndjson(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  let closed = false;
  res.on('close', () => (closed = true));
  return {
    send(obj: unknown) {
      if (closed) return;
      res.write(JSON.stringify(obj) + '\n');
    },
    end() {
      if (!closed) res.end();
      closed = true;
    },
    get closed() { return closed; },
  };
}
