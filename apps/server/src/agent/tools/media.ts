import { Type } from 'typebox';
import type { DownloadTask, ExportTask } from '@creator-studio/contracts';
import { cancelDownload, createDownload, deleteDownload, getDownload, listDownloads, previewDownload } from '../../services/downloads.js';
import { enqueueExport, getExport, listExports } from '../../services/exports.js';
import { getAsset, listAssets } from '../../services/media.js';
import { creatorTool, requiredResult } from './tool.js';

const limit = Type.Optional(Type.Integer({ minimum: 1, maximum: 50 }));
const idInput = Type.Object({ id: Type.String() });
const download = (task: DownloadTask, summary: string) =>
  ({ data: task, summary, references: [{ kind: 'download' as const, task }] });
const exported = (task: ExportTask, summary: string) =>
  ({ data: task, summary, references: [{ kind: 'export' as const, task }] });

export const mediaTools = [
  creatorTool('list_assets', '查询素材', '按名称或类型查本地素材及其时长、尺寸等元数据，返回素材 ID。', Type.Object({
    search: Type.Optional(Type.String()),
    type: Type.Optional(Type.Union([Type.Literal('video'), Type.Literal('audio'), Type.Literal('image')])),
    limit,
  }), input => {
    const data = listAssets(input);
    return { data, summary: `找到 ${data.length} 个素材` };
  }),
  creatorTool('get_asset', '查看素材', '根据素材 ID 读取详细元数据和网页预览地址。', idInput, ({ id }) => {
    const asset = requiredResult(getAsset(id), '素材不存在');
    return { data: asset, summary: asset.name, references: [{ kind: 'asset', asset }] };
  }),
  creatorTool('preview_download', '解析视频链接', '解析 B站、抖音或 YouTube 链接或分享文案，得到临时预览 ID 和可用画质。', Type.Object({
    url: Type.String(),
  }), async ({ url }, signal) => {
    const data = await previewDownload(url, signal);
    return { data, summary: data.title };
  }),
  creatorTool('start_download', '提交下载', '使用解析得到的 previewId 下载视频。resolution 是可用画质中的高度，留空选择最佳画质。', Type.Object({
    previewId: Type.String(), resolution: Type.Optional(Type.Integer({ minimum: 1 })),
  }), ({ previewId, resolution }) => download(createDownload(previewId, resolution ?? null), '已提交下载任务')),
  creatorTool('get_download', '查询下载进度', '根据下载任务 ID 查询实时状态、进度、错误和完成后的素材 ID。', idInput,
    ({ id }) => download(requiredResult(getDownload(id), '下载任务不存在'), '下载任务状态')),
  creatorTool('list_downloads', '查询下载记录', '读取最近的下载任务及其 ID。', Type.Object({ limit }), input => {
    const data = listDownloads(input.limit);
    return { data, summary: `${data.length} 条下载记录` };
  }),
  creatorTool('cancel_download', '停止下载', '停止已排队或运行中的下载任务。', idInput,
    ({ id }) => download(cancelDownload(id), '下载已停止')),
  creatorTool('delete_download', '删除下载记录', '删除已结束的任务记录，已入库素材仍可使用。', idInput, ({ id }) => {
    deleteDownload(id);
    return { data: { id, deleted: true }, summary: '下载记录已删除' };
  }),
  creatorTool('start_export', '提交视频导出', '以素材 ID 裁剪单段视频，start/end 为秒。可改画幅、静音原声或使用音频素材混入背景音乐。', Type.Object({
    assetId: Type.String(), start: Type.Number({ minimum: 0 }), end: Type.Number({ exclusiveMinimum: 0 }),
    aspect: Type.Union([Type.Literal('original'), Type.Literal('16:9'), Type.Literal('9:16'), Type.Literal('1:1')]),
    mute: Type.Boolean(), bgmAssetId: Type.Optional(Type.String()), bgmVolume: Type.Optional(Type.Number()),
  }), input => exported(enqueueExport(input), '已提交导出任务')),
  creatorTool('get_export', '查询导出进度', '根据导出任务 ID 查询实时状态、进度和完成后的 MP4 预览地址。', idInput,
    ({ id }) => exported(requiredResult(getExport(id), '导出任务不存在'), '导出任务状态')),
  creatorTool('list_exports', '查询导出记录', '读取最近的导出任务及其 ID。', Type.Object({ limit }), input => {
    const data = listExports(input.limit);
    return { data, summary: `${data.length} 条导出记录` };
  }),
];
