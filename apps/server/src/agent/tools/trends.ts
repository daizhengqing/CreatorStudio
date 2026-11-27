import { Type } from 'typebox';
import type { TrendItem } from '@creator-studio/contracts';
import { trendMessage } from '../../harness/messages.js';
import type { createTrendsService } from '../../harness/trends/index.js';
import { toolMetadata } from '../content.js';
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
    creatorTool(toolMetadata('list_trends'), Type.Object({
      ...filter, offset: Type.Optional(Type.Integer({ minimum: 0 })), savedOnly: Type.Optional(Type.Boolean()),
    }), input => {
      const page = trends.list({ ...input, limit: input.limit ?? 10 });
      return { data: { ...page, items: page.items.map(preview) }, summary: `找到 ${page.total} 条资讯` };
    }, ({ items, total, offset, limit }) => ({
      items: items.map(item => ({ ...trendMessage(item), ...(item.saved ? { saved: true, note: item.note } : {}) })),
      total,
      ...(offset + items.length < total ? { nextOffset: offset + limit } : {}),
    })),
    creatorTool(toolMetadata('get_trend'), itemId, input => {
      const data = requiredResult(trends.get(input.itemId), '资讯不存在');
      return { data, summary: data.titleZh ?? data.title };
    }, item => ({
      ...trendMessage(item), title: item.title, text: item.content,
      ...(item.summaryZh && item.summaryZh !== item.content ? { summary: item.summaryZh } : {}),
    })),
    creatorTool(toolMetadata('list_rankings'), Type.Object(filter), input => {
      const data = trends.rankings({ ...input, limit: input.limit ?? 5 }).map(group => ({ ...group, items: group.items.map(preview) }));
      return { data, summary: `${data.length} 个榜单` };
    }, groups => groups.filter(({ items }) => items.length).map(({ source, items }) => ({
      source: source.name,
      items: items.map(item => {
        const { source: _source, ...message } = trendMessage(item);
        const rank = item.sources.find(entry => entry.id === source.id);
        return { ...message, rank: rank?.rank, ...(rank?.heat ? { heat: rank.heat } : {}) };
      }),
    }))),
    creatorTool(toolMetadata('get_trends_status'), Type.Object({}), () => {
      const data = trends.getStatus();
      return { data, summary: `${data.sources.filter(source => source.enabled).length} 个来源已启用` };
    }),
    creatorTool(toolMetadata('refresh_trends'), Type.Object({
      sourceId: Type.Optional(Type.String()),
    }), ({ sourceId }) => {
      const sourceIds = trends.refresh(sourceId);
      return { data: { sourceIds }, summary: `已请求刷新 ${sourceIds.length} 个来源` };
    }),
    creatorTool(toolMetadata('set_trend_source_enabled'), Type.Object({
      sourceId: Type.String(), enabled: Type.Boolean(),
    }), async ({ sourceId, enabled }) => {
      const data = await trends.setSourceEnabled(sourceId, enabled);
      return { data, summary: data.state === 'needs_auth' ? '来源需要配置登录态' : `${data.name}已${data.enabled ? '启用' : '停用'}` };
    }),
    creatorTool(toolMetadata('save_topic'), Type.Object({
      itemId: Type.String(), note: Type.String(),
    }), ({ itemId, note }) => {
      trends.saveTopic(itemId, note);
      return { data: { itemId, note, saved: true }, summary: '已保存选题' };
    }),
    creatorTool(toolMetadata('remove_topic'), itemId, ({ itemId }) => {
      trends.removeTopic(itemId);
      return { data: { itemId, saved: false }, summary: '已移除选题收藏' };
    }),
    creatorTool(toolMetadata('set_trend_auto_summary'), Type.Object({
      enabled: Type.Boolean(),
    }), ({ enabled }) => ({ data: trends.setAutoSummary(enabled), summary: `已${enabled ? '开启' : '停止'}自动摘要` })),
    creatorTool(toolMetadata('retry_trend_summary'), itemId, ({ itemId }) => {
      trends.retryAi(itemId);
      return { data: { itemId, queued: true }, summary: '已提交摘要任务' };
    }),
  ];
}
