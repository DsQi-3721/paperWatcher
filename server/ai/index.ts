// POST /api/ai/ask: composes the question, routes it to the chosen agent and streams NDJSON events back.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ndjson, readJson } from '../http.ts';
import { getMeta, loadSettings, paperDir, readPaperText, saveAsset, type Settings } from '../store.ts';
import { runClaude } from './claude.ts';
import { runCodex } from './codex.ts';
import { runOpenAI } from './openai.ts';
import { capture } from './proc.ts';
import { firstTurnMessage, followUpMessage, systemPrompt, type AskBody } from './prompt.ts';
import type { AiEvent, Image, RunOptions, RunResult } from './types.ts';

const MAX_PARALLEL = 4;
let running = 0;

export function run(provider: Settings['provider'], settings: Settings, o: RunOptions, emit: (e: AiEvent) => void): Promise<RunResult> {
  if (provider === 'codex') return runCodex(settings.codex, o, emit);
  if (provider === 'openai') return runOpenAI(settings.openai, o, emit);
  return runClaude(settings.claude, o, emit);
}

export async function handleAsk(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson<AskBody>(req);
  const stream = ndjson(res);
  const ctl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctl.abort(); });

  if (running >= MAX_PARALLEL) {
    stream.send({ type: 'error', message: 'Too many questions at once - wait for one to finish.' });
    stream.end();
    return;
  }
  running++;
  try {
    if (!body?.paperId || !body.question?.trim()) throw new Error('Missing paper or question');
    const settings = await loadSettings();
    const provider = body.provider || settings.provider;
    const meta = await getMeta(body.paperId);
    const cwd = paperDir(body.paperId);
    const images: Image[] = [];
    for (const d of (body.images || []).slice(0, 4)) images.push(await saveAsset(body.paperId, d));

    let paperText: string | undefined;
    if (provider === 'openai' && settings.openai.fullText) {
      paperText = await readPaperText(body.paperId);
      if (paperText.length > 400_000) paperText = paperText.slice(0, 400_000) + '\n[… truncated]';
    }
    const system = systemPrompt({
      meta,
      settings,
      fileAccess: provider !== 'openai',
      paperText,
      outline: body.outline,
    });
    const stateless = provider === 'openai';
    const resume = !stateless && !!body.sessionId;
    const message = resume ? followUpMessage(body, images.length > 0) : firstTurnMessage(body, images.length > 0);
    const emit = (e: AiEvent) => stream.send(e);

    let result: RunResult;
    try {
      result = await run(provider, settings, {
        cwd, system, message, images,
        sessionId: resume ? body.sessionId : undefined,
        history: stateless ? body.history : undefined,
        signal: ctl.signal,
      }, emit);
    } catch (e: any) {
      // A lost CLI session (deleted history, other machine…): start a fresh one carrying the conversation so far.
      if (e?.code !== 'SESSION_LOST' || !resume) throw e;
      emit({ type: 'status', text: 'restarting conversation' });
      const recap = (body.history || []).map((h) => `${h.role === 'ai' ? 'You' : 'Me'}: ${h.text}`).join('\n\n');
      result = await run(provider, settings, {
        cwd, system, images, signal: ctl.signal,
        message: firstTurnMessage({ ...body, question: `${recap ? `(Our conversation so far)\n${recap}\n\n` : ''}${body.question}` }, images.length > 0),
      }, emit);
    }
    stream.send({ type: 'done', sessionId: result.sessionId, text: result.text, cost: result.cost });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    if (msg !== 'Cancelled') console.error('[ai]', msg);
    stream.send({ type: 'error', message: msg });
  } finally {
    running--;
    stream.end();
  }
}

/* ---------- provider detection ---------- */

let statusCache: { at: number; key: string; value: any } | null = null;

export async function aiStatus(force = false) {
  const s = await loadSettings();
  const key = JSON.stringify([s.claude.bin, s.codex.bin, s.openai.baseUrl, !!s.openai.apiKey]);
  if (!force && statusCache && statusCache.key === key && Date.now() - statusCache.at < 60_000) return statusCache.value;
  const [cv, xv, xl] = await Promise.all([
    capture(s.claude.bin || 'claude', ['--version']),
    capture(s.codex.bin || 'codex', ['--version']),
    capture(s.codex.bin || 'codex', ['login', 'status']),
  ]);
  const localApi = /localhost|127\.0\.0\.1|0\.0\.0\.0/.test(s.openai.baseUrl);
  const value = {
    claude: { installed: cv.ok, version: cv.ok ? cv.out.split('\n')[0] : undefined },
    codex: {
      installed: xv.ok,
      version: xv.ok ? xv.out.split('\n').pop() : undefined,
      login: xl.ok ? xl.out.split('\n').find((l) => /logged in/i.test(l)) || xl.out.split('\n')[0] : undefined,
    },
    openai: { configured: !!s.openai.apiKey || localApi, model: s.openai.model, baseUrl: s.openai.baseUrl },
  };
  statusCache = { at: Date.now(), key, value };
  return value;
}
