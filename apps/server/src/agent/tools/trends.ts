import { Type } from 'typebox';
import type { TrendItem } from '@creator-studio/contracts';
import type { createTrendsService } from '../../harness/trends/index.js';
import { creatorTool, requiredResult } from './tool.js';

const filter = {
  search: Type.Optional(Type.String()),
  category: Type.Optional(Type.Union([Type.Literal('social'), Type.Literal('international'), Type.Literal('ai'), Type.Literal('finance'), Type.Literal('crypto')])),
  sourceId: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
};
const itemId = Type.Object({ itemId: Type.String() });

function preview(item: TrendItem) {
  return { ...item, content: item.content.slice(0, 700) };
}

export function trendTools(trends: ReturnType<typeof createTrendsService>) {
  return [
    creatorTool('list_trends', '查询热点资讯', '按关键词、分类、来源或收藏状态查资讯。返回分页结果、原文链接和 itemId。', Type.Object({
      ...filter, offset: Type.Optional(Type.Integer({ minimum: 0 })), savedOnly: Type.Optional(Type.Boolean()),
    }), input => {
      const page = trends.list({ ...input, limit: input.limit ?? 10 });
      return { data: { ...page, items: page.items.map(preview) }, summary: `找到 ${page.total} 条资讯` };
    }),
    creatorTool('get_trend', '查看热点详情', '按 itemId 读取一条资讯的完整已采集内容、中文摘要和来源。', itemId, input => {
      const data = requiredResult(trends.get(input.itemId), '资讯不存在');
      return { data, summary: data.titleZh ?? data.title };
    }),
    creatorTool('list_rankings', '查询平台热榜', '按来源、分类或关键词查平台排名。limit 为每个榜单返回条数。', Type.Object(filter), input => {
      const data = trends.rankings({ ...input, limit: input.limit ?? 5 }).map(group => ({ ...group, items: group.items.map(preview) }));
      return { data, summary: `${data.length} 个榜单` };
    }),
    creatorTool('get_trends_status', '查看热点采集状态', '读取信息源 ID、启停状态、上次采集时间、摘要队列和配置状态。', Type.Object({}), () => {
      const data = trends.getStatus();
      return { data, summary: `${data.sources.filter(source => source.enabled).length} 个来源已启用` };
    }),
    creatorTool('refresh_trends', '刷新热点来源', '立即安排一项来源采集，省略 sourceId 则刷新所有已启用来源。', Type.Object({
      sourceId: Type.Optional(Type.String()),
    }), ({ sourceId }) => {
      const sourceIds = trends.refresh(sourceId);
      return { data: { sourceIds }, summary: `已请求刷新 ${sourceIds.length} 个来源` };
    }),
    creatorTool('set_trend_source_enabled', '修改热点来源状态', '启用或停用已有信息源，返回保存后的采集状态。', Type.Object({
      sourceId: Type.String(), enabled: Type.Boolean(),
    }), async ({ sourceId, enabled }) => {
      const data = await trends.setSourceEnabled(sourceId, enabled);
      return { data, summary: data.state === 'needs_auth' ? '来源需要配置登录态' : `${data.name}已${data.enabled ? '启用' : '停用'}` };
    }),
    creatorTool('save_topic', '收藏或更新选题', '按 itemId 保存选题和创作备注。已有收藏会更新备注。', Type.Object({
      itemId: Type.String(), note: Type.String(),
    }), ({ itemId, note }) => {
      trends.saveTopic(itemId, note);
      return { data: { itemId, note, saved: true }, summary: '已保存选题' };
    }),
    creatorTool('remove_topic', '移除选题收藏', '按 itemId 移除收藏。', itemId, ({ itemId }) => {
      trends.removeTopic(itemId);
      return { data: { itemId, saved: false }, summary: '已移除选题收藏' };
    }),
    creatorTool('set_trend_auto_summary', '设置热点自动摘要', '开启或停止热点中文翻译与摘要队列的自动处理。', Type.Object({
      enabled: Type.Boolean(),
    }), ({ enabled }) => ({ data: trends.setAutoSummary(enabled), summary: `已${enabled ? '开启' : '停止'}自动摘要` })),
    creatorTool('retry_trend_summary', '重试热点摘要', '按 itemId 将一条资讯的中文翻译与摘要加入队列。', itemId, ({ itemId }) => {
      trends.retryAi(itemId);
      return { data: { itemId, queued: true }, summary: '已提交摘要任务' };
    }),
  ];
}
