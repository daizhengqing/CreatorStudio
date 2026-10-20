import { rmSync } from 'node:fs';
for (const dir of ['apps/web/dist', 'apps/server/dist']) rmSync(dir, { recursive: true, force: true });
console.log('Build artifacts removed (your media data is untouched).');
