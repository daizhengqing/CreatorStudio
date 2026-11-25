import { rmSync } from 'node:fs';

for (const directory of ['apps/web/dist', 'apps/server/dist', 'packages/contracts/dist']) {
  rmSync(directory, { recursive: true, force: true });
}
console.log('已清理构建产物。');
