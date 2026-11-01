import { addTodo, checkDictation, dictationWords, patchTodo, readPlanner } from './deskapps.ts';
import { addAudioLink, importAudio, listMusic, musicFile, removeMusic } from './music.ts';
import { readBody, readJson, Router, sendError, sendJson } from './http.ts';
import { sendFile } from './files.ts';

export function deskRoutes(api: Router) {
  api.get('/api/planner', async (req, res) => sendJson(res, await readPlanner(req.query.get('date') || undefined)));
  api.post('/api/planner/:date', async (req, res) => { const b = await readJson(req, 5000); sendJson(res, await addTodo(req.params.date, b.text, b.id)); });
  api.patch('/api/planner/:date/:id', async (req, res) => sendJson(res, await patchTodo(req.params.date, req.params.id, await readJson(req, 5000))));
  api.get('/api/dictation', async (req, res) => sendJson(res, await dictationWords(Number(req.query.get('limit')) || 10)));
  api.post('/api/dictation/check', async (req, res) => { const b = await readJson(req, 5000); sendJson(res, await checkDictation(b.entryId, b.answer)); });
  api.get('/api/music', async (_req, res) => sendJson(res, await listMusic()));
  api.post('/api/music/upload', async (req, res) => sendJson(res, await importAudio(await readBody(req, 200 * 1024 * 1024), decodeURIComponent(String(req.headers['x-filename'] || 'audio')))));
  api.post('/api/music/link', async (req, res) => { const b = await readJson(req, 10_000); sendJson(res, await addAudioLink(b.url, b.title)); });
  api.patch('/api/music/:id', async (req, res) => { const b = await readJson(req, 2000); if (typeof b.deleted !== 'boolean') throw new Error('请指定移除或恢复'); sendJson(res, await removeMusic(req.params.id, b.deleted)); });
  const audio = async (req: any, res: any) => { const file = await musicFile(req.params.id); if (!file || !await sendFile(req, res, file, 'private, max-age=3600')) sendError(res, 404, '音频不存在'); };
  api.get('/api/music/:id/audio', audio);
  api.add('HEAD', '/api/music/:id/audio', audio);
}
