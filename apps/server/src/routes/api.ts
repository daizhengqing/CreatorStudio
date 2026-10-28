import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync, unlinkSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ExportRequest } from '@creator-studio/plugin-sdk';
import { DIRS } from '../config.js';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { cancelDownload, createDownload, deleteDownload, listDownloads, previewDownload } from '../services/downloads.js';
import { enqueueExport, listExports } from '../services/exports.js';
import { addClient, removeClient } from '../services/events.js';
import { folderFor, formatForFile, registerLocalFile, resolveMediaPath, toAsset } from '../services/media.js';

function badRequest(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: message });
}

function streamFile(reply: FastifyReply, path: string, mime: string, rangeHeader: string | undefined) {
  const stat = statSync(path);
  reply.header('Content-Type', mime).header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, max-age=3600');
  if (!rangeHeader) {
    reply.header('Content-Length', stat.size);
    return reply.send(createReadStream(path));
  }
  const matched = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!matched) return reply.code(416).header('Content-Range', `bytes */${stat.size}`).send();
  let start = matched[1] ? Number(matched[1]) : 0;
  let end = matched[2] ? Number(matched[2]) : stat.size - 1;
  if (!matched[1] && matched[2]) {
    const suffix = Number(matched[2]);
    start = Math.max(0, stat.size - suffix);
    end = stat.size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size || end < 0) {
    return reply.code(416).header('Content-Range', `bytes */${stat.size}`).send();
  }
  end = Math.min(stat.size - 1, end);
  return reply.code(206).header('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    .header('Content-Length', end - start + 1).send(createReadStream(path, { start, end }));
}

export async function installApi(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }));

  app.get('/api/assets', async () => db.select().from(assets).orderBy(desc(assets.createdAt)).all().map(toAsset));

  app.post('/api/assets/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) return badRequest(reply, '请选择素材文件');
    const format = formatForFile(file.filename);
    if (!format) {
      file.file.resume();
      return badRequest(reply, '不支持该格式；支持 MP4/MOV/WebM/MKV、MP3/WAV/M4A/FLAC、JPG/PNG/WebP');
    }
    const id = randomUUID();
    const extension = file.filename.slice(file.filename.lastIndexOf('.')).toLowerCase();
    const filepath = join(folderFor(format.type), `${id}${extension}`);
    try {
      await pipeline(file.file, createWriteStream(filepath, { flags: 'wx' }));
      if (file.file.truncated) throw new Error('文件超过 4 GB 限制');
      await registerLocalFile({ id, filename: basename(file.filename), path: filepath, source: 'local' });
      return reply.code(201).send({ id });
    } catch (err) {
      if (existsSync(filepath)) unlinkSync(filepath);
      return badRequest(reply, err instanceof Error ? err.message : '导入失败');
    }
  });

  app.get('/api/assets/:id/stream', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!row) return reply.code(404).send({ error: '素材不存在' });
    const path = resolveMediaPath(row);
    if (!existsSync(path)) return reply.code(404).send({ error: '文件不存在' });
    return streamFile(reply, path, row.mime, request.headers.range);
  });

  app.get('/api/assets/:id/thumbnail', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(404).send();
    const asset = db.select().from(assets).where(eq(assets.id, id)).get();
    if (!asset || asset.type !== 'video') return reply.code(404).send();
    const thumbnail = join(DIRS.thumbs, `${id}.jpg`);
    if (!existsSync(thumbnail)) return reply.code(404).send();
    return reply.header('Content-Type', 'image/jpeg').send(createReadStream(thumbnail));
  });

  app.get('/api/downloads', async () => listDownloads());
  app.post('/api/downloads/preview', async (request, reply) => {
    const body = request.body as { url?: unknown } | null;
    if (typeof body?.url !== 'string') return badRequest(reply, '请输入链接');
    try { return await previewDownload(body.url.trim()); }
    catch (err) { return badRequest(reply, err instanceof Error ? err.message : '无法解析视频'); }
  });
  app.post('/api/downloads', async (request, reply) => {
    const body = request.body as { url?: unknown; previewId?: unknown; resolution?: unknown } | null;
    try {
      if (typeof body?.previewId === 'string') {
        const resolution = body.resolution ?? null;
        if (resolution !== null && (typeof resolution !== 'number' || !Number.isInteger(resolution))) return badRequest(reply, '分辨率无效');
        return reply.code(201).send(createDownload(body.previewId, resolution));
      }
      if (typeof body?.url === 'string') {
        const preview = await previewDownload(body.url.trim());
        return reply.code(201).send(createDownload(preview.id, null));
      }
      return badRequest(reply, '请输入链接或先解析视频');
    }
    catch (err) { return badRequest(reply, err instanceof Error ? err.message : '无法创建下载任务'); }
  });
  app.post('/api/downloads/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    try { return cancelDownload(id); }
    catch (err) { return badRequest(reply, err instanceof Error ? err.message : '无法停止下载'); }
  });
  app.delete('/api/downloads/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try { deleteDownload(id); return { deleted: true }; }
    catch (err) { return badRequest(reply, err instanceof Error ? err.message : '无法删除下载任务'); }
  });

  app.get('/api/exports', async () => listExports());
  app.post('/api/exports', async (request, reply) => {
    const body = request.body as Partial<ExportRequest> | null;
    const aspects = ['original', '16:9', '9:16', '1:1'];
    if (!body || typeof body.assetId !== 'string' || typeof body.start !== 'number'
      || typeof body.end !== 'number' || !Number.isFinite(body.start) || !Number.isFinite(body.end)
      || !aspects.includes(body.aspect ?? '') || typeof body.mute !== 'boolean'
      || (body.bgmAssetId !== undefined && typeof body.bgmAssetId !== 'string')
      || (body.bgmVolume !== undefined && (typeof body.bgmVolume !== 'number' || !Number.isFinite(body.bgmVolume)))) {
      return badRequest(reply, '导出参数无效');
    }
    try { return reply.code(201).send(enqueueExport(body as ExportRequest)); }
    catch (err) { return badRequest(reply, err instanceof Error ? err.message : '导出任务创建失败'); }
  });

  app.get('/api/exports/:id/file', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = listExports().find(item => item.id === id);
    if (!row || row.status !== 'completed' || !row.outputFile || !existsSync(row.outputFile)) return reply.code(404).send();
    return streamFile(reply, row.outputFile, 'video/mp4', request.headers.range);
  });

  app.get('/api/events', (request, reply) => {
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.write(': connected\n\n');
    addClient(response);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15_000);
    request.raw.on('close', () => { clearInterval(heartbeat); removeClient(response); });
  });
}
