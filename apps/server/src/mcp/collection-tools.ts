import { Type } from 'typebox';
import type { CollectionSignal } from '@creator-studio/contracts';
import type { createTrendsService } from '../harness/trends/index.js';
import type { createXMonitorService } from '../harness/x-monitor/index.js';
import { toolMetadata, type ToolMetadata } from '../agent/content.js';
import { creatorTool } from '../agent/tools/tool.js';
import { trendTools } from '../agent/tools/trends.js';
import { xTools } from '../agent/tools/x-monitor.js';
import { xResearchTools } from '../agent/tools/x-research.js';

type CollectionFeed = {
  latestSequence(): number;
  listNew(after: number, through: number, limit: number): CollectionSignal[];
};

function incrementalTool(metadata: ToolMetadata, noun: string, feed: CollectionFeed) {
  return creatorTool(metadata,
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
    incrementalTool(toolMetadata('list_new_trends'), '热点资讯', trends),
    creatorTool(toolMetadata('get_trends_config'), Type.Object({}), () => {
      const { autoGenerate, proxyUrl } = trends.getConfig();
      return { data: { autoGenerate, hasProxy: Boolean(proxyUrl) }, summary: '已读取热点配置' };
    }),
  ];
  const settings = [
    creatorTool(toolMetadata('set_trends_proxy'), Type.Object({
      proxyUrl: Type.String(),
    }), ({ proxyUrl }) => {
      const config = trends.setProxy(proxyUrl);
      return { data: { hasProxy: Boolean(config.proxyUrl) }, summary: config.proxyUrl ? '已更新代理' : '已清除代理' };
    }),
    creatorTool(toolMetadata('set_weibo_cookie'), Type.Object({
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
    incrementalTool(toolMetadata('list_new_x_tweets'), 'X 推文', x),
    creatorTool(toolMetadata('list_x_login_accounts'), Type.Object({}), async () => {
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
    creatorTool(toolMetadata('save_x_login_account'), Type.Object({ account: login }), async ({ account }) => {
      const { username, state, lastUsedAt } = await x.saveLoginAccount(account);
      return { data: { username, state, lastUsedAt }, summary: '已保存 X 登录配置' };
    }),
    creatorTool(toolMetadata('remove_x_login_account'), Type.Object({ username }), async ({ username }) => {
      await x.removeLoginAccount(username);
      return { data: { username }, summary: '已删除 X 登录配置' };
    }),
  ];
  return { agent, settings };
}
