import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JsonValue, PluginStorage } from '@creator-studio/plugin-sdk';
import { DIRS } from '../config.js';

export function createPluginStorage(pluginId: string) {
  const directory = join(DIRS.pluginData, pluginId);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'storage.json');
  const saved = (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}) as Record<string, JsonValue>;
  const values = new Map(Object.entries(saved));
  let pending = Promise.resolve();
  function save(): Promise<void> {
    const content = JSON.stringify(Object.fromEntries(values), null, 2);
    // 同一插件的写入按顺序落盘，避免并发请求覆盖较新的内容。
    pending = pending.then(() => writeFile(path, content));
    return pending;
  }
  const storage: PluginStorage = {
    async get<T extends JsonValue>(key: string) { return values.get(key) as T | undefined; },
    set(key, value) { values.set(key, value); return save(); },
    delete(key) { values.delete(key); return save(); },
  };
  return { storage, flush: () => pending };
}
