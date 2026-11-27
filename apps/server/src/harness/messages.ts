import type { CollectionSignal, TrendItem, XMonitorTweet } from '@creator-studio/contracts';
import type { createTrendsService } from './trends/index.js';
import type { createXMonitorService } from './x-monitor/index.js';

export type MessageCursors = { trends: number; x: number };
type MessageSource = keyof MessageCursors;
export type Message = { id: string; source: string; url: string; title?: string; text: string; publishedAt?: string };
export type MessageBatch = { items: Message[]; cursors: MessageCursors; scanned: MessageCursors };
export type MessageQuery = { source?: MessageSource; keyword?: string; limit?: number };

type Feed = { latestSequence(): number; listNew(after: number, through: number, limit: number): CollectionSignal[] };
type Trends = Pick<ReturnType<typeof createTrendsService>, 'list'> & Feed;
type X = Pick<ReturnType<typeof createXMonitorService>, 'listTweets'> & Feed;

const perSource = 12;

export function messageExcerpt(text: string, limit = 400): string {
  return Array.from(text.trim().replace(/\s+/gu, ' ')).slice(0, limit).join('');
}

function projectMessage({ id, source, url, title, text, publishedAt }: Omit<Message, 'publishedAt'> & { publishedAt: number | null }): Message {
  const excerpt = messageExcerpt(text);
  const headline = title ? messageExcerpt(title, 160) : '';
  return {
    id, source, url, text: excerpt,
    ...(headline && headline !== excerpt ? { title: headline } : {}),
    ...(publishedAt !== null ? { publishedAt: new Date(publishedAt).toISOString() } : {}),
  };
}

export function trendMessage(item: TrendItem): Message {
  return projectMessage({
    id: item.id, source: item.sources.map(({ name }) => name).join('、'), url: item.url,
    title: item.titleZh || item.title, text: item.summaryZh || item.content, publishedAt: item.publishedAt,
  });
}

export function xMessage(item: XMonitorTweet): Message {
  const reference = item.reference ? `原帖 @${item.reference.author.handle}：${item.reference.text}` : '';
  return projectMessage({
    id: item.id, source: `X @${item.author.handle}`, url: item.url,
    text: [item.text, reference].filter(Boolean).join('\n'), publishedAt: item.publishedAt,
  });
}

function readBatch(feed: Feed, source: MessageSource, after: number, through: number) {
  const page = feed.listNew(after, through, perSource + 1);
  const batch = page.slice(0, perSource);
  // 只推进到本轮实际交给模型的最后一条。后续新增和本批之外的积压留给下一轮。
  const cursor = page.length > perSource ? batch.at(-1)!.seq : Math.max(after, through);
  const items = batch.map(item => projectMessage({
    id: `${source}:${item.seq}`, source: item.source, url: item.url,
    ...(source === 'trends' ? { title: item.title } : {}), text: item.text, publishedAt: item.publishedAt,
  }));
  return { items, cursor };
}

export function createMessageService(trends: Trends, x: X) {
  return {
    latestCursors: (): MessageCursors => ({ trends: trends.latestSequence(), x: x.latestSequence() }),
    listBatch(start: MessageCursors, through: MessageCursors): MessageBatch {
      const trendBatch = readBatch(trends, 'trends', start.trends, through.trends);
      const xBatch = readBatch(x, 'x', start.x, through.x);
      return {
        items: [...trendBatch.items, ...xBatch.items],
        cursors: { trends: trendBatch.cursor, x: xBatch.cursor },
        scanned: { trends: trendBatch.items.length, x: xBatch.items.length },
      };
    },
    list({ source, keyword, limit = 12 }: MessageQuery): Message[] {
      const trendItems = source === 'x' ? [] : trends.list({ search: keyword, limit }).items.map(item => ({
        message: trendMessage(item), time: item.publishedAt ?? item.firstSeenAt,
      }));
      const xItems = source === 'trends' ? [] : x.listTweets({ q: keyword, limit }).items.map(item => ({
        message: xMessage(item), time: item.publishedAt,
      }));
      return [...trendItems, ...xItems].sort((left, right) => right.time - left.time)
        .slice(0, limit).map(({ message }) => message);
    },
  };
}
