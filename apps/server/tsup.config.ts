import { copyFile, cp } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  async onSuccess() {
    await Promise.all([
      copyFile('src/harness/x-monitor/bridge.py', 'dist/bridge.py'),
      copyFile('src/harness/x-monitor/research.py', 'dist/research.py'),
      copyFile('src/harness/x-monitor/requirements.txt', 'dist/requirements.txt'),
      copyFile('src/harness/trends/NOTICE.md', 'dist/NOTICE.md'),
      cp('src/agent/content', 'dist/content', { recursive: true }),
    ]);
  },
});
