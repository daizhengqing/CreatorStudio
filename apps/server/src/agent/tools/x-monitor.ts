import { Type } from 'typebox';
import type { createXMonitorService } from '../../harness/x-monitor/index.js';
import { creatorTool, requiredResult } from './tool.js';

const targetId = Type.Object({ id: Type.String() });
const interval = Type.Integer({ minimum: 1, maximum: 525_600 });
const date = Type.Integer({ minimum: 0 });

export function xTools(x: ReturnType<typeof createXMonitorService>) {
  return [
    creatorTool('list_x_targets', '查询 X 监控目标', '查看当前监控账号、ID、状态、采集间隔和最近结果。', Type.Object({}), () => {
      const data = x.listTargets();
      return { data, summary: `${data.length} 个 X 监控目标` };
    }),
    creatorTool('list_x_tweets', '查询已采集的推文', '从本地数据库按目标、关键词、日期和类型筛选 X 推文。时间为毫秒时间戳。', Type.Object({
      targetId: Type.Optional(Type.String()), search: Type.Optional(Type.String()),
      from: Type.Optional(date), to: Type.Optional(date),
      kind: Type.Optional(Type.Union([Type.Literal('original'), Type.Literal('quote'), Type.Literal('repost')])),
      hasMedia: Type.Optional(Type.Boolean()),
      cursor: Type.Optional(Type.Object({ publishedAt: date, id: Type.String() })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }), input => {
      const data = x.listTweets({ ...input, limit: input.limit ?? 10 });
      return { data, summary: `返回 ${data.items.length} 条推文` };
    }),
    creatorTool('get_x_tweet', '查看推文详情', '按推文 ID 读取已采集正文、链接、媒体以及引用关系。', targetId, ({ id }) => {
      const data = requiredResult(x.getTweet(id), '推文不存在');
      return { data, summary: `@${data.author.handle} 的推文` };
    }),
    creatorTool('add_x_target', '添加 X 监控', '添加指定用户名。补采可从现在开始、往前指定天数、或采集最新指定条数。', Type.Object({
      handle: Type.String(), intervalMinutes: interval,
      backfill: Type.Union([
        Type.Object({ mode: Type.Literal('from_now') }),
        Type.Object({ mode: Type.Union([Type.Literal('days'), Type.Literal('latest')]), amount: Type.Integer({ minimum: 1 }) }),
      ]),
    }), async (input, signal) => {
      const data = await x.addTarget(input, signal);
      return { data, summary: `已添加 @${data.handle} 的监控` };
    }),
    creatorTool('update_x_target', '更新 X 监控', '按目标 ID 修改间隔或通过 enabled 暂停和恢复采集。', Type.Object({
      id: Type.String(), intervalMinutes: Type.Optional(interval), enabled: Type.Optional(Type.Boolean()),
    }), input => {
      const data = x.updateTarget(input);
      return { data, summary: `已更新 @${data.handle} 的监控` };
    }),
    creatorTool('remove_x_target', '移除 X 监控', '停止监控指定目标。', targetId, ({ id }) => {
      x.removeTarget(id);
      return { data: { id, removed: true }, summary: '已移除 X 监控' };
    }),
    creatorTool('collect_x_now', '立即采集 X 账号', '安排指定已启用目标立即采集。', targetId, ({ id }) => {
      const data = x.collectNow(id);
      return { data, summary: `已请求采集 @${data.handle}` };
    }),
    creatorTool('get_x_runtime', '检查 X 运行环境', '检查 X Monitor 的 Python 运行环境。', Type.Object({}), async (_input, signal) => {
      const data = await x.getRuntime(signal);
      return { data, summary: data.ready ? 'X 运行环境就绪' : data.message ?? 'X 运行环境未就绪' };
    }),
  ];
}
