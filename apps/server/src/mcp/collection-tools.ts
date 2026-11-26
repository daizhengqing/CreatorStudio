import { Type } from 'typebox';
import type { CollectionSignal } from '@creator-studio/contracts';
import type { createTrendsService } from '../harness/trends/index.js';
import type { createXMonitorService } from '../harness/x-monitor/index.js';
import { creatorTool } from '../agent/tools/tool.js';
import { trendTools } from '../agent/tools/trends.js';
import { xTools } from '../agent/tools/x-monitor.js';
import { xResearchTools } from '../agent/tools/x-research.js';

type CollectionFeed = {
  latestSequence(): number;
  listNew(after: number, through: number, limit: number): CollectionSignal[];
};

function incrementalTool(name: string, label: string, noun: string, feed: CollectionFeed) {
  return creatorTool(name, label,
    '按入库序号读取' + noun + '。首次读取时可省略 through，后续使用返回的 through 固定本次上界，并从 nextCursor 继续，直到 hasMore 为 false。',
    Type.Object({
      after: Type.Integer({ minimum: 0 }),
      through: Type.Optional(Type.Integer({ minimum: 0 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    ({ after, through, limit = 8 }) => {
      const latest = feed.latestSequence();
      const upper = Math.min(through ?? latest, latest);
      const page = feed.listNew(after, upper, limit + 1);
      const items = page.slice(0, limit);
      return {
        data: { items, nextCursor: items.at(-1)?.seq ?? Math.max(after, upper), through: upper, hasMore: page.length > limit },
        summary: '读取 ' + items.length + ' 条' + noun,
      };
    },
  );
}

export function createTrendMcpTools(trends: ReturnType<typeof createTrendsService>) {
  const agent = [
    ...trendTools(trends),
    incrementalTool('list_new_trends', '读取新增热点', '热点资讯', trends),
    creatorTool('get_trends_config', '查看热点配置', '查看自动摘要和是否已配置采集代理。', Type.Object({}), () => {
      const { autoGenerate, proxyUrl } = trends.getConfig();
      return { data: { autoGenerate, hasProxy: Boolean(proxyUrl) }, summary: '已读取热点配置' };
    }),
  ];
  const settings = [
    creatorTool('set_trends_proxy', '修改热点采集代理', '保存采集代理地址，传空字符串清除代理。', Type.Object({
      proxyUrl: Type.String(),
    }), ({ proxyUrl }) => {
      const config = trends.setProxy(proxyUrl);
      return { data: { hasProxy: Boolean(config.proxyUrl) }, summary: config.proxyUrl ? '已更新代理' : '已清除代理' };
    }),
    creatorTool('set_weibo_cookie', '配置微博登录状态', '保存并试采微博 Cookie，传空字符串清除。', Type.Object({
      cookie: Type.String(),
    }), async ({ cookie }) => {
      const { state, enabled, hasCredentials } = await trends.saveSourceCredentials('weibo', cookie);
      return { data: { state, enabled, hasCredentials }, summary: hasCredentials ? '已保存微博登录配置' : '已清除微博登录配置' };
    }),
  ];
  return { agent, settings };
}

export function createXMcpTools(x: ReturnType<typeof createXMonitorService>) {
  const agent = [
    ...xTools(x),
    ...xResearchTools(x),
    incrementalTool('list_new_x_tweets', '读取新增 X 推文', 'X 推文', x),
    creatorTool('list_x_login_accounts', '查看 X 登录账号状态', '列出 X 采集用的登录账号和状态。', Type.Object({}), async () => {
      const data = (await x.listLoginAccounts()).map(({ username, state, lastUsedAt }) => ({ username, state, lastUsedAt }));
      return { data, summary: data.length + ' 个 X 登录账号' };
    }),
  ];
  const username = Type.String({ minLength: 1 });
  const login = Type.Union([
    Type.Object({ mode: Type.Literal('cookie'), username, cookie: Type.String({ minLength: 1 }) }),
    Type.Object({
      mode: Type.Literal('password'), username, password: Type.String({ minLength: 1 }), email: Type.String({ minLength: 1 }),
      emailPassword: Type.Optional(Type.String()), totpSecret: Type.Optional(Type.String()),
    }),
  ]);
  const settings = [
    creatorTool('save_x_login_account', '保存 X 登录配置', '为本机 X Monitor 保存和验证登录配置。', Type.Object({ account: login }), async ({ account }) => {
      const { username, state, lastUsedAt } = await x.saveLoginAccount(account);
      return { data: { username, state, lastUsedAt }, summary: '已保存 X 登录配置' };
    }),
    creatorTool('remove_x_login_account', '删除 X 登录配置', '通过用户名移除用于采集的登录账号。', Type.Object({ username }), async ({ username }) => {
      await x.removeLoginAccount(username);
      return { data: { username }, summary: '已删除 X 登录配置' };
    }),
  ];
  return { agent, settings };
}
