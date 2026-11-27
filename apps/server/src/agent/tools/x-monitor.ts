import { Type } from 'typebox';
import { xMessage } from '../../harness/messages.js';
import type { createXMonitorService } from '../../harness/x-monitor/index.js';
import { toolMetadata, toolText } from '../content.js';
import { creatorTool, requiredResult } from './tool.js';
import { projectXPost, projectXReference } from './x-post-projection.js';

const targetId = Type.Object({ id: Type.String() });
const defaultIntervalMinutes = 5;
const descriptions = toolText.parameters.xMonitor;
const interval = Type.Integer({ minimum: 1, maximum: 525_600, description: descriptions.intervalMinutes });
const date = Type.Integer({ minimum: 0 });

export function xTools(x: ReturnType<typeof createXMonitorService>) {
  const addTargetMetadata = toolMetadata('add_x_target');
  return [
    creatorTool(toolMetadata('list_x_targets'), Type.Object({}), () => {
      const data = x.listTargets();
      return { data, summary: `${data.length} 个 X 监控目标` };
    }),
    creatorTool(toolMetadata('list_x_tweets'), Type.Object({
      targetId: Type.Optional(Type.String()), search: Type.Optional(Type.String()),
      from: Type.Optional(date), to: Type.Optional(date),
      kind: Type.Optional(Type.Union([Type.Literal('original'), Type.Literal('quote'), Type.Literal('repost')])),
      hasMedia: Type.Optional(Type.Boolean()),
      cursor: Type.Optional(Type.Object({ publishedAt: date, id: Type.String() })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }), ({ search, ...query }) => {
      const data = x.listTweets({ ...query, q: search, limit: query.limit ?? 10 });
      return { data, summary: `返回 ${data.items.length} 条推文` };
    }, ({ items, nextCursor }) => ({
      items: items.map(xMessage), ...(nextCursor ? { nextCursor } : {}),
    })),
    creatorTool(toolMetadata('get_x_tweet'), targetId, ({ id }) => {
      const data = requiredResult(x.getTweet(id), '推文不存在');
      return { data, summary: `@${data.author.handle} 的推文` };
    }, post => ({
      ...projectXPost(post, true), kind: post.kind,
      ...(post.reference ? { reference: projectXReference(post.reference, true) } : {}),
    })),
    creatorTool(
      {
        ...addTargetMetadata,
        description: addTargetMetadata.description.replace('{{intervalMinutes}}', String(defaultIntervalMinutes)),
      },
      Type.Object({
        handle: Type.String({ description: descriptions.handle }),
        intervalMinutes: Type.Optional(interval),
        backfill: Type.Optional(Type.Union([
          Type.Object({ mode: Type.Literal('from_now') }),
          Type.Object({ mode: Type.Union([Type.Literal('days'), Type.Literal('latest')]), amount: Type.Integer({ minimum: 1 }) }),
        ], { description: descriptions.backfill })),
      }),
      async ({ handle, intervalMinutes = defaultIntervalMinutes, backfill }, signal) => {
        // 默认以添加时刻为采集起点，按需补采历史推文。
        const data = await x.addTarget({ handle, intervalMinutes, backfill: backfill ?? { mode: 'from_now' } }, signal);
        return { data, summary: `已添加 @${data.handle} 的监控，每 ${data.intervalMinutes} 分钟采集` };
      },
    ),
    creatorTool(toolMetadata('update_x_target'), Type.Object({
      id: Type.String(), intervalMinutes: Type.Optional(interval), enabled: Type.Optional(Type.Boolean()),
    }), input => {
      const data = x.updateTarget(input);
      return { data, summary: `已更新 @${data.handle} 的监控` };
    }),
    creatorTool(toolMetadata('remove_x_target'), targetId, ({ id }) => {
      x.removeTarget(id);
      return { data: { id, removed: true }, summary: '已移除 X 监控' };
    }),
    creatorTool(toolMetadata('collect_x_now'), targetId, ({ id }) => {
      const data = x.collectNow(id);
      return { data, summary: `已请求采集 @${data.handle}` };
    }),
    creatorTool(toolMetadata('get_x_runtime'), Type.Object({}), async (_input, signal) => {
      const data = await x.getRuntime(signal);
      return { data, summary: data.ready ? 'X 运行环境就绪' : data.message ?? 'X 运行环境未就绪' };
    }),
  ];
}
