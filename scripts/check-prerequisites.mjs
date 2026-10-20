import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const localYtDlp = fileURLToPath(new URL('../.tools/yt-dlp.exe', import.meta.url));
const ytDlp = process.env.YT_DLP_BIN ?? (process.platform === 'win32' && existsSync(localYtDlp) ? localYtDlp : 'yt-dlp');

let missing = false;
for (const [label, bin, args] of [
  ['Node.js', 'node', ['--version']],
  ['FFmpeg', process.env.FFMPEG_BIN ?? 'ffmpeg', ['-version']],
  ['FFprobe', process.env.FFPROBE_BIN ?? 'ffprobe', ['-version']],
  ['yt-dlp', ytDlp, ['--version']],
]) {
  const result = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) missing = true;
  console.log(`${result.status === 0 ? 'OK ' : 'MISSING'} ${label.padEnd(8)} ${result.status === 0 ? result.stdout.split('\n')[0] : (result.error?.message ?? '')}`);
}
if (missing) {
  console.error('缺少运行依赖；Windows 请运行 scripts/init.cmd。');
  process.exitCode = 1;
}
