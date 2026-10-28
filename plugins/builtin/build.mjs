import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

for (const name of ['assets', 'downloads', 'editor', 'inspector', 'exports']) {
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
  await writeFile(join(outDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
}
