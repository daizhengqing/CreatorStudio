import { Type, type Static, type TObjectOptions, type TProperties, type TSchema } from 'typebox';
import type { createXMonitorService } from '../../harness/x-monitor/index.js';
import { creatorTool } from './tool.js';

const xId = Type.String({ pattern: '^[1-9][0-9]{0,19}$', description: 'X 数字 ID，以字符串传入以保留精度。' });
const handle = Type.String({ pattern: '^@?[A-Za-z0-9_]{1,15}$' });
const query = Type.String({ minLength: 1, maxLength: 1_000 });
const page = {
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: '期望的每页条数，默认 10，实际页大小由 X 决定。' })),
  cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 8_192, description: '使用同一工具和同一查询上一页返回的 nextCursor。' })),
};

function toolInput<const Properties extends TProperties>(properties: Properties, options?: TObjectOptions) {
  // 只将工具明确声明的参数交给桥接层。
  return Type.Object(properties, { ...options, additionalProperties: false });
}

export function xResearchTools(x: ReturnType<typeof createXMonitorService>) {
  type ResearchInput = Parameters<typeof x.research>[0];

  function liveTool<Schema extends TSchema>(
    name: string, label: string, description: string, parameters: Schema,
    request: (input: Static<Schema>) => ResearchInput,
  ) {
    return creatorTool(name, label, description, parameters, async (input, signal) => {
      const data = await x.research(request(input), signal);
      const summary = 'items' in data ? `返回 ${data.items.length} 条结果` : data.item ? '已读取详情' : '未找到结果';
      return { data, summary };
    });
  }

  return [
    liveTool('search_x_posts', '在线搜索 X 帖子',
      '从 X 搜索帖子，可使用 X 搜索语法，例如 from:用户名、lang:ja、min_faves:100。mode 可选 latest（最新，默认）、top（热门结果）、media（媒体结果）、trend（按趋势词搜索）。返回正文、链接、互动和浏览数据（X 提供时）及媒体。',
      toolInput({ query, mode: Type.Optional(Type.Union([
        Type.Literal('latest'), Type.Literal('top'), Type.Literal('media'), Type.Literal('trend'),
      ])), ...page }), input => ({ ...input, operation: 'search_posts' })),
    liveTool('search_x_users', '在线搜索 X 用户', '从 X 按搜索词查找用户及其资料。',
      toolInput({ query, ...page }), input => ({ ...input, operation: 'search_users' })),
    liveTool('fetch_x_post', '在线读取 X 帖子', '按帖子 ID 从 X 获取正文、作者、互动和浏览数据、媒体及引用关系。',
      toolInput({ postId: xId }), input => ({ ...input, operation: 'post' })),
    liveTool('list_x_post_replies', '在线读取 X 帖子回复', '按帖子 ID 从 X 分页读取直接回复。',
      toolInput({ postId: xId, ...page }), input => ({ ...input, operation: 'replies' })),
    liveTool('get_x_conversation', '在线读取 X 对话线程', '按帖子 ID 从 X 分页读取所属对话线程，包括根帖及上游返回的后续回复。',
      toolInput({ postId: xId, ...page }), input => ({ ...input, operation: 'conversation' })),
    liveTool('get_x_user', '在线读取 X 用户资料', '按用户名 handle 或用户数字 ID userId 从 X 查询资料，两者择一。',
      toolInput({ handle: Type.Optional(handle), userId: Type.Optional(xId) }, {
        minProperties: 1, maxProperties: 1,
      }), ({ handle, userId }) => userId === undefined ? { operation: 'user', handle: handle! } : { operation: 'user', userId }),
    liveTool('get_x_user_about', '在线读取 X 账号背景', '按用户名读取 X 账号「关于此账号」页面提供的背景资料。',
      toolInput({ handle }), input => ({ ...input, operation: 'user_about' })),
    liveTool('list_x_user_posts', '在线读取 X 用户时间线', '按用户 ID 从 X 分页读取该用户的历史帖子。mode 可选 posts（默认）、posts_and_replies（帖子及回复）或 media（媒体帖）。',
      toolInput({ userId: xId, mode: Type.Optional(Type.Union([
        Type.Literal('posts'), Type.Literal('posts_and_replies'), Type.Literal('media'),
      ])), ...page }), input => ({ ...input, operation: 'user_posts' })),
    liveTool('list_x_user_connections', '在线读取 X 用户关系', '按用户 ID 从 X 分页读取粉丝、认证粉丝、关注的人或订阅的创作者。',
      toolInput({ userId: xId, kind: Type.Union([
        Type.Literal('followers'), Type.Literal('verified_followers'), Type.Literal('following'), Type.Literal('subscriptions'),
      ]), ...page }), input => ({ ...input, operation: 'user_connections' })),
    liveTool('list_x_post_reposters', '在线读取 X 转发用户', '按帖子 ID 从 X 分页查看转发该帖的用户。',
      toolInput({ postId: xId, ...page }), input => ({ ...input, operation: 'reposters' })),
    liveTool('list_x_trends', '在线读取 X 热门趋势', '读取 X 探索页趋势。category 可传 trending（默认）、news、sport、entertainment 或 X 提供的趋势时间线 ID。',
      toolInput({ category: Type.Optional(Type.String({ minLength: 1 })), ...page }), input => ({ ...input, operation: 'trends' })),
    liveTool('get_x_community', '在线读取 X 社区资料', '按社区 ID 从 X 查询社区简介及统计信息。',
      toolInput({ communityId: xId }), input => ({ ...input, operation: 'community' })),
    liveTool('list_x_community_posts', '在线读取 X 社区帖子', '按社区 ID 从 X 分页读取帖子。',
      toolInput({ communityId: xId, ...page }), input => ({ ...input, operation: 'community_posts' })),
    liveTool('list_x_community_people', '在线读取 X 社区成员', '按社区 ID 从 X 分页查看社区成员或管理员。',
      toolInput({ communityId: xId, role: Type.Union([Type.Literal('members'), Type.Literal('moderators')]), ...page }),
      input => ({ ...input, operation: 'community_people' })),
    liveTool('list_x_list_posts', '在线读取 X 列表时间线', '按 X List ID 从 X 分页读取该列表的帖子。',
      toolInput({ listId: xId, ...page }), input => ({ ...input, operation: 'list_posts' })),
    liveTool('list_x_list_members', '在线读取 X 列表成员', '按 X List ID 从 X 分页读取该列表的成员。',
      toolInput({ listId: xId, ...page }), input => ({ ...input, operation: 'list_members' })),
    liveTool('list_x_bookmarks', '在线读取 X 书签', '分页读取指定已配置 X 登录账号的书签。account 为登录用户名，后续页使用同一账号。',
      toolInput({ account: handle, ...page }), input => ({ ...input, operation: 'bookmarks' })),
  ];
}
