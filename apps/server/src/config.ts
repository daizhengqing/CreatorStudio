import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const DATA_ROOT = resolve(process.env.MEDIA_STUDIO_DATA_DIR ?? join(homedir(), 'MediaStudio'));
export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DIRS = {
  database: join(DATA_ROOT, 'database'),
  videos: join(DATA_ROOT, 'materials', 'videos'),
  audio: join(DATA_ROOT, 'materials', 'audio'),
  images: join(DATA_ROOT, 'materials', 'images'),
  thumbs: join(DATA_ROOT, 'thumbnails'),
  exports: join(DATA_ROOT, 'exports'),
  temp: join(DATA_ROOT, 'temp'),
  projects: join(DATA_ROOT, 'projects'),
  plugins: join(DATA_ROOT, 'plugins'),
  pluginData: join(DATA_ROOT, 'plugin-data'),
} as const;

export function ensureDataDirs(): void {
  for (const value of Object.values(DIRS)) mkdirSync(value, { recursive: true });
}

export const FFMPEG = process.env.FFMPEG_BIN ?? 'ffmpeg';
export const FFPROBE = process.env.FFPROBE_BIN ?? 'ffprobe';
// 初始化脚本把 Windows 版 yt-dlp 放在项目内，避免依赖启动终端的 PATH。
const localYtDlp = resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.tools', 'yt-dlp.exe');
export function ytDlpBin(): string {
  return process.env.YT_DLP_BIN ?? (process.platform === 'win32' && existsSync(localYtDlp) ? localYtDlp : 'yt-dlp');
}
export const YT_DLP_COOKIES_BROWSER = process.env.YT_DLP_COOKIES_BROWSER;
