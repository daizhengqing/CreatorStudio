import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = resolve(process.env.CREATOR_STUDIO_DATA_DIR ?? join(homedir(), 'CreatorStudio'));
export const DIRS = {
  database: join(DATA_ROOT, 'database'),
  videos: join(DATA_ROOT, 'materials', 'videos'),
  audio: join(DATA_ROOT, 'materials', 'audio'),
  images: join(DATA_ROOT, 'materials', 'images'),
  thumbs: join(DATA_ROOT, 'thumbnails'),
  exports: join(DATA_ROOT, 'exports'),
  sessions: join(DATA_ROOT, 'agent', 'sessions'),
  agent: join(DATA_ROOT, 'agent'),
  trends: join(DATA_ROOT, 'collections', 'trends'),
  xMonitor: join(DATA_ROOT, 'collections', 'x-monitor'),
};

export function ensureDataDirs(): void {
  for (const directory of Object.values(DIRS)) mkdirSync(directory, { recursive: true });
}

export const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_BIN ?? 'ffprobe';
const localYtDlp = fileURLToPath(new URL('../../../.tools/yt-dlp.exe', import.meta.url));
export function ytDlpBin(): string {
  if (process.env.YT_DLP_BIN) return process.env.YT_DLP_BIN;
  return process.platform === 'win32' && existsSync(localYtDlp) ? localYtDlp : 'yt-dlp';
}

export const YT_DLP_COOKIES_BROWSER = process.env.YT_DLP_COOKIES_BROWSER;
