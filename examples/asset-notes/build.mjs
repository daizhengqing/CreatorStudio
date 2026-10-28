import { copyFile } from 'node:fs/promises';
for (const name of ['plugin.json', 'style.css']) {
  await copyFile(new URL(name, import.meta.url), new URL(`dist/${name}`, import.meta.url));
}
