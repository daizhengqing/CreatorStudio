import { rmSync } from 'node:fs';
for (const dir of ['apps/web/dist', 'apps/server/dist', 'packages/plugin-sdk/dist', 'plugins/builtin/dist', 'examples/asset-notes/dist']) rmSync(dir, { recursive: true, force: true });
console.log('Build artifacts removed (your media data is untouched).');
