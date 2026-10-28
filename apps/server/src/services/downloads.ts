import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { desc, eq } from 'drizzle-orm';
import type { AssetSource, DownloadPreview, DownloadTask } from '@creator-studio/plugin-sdk';
import { DIRS, ytDlpBin, YT_DLP_COOKIES_BROWSER } from '../config.js';
import { db } from '../db/index.js';
import { downloadTasks } from '../db/schema.js';
import { formatForFile, registerLocalFile, folderFor } from './media.js';
import { publish } from './events.js';

const allowed: Array<{ host: string; source: AssetSource }> = [
  { host: 'youtube.com', source: 'youtube' }, { host: 'youtu.be', source: 'youtube' },
  { host: 'bilibili.com', source: 'bilibili' }, { host: 'b23.tv', source: 'bilibili' },
  { host: 'douyin.com', source: 'douyin' }, { host: 'iesdouyin.com', source: 'douyin' },
];
const execFileAsync = promisify(execFile);
const previews = new Map<string, { value: DownloadPreview; expiresAt: number }>();
const previewLifetime = 10 * 60_000;

type ActiveDownload = { id: string; controller: AbortController; child: ChildProcessWithoutNullStreams | null };
let active: ActiveDownload | null = null;
export function platformFromUrl(input: string): AssetSource | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return null;
    const match = allowed.find(({ host }) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return match?.source ?? null;
  } catch { return null; }
}

