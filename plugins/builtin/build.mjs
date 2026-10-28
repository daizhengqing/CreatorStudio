import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

for (const name of ['assets', 'downloads', 'editor', 'inspector', 'exports', 'trends']) {
  const manifest = JSON.parse(await readFile(new URL(`./manifests/${name}.json`, import.meta.url), 'utf8'));
  const outDir = join(import.meta.dirname, 'dist', manifest.id);
  await build({
    configFile: false, root: import.meta.dirname, base: './',
    plugins: [react(), tailwindcss()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      outDir, emptyOutDir: true, target: 'es2022',
      lib: { entry: join(import.meta.dirname, 'src', `${name}.tsx`), formats: ['es'], fileName: () => 'frontend.js', cssFileName: 'style' },
    },
  });
  if (manifest.backend) {
    // 后台独立输出，原生 SQLite 依赖由本地 Node 环境加载。
    await build({
      configFile: false, root: import.meta.dirname,
      ssr: { noExternal: true, external: ['better-sqlite3'] },
      build: {
        ssr: join(import.meta.dirname, 'src/trends/server/index.ts'),
        outDir, emptyOutDir: false, target: 'node22', minify: false,
        rollupOptions: { external: ['better-sqlite3', /^node:/], output: { entryFileNames: 'backend.mjs', inlineDynamicImports: true } },
      },
    });
    await copyFile(join(import.meta.dirname, 'src/trends/server/NOTICE.md'), join(outDir, 'NOTICE.md'));
  }
  await writeFile(join(outDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
}
