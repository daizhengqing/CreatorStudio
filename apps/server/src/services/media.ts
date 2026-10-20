import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { extname, join, basename } from 'node:path';
import type { Asset, AssetSource, AssetType } from '@creator-studio/shared';
import { DIRS, FFMPEG, FFPROBE } from '../config.js';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { publish } from './events.js';

const supported: Record<string, { type: AssetType; mime: string }> = {
  '.mp4': { type: 'video', mime: 'video/mp4' },
  '.mov': { type: 'video', mime: 'video/quicktime' },
  '.webm': { type: 'video', mime: 'video/webm' },
  '.mkv': { type: 'video', mime: 'video/x-matroska' },
  '.mp3': { type: 'audio', mime: 'audio/mpeg' },
  '.wav': { type: 'audio', mime: 'audio/wav' },
  '.m4a': { type: 'audio', mime: 'audio/mp4' },
  '.flac': { type: 'audio', mime: 'audio/flac' },
  '.jpg': { type: 'image', mime: 'image/jpeg' },
  '.jpeg': { type: 'image', mime: 'image/jpeg' },
  '.png': { type: 'image', mime: 'image/png' },
  '.webp': { type: 'image', mime: 'image/webp' },
};

export function formatForFile(filename: string) {
  return supported[extname(filename).toLowerCase()] ?? null;
}
export function folderFor(type: AssetType): string { return type === 'video' ? DIRS.videos : type === 'audio' ? DIRS.audio : DIRS.images; }
export function safeExtension(filename: string): string { return extname(filename).toLowerCase(); }
export function resolveMediaPath(row: { type: string; relativePath: string }): string {
  if (row.relativePath !== basename(row.relativePath)) throw new Error('Invalid stored file path');
  return join(folderFor(row.type as AssetType), row.relativePath);
}

function runAndCapture(program: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { if (output.length < 512_000) output += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`${program} exited: ${code}`)));
  });
}

async function probe(path: string): Promise<{ duration: number | null; width: number | null; height: number | null; hasAudio: boolean }> {
  try {
    const raw = await runAndCapture(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]);
    const obj = JSON.parse(raw) as {
      streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
      format?: { duration?: string };
    };
    const video = obj.streams?.find(s => s.codec_type === 'video');
    const duration = Number(obj.format?.duration);
    return { duration: Number.isFinite(duration) ? Math.round(duration) : null, width: video?.width ?? null, height: video?.height ?? null, hasAudio: !!obj.streams?.some(s => s.codec_type === 'audio') };
  } catch { return { duration: null, width: null, height: null, hasAudio: false }; }
}

export async function registerLocalFile(input: {
  id: string; filename: string; path: string; source: AssetSource; sourceUrl?: string; signal?: AbortSignal;
}): Promise<void> {
  const format = formatForFile(input.path);
  if (!format || !existsSync(input.path)) throw new Error('Unsupported media file');
  const info = format.type === 'image' ? { duration: null, width: null, height: null, hasAudio: false } : await probe(input.path);
  input.signal?.throwIfAborted();
  db.insert(assets).values({
    id: input.id, name: input.filename.slice(0, 255), type: format.type,
    source: input.source, sourceUrl: input.sourceUrl ?? null,
    relativePath: basename(input.path), mime: format.mime, size: statSync(input.path).size,
    ...info, createdAt: Date.now(),
  }).run();
  if (format.type === 'video') {
    const thumbnailPath = join(DIRS.thumbs, `${input.id}.jpg`);
    // Best effort; thumbnail generation must never block asset import.
    void runAndCapture(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '00:00:00.5', '-i', input.path, '-frames:v', '1', '-vf', 'scale=400:-2', thumbnailPath])
      .then(() => publish('assets')).catch(() => undefined);
  }
  publish('assets');
}

export function toAsset(row: typeof assets.$inferSelect): Asset {
  return {
    id: row.id, name: row.name, type: row.type as AssetType, source: row.source as AssetSource,
    sourceUrl: row.sourceUrl, mime: row.mime, size: row.size,
    duration: row.duration, width: row.width, height: row.height, hasAudio: row.hasAudio,
    createdAt: row.createdAt, streamUrl: `/api/assets/${row.id}/stream`,
    thumbnailUrl: row.type === 'image' ? `/api/assets/${row.id}/stream` : row.type === 'video' ? `/api/assets/${row.id}/thumbnail` : null,
  };
}