export function parseDownloadInput(input: string): { url: string; platform: AssetSource } | null {
  // 分享文案含有标题和提示文字；只把受支持的 HTTPS 链接交给 yt-dlp。
  const links = input.match(/https:\/\/[^\s<>"'，。！？；：、（）【】]+/giu) ?? [];
  for (const link of links) {
    const url = link.replace(/[.,;!?]+$/u, '');
    const platform = platformFromUrl(url);
    if (platform && url.length <= 2048) return { url, platform };
  }
  return null;
}

function ytDlpOptions(platform: AssetSource): string[] {
  return [
    '--ignore-config', '--no-playlist', '--no-warnings',
    ...(platform === 'douyin' && YT_DLP_COOKIES_BROWSER ? ['--cookies-from-browser', YT_DLP_COOKIES_BROWSER] : []),
  ];
}

export async function previewDownload(input: string): Promise<DownloadPreview> {
  const target = parseDownloadInput(input);
  if (!target) throw new Error('请粘贴 B站、抖音或 YouTube 的 HTTPS 链接或分享文案');
  let output: string;
  try {
    const result = await execFileAsync(ytDlpBin(), [
      ...ytDlpOptions(target.platform), '--dump-single-json', '--simulate', '--', target.url,
    ], { windowsHide: true, timeout: 60_000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf8' });
    output = result.stdout;
  } catch (error) {
    const failure = error as Error & { code?: string; stderr?: string };
    if (failure.code === 'ENOENT') throw new Error('未找到 yt-dlp，请运行 scripts/init.cmd 安装下载依赖');
    throw new Error(`解析失败：${(failure.stderr?.trim() || failure.message).slice(-900)}`);
  }

  let info: {
    _type?: string; title?: string; thumbnail?: string; duration?: number;
    formats?: Array<{ height?: number; vcodec?: string }>;
  };
  try { info = JSON.parse(output); }
  catch { throw new Error('解析结果不是有效的视频元数据，请更新 yt-dlp 后重试'); }
  if (info._type === 'playlist') throw new Error('请粘贴单个视频的链接');
  const resolutions = [...new Set((info.formats ?? [])
    .filter(format => format.vcodec && format.vcodec !== 'none' && Number.isInteger(format.height) && (format.height ?? 0) > 0)
    .map(format => format.height as number))].sort((a, b) => b - a);
  const thumbnailUrl = typeof info.thumbnail === 'string' && info.thumbnail.startsWith('https://')
    ? info.thumbnail.slice(0, 4096) : null;
  const preview: DownloadPreview = {
    id: randomUUID(), url: target.url, platform: target.platform,
    title: typeof info.title === 'string' && info.title.trim() ? info.title.trim().slice(0, 255) : target.url,
    thumbnailUrl,
    duration: typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0 ? Math.round(info.duration) : null,
    resolutions,
  };
  // 预览只在短时间内有效；提交任务时使用服务端保存的元数据。
  for (const [id, item] of previews) if (item.expiresAt <= Date.now()) previews.delete(id);
  if (previews.size >= 50) {
    const oldest = previews.keys().next().value;
    if (oldest) previews.delete(oldest);
  }
  previews.set(preview.id, { value: preview, expiresAt: Date.now() + previewLifetime });
  return preview;
}

function asDownloadTask(row: typeof downloadTasks.$inferSelect): DownloadTask {
  return {
    id: row.id, url: row.url, title: row.title, platform: row.platform as AssetSource,
    thumbnailUrl: row.thumbnailUrl, resolution: row.resolution,
    status: row.status as DownloadTask['status'], progress: row.progress,
    error: row.error, assetId: row.assetId, createdAt: row.createdAt,
  };
}
export function listDownloads(): DownloadTask[] {
  return db.select().from(downloadTasks).orderBy(desc(downloadTasks.createdAt)).all().map(asDownloadTask);
}

let running = false;
const waiting: string[] = [];

export function createDownload(previewId: string, resolution: number | null): DownloadTask {
  const cached = previews.get(previewId);
  if (!cached || cached.expiresAt <= Date.now()) throw new Error('预览已过期，请重新解析链接');
  const preview = cached.value;
  if (resolution !== null && !preview.resolutions.includes(resolution)) throw new Error('请选择预览中提供的分辨率');
  const id = randomUUID();
  const row = {
    id, url: preview.url, title: preview.title, platform: preview.platform,
    thumbnailUrl: preview.thumbnailUrl, resolution, status: 'queued', progress: 0,
    error: null, assetId: null, createdAt: Date.now(),
  };
  db.insert(downloadTasks).values(row).run();
  previews.delete(previewId);
  waiting.push(id);
  publish('downloads');
  void processQueue();
  return asDownloadTask(row);
}

function stopProcess(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    // yt-dlp 可能启动 ffmpeg；Windows 下需要终止整棵子进程树。
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
    killer.on('close', code => { if (code !== 0) child.kill(); });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill(); }
  }
}

export function cancelDownload(id: string): DownloadTask {
  const row = db.select().from(downloadTasks).where(eq(downloadTasks.id, id)).get();
  if (!row) throw new Error('下载任务不存在');
  if (row.status !== 'queued' && row.status !== 'running') throw new Error('该任务已结束，无法停止');
  if (row.status === 'queued') {
    const index = waiting.indexOf(id);
    if (index >= 0) waiting.splice(index, 1);
  } else if (active?.id === id) {
    active.controller.abort();
    if (active.child) stopProcess(active.child);
  }
  db.update(downloadTasks).set({ status: 'cancelled' }).where(eq(downloadTasks.id, id)).run();
  publish('downloads');
  return asDownloadTask({ ...row, status: 'cancelled' });
}

export function deleteDownload(id: string): void {
  const row = db.select().from(downloadTasks).where(eq(downloadTasks.id, id)).get();
  if (!row) throw new Error('下载任务不存在');
  if (row.status === 'queued' || row.status === 'running') throw new Error('请先停止下载，再删除任务记录');
  db.delete(downloadTasks).where(eq(downloadTasks.id, id)).run();
  publish('downloads');
}

async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (waiting.length) {
      const id = waiting.shift();
      if (id) await performDownload(id);
    }
  } finally { running = false; }
}

