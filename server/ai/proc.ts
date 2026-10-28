// Spawns a CLI agent, feeds stdin, and hands back stdout one line at a time.
import { spawn } from 'node:child_process';

export interface ProcResult { code: number | null; stderr: string; aborted: boolean }

export function runLines(
  bin: string,
  args: string[],
  opts: { cwd: string; stdin?: string; signal: AbortSignal; env?: NodeJS.ProcessEnv },
  onLine: (line: string) => void,
): Promise<ProcResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, {
        cwd: opts.cwd,
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      reject(e);
      return;
    }
    let stderr = '';
    let buf = '';
    let aborted = false;
    const kill = () => {
      aborted = true;
      child.kill('SIGTERM');
      setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 3000).unref();
    };
    if (opts.signal.aborted) kill();
    opts.signal.addEventListener('abort', kill, { once: true });

    child.on('error', (err: NodeJS.ErrnoException) => {
      opts.signal.removeEventListener('abort', kill);
      if (err.code === 'ENOENT') reject(new Error(`Cannot find "${bin}". Is it installed and on your PATH?`));
      else reject(err);
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onLine(line);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c: string) => {
      stderr = (stderr + c).slice(-6000);
    });
    child.on('close', (code) => {
      opts.signal.removeEventListener('abort', kill);
      if (buf.trim()) onLine(buf.trim());
      resolve({ code, stderr, aborted });
    });
    child.stdin.on('error', () => { /* the agent may exit before reading everything */ });
    if (opts.stdin !== undefined) child.stdin.end(opts.stdin);
    else child.stdin.end();
  });
}

/** Runs a short command and returns stdout (used for --version checks). */
export function capture(bin: string, args: string[], timeoutMs = 6000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      resolve({ ok: false, out: '' });
      return;
    }
    const finish = (ok: boolean) => { if (!done) { done = true; resolve({ ok, out: out.trim() }); } };
    const t = setTimeout(() => { child.kill('SIGKILL'); finish(false); }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (out += c));
    child.on('error', () => { clearTimeout(t); finish(false); });
    child.on('close', (code) => { clearTimeout(t); finish(code === 0); });
  });
}
