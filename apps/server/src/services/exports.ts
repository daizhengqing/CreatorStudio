import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import type { ExportRequest, ExportTask } from '@creator-studio/plugin-sdk';
import { DIRS, FFMPEG } from '../config.js';
import { db } from '../db/index.js';
import { assets, exportTasks } from '../db/schema.js';
import { resolveMediaPath } from './media.js';
import { publish } from './events.js';

export function listExports(): ExportTask[] {
  return db.select().from(exportTasks).orderBy(desc(exportTasks.createdAt)).all().map(row => ({
    ...row, status: row.status as ExportTask['status'],
  }));
}

const activeQueue: Array<{ id: string; request: ExportRequest }> = [];
let busy = false;

export function enqueueExport(request: ExportRequest): ExportTask {
  const asset = db.select().from(assets).where(eq(assets.id, request.assetId)).get();
  if (!asset || asset.type !== 'video') throw new Error('请先选择一个视频素材');
  if (request.start < 0 || request.end <= request.start || request.end - request.start > 3600) throw new Error('裁剪范围无效（最多 1 小时）');
  if (asset.duration !== null && request.end > asset.duration + 1) throw new Error('结束时间超出素材时长');
  if (request.bgmAssetId) {
    const bgm = db.select().from(assets).where(eq(assets.id, request.bgmAssetId)).get();
    if (!bgm || bgm.type !== 'audio') throw new Error('背景音乐素材无效');
  }
  const id = randomUUID();
  const task = { id, assetId: request.assetId, status: 'queued' as const, progress: 0, outputFile: null, error: null, createdAt: Date.now() };
  db.insert(exportTasks).values(task).run();
  activeQueue.push({ id, request });
  publish('exports');
  void processQueue();
  return task;
}

async function processQueue(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    while (activeQueue.length) {
      const next = activeQueue.shift();
      if (next) await render(next.id, next.request);
    }
  } finally { busy = false; }
}

const aspectSizes: Record<Exclude<ExportRequest['aspect'], 'original'>, [number, number]> = {
  '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080],
};

async function render(id: string, req: ExportRequest): Promise<void> {
  db.update(exportTasks).set({ status: 'running' }).where(eq(exportTasks.id, id)).run();
  publish('exports');
  const output = join(DIRS.exports, `${id}.mp4`);
  try {
    const asset = db.select().from(assets).where(eq(assets.id, req.assetId)).get();
    if (!asset) throw new Error('视频文件不存在');
    const input = resolveMediaPath(asset);
    const duration = req.end - req.start;
    const args: string[] = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', `${req.start}`, '-t', `${duration}`, '-i', input];
    const bgm = req.bgmAssetId ? db.select().from(assets).where(eq(assets.id, req.bgmAssetId)).get() : undefined;
    if (bgm) args.push('-stream_loop', '-1', '-i', resolveMediaPath(bgm));
    args.push('-map', '0:v:0');
    if (req.aspect !== 'original') {
      const [width, height] = aspectSizes[req.aspect];
      args.push('-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`);
    }
    if (bgm) {
      const volume = Math.max(0, Math.min(2, req.bgmVolume ?? 0.5));
      if (!req.mute && asset.hasAudio) {
        args.push('-filter_complex', `[0:a:0]volume=1[a];[1:a:0]volume=${volume}[b];[a][b]amix=inputs=2:duration=first:dropout_transition=0[m]`, '-map', '[m]');
      } else args.push('-map', '1:a:0', '-af', `volume=${volume}`);
    } else if (!req.mute && asset.hasAudio) args.push('-map', '0:a:0');
    else args.push('-an');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', `${duration}`, '-progress', 'pipe:1', '-nostats', output);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(FFMPEG, args, { windowsHide: true, shell: false });
      let buffer = '';
      let last = -1;
      let errText = '';
      child.stdout.on('data', (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('out_time=')) continue;
          const time = line.slice('out_time='.length).split(':');
          if (time.length !== 3) continue;
          const seconds = Number(time[0]) * 3600 + Number(time[1]) * 60 + Number(time[2]);
          const progress = Math.min(99, Math.round(seconds / duration * 100));
          if (Number.isFinite(progress) && progress !== last) {
            last = progress;
            db.update(exportTasks).set({ progress }).where(eq(exportTasks.id, id)).run();
            publish('exports');
          }
        }
      });
      child.stderr.on('data', (data: Buffer) => { errText = (errText + data.toString()).slice(-4000); });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg (${code}): ${errText.slice(-1200)}`)));
    });
    db.update(exportTasks).set({ status: 'completed', progress: 100, outputFile: output }).where(eq(exportTasks.id, id)).run();
  } catch (err) {
    if (existsSync(output)) unlinkSync(output);
    db.update(exportTasks).set({ status: 'failed', error: err instanceof Error ? err.message.slice(0, 1200) : '导出失败' }).where(eq(exportTasks.id, id)).run();
  }
  publish('exports');
}
