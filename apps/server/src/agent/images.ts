import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import type { Asset } from '@creator-studio/contracts';
import type { ImageContent } from '@earendil-works/pi-ai';
import { db } from '../db/index.js';
import { assets } from '../db/schema.js';
import { resolveMediaPath } from '../services/media.js';

export async function loadPromptImages(attachments: Asset[]): Promise<ImageContent[]> {
  const images: ImageContent[] = [];
  for (const attachment of attachments) {
    if (attachment.type !== 'image') continue;
    // 素材 ID 已在接收指令时校验，图片始终从数据库记录对应的素材目录读取。
    const row = db.select().from(assets).where(eq(assets.id, attachment.id)).get()!;
    const data = await readFile(resolveMediaPath(row), 'base64');
    images.push({ type: 'image', data, mimeType: row.mime });
  }
  return images;
}
