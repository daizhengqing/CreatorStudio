import type { CollectedBatch, CollectedItem } from '../contracts.js';
import type { CollectOptions } from './collectors.js';
import { fetchJson } from './http.js';
import { plainText } from './rss.js';

type HnItem = { id: number; type: string; title?: string; text?: string; url?: string; time: number; score?: number; deleted?: boolean; dead?: boolean };
const baseUrl = 'https://hacker-news.firebaseio.com/v0';

export async function collectHackernews(options: CollectOptions): Promise<CollectedBatch> {
  // 官方 API 的 top/new 分别取 30 条；同一帖同时出现在两列时只保留一份。
  const [top, latest] = await Promise.all([
    fetchJson<number[]>(`${baseUrl}/topstories.json`, options),
    fetchJson<number[]>(`${baseUrl}/newstories.json`, options),
  ]);
  const topIds = top.slice(0, 30);
  const ids = [...new Set([...topIds, ...latest.slice(0, 30)])];
  const items: CollectedItem[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      if (id === undefined) break;
      const entry = await fetchJson<HnItem | null>(`${baseUrl}/item/${id}.json`, options);
      if (!entry || entry.deleted || entry.dead || entry.type !== 'story' || !entry.title) continue;
      const position = topIds.indexOf(id);
      items.push({
        externalId: String(entry.id), title: plainText(entry.title), url: entry.url || `https://news.ycombinator.com/item?id=${entry.id}`,
        content: plainText(entry.text ?? ''), publishedAt: entry.time * 1000, updatedAt: null,
        // HN time 是社区投稿时间，不能当作链接中文章的发布时间。
        timeKind: 'community', rank: position < 0 ? null : position + 1,
        heat: entry.score === undefined ? null : `${entry.score} points`,
      });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (!items.length) throw new Error('Hacker News 没有返回有效帖子');
  return { items: items.sort((left, right) => (right.publishedAt ?? 0) - (left.publishedAt ?? 0)) };
}
