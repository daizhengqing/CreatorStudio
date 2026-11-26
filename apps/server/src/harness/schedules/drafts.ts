import type { CollectionSignal, ScheduledPost } from '@creator-studio/contracts';
import { Type } from 'typebox';
import { creatorTool, requiredResult } from '../../agent/tools/tool.js';
import type { Cursors } from './store.js';

export type CollectionFeed = { latestSequence(): number };

export type CallCollectionTool = (
  name: string, input: Record<string, unknown>, signal?: AbortSignal,
) => Promise<{ data: unknown; summary: string }>;

type CollectionPage = {
  items: CollectionSignal[];
  nextCursor: number;
  hasMore: boolean;
};

const perSource = 8;
const names = {
  trends: { tool: 'list_new_trends', label: '读取热点增量' },
  x: { tool: 'list_new_x_tweets', label: '读取 X 推文增量' },
};

const submission = Type.Object({
  title: Type.String({ minLength: 1 }),
  text: Type.String({ minLength: 1 }),
  reason: Type.String({ minLength: 1 }),
  sourceIds: Type.Array(Type.String(), { minItems: 1 }),
});

function draftKey(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function modelSource(collection: keyof Cursors, signal: CollectionSignal) {
  return {
    id: `${collection}:${signal.seq}`,
    itemId: signal.id,
    source: signal.source,
    title: signal.title.slice(0, 240),
    text: signal.text.slice(0, 1_200),
    url: signal.url,
    publishedAt: signal.publishedAt === null ? null : new Date(signal.publishedAt).toISOString(),
    collectedAt: new Date(signal.collectedAt).toISOString(),
  };
}

export function scheduledDraftPrompt(prompt: string) {
  return [
    prompt,
    '按信息采集与内容创作 Skill 执行。分别调用 list_new_trends 和 list_new_x_tweets，直到两边均返回 hasMore: false。',
    '有合适的内容时用 save_x_draft 提交待审草稿，引用本轮工具返回的来源 ID。没有合适选题时，读取完成后简要说明。',
  ].join('\n\n');
}

export function prepareDraftRun(start: Cursors, through: Cursors, call: CallCollectionTool) {
  // 只在本轮内推进，实际入库的新消息和失败重试都保留给正确的批次。
  const cursors = { ...start };
  const finished = { trends: false, x: false };
  const scanned: Cursors = { trends: 0, x: 0 };
  const sourceUrls = new Map<string, string>();
  const posts: ScheduledPost[] = [];
  const titles = new Set<string>();
  const bodies = new Set<string>();
  const cited = new Set<string>();

  function readTool(collection: keyof Cursors) {
    const { tool, label } = names[collection];
    return creatorTool(tool, label, '读取本轮下一页新增消息。返回来源 ID 与 hasMore，后者为 true 时请继续调用此工具。', Type.Object({}),
      async (_input, signal) => {
        if (finished[collection]) return { data: { items: [], hasMore: false }, summary: '本轮已读完' };
        const { data } = await call(tool, { after: cursors[collection], through: through[collection], limit: perSource }, signal);
        const page = data as CollectionPage;
        const items = page.items.map(item => modelSource(collection, item));
        for (const item of items) sourceUrls.set(item.id, item.url);
        scanned[collection] += items.length;
        finished[collection] = !page.hasMore;
        cursors[collection] = page.hasMore ? page.nextCursor : through[collection];
        return { data: { items, hasMore: page.hasMore }, summary: items.length ? `读取 ${items.length} 条新增消息` : '本路没有待处理的新增消息' };
      });
  }

  const save = creatorTool('save_x_draft', '提交 X 草稿', '暂存一条待审的 X 草稿，sourceIds 必须来自本轮增量工具。读取完成后统一写入草稿，不发布。', submission,
    ({ title, text, reason, sourceIds }) => {
      const urls = [...new Set(sourceIds.map(id => requiredResult(sourceUrls.get(id), `来源 ID 未在本轮读取：${id}`)))];
      const content = text.replace(/https?:\/\/[^\s<>"）)]+/gi, '').trim();
      if (!title.trim() || !content || !reason.trim() || !urls.length) throw new Error('请提供草稿标题、正文、理由及来源');

      const titleKey = draftKey(title);
      const bodyKey = draftKey(content);
      if (titles.has(titleKey) || bodies.has(bodyKey) || urls.every(url => cited.has(url))) {
        return { data: { accepted: false }, summary: '该选题已在本轮提交' };
      }
      titles.add(titleKey);
      bodies.add(bodyKey);
      urls.forEach(url => cited.add(url));
      posts.push({ title: title.trim(), text: content, reason: reason.trim(), sourceUrls: urls });
      return { data: { accepted: true, title: title.trim() }, summary: '已暂存为本轮待审草稿' };
    });

  return {
    tools: [readTool('trends'), readTool('x'), save],
    finish() {
      if (!finished.trends || !finished.x) throw new Error('本轮热点或 X 推文增量尚未读完');
      return { cursors, posts, scanned };
    },
  };
}
