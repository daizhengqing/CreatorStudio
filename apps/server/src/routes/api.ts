import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { DIRS } from '../config.js';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { getDownload } from '../services/downloads.js';
import { getExport, getExportPath } from '../services/exports.js';
import { folderFor, formatForFile, getAsset, listAssets, registerLocalFile, resolveMediaPath } from '../services/media.js';

function streamFile(reply: FastifyReply, path: string, mime: string, rangeHeader?: string) {
  const { size } = statSync(path);
  reply.header('Content-Type', mime).header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, max-age=3600');
  if (!rangeHeader) return reply.header('Content-Length', size).send(createReadStream(path));

  // 浏览器通过 Range 请求从任意位置预览媒体。
  const range = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  const invalid = () => reply.code(416).header('Content-Range', `bytes */${size}`).send();
  if (!range || (!range[1] && !range[2])) return invalid();
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return invalid();
  return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`)
    .header('Content-Length', end - start + 1).send(createReadStream(path, { start, end }));
}

export function installApi(app: FastifyInstance): void {
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/assets', async () => listAssets({}));

  app.get<{ Params: { id: string } }>('/api/assets/:id', async (request, reply) =>
    getAsset(request.params.id) ?? reply.code(404).send({ error: '素材不存在' }));

  app.post('/api/assets/upload', async (request, reply) => {
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ error: '请选择素材文件' });
    const format = formatForFile(upload.filename);
    if (!format) {
      upload.file.resume();
      return reply.code(400).send({ error: '请选择支持的视频、音频或图片文件' });
    }
    const id = randomUUID();
    const path = join(folderFor(format.type), `${id}${extname(upload.filename).toLowerCase()}`);
    try {
      await pipeline(upload.file, createWriteStream(path, { flags: 'wx' }));
      if (upload.file.truncated) throw new Error('文件超过 4 GB 限制');
      await registerLocalFile({ id, filename: basename(upload.filename), path, source: 'local' });
      return reply.code(201).send(getAsset(id));
    } catch (error) {
      if (existsSync(path)) await unlink(path);
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>('/api/assets/:id/stream', async (request, reply) => {
    const row = db.select().from(assets).where(eq(assets.id, request.params.id)).get();
    const path = row && resolveMediaPath(row);
    if (!row || !path || !existsSync(path)) return reply.code(404).send({ error: '素材文件不存在' });
    return streamFile(reply, path, row.mime, request.headers.range);
  });

  app.get<{ Params: { id: string } }>('/api/assets/:id/thumbnail', async (request, reply) => {
    const asset = getAsset(request.params.id);
    if (asset?.type !== 'video') return reply.code(404).send();
    const path = join(DIRS.thumbs, `${asset.id}.jpg`);
    if (!existsSync(path)) return reply.code(404).send();
    return reply.type('image/jpeg').send(createReadStream(path));
  });

  app.get<{ Params: { id: string } }>('/api/downloads/:id', async (request, reply) =>
    getDownload(request.params.id) ?? reply.code(404).send({ error: '下载任务不存在' }));

  app.get<{ Params: { id: string } }>('/api/exports/:id', async (request, reply) =>
    getExport(request.params.id) ?? reply.code(404).send({ error: '导出任务不存在' }));

  app.get<{ Params: { id: string } }>('/api/exports/:id/file', async (request, reply) => {
    const path = getExportPath(request.params.id);
    if (!path || !existsSync(path)) return reply.code(404).send({ error: '导出文件尚不可用' });
    return streamFile(reply, path, 'video/mp4', request.headers.range);
  });
}
