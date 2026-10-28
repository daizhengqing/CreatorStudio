import { randomUUID } from 'node:crypto';
import { copyFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { desc, eq } from 'drizzle-orm';
import type { ServerContext } from '@creator-studio/plugin-sdk/server';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { cancelDownload, createDownload, deleteDownload, listDownloads, previewDownload } from '../services/downloads.js';
import { enqueueExport, listExports } from '../services/exports.js';
import { folderFor, formatForFile, registerLocalFile, toAsset } from '../services/media.js';

// 插件获得领域能力，不依赖 Fastify、数据库表或宿主服务的源码路径。
export const media: ServerContext['media'] = {
  async assets() { return db.select().from(assets).orderBy(desc(assets.createdAt)).all().map(toAsset); },
  async downloads() { return listDownloads(); },
  previewDownload,
  async startDownload(input) { return createDownload(input.previewId, input.resolution); },
  async cancelDownload(id) { return cancelDownload(id); },
  async deleteDownload(id) { deleteDownload(id); return { deleted: true }; },
  async exports() { return listExports(); },
  async startExport(input) { return enqueueExport(input); },
  async importFile(path) {
    const format = formatForFile(path);
    if (!format) throw new Error('不支持该素材格式');
    const id = randomUUID();
    const destination = join(folderFor(format.type), `${id}${extname(path).toLowerCase()}`);
    await copyFile(path, destination);
    await registerLocalFile({ id, filename: basename(path), path: destination, source: 'local' });
    return toAsset(db.select().from(assets).where(eq(assets.id, id)).get()!);
  },
};
