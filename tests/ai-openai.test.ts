import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { runOpenAI } from '../server/ai/openai.ts';
import { DEFAULT_SETTINGS } from '../server/store.ts';
import type { RunOptions, AiEvent } from '../server/ai/types.ts';

const options: RunOptions = {
  cwd: '.', system: 'Read the paper.', message: 'Explain this figure.',
  images: [{ file: 'figure.png', mime: 'image/png', base64: 'AA==' }],
  history: [{ role: 'user', text: 'Earlier question' }, { role: 'ai', text: 'Earlier answer' }],
  signal: new AbortController().signal,
};
const completed = { type: 'response.completed', response: { status: 'completed' } };
const sse = (events: unknown[]) => events.map((e) => `event: message\r\ndata: ${JSON.stringify(e)}\r\n\r\n`).join('');

async function fixture(wire: string, run: (baseUrl: string, received: any[]) => Promise<void>, status = 200) {
  const received: any[] = [];
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) });
    res.writeHead(status, { 'Content-Type': 'text/event-stream' });
    // Split inside Chinese UTF-8 characters as well as SSE field names and JSON.
    const bytes = Buffer.from(wire);
    for (let i = 0; i < bytes.length; i += 7) {
      if (res.destroyed) break;
      res.write(bytes.subarray(i, i + 7));
      await new Promise((r) => setImmediate(r));
    }
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try { await run(`http://127.0.0.1:${(server.address() as any).port}/v1`, received); }
  finally { server.closeAllConnections(); await new Promise<void>((r) => server.close(() => r())); }
}

test('Responses streams Chinese and sends model, instructions, history and image without response storage', async () => {
  const wire = sse([{ type: 'response.output_text.delta', delta: '你好，' }, { type: 'response.output_text.delta', delta: '论文。' }, completed]);
  await fixture(wire, async (baseUrl, received) => {
    const events: AiEvent[] = [];
    const result = await runOpenAI({ ...DEFAULT_SETTINGS.openai, protocol: 'responses', baseUrl, apiKey: 'test-key', model: 'gpt-6.1-sol' }, options, (e) => events.push(e));
    assert.equal(result.text, '你好，论文。');
    assert.equal(events.filter((e) => e.type === 'delta').map((e: any) => e.text).join(''), result.text);
    const req = received[0];
    assert.equal(req.url, '/v1/responses');
    assert.equal(req.auth, 'Bearer test-key');
    assert.equal(req.body.model, 'gpt-6.1-sol');
    assert.equal(req.body.instructions, options.system);
    assert.equal(req.body.store, false);
    assert.equal(req.body.stream, true);
    assert.deepEqual(req.body.input.slice(0, 2), [{ role: 'user', content: 'Earlier question' }, { role: 'assistant', content: 'Earlier answer' }]);
    assert.deepEqual(req.body.input[2].content, [{ type: 'input_text', text: options.message }, { type: 'input_image', image_url: 'data:image/png;base64,AA==' }]);
  });
});

test('Responses supports a final payload without deltas or trailing newline', async () => {
  const event = { type: 'response.completed', response: { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Final answer' }] }] } };
  await fixture(`data: ${JSON.stringify(event)}`, async (baseUrl) => {
    const result = await runOpenAI({ ...DEFAULT_SETTINGS.openai, protocol: 'responses', baseUrl }, options, () => {});
    assert.equal(result.text, 'Final answer');
  });
});

test('Responses never treats API errors or interrupted partial output as success', async () => {
  for (const event of [
    { type: 'error', message: 'Quota exhausted' },
    { type: 'response.failed', response: { error: { message: 'Quota exhausted' } } },
    { type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } },
  ]) {
    await fixture(sse([{ type: 'response.output_text.delta', delta: 'Partial' }, event]), async (baseUrl) => {
      await assert.rejects(runOpenAI({ ...DEFAULT_SETTINGS.openai, protocol: 'responses', baseUrl }, options, () => {}), /Quota exhausted|max_output_tokens/);
    });
  }
  await fixture(sse([{ type: 'response.output_text.delta', delta: 'Partial' }]), async (baseUrl) => {
    await assert.rejects(runOpenAI({ ...DEFAULT_SETTINGS.openai, protocol: 'responses', baseUrl }, options, () => {}), /before completion/);
  });
  await fixture('{"error":{"message":"Invalid key"}}', async (baseUrl) => {
    await assert.rejects(runOpenAI({ ...DEFAULT_SETTINGS.openai, protocol: 'responses', baseUrl }, options, () => {}), /API error 401: Invalid key/);
  }, 401);
});

test('Responses respects cancellation', async () => {
  await fixture(sse([completed]), async (baseUrl) => {
    await assert.rejects(runOpenAI({ ...DEFAULT_SETTINGS.openai, protocol: 'responses', baseUrl }, { ...options, signal: AbortSignal.abort() }, () => {}), { name: 'AbortError' });
  });
});

test('existing Chat Completions settings still use the original endpoint and image format', async () => {
  await fixture('data: {"choices":[{"delta":{"content":"Chat answer"}}]}\n\ndata: [DONE]\n\n', async (baseUrl, received) => {
    const result = await runOpenAI({ ...DEFAULT_SETTINGS.openai, baseUrl }, options, () => {});
    assert.equal(result.text, 'Chat answer');
    assert.equal(received[0].url, '/v1/chat/completions');
    assert.equal(received[0].body.messages.at(-1).content[1].type, 'image_url');
  });
});