function executeDownload(task: DownloadTask, run: ActiveDownload, onProgress: (n: number) => void): Promise<void> {
  const fileTemplate = join(DIRS.videos, `${task.id}.%(ext)s`);
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpBin(), [
      ...ytDlpOptions(task.platform), '--newline',
      '--merge-output-format', 'mp4',
      '--progress-template', 'download:%(progress._percent_str)s',
      ...(task.resolution === null ? [] : ['--format', `bv[height=${task.resolution}]+ba/b[height=${task.resolution}]`]),
      '--output', fileTemplate, '--', task.url,
    ], { windowsHide: true, shell: false, detached: process.platform !== 'win32' });
    run.child = child;
    let log = '';
    const consume = (chunk: Buffer) => {
      const text = chunk.toString();
      log = (log + text).slice(-12_000);
      for (const match of text.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g)) {
        const n = Number(match[1]);
        if (Number.isFinite(n)) onProgress(Math.min(99, Math.round(n)));
      }
    };
    child.stdout.on('data', consume);
    child.stderr.on('data', consume);
    child.on('error', err => reject('code' in err && err.code === 'ENOENT'
      ? new Error('未找到 yt-dlp，请运行 scripts/init.cmd 安装下载依赖') : err));
    child.on('close', code => {
      run.child = null;
      if (run.controller.signal.aborted) return reject(new Error('下载已停止'));
      if (code === 0) return resolve();
      if (task.platform === 'douyin' && /Fresh cookies.*needed/i.test(log)) {
        return reject(new Error(YT_DLP_COOKIES_BROWSER
          ? '抖音仍要求新鲜 cookies；请在所选浏览器打开并刷新该视频后重试，若仍失败请更新 yt-dlp'
          : '抖音要求新鲜 cookies；设置 YT_DLP_COOKIES_BROWSER=edge（或 chrome/firefox）并重启服务后重试'));
      }
      reject(new Error(`yt-dlp 退出码 ${code}: ${log.slice(-900)}`));
    });
  });
}

function cleanupDownloadFiles(id: string): boolean {
  let cleaned = true;
  for (const entry of readdirSync(DIRS.videos, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(`${id}.`)) continue;
    try { unlinkSync(join(DIRS.videos, entry.name)); }
    catch { cleaned = false; }
  }
  return cleaned;
}

async function performDownload(id: string): Promise<void> {
  const row = db.select().from(downloadTasks).where(eq(downloadTasks.id, id)).get();
  if (!row || row.status !== 'queued') return;
  const task = asDownloadTask(row);
  const run: ActiveDownload = { id, controller: new AbortController(), child: null };
  active = run;
  db.update(downloadTasks).set({ status: 'running' }).where(eq(downloadTasks.id, id)).run();
  publish('downloads');
  let movedPath: string | null = null;
  let registered = false;
  try {
    let lastProgress = -1;
    await executeDownload(task, run, progress => {
      if (run.controller.signal.aborted || progress <= lastProgress) return;
      lastProgress = progress;
      db.update(downloadTasks).set({ progress }).where(eq(downloadTasks.id, id)).run();
      publish('downloads');
    });
    run.controller.signal.throwIfAborted();
    const file = readdirSync(DIRS.videos).find(name => name.startsWith(`${id}.`) && formatForFile(name) && !name.endsWith('.part'));
    if (!file) throw new Error('下载完成，但未找到支持格式的成品文件');
    const assetId = randomUUID();
    const src = join(DIRS.videos, file);
    const format = formatForFile(file);
    if (!format) throw new Error('不支持的媒体格式');
    const newPath = join(folderFor(format.type), `${assetId}${file.slice(file.lastIndexOf('.'))}`);
    if (src !== newPath) renameSync(src, newPath);
    movedPath = newPath;
    await registerLocalFile({
      id: assetId, filename: `${task.title}${file.slice(file.lastIndexOf('.'))}`,
      path: newPath, source: task.platform, sourceUrl: task.url, signal: run.controller.signal,
    });
    registered = true;
    db.update(downloadTasks).set({ status: 'completed', progress: 100, assetId }).where(eq(downloadTasks.id, id)).run();
  } catch (err) {
    let cleaned = cleanupDownloadFiles(id);
    if (movedPath && !registered && existsSync(movedPath)) {
      try { unlinkSync(movedPath); } catch { cleaned = false; }
    }
    const cleanupError = cleaned ? '' : '；部分临时文件未能清理';
    if (run.controller.signal.aborted) {
      if (!cleaned) db.update(downloadTasks).set({ error: `下载已停止${cleanupError}` }).where(eq(downloadTasks.id, id)).run();
    } else db.update(downloadTasks).set({ status: 'failed', error: `${err instanceof Error ? err.message.slice(0, 1100) : '下载失败'}${cleanupError}` }).where(eq(downloadTasks.id, id)).run();
  } finally {
    active = null;
    publish('downloads');
  }
}
