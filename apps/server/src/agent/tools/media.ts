import { Type } from 'typebox';
import type { DownloadTask, ExportTask } from '@creator-studio/contracts';
import { cancelDownload, createDownload, deleteDownload, getDownload, listDownloads, previewDownload } from '../../services/downloads.js';
import { enqueueExport, getExport, listExports } from '../../services/exports.js';
import { getAsset, listAssets } from '../../services/media.js';
import { toolMetadata } from '../content.js';
import { creatorTool, requiredResult } from './tool.js';

const limit = Type.Optional(Type.Integer({ minimum: 1, maximum: 50 }));
const idInput = Type.Object({ id: Type.String() });
const download = (task: DownloadTask, summary: string) =>
  ({ data: task, summary, references: [{ kind: 'download' as const, task }] });
const exported = (task: ExportTask, summary: string) =>
  ({ data: task, summary, references: [{ kind: 'export' as const, task }] });

export const mediaTools = [
  creatorTool(toolMetadata('list_assets'), Type.Object({
    search: Type.Optional(Type.String()),
    type: Type.Optional(Type.Union([Type.Literal('video'), Type.Literal('audio'), Type.Literal('image')])),
    limit,
  }), input => {
    const data = listAssets(input);
    return { data, summary: `找到 ${data.length} 个素材` };
  }),
  creatorTool(toolMetadata('get_asset'), idInput, ({ id }) => {
    const asset = requiredResult(getAsset(id), '素材不存在');
    return { data: asset, summary: asset.name, references: [{ kind: 'asset', asset }] };
  }),
  creatorTool(toolMetadata('preview_download'), Type.Object({
    url: Type.String(),
  }), async ({ url }, signal) => {
    const data = await previewDownload(url, signal);
    return { data, summary: data.title };
  }),
  creatorTool(toolMetadata('start_download'), Type.Object({
    previewId: Type.String(), resolution: Type.Optional(Type.Integer({ minimum: 1 })),
  }), ({ previewId, resolution }) => download(createDownload(previewId, resolution ?? null), '已提交下载任务')),
  creatorTool(toolMetadata('get_download'), idInput,
    ({ id }) => download(requiredResult(getDownload(id), '下载任务不存在'), '下载任务状态')),
  creatorTool(toolMetadata('list_downloads'), Type.Object({ limit }), input => {
    const data = listDownloads(input.limit);
    return { data, summary: `${data.length} 条下载记录` };
  }),
  creatorTool(toolMetadata('cancel_download'), idInput,
    ({ id }) => download(cancelDownload(id), '下载已停止')),
  creatorTool(toolMetadata('delete_download'), idInput, ({ id }) => {
    deleteDownload(id);
    return { data: { id, deleted: true }, summary: '下载记录已删除' };
  }),
  creatorTool(toolMetadata('start_export'), Type.Object({
    assetId: Type.String(), start: Type.Number({ minimum: 0 }), end: Type.Number({ exclusiveMinimum: 0 }),
    aspect: Type.Union([Type.Literal('original'), Type.Literal('16:9'), Type.Literal('9:16'), Type.Literal('1:1')]),
    mute: Type.Boolean(), bgmAssetId: Type.Optional(Type.String()), bgmVolume: Type.Optional(Type.Number()),
  }), input => exported(enqueueExport(input), '已提交导出任务')),
  creatorTool(toolMetadata('get_export'), idInput,
    ({ id }) => exported(requiredResult(getExport(id), '导出任务不存在'), '导出任务状态')),
  creatorTool(toolMetadata('list_exports'), Type.Object({ limit }), input => {
    const data = listExports(input.limit);
    return { data, summary: `${data.length} 条导出记录` };
  }),
];
