import { Type, type Static, type TObjectOptions, type TProperties, type TSchema } from 'typebox';
import type { XMonitorPost } from '@creator-studio/contracts';
import type { createXMonitorService } from '../../harness/x-monitor/index.js';
import type { ResearchInput, ResearchResult } from '../../harness/x-monitor/research.js';
import { toolMetadata, toolText, type ToolMetadata } from '../content.js';
import { creatorTool } from './tool.js';
import { projectXPost, projectXReference } from './x-post-projection.js';

const descriptions = toolText.parameters.xResearch;
const xId = Type.String({ pattern: '^[1-9][0-9]{0,19}$', description: descriptions.id });
const handle = Type.String({ pattern: '^@?[A-Za-z0-9_]{1,15}$' });
const query = Type.String({ minLength: 1, maxLength: 1_000 });
const page = {
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: descriptions.count })),
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 8_192, description: descriptions.cursor })),
};

function toolInput<const Properties extends TProperties>(properties: Properties, options?: TObjectOptions) {
  // 只将工具明确声明的参数交给桥接层。
  return Type.Object(properties, { ...options, additionalProperties: false });
}

const postTools = new Set([
  'search_x_posts', 'fetch_x_post', 'list_x_post_replies', 'get_x_conversation', 'list_x_user_posts',
  'list_x_community_posts', 'list_x_list_posts', 'list_x_bookmarks',
]);

type ResearchPost = XMonitorPost & {
  reference: XMonitorPost | null;
  conversationId: string;
  parentPostId: string | null;
  article?: { title: string; preview: string | null; text: string | null };
};

function projectResearchPosts(data: ResearchResult, fullText: boolean) {
  function project(item: Record<string, unknown>) {
    // 这些操作由 Python 的 research_post 序列化，和用户、社区、热榜的返回结构不同。
    const post = item as ResearchPost;
    return {
      ...projectXPost(post, fullText),
      ...(post.reference ? { reference: projectXReference(post.reference, fullText) } : {}),
      ...(post.parentPostId ? { parentPostId: post.parentPostId } : {}),
      ...(fullText && post.conversationId !== post.id ? { conversationId: post.conversationId } : {}),
      ...(fullText && post.article ? { article: { title: post.article.title, text: post.article.text ?? post.article.preview } } : {}),
    };
  }
  return 'items' in data
    ? { items: data.items.map(project), ...(data.nextCursor ? { nextCursor: data.nextCursor } : {}) }
    : { item: data.item ? project(data.item) : null };
}

export function xResearchTools(x: ReturnType<typeof createXMonitorService>) {
  function liveTool<Schema extends TSchema>(
    metadata: ToolMetadata, parameters: Schema,
    request: (input: Static<Schema>) => ResearchInput,
  ) {
    const { name } = metadata;
    return creatorTool(metadata, parameters, async (input, signal) => {
      const data = await x.research(request(input), signal);
      const summary = 'items' in data ? `返回 ${data.items.length} 条结果` : data.item ? '已读取详情' : '未找到结果';
      return { data, summary };
    }, postTools.has(name) ? data => projectResearchPosts(data, name === 'fetch_x_post') : undefined);
  }

  return [
    liveTool(toolMetadata('search_x_posts'),
      toolInput({ query, mode: Type.Optional(Type.Union([
        Type.Literal('latest'), Type.Literal('top'), Type.Literal('media'), Type.Literal('trend'),
      ])), ...page }), input => ({ ...input, operation: 'search_posts' })),
    liveTool(toolMetadata('search_x_users'),
      toolInput({ query, ...page }), input => ({ ...input, operation: 'search_users' })),
    liveTool(toolMetadata('fetch_x_post'),
      toolInput({ postId: xId }), input => ({ ...input, operation: 'post' })),
    liveTool(toolMetadata('list_x_post_replies'),
      toolInput({ postId: xId, ...page }), input => ({ ...input, operation: 'replies' })),
    liveTool(toolMetadata('get_x_conversation'),
      toolInput({ postId: xId, ...page }), input => ({ ...input, operation: 'conversation' })),
    liveTool(toolMetadata('get_x_user'),
      toolInput({ handle: Type.Optional(handle), userId: Type.Optional(xId) }, {
        minProperties: 1, maxProperties: 1,
      }), ({ handle, userId }) => userId === undefined ? { operation: 'user', handle: handle! } : { operation: 'user', userId }),
    liveTool(toolMetadata('get_x_user_about'),
      toolInput({ handle }), input => ({ ...input, operation: 'user_about' })),
    liveTool(toolMetadata('list_x_user_posts'),
      toolInput({ userId: xId, mode: Type.Optional(Type.Union([
        Type.Literal('posts'), Type.Literal('posts_and_replies'), Type.Literal('media'),
      ])), ...page }), input => ({ ...input, operation: 'user_posts' })),
    liveTool(toolMetadata('list_x_user_connections'),
      toolInput({ userId: xId, kind: Type.Union([
        Type.Literal('followers'), Type.Literal('verified_followers'), Type.Literal('following'), Type.Literal('subscriptions'),
      ]), ...page }), input => ({ ...input, operation: 'user_connections' })),
    liveTool(toolMetadata('list_x_post_reposters'),
      toolInput({ postId: xId, ...page }), input => ({ ...input, operation: 'reposters' })),
    liveTool(toolMetadata('list_x_trends'),
      toolInput({ category: Type.Optional(Type.String({ minLength: 1 })), ...page }), input => ({ ...input, operation: 'trends' })),
    liveTool(toolMetadata('get_x_community'),
      toolInput({ communityId: xId }), input => ({ ...input, operation: 'community' })),
    liveTool(toolMetadata('list_x_community_posts'),
      toolInput({ communityId: xId, ...page }), input => ({ ...input, operation: 'community_posts' })),
    liveTool(toolMetadata('list_x_community_people'),
      toolInput({ communityId: xId, role: Type.Union([Type.Literal('members'), Type.Literal('moderators')]), ...page }),
      input => ({ ...input, operation: 'community_people' })),
    liveTool(toolMetadata('list_x_list_posts'),
      toolInput({ listId: xId, ...page }), input => ({ ...input, operation: 'list_posts' })),
    liveTool(toolMetadata('list_x_list_members'),
      toolInput({ listId: xId, ...page }), input => ({ ...input, operation: 'list_members' })),
    liveTool(toolMetadata('list_x_bookmarks'),
      toolInput({ account: handle, ...page }), input => ({ ...input, operation: 'bookmarks' })),
  ];
}
