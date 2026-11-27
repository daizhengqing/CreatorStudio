import type { ScheduledPost } from '@creator-studio/contracts';
import { Type, type Static } from 'typebox';
import { toolMetadata, toolText, xDraftWorkflow } from '../../agent/content.js';
import { creatorTool, requiredResult, type ToolOutput } from '../../agent/tools/tool.js';
import type { MessageBatch } from '../messages.js';

const submission = Type.Object({
  drafts: Type.Array(Type.Object({
    title: Type.String({ minLength: 1 }),
    text: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 1 }),
    sourceIds: Type.Array(Type.String(), { minItems: 1 }),
  }), { minItems: 1 }),
});

type ReadOutput = ToolOutput<{ items: MessageBatch['items'] } | { status: 'already_read' }>;
type SaveOutput = ToolOutput<{ accepted: number } | { status: 'already_submitted' }>;

function draftKey(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function preparePosts(drafts: Static<typeof submission>['drafts'], sourceUrls: Map<string, string>) {
  const posts: ScheduledPost[] = [];
  const titles = new Set<string>();
  const bodies = new Set<string>();
  const cited = new Set<string>();

  for (const draft of drafts) {
    const title = draft.title.trim();
    const text = draft.text.replace(/https?:\/\/[^\s<>"）)]+/gi, '').trim();
    const reason = draft.reason.trim();
    const urls = [...new Set(draft.sourceIds.map(id => requiredResult(sourceUrls.get(id), '来源 ID 未在本轮读取')))];
    if (!title || !text || !reason) throw new Error('请提供草稿标题、正文及选题理由');

    const titleKey = draftKey(title);
    const bodyKey = draftKey(text);
    if (titles.has(titleKey) || bodies.has(bodyKey) || urls.every(url => cited.has(url))) continue;
    titles.add(titleKey);
    bodies.add(bodyKey);
    urls.forEach(url => cited.add(url));
    posts.push({ title, text, reason, sourceUrls: urls });
  }
  return posts;
}

export function scheduledDraftPrompt(prompt: string) {
  return `${prompt}\n\n${xDraftWorkflow}`;
}

export function prepareDraftRun({ items, cursors, scanned }: MessageBatch) {
  const sourceUrls = new Map(items.map(({ id, url }) => [id, url]));
  let read = false;
  let posts: ScheduledPost[] | undefined;

  const getMessages = creatorTool(
    { name: 'get_messages', ...toolText.tools.get_messages.scheduled },
    Type.Object({}),
    (): ReadOutput => {
      if (read) return { data: { status: 'already_read' }, summary: '本轮消息已返回' };
      read = true;
      return { data: { items }, summary: `读取 ${scanned.trends} 条热点和 ${scanned.x} 条 X 推文` };
    },
  );

  const save = creatorTool(toolMetadata('save_x_draft'), submission, ({ drafts }): SaveOutput => {
    if (posts) return { data: { status: 'already_submitted' }, summary: '本轮草稿已提交', terminate: true };
    if (!read) throw new Error('请先读取本轮消息');
    posts = preparePosts(drafts, sourceUrls);
    return { data: { accepted: posts.length }, summary: `已暂存 ${posts.length} 条待审草稿`, terminate: true };
  });

  return {
    empty: items.length === 0,
    tools: [getMessages, save],
    finish() {
      if (items.length && !read) throw new Error('本轮新增消息未读取');
      return { cursors, posts: posts ?? [], scanned };
    },
  };
}
