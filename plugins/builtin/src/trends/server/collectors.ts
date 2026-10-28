import type { CollectedBatch, SourceDefinition } from '../contracts.js';
import { collectHackernews } from './hackernews.js';
import { collectFeed } from './rss.js';
import { collectDouyin, collectThepaper, collectWallstreet, collectWeibo, collectZhihu } from './social.js';

export type CollectOptions = { proxyUrl: string; cookie?: string; signal: AbortSignal };
const collectors: Record<string, (options: CollectOptions) => Promise<CollectedBatch>> = {
  thepaper: collectThepaper, zhihu: collectZhihu, douyin: collectDouyin, weibo: collectWeibo,
  wallstreetcn: collectWallstreet, hackernews: collectHackernews,
};

export async function collectSource(definition: SourceDefinition, options: CollectOptions): Promise<CollectedBatch> {
  if (definition.kind === 'feed' && definition.url) return collectFeed(definition.url, options);
  const collector = collectors[definition.id];
  if (!collector) throw new Error(`没有为 ${definition.name} 配置采集器`);
  return collector(options);
}
